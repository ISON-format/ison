using System.Collections.Generic;
using IsonParser;
using Xunit;

namespace IsonParser.Tests
{
    public class TestSerializer
    {
        private static Document OneRow(params (string Field, object? Value)[] cells)
        {
            var doc = new Document();
            var block = new Block("table", "t");
            var row = new Dictionary<string, object?>();
            foreach (var (field, value) in cells)
            {
                block.Fields.Add(field);
                row[field] = value;
            }
            block.Rows.Add(row);
            doc.Blocks.Add(block);
            return doc;
        }

        private static string ValueLine(params (string Field, object? Value)[] cells) =>
            Ison.Dumps(OneRow(cells)).Split('\n')[2];

        [Fact]
        public void SerializesSimpleTable()
        {
            var doc = Ison.Loads("table.users\nid name\n1 Alice");
            Assert.Equal("table.users\nid name\n1 Alice", Ison.Dumps(doc));
        }

        [Fact]
        public void RoundTripsThroughDumps()
        {
            string source = string.Join("\n",
                "table.users",
                "id name active",
                "1 Alice true",
                "2 Bob false");

            Assert.Equal(source, Ison.Dumps(Ison.Loads(source)));
        }

        [Fact]
        public void QuotesStringsNeedingIt()
        {
            Assert.Equal("\"has space\"", ValueLine(("a", "has space")));
            Assert.Equal("\"\"", ValueLine(("a", "")));
            Assert.Equal("\"true\"", ValueLine(("a", "true")));
            Assert.Equal("\"null\"", ValueLine(("a", "null")));
            Assert.Equal("\"123\"", ValueLine(("a", "123")));
            Assert.Equal("\"1.5\"", ValueLine(("a", "1.5")));
            Assert.Equal("\"#tag\"", ValueLine(("a", "#tag")));
            Assert.Equal("\":ref\"", ValueLine(("a", ":ref")));
        }

        [Fact]
        public void QuotesBlockHeaderLookalikes()
        {
            // "kind.name" alone on a line would be re-read as a block header.
            Assert.Equal("\"table.users\"", ValueLine(("a", "table.users")));
            // Three segments cannot be a header, so no quoting is needed.
            Assert.Equal("a.b.c", ValueLine(("a", "a.b.c")));
        }

        [Fact]
        public void QuotesCarriageReturnAndBackslash()
        {
            Assert.Equal("\"a\\rb\"", ValueLine(("a", "a\rb")));
            Assert.Equal("\"c:\\\\path\\\\\"", ValueLine(("a", "c:\\path\\")));
        }

        [Fact]
        public void DoesNotQuotePlainStrings()
        {
            Assert.Equal("Alice", ValueLine(("a", "Alice")));
            Assert.Equal("alice@example.com", ValueLine(("a", "alice@example.com")));
        }

        [Fact]
        public void FormatsNumbersLikeTheReference()
        {
            Assert.Equal("42", ValueLine(("a", 42L)));
            Assert.Equal("-7", ValueLine(("a", -7L)));
            Assert.Equal("3.14", ValueLine(("a", 3.14)));
            // Integral doubles keep a trailing ".0", matching Python's repr.
            Assert.Equal("1.0", ValueLine(("a", 1.0)));
            Assert.Equal("-2.0", ValueLine(("a", -2.0)));
        }

        [Fact]
        public void SerializesBooleansAndNull()
        {
            Assert.Equal("true", ValueLine(("a", true)));
            Assert.Equal("false", ValueLine(("a", false)));
            Assert.Equal("null", ValueLine(("a", null)));
        }

        [Fact]
        public void SerializesReferences()
        {
            Assert.Equal(":10", ValueLine(("a", new Reference("10"))));
            Assert.Equal(":user:101", ValueLine(("a", new Reference("101", "user"))));
        }

        [Fact]
        public void JsonEncodesCollections()
        {
            // Python's json.dumps defaults: ", " separator, ensure_ascii escaping.
            Assert.Equal("\"[1, 2, 3]\"", ValueLine(("a", new List<object?> { 1L, 2L, 3L })));
            Assert.Equal("\"{\\\"k\\\": 1}\"",
                ValueLine(("a", new Dictionary<string, object?> { { "k", 1L } })));
        }

        [Fact]
        public void PreservesTypeAnnotationsOnOutput()
        {
            var doc = Ison.Loads("table.users\nid:int name:string\n1 Alice");
            Assert.Contains("id:int name:string", Ison.Dumps(doc));
        }

        [Fact]
        public void EmitsSummaryRow()
        {
            var doc = Ison.Loads("table.t\nid amount\n1 100\n---\ntotal 100");
            string output = Ison.Dumps(doc);
            Assert.Contains("---\ntotal 100", output);
        }

        [Fact]
        public void AlignsColumnsWhenRequested()
        {
            var doc = Ison.Loads(string.Join("\n",
                "table.t",
                "id name",
                "1 Alice",
                "100 Bo"));

            string[] lines = Ison.Dumps(doc, alignColumns: true).Split('\n');
            Assert.Equal("1   Alice", lines[2]);
            Assert.Equal("100 Bo", lines[3]);
        }

        [Fact]
        public void SupportsCustomDelimiter()
        {
            var doc = Ison.Loads("table.t\nid name\n1 Alice");
            Assert.Contains("1\tAlice", Ison.Dumps(doc, alignColumns: false, delimiter: "\t"));
        }

        [Fact]
        public void SeparatesBlocksWithBlankLine()
        {
            var doc = Ison.Loads("table.a\nid\n1\n\ntable.b\nid\n2");
            Assert.Equal("table.a\nid\n1\n\ntable.b\nid\n2", Ison.Dumps(doc));
        }
    }
}
