using System.Collections.Generic;
using IsonParser;
using Xunit;

namespace IsonParser.Tests
{
    public class TestIsonl
    {
        [Fact]
        public void ParsesSingleLine()
        {
            var record = new IsonlParser().ParseLine("table.users|id name active|1 Alice true");

            Assert.NotNull(record);
            Assert.Equal("table", record!.Kind);
            Assert.Equal("users", record.Name);
            Assert.Equal(new[] { "id", "name", "active" }, record.Fields);
            Assert.Equal(1L, record.Values["id"]);
            Assert.Equal("Alice", record.Values["name"]);
            Assert.Equal(true, record.Values["active"]);
        }

        [Fact]
        public void SkipsBlanksAndComments()
        {
            var parser = new IsonlParser();
            Assert.Null(parser.ParseLine(""));
            Assert.Null(parser.ParseLine("   "));
            Assert.Null(parser.ParseLine("# a comment"));
        }

        [Fact]
        public void RequiresThreeSections()
        {
            var parser = new IsonlParser();
            Assert.Throws<IsonSyntaxException>(() => parser.ParseLine("table.users|id name"));
            Assert.Throws<IsonSyntaxException>(() => parser.ParseLine("table.users|a|b|c"));
        }

        [Fact]
        public void GroupsRecordsIntoBlocks()
        {
            var doc = Ison.LoadsIsonl(string.Join("\n",
                "table.users|id name|1 Alice",
                "table.users|id name|2 Bob",
                "table.posts|id title|10 Hello"));

            Assert.Equal(2, doc.Blocks.Count);
            Assert.Equal("users", doc.Blocks[0].Name);
            Assert.Equal(2, doc.Blocks[0].Rows.Count);
            Assert.Equal("posts", doc.Blocks[1].Name);
        }

        [Fact]
        public void RoundTripsThroughIsonl()
        {
            var doc = Ison.Loads("table.users\nid name\n1 Alice\n2 Bob");
            string isonl = Ison.DumpsIsonl(doc);
            var back = Ison.LoadsIsonl(isonl);

            Assert.Equal("table.users|id name|1 Alice\ntable.users|id name|2 Bob", isonl);
            Assert.Equal(2, back.Blocks[0].Rows.Count);
            Assert.Equal("Alice", back.Blocks[0].Rows[0]["name"]);
        }

        /// <summary>
        /// A value ending in an escaped backslash must not desync quote
        /// tracking in the pipe splitter.
        /// </summary>
        [Fact]
        public void TrailingBackslashSurvivesRoundTrip()
        {
            var doc = new Document();
            doc.Blocks.Add(new Block("table", "t")
            {
                Fields = new List<string> { "id", "path" },
                Rows = new List<Dictionary<string, object?>>
                {
                    new() { { "id", 1L }, { "path", @"C:\path\" } }
                }
            });

            var back = Ison.LoadsIsonl(Ison.DumpsIsonl(doc));
            Assert.Equal(@"C:\path\", back.Blocks[0].Rows[0]["path"]);
        }

        [Fact]
        public void PipesAndControlCharsSurviveRoundTrip()
        {
            var doc = new Document();
            doc.Blocks.Add(new Block("table", "t")
            {
                Fields = new List<string> { "id", "a", "b", "c" },
                Rows = new List<Dictionary<string, object?>>
                {
                    new()
                    {
                        { "id", 1L },
                        { "a", "has|pipe" },
                        { "b", "has\rcarriage" },
                        { "c", "has\"quote" }
                    }
                }
            });

            var row = Ison.LoadsIsonl(Ison.DumpsIsonl(doc)).Blocks[0].Rows[0];
            Assert.Equal("has|pipe", row["a"]);
            Assert.Equal("has\rcarriage", row["b"]);
            Assert.Equal("has\"quote", row["c"]);
        }

        [Fact]
        public void QuotedNumericStaysString()
        {
            var record = new IsonlParser().ParseLine("table.t|id code|1 \"123\"");
            Assert.Equal("123", record!.Values["code"]);
        }

        [Fact]
        public void ExtraValuesAreRejected()
        {
            var ex = Assert.Throws<IsonSyntaxException>(() =>
                new IsonlParser().ParseLine("table.t|id name|1 Alice extra"));
            Assert.Contains("3 values but only 2 fields", ex.Message);
        }

        [Fact]
        public void StripsInlineComments()
        {
            var record = new IsonlParser().ParseLine("table.t|id name|1 Alice # trailing");
            Assert.Equal(1L, record!.Values["id"]);
            Assert.Equal("Alice", record.Values["name"]);
        }

        [Fact]
        public void MissingTrailingValuesBecomeNull()
        {
            var record = new IsonlParser().ParseLine("table.t|id name active|1 Alice");
            Assert.Null(record!.Values["active"]);
        }

        [Fact]
        public void RejectsUnserializableEnvelope()
        {
            var doc = new Document();
            doc.Blocks.Add(new Block("table", "bad name")
            {
                Fields = new List<string> { "id" },
                Rows = new List<Dictionary<string, object?>> { new() { { "id", 1L } } }
            });

            Assert.Throws<IsonException>(() => Ison.DumpsIsonl(doc));
        }

        [Fact]
        public void RejectsDottedKind()
        {
            var doc = new Document();
            doc.Blocks.Add(new Block("ta.ble", "t")
            {
                Fields = new List<string> { "id" },
                Rows = new List<Dictionary<string, object?>> { new() { { "id", 1L } } }
            });

            Assert.Throws<IsonException>(() => Ison.DumpsIsonl(doc));
        }

        [Fact]
        public void ConvertsBetweenIsonAndIsonl()
        {
            string ison = "table.users\nid name\n1 Alice";
            string isonl = Ison.IsonToIsonl(ison);
            Assert.Equal("table.users|id name|1 Alice", isonl);
            Assert.Equal(ison, Ison.IsonlToIson(isonl));
        }
    }
}
