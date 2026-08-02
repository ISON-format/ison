using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using IsonParser;
using Xunit;

namespace IsonParser.Tests
{
    public class TestCanonical
    {
        /// <summary>
        /// Load the shared cross-language golden fixture and verify canonical
        /// serialization matches byte-for-byte.
        /// </summary>
        [Fact]
        public void TestGoldenFixtureFieldSort()
        {
            string repoRoot = TestPaths.FindRepositoryRoot();

            string fixtureJsonPath = Path.Combine(repoRoot, "benchmark", "golden_fixture_field_sort.json");
            string expectedIsonPath = Path.Combine(repoRoot, "benchmark", "golden_fixture_field_sort.expected.ison");

            Assert.True(File.Exists(fixtureJsonPath), $"Golden fixture not found: {fixtureJsonPath}");
            Assert.True(File.Exists(expectedIsonPath), $"Expected output not found: {expectedIsonPath}");

            var document = Ison.FromJson(File.ReadAllText(fixtureJsonPath, Encoding.UTF8));
            string output = Ison.DumpsCanonical(document);
            string expected = File.ReadAllText(expectedIsonPath, Encoding.UTF8);

            Assert.Equal(TestPaths.NormalizeLineEndings(expected), TestPaths.NormalizeLineEndings(output));
        }

        /// <summary>
        /// UTF-16 vs UTF-8 divergence: Ａfield (U+FF21, UTF-8 starts 0xEF) must
        /// sort before 😀field (U+1F600, UTF-8 starts 0xF0). Comparing UTF-16
        /// code units would reverse them.
        /// </summary>
        [Fact]
        public void TestUTF16Divergence()
        {
            var doc = new Document();
            doc.Blocks.Add(new Block("table", "utf16_divergence")
            {
                Fields = new List<string> { "id", "😀field", "Ａfield" },
                Rows = new List<Dictionary<string, object?>>
                {
                    new Dictionary<string, object?>
                    {
                        { "id", 101 },
                        { "😀field", "non-BMP emoji (U+1F600 starts 0xF0 in UTF-8)" },
                        { "Ａfield", "fullwidth A (U+FF21 is 0xEF in UTF-8)" }
                    }
                }
            });

            string[] lines = Ison.DumpsCanonical(doc).Split('\n');
            Assert.Equal("id Ａfield 😀field", lines[1]);
        }

        /// <summary>The id field is hoisted to first position.</summary>
        [Fact]
        public void TestIdHoisting()
        {
            var doc = new Document();
            doc.Blocks.Add(new Block("table", "test")
            {
                Fields = new List<string> { "score", "active", "id", "email", "name" },
                Rows = new List<Dictionary<string, object?>>
                {
                    new Dictionary<string, object?>
                    {
                        { "score", 95.5 },
                        { "active", true },
                        { "id", 1 },
                        { "email", "alice@example.com" },
                        { "name", "Alice" }
                    }
                }
            });

            string[] lines = Ison.DumpsCanonical(doc).Split('\n');
            Assert.Equal("id active email name score", lines[1]);
        }

        /// <summary>Rows sort ordinal-string by the key column: "1" &lt; "10" &lt; "2".</summary>
        [Fact]
        public void TestRowSorting()
        {
            var doc = new Document();
            doc.Blocks.Add(new Block("table", "items")
            {
                Fields = new List<string> { "id", "name" },
                Rows = new List<Dictionary<string, object?>>
                {
                    new Dictionary<string, object?> { { "id", "10" }, { "name", "ten" } },
                    new Dictionary<string, object?> { { "id", "2" }, { "name", "two" } },
                    new Dictionary<string, object?> { { "id", "1" }, { "name", "one" } }
                }
            });

            string[] lines = Ison.DumpsCanonical(doc).Split('\n');

            int idx1 = Array.FindIndex(lines, l => l.Contains("\"1\" one"));
            int idx10 = Array.FindIndex(lines, l => l.Contains("\"10\" ten"));
            int idx2 = Array.FindIndex(lines, l => l.Contains("\"2\" two"));

            Assert.True(idx1 >= 0 && idx10 >= 0 && idx2 >= 0, "All rows should be present");
            Assert.True(idx1 < idx10 && idx10 < idx2, $"Row order incorrect: {idx1}, {idx10}, {idx2}");
        }

        /// <summary>Blocks sort ordinal-string by "kind.name".</summary>
        [Fact]
        public void TestBlockSorting()
        {
            var doc = new Document();
            doc.Blocks.Add(new Block("table", "users")
            {
                Fields = new List<string> { "id" },
                Rows = new List<Dictionary<string, object?>> { new() { { "id", 1L } } }
            });
            doc.Blocks.Add(new Block("table", "edges")
            {
                Fields = new List<string> { "id" },
                Rows = new List<Dictionary<string, object?>> { new() { { "id", 1L } } }
            });

            string canonical = Ison.DumpsCanonical(doc);
            Assert.StartsWith("table.edges", canonical);
            Assert.True(canonical.IndexOf("table.edges", StringComparison.Ordinal) <
                        canonical.IndexOf("table.users", StringComparison.Ordinal));
        }

        /// <summary>
        /// Ordinal, not culture-sensitive, ordering. Culture-aware comparison
        /// treats '-' as ignorable and would order these differently.
        /// </summary>
        [Fact]
        public void TestOrdinalNotCultureSensitiveSorting()
        {
            var doc = new Document();
            doc.Blocks.Add(new Block("table", "t")
            {
                Fields = new List<string> { "id" },
                Rows = new List<Dictionary<string, object?>>
                {
                    new() { { "id", "coop" } },
                    new() { { "id", "co-op" } },
                    new() { { "id", "co_op" } }
                }
            });

            string[] lines = Ison.DumpsCanonical(doc).Split('\n');
            // Ordinal byte order: '-' (0x2D) < '_' (0x5F) < 'o' (0x6F)
            Assert.Equal("co-op", lines[2]);
            Assert.Equal("co_op", lines[3]);
            Assert.Equal("coop", lines[4]);
        }

        /// <summary>Rows whose key is null sort to the end.</summary>
        [Fact]
        public void TestNullKeysSortLast()
        {
            var doc = new Document();
            doc.Blocks.Add(new Block("table", "t")
            {
                Fields = new List<string> { "id", "name" },
                Rows = new List<Dictionary<string, object?>>
                {
                    new() { { "id", null }, { "name", "nokey" } },
                    new() { { "id", "b" }, { "name", "bee" } },
                    new() { { "id", "a" }, { "name", "ay" } }
                }
            });

            string[] lines = Ison.DumpsCanonical(doc).Split('\n');
            Assert.Equal("a ay", lines[2]);
            Assert.Equal("b bee", lines[3]);
            Assert.Equal("null nokey", lines[4]);
        }

        /// <summary>Canonical serialization is idempotent.</summary>
        [Fact]
        public void TestCanonicalIdempotent()
        {
            string source = string.Join("\n",
                "table.users",
                "id name active",
                "2 Bob false",
                "1 Alice true");

            string once = Ison.DumpsCanonical(Ison.Loads(source));
            string twice = Ison.DumpsCanonical(Ison.Loads(once));

            Assert.Equal(once, twice);
        }

        /// <summary>Blocks with no fields are omitted from canonical output.</summary>
        [Fact]
        public void TestEmptyBlockOmitted()
        {
            var doc = new Document();
            doc.Blocks.Add(new Block("table", "empty"));
            doc.Blocks.Add(new Block("table", "full")
            {
                Fields = new List<string> { "id" },
                Rows = new List<Dictionary<string, object?>> { new() { { "id", 1L } } }
            });

            string canonical = Ison.DumpsCanonical(doc);
            Assert.DoesNotContain("table.empty", canonical);
            Assert.Contains("table.full", canonical);
        }

        /// <summary>Canonical form preserves field type annotations.</summary>
        [Fact]
        public void TestCanonicalPreservesTypeAnnotations()
        {
            var doc = Ison.Loads(string.Join("\n",
                "table.users",
                "id:int name:string active:bool",
                "1 Alice true"));

            string canonical = Ison.DumpsCanonical(doc);
            Assert.Contains("id:int active:bool name:string", canonical);
        }

        /// <summary>References survive canonical serialization.</summary>
        [Fact]
        public void TestCanonicalWithReferences()
        {
            var doc = Ison.Loads(string.Join("\n",
                "table.edges",
                "source target",
                ":2 :1",
                ":1 :3"));

            string canonical = Ison.DumpsCanonical(doc);
            Assert.Contains(":1 :3", canonical);
            Assert.Contains(":2 :1", canonical);
            Assert.True(canonical.IndexOf(":1 :3", StringComparison.Ordinal) <
                        canonical.IndexOf(":2 :1", StringComparison.Ordinal));
        }

        /// <summary>Canonical ISONL sorts blocks and rows the same way.</summary>
        [Fact]
        public void TestCanonicalIsonl()
        {
            var doc = Ison.Loads(string.Join("\n",
                "table.users",
                "id name",
                "2 Bob",
                "1 Alice"));

            string canonical = Ison.DumpsCanonicalIsonl(doc);
            string[] lines = canonical.Split('\n');

            Assert.Equal("table.users|id name|1 Alice", lines[0]);
            Assert.Equal("table.users|id name|2 Bob", lines[1]);
        }
    }

    internal static class TestPaths
    {
        public static string NormalizeLineEndings(string text)
        {
            string[] lines = text.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None);
            return string.Join("\n", lines.Select(l => l.TrimEnd()));
        }

        public static string FindRepositoryRoot()
        {
            var dir = new DirectoryInfo(Directory.GetCurrentDirectory());
            while (dir != null)
            {
                if (Directory.Exists(Path.Combine(dir.FullName, "benchmark")) &&
                    Directory.Exists(Path.Combine(dir.FullName, "ison-cs")))
                {
                    return dir.FullName;
                }
                dir = dir.Parent;
            }
            return Directory.GetCurrentDirectory();
        }
    }
}
