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
}
