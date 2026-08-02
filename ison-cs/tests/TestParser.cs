using System.Collections.Generic;
using IsonParser;
using Xunit;

namespace IsonParser.Tests
{
    public class TestParser
    {
        [Fact]
        public void ParsesSimpleTable()
        {
            var doc = Ison.Loads(string.Join("\n",
                "table.users",
                "id name active",
                "1 Alice true",
                "2 Bob false"));

            Assert.Single(doc.Blocks);
            var block = doc.Blocks[0];
            Assert.Equal("table", block.Kind);
            Assert.Equal("users", block.Name);
            Assert.Equal(new[] { "id", "name", "active" }, block.Fields);
            Assert.Equal(2, block.Rows.Count);
            Assert.Equal(1L, block.Rows[0]["id"]);
            Assert.Equal("Alice", block.Rows[0]["name"]);
            Assert.Equal(true, block.Rows[0]["active"]);
            Assert.Equal(false, block.Rows[1]["active"]);
        }

        [Fact]
        public void InfersTypes()
        {
            var doc = Ison.Loads(string.Join("\n",
                "table.t",
                "i f b n s",
                "42 3.14 true null hello"));

            var row = doc.Blocks[0].Rows[0];
            Assert.Equal(42L, row["i"]);
            Assert.Equal(3.14, row["f"]);
            Assert.Equal(true, row["b"]);
            Assert.Null(row["n"]);
            Assert.Equal("hello", row["s"]);
        }

        [Fact]
        public void NegativeNumbers()
        {
            var doc = Ison.Loads("table.t\na b\n-5 -2.5");
            var row = doc.Blocks[0].Rows[0];
            Assert.Equal(-5L, row["a"]);
            Assert.Equal(-2.5, row["b"]);
        }

        [Fact]
        public void QuotedTokensStayStrings()
        {
            var doc = Ison.Loads(string.Join("\n",
                "table.t",
                "a b c d",
                "\"123\" \"true\" \"null\" \":5\""));

            var row = doc.Blocks[0].Rows[0];
            Assert.Equal("123", row["a"]);
            Assert.Equal("true", row["b"]);
            Assert.Equal("null", row["c"]);
            Assert.Equal(":5", row["d"]);
        }

        [Fact]
        public void ParsesReferences()
        {
            var doc = Ison.Loads(string.Join("\n",
                "table.t",
                "simple namespaced relation",
                ":10 :user:101 :MEMBER_OF:7"));

            var row = doc.Blocks[0].Rows[0];

            var simple = Assert.IsType<Reference>(row["simple"]);
            Assert.Equal("10", simple.Id);
            Assert.Null(simple.Type);

            var ns = Assert.IsType<Reference>(row["namespaced"]);
            Assert.Equal("101", ns.Id);
            Assert.Equal("user", ns.Type);
            Assert.Equal("user", ns.Namespace);
            Assert.False(ns.IsRelationship());

            var rel = Assert.IsType<Reference>(row["relation"]);
            Assert.Equal("7", rel.Id);
            Assert.Equal("MEMBER_OF", rel.RelationshipType);
            Assert.True(rel.IsRelationship());
        }

        [Fact]
        public void ParsesTypeAnnotations()
        {
            var doc = Ison.Loads(string.Join("\n",
                "table.users",
                "id:int name:string total:computed",
                "1 Alice 99"));

            var block = doc.Blocks[0];
            Assert.Equal(new[] { "id", "name", "total" }, block.Fields);
            Assert.Equal("int", block.GetFieldType("id"));
            Assert.Equal("string", block.GetFieldType("name"));
            Assert.Equal(new[] { "total" }, block.GetComputedFields());
        }

        [Fact]
        public void SkipsCommentsAndBlankLines()
        {
            var doc = Ison.Loads(string.Join("\n",
                "# leading comment",
                "",
                "table.t",
                "id name",
                "# comment inside data",
                "1 Alice"));

            Assert.Single(doc.Blocks);
            Assert.Single(doc.Blocks[0].Rows);
        }

        [Fact]
        public void StripsInlineComments()
        {
            var doc = Ison.Loads(string.Join("\n",
                "table.t",
                "id name",
                "1 Alice # this is a comment"));

            var row = doc.Blocks[0].Rows[0];
            Assert.Equal(1L, row["id"]);
            Assert.Equal("Alice", row["name"]);
        }

        [Fact]
        public void QuotedHashIsData()
        {
            var doc = Ison.Loads(string.Join("\n",
                "table.t",
                "id tag",
                "1 \"#hashtag\""));

            Assert.Equal("#hashtag", doc.Blocks[0].Rows[0]["tag"]);
        }

        [Fact]
        public void ExtraValuesAreRejected()
        {
            var ex = Assert.Throws<IsonSyntaxException>(() => Ison.Loads(string.Join("\n",
                "table.t",
                "id name",
                "1 Alice extra")));

            Assert.Contains("3 values but only 2 fields", ex.Message);
        }

        [Fact]
        public void MissingTrailingValuesBecomeNull()
        {
            var doc = Ison.Loads(string.Join("\n",
                "table.t",
                "id name active",
                "1 Alice"));

            var row = doc.Blocks[0].Rows[0];
            Assert.Equal(1L, row["id"]);
            Assert.Equal("Alice", row["name"]);
            Assert.Null(row["active"]);
        }

        [Fact]
        public void ParsesEscapeSequences()
        {
            var doc = Ison.Loads(string.Join("\n",
                "table.t",
                "a b c d",
                "\"line\\nbreak\" \"tab\\there\" \"quote\\\"inside\" \"back\\\\slash\""));

            var row = doc.Blocks[0].Rows[0];
            Assert.Equal("line\nbreak", row["a"]);
            Assert.Equal("tab\there", row["b"]);
            Assert.Equal("quote\"inside", row["c"]);
            Assert.Equal("back\\slash", row["d"]);
        }

        [Fact]
        public void UnterminatedQuoteThrows()
        {
            Assert.Throws<IsonSyntaxException>(() =>
                Ison.Loads("table.t\nid name\n1 \"unterminated"));
        }

        [Fact]
        public void MultipleBlocks()
        {
            var doc = Ison.Loads(string.Join("\n",
                "table.users",
                "id name",
                "1 Alice",
                "",
                "table.posts",
                "id title",
                "10 Hello"));

            Assert.Equal(2, doc.Blocks.Count);
            Assert.Equal("users", doc.Blocks[0].Name);
            Assert.Equal("posts", doc.Blocks[1].Name);
            Assert.NotNull(doc["posts"]);
            Assert.Null(doc["missing"]);
        }

        [Fact]
        public void ParsesSummaryRow()
        {
            var doc = Ison.Loads(string.Join("\n",
                "table.sales",
                "id amount",
                "1 100",
                "2 200",
                "---",
                "total 300"));

            var block = doc.Blocks[0];
            Assert.Equal(2, block.Rows.Count);
            Assert.Equal("total 300", block.Summary);
        }

        [Fact]
        public void ParsesNestedDotPathFields()
        {
            var doc = Ison.Loads(string.Join("\n",
                "table.t",
                "id user.name user.email",
                "1 Alice alice@example.com"));

            var row = doc.Blocks[0].Rows[0];
            var user = Assert.IsType<Dictionary<string, object?>>(row["user"]);
            Assert.Equal("Alice", user["name"]);
            Assert.Equal("alice@example.com", user["email"]);
        }

        [Fact]
        public void MissingHeaderDotThrows()
        {
            Assert.Throws<IsonSyntaxException>(() => Ison.Loads("notaheader\nid\n1"));
        }

        [Fact]
        public void BlockNameMayContainDots()
        {
            var doc = Ison.Loads("table.users.v2\nid\n1");
            Assert.Equal("table", doc.Blocks[0].Kind);
            Assert.Equal("users.v2", doc.Blocks[0].Name);
        }

        [Fact]
        public void EmptyInputProducesEmptyDocument()
        {
            Assert.Empty(Ison.Loads("").Blocks);
            Assert.Empty(Ison.Loads("\n\n  \n").Blocks);
        }
    }
}
