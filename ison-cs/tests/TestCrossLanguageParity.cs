using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using IsonParser;
using Xunit;

namespace IsonParser.Tests
{
    /// <summary>
    /// Byte-identity checks against the shared parity corpus in benchmark/parity.
    ///
    /// The .expected files are generated from the ison-py reference
    /// implementation, so any divergence here is a genuine cross-language
    /// incompatibility rather than a C#-only test failure.
    /// </summary>
    public class TestCrossLanguageParity
    {
        public static IEnumerable<object[]> Cases()
        {
            string dir = Path.Combine(TestPaths.FindRepositoryRoot(), "benchmark", "parity");
            if (!Directory.Exists(dir)) yield break;

            foreach (string path in Directory.GetFiles(dir, "*.ison").OrderBy(p => p, System.StringComparer.Ordinal))
            {
                yield return new object[] { Path.GetFileNameWithoutExtension(path) };
            }
        }

        private static string Read(string caseName, string suffix)
        {
            string path = Path.Combine(
                TestPaths.FindRepositoryRoot(), "benchmark", "parity", $"{caseName}.{suffix}");
            return File.ReadAllText(path, Encoding.UTF8).Replace("\r\n", "\n");
        }

        private static Document LoadCase(string caseName) => Ison.Loads(Read(caseName, "ison"));

        [Theory]
        [MemberData(nameof(Cases))]
        public void CanonicalMatchesReference(string caseName)
        {
            Assert.Equal(Read(caseName, "canonical.expected"), Ison.DumpsCanonical(LoadCase(caseName)));
        }

        [Theory]
        [MemberData(nameof(Cases))]
        public void DumpsMatchesReference(string caseName)
        {
            Assert.Equal(Read(caseName, "dumps.expected"), Ison.Dumps(LoadCase(caseName)));
        }

        [Theory]
        [MemberData(nameof(Cases))]
        public void IsonlMatchesReference(string caseName)
        {
            Assert.Equal(Read(caseName, "isonl.expected"), Ison.DumpsIsonl(LoadCase(caseName)));
        }

        [Theory]
        [MemberData(nameof(Cases))]
        public void CanonicalIsonlMatchesReference(string caseName)
        {
            Assert.Equal(Read(caseName, "canonical_isonl.expected"),
                         Ison.DumpsCanonicalIsonl(LoadCase(caseName)));
        }

        /// <summary>
        /// Canonicalizing an already-canonical document must be a no-op, which
        /// is what makes canonical form usable for content addressing.
        /// </summary>
        [Theory]
        [MemberData(nameof(Cases))]
        public void CanonicalIsIdempotent(string caseName)
        {
            string once = Ison.DumpsCanonical(LoadCase(caseName));
            string twice = Ison.DumpsCanonical(Ison.Loads(once));
            Assert.Equal(once, twice);
        }

        /// <summary>
        /// Every corpus document survives an ISON -> parse -> ISON round trip
        /// unchanged.
        /// </summary>
        [Theory]
        [MemberData(nameof(Cases))]
        public void DumpsRoundTripsStably(string caseName)
        {
            string once = Ison.Dumps(LoadCase(caseName));
            string twice = Ison.Dumps(Ison.Loads(once));
            Assert.Equal(once, twice);
        }
    }

    /// <summary>
    /// Order independence: every permutation of the same logical document must
    /// serialize to identical canonical bytes.
    ///
    /// The top-level corpus cannot express this — a single input has one row
    /// order, so its output is deterministic whether or not the row sort is
    /// total. Cases live in benchmark/parity/permuted/&lt;name&gt;/{a,b,c}.ison
    /// with one shared expected output per mode.
    /// </summary>
    public class TestPermutedParity
    {
        private static string PermutedDir =>
            Path.Combine(TestPaths.FindRepositoryRoot(), "benchmark", "parity", "permuted");

        public static IEnumerable<object[]> Cases()
        {
            if (!Directory.Exists(PermutedDir)) yield break;
            foreach (string dir in Directory.GetDirectories(PermutedDir)
                         .OrderBy(d => d, StringComparer.Ordinal))
            {
                yield return new object[] { Path.GetFileName(dir) };
            }
        }

        [Theory]
        [MemberData(nameof(Cases))]
        public void EveryPermutationYieldsTheSameBytes(string caseName)
        {
            string dir = Path.Combine(PermutedDir, caseName);

            string? Expected(string mode)
            {
                string p = Path.Combine(dir, mode + ".expected");
                return File.Exists(p)
                    ? File.ReadAllText(p, Encoding.UTF8).Replace("\r\n", "\n")
                    : null;
            }

            string? canonical = Expected("canonical");
            string? canonicalIsonl = Expected("canonical_isonl");

            var variants = Directory.GetFiles(dir, "*.ison")
                .OrderBy(f => f, StringComparer.Ordinal).ToList();
            Assert.True(variants.Count > 1, "a permuted case needs at least two variants");

            foreach (string path in variants)
            {
                var doc = Ison.Loads(File.ReadAllText(path, Encoding.UTF8).Replace("\r\n", "\n"));

                if (canonical != null) Assert.Equal(canonical, Ison.DumpsCanonical(doc));
                if (canonicalIsonl != null) Assert.Equal(canonicalIsonl, Ison.DumpsCanonicalIsonl(doc));
            }
        }
    }
}
