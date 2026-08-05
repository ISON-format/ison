using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Xunit;

namespace IsonParser.Tests
{
    /// <summary>
    /// The benchmark/parity/built corpus: Documents constructed, not parsed.
    ///
    /// Everything in the flat corpus arrives via Loads, so its names are safe by
    /// construction -- the parser could not have produced an unwritable one.
    /// These cases feed a plain data JSON through Json.FromJson instead, which
    /// is the only path that can put a name like "first name" or "a:b" into a
    /// Document.
    ///
    /// A case declares either an output or a rejection, never both.
    /// </summary>
    public class TestBuiltCorpus
    {
        private static string BuiltDir =>
            Path.Combine(TestPaths.FindRepositoryRoot(), "benchmark", "parity", "built");

        private static string? Read(string file)
        {
            string path = Path.Combine(BuiltDir, file);
            return File.Exists(path)
                ? File.ReadAllText(path).Replace("\r\n", "\n")
                : null;
        }

        public static IEnumerable<object[]> Cases()
        {
            string manifest = Path.Combine(BuiltDir, "cases.txt");
            if (!File.Exists(manifest))
            {
                yield break;
            }

            foreach (string line in File.ReadAllLines(manifest))
            {
                string name = line.Trim();
                if (name.Length > 0)
                {
                    yield return new object[] { name };
                }
            }
        }

        /// <summary>
        /// Map an exception onto the corpus's neutral token. Exception class
        /// names are not shared across seven languages, so the corpus holds a
        /// token and each implementation supplies this shim.
        /// </summary>
        private static string Classify(Exception e)
        {
            string text = e.Message.ToLowerInvariant();
            if (text.Contains("field")) return "INVALID_FIELD_NAME";
            if (text.Contains("block")) return "INVALID_BLOCK_NAME";
            return $"UNCLASSIFIED({e.GetType().Name})";
        }

        [Theory]
        [MemberData(nameof(Cases))]
        public void MatchesReferenceVerdict(string name)
        {
            string? build = Read($"{name}.build.json");
            Assert.NotNull(build);

            var modes = new (string Mode, Func<Document, string> Dump)[]
            {
                ("canonical", Serializer.DumpsCanonical),
                ("canonical_isonl", d => IsonlSerializer.DumpsCanonical(d).TrimEnd('\n')),
            };

            foreach (var (mode, dump) in modes)
            {
                string? wantErr = Read($"{name}.{mode}.expect-error");
                string? wantOut = Read($"{name}.{mode}.expected");

                Assert.False(wantErr != null && wantOut != null,
                    $"{name}.{mode} declares both an output and a rejection");

                if (wantErr == null && wantOut == null) continue;

                string? got = null;
                Exception? raised = null;
                try
                {
                    got = dump(Json.FromJson(build!));
                }
                catch (IsonException e)
                {
                    raised = e;
                }

                if (wantErr != null)
                {
                    Assert.True(raised != null,
                        $"{name}.{mode} serialized instead of being rejected: {got}");
                    Assert.Equal(wantErr.Trim(), Classify(raised!));
                }
                else
                {
                    Assert.True(raised == null, $"{name}.{mode} unexpected error: {raised?.Message}");
                    Assert.Equal(wantOut!.TrimEnd('\n'), got!.TrimEnd('\n'));
                }
            }
        }

        /// <summary>
        /// A corpus-driven Theory over an empty MemberData passes exactly like
        /// one that checked everything, so assert the corpus was found.
        /// </summary>
        [Fact]
        public void CorpusIsPresent()
        {
            Assert.True(Cases().Any(), $"built corpus not found at {BuiltDir}");
        }
    }
}
