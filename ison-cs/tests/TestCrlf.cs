using System.Collections.Generic;
using Xunit;

namespace IsonParser.Tests
{
    /// <summary>
    /// A CRLF-saved ISON file must parse as the same document as an LF one.
    ///
    /// Splitting on '\n' alone leaves a trailing '\r' on every line. That
    /// carriage return then lands inside block names, field names and values,
    /// so the file does not fail to parse -- it parses as *different data*. A
    /// two-column row read its second field as "target\r", and a reference in
    /// that column silently went missing.
    ///
    /// Python uses splitlines() and Rust uses .lines(); C# was the only
    /// implementation splitting on a bare '\n'.
    /// </summary>
    public class TestCrlf
    {
        private const string Lf =
            "table.edges\nsource target\n1 :node:2\n3 :node:4";

        private static string Crlf => Lf.Replace("\n", "\r\n");

        [Fact]
        public void CrlfParsesIdenticallyToLf()
        {
            var lf = Ison.Loads(Lf);
            var crlf = Ison.Loads(Crlf);

            Assert.Equal(Serializer.DumpsCanonical(lf), Serializer.DumpsCanonical(crlf));
        }

        [Fact]
        public void CrlfLeavesNoCarriageReturnInNamesOrValues()
        {
            var block = Ison.Loads(Crlf).Blocks[0];

            Assert.Equal("edges", block.Name);
            Assert.Equal("table", block.Kind);
            Assert.Equal(new List<string> { "source", "target" }, block.Fields);

            foreach (var row in block.Rows)
            {
                foreach (var kv in row)
                {
                    Assert.DoesNotContain("\r", kv.Key);
                    Assert.DoesNotContain("\r", kv.Value?.ToString() ?? "");
                }
            }
        }

        [Fact]
        public void CrlfPreservesReferencesInTheLastColumn()
        {
            // The failure that surfaced this: the last column is where the
            // stray '\r' lands, so a reference there was the first casualty.
            var block = Ison.Loads(Crlf).Blocks[0];

            var first = Assert.IsType<Reference>(block.Rows[0]["target"]);
            Assert.Equal("2", first.Id);
            Assert.Equal("node", first.Type);
        }

        [Fact]
        public void CrlfIsonlParsesIdenticallyToLf()
        {
            const string isonlLf = "table.edges|source target|1 :node:2";
            string isonlCrlf = isonlLf + "\r\n";

            Assert.Equal(
                Serializer.DumpsCanonical(Ison.LoadsIsonl(isonlLf)),
                Serializer.DumpsCanonical(Ison.LoadsIsonl(isonlCrlf)));
        }

        [Fact]
        public void BareCarriageReturnsAreAlsoHandled()
        {
            // Classic-Mac line endings are rare but cost nothing to accept,
            // and leaving them out would mean a third distinct behaviour.
            string cr = Lf.Replace("\n", "\r");

            Assert.Equal(
                Serializer.DumpsCanonical(Ison.Loads(Lf)),
                Serializer.DumpsCanonical(Ison.Loads(cr)));
        }
    }
}
