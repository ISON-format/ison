package ison

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Byte-identity checks against the shared parity corpus in benchmark/parity.
//
// The .expected files are generated from the ison-py reference implementation,
// so a diff here is a genuine cross-language incompatibility rather than a
// Go-only test failure.

const parityDir = "../benchmark/parity"

func parityCases(t *testing.T) []string {
	t.Helper()

	entries, err := os.ReadDir(parityDir)
	if err != nil {
		t.Skipf("parity corpus not available: %v", err)
	}

	var names []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".ison") {
			names = append(names, strings.TrimSuffix(e.Name(), ".ison"))
		}
	}
	sort.Strings(names)
	return names
}

func parityRead(t *testing.T, name, suffix string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(parityDir, name+"."+suffix))
	require.NoError(t, err)
	return strings.ReplaceAll(string(b), "\r\n", "\n")
}

func TestParityCorpus(t *testing.T) {
	for _, name := range parityCases(t) {
		name := name
		t.Run(name, func(t *testing.T) {
			doc, err := Parse(parityRead(t, name, "ison"))
			require.NoError(t, err)

			assert.Equal(t, parityRead(t, name, "canonical.expected"),
				DumpsCanonical(doc), "canonical ISON")

			assert.Equal(t, parityRead(t, name, "dumps.expected"),
				Dumps(doc), "regular ISON")

			isonl, err := DumpsISONL(doc)
			require.NoError(t, err)
			assert.Equal(t, parityRead(t, name, "isonl.expected"),
				strings.TrimRight(isonl, "\n"), "ISONL")

			canonicalIsonl, err := DumpsCanonicalISONL(doc)
			require.NoError(t, err)
			assert.Equal(t, parityRead(t, name, "canonical_isonl.expected"),
				strings.TrimRight(canonicalIsonl, "\n"), "canonical ISONL")
		})
	}
}

// Canonicalizing already-canonical output must be a no-op, which is what makes
// canonical form usable for content addressing.
func TestParityCanonicalIdempotent(t *testing.T) {
	for _, name := range parityCases(t) {
		name := name
		t.Run(name, func(t *testing.T) {
			doc, err := Parse(parityRead(t, name, "ison"))
			require.NoError(t, err)

			once := DumpsCanonical(doc)
			reparsed, err := Parse(once)
			require.NoError(t, err)

			assert.Equal(t, once, DumpsCanonical(reparsed))
		})
	}
}

// Order independence: every permutation of the same logical document must
// serialize to the same canonical bytes. The top-level corpus cannot express
// this -- a single input has one row order, so its output is deterministic
// whether or not the row sort is total.
//
// Cases live in benchmark/parity/permuted/<name>/{a,b,c}.ison with one shared
// expected output per mode.

const permutedDir = parityDir + "/permuted"

func permutedCases(t *testing.T) []string {
	t.Helper()
	entries, err := os.ReadDir(permutedDir)
	if err != nil {
		t.Skipf("permuted corpus not available: %v", err)
	}
	var names []string
	for _, e := range entries {
		if e.IsDir() {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	return names
}

func TestParityPermuted(t *testing.T) {
	for _, name := range permutedCases(t) {
		name := name
		t.Run(name, func(t *testing.T) {
			dir := filepath.Join(permutedDir, name)

			readExpected := func(mode string) (string, bool) {
				b, err := os.ReadFile(filepath.Join(dir, mode+".expected"))
				if err != nil {
					return "", false
				}
				return strings.ReplaceAll(string(b), "\r\n", "\n"), true
			}

			entries, err := os.ReadDir(dir)
			require.NoError(t, err)

			variants := 0
			for _, e := range entries {
				if !strings.HasSuffix(e.Name(), ".ison") {
					continue
				}
				variants++
				src, err := os.ReadFile(filepath.Join(dir, e.Name()))
				require.NoError(t, err)

				doc, err := Parse(strings.ReplaceAll(string(src), "\r\n", "\n"))
				require.NoError(t, err)

				if want, ok := readExpected("canonical"); ok {
					assert.Equal(t, want, DumpsCanonical(doc),
						"%s/%s canonical", name, e.Name())
				}
				if want, ok := readExpected("canonical_isonl"); ok {
					got, err := DumpsCanonicalISONL(doc)
					require.NoError(t, err)
					assert.Equal(t, want, strings.TrimRight(got, "\n"),
						"%s/%s canonical ISONL", name, e.Name())
				}
			}
			assert.Greater(t, variants, 1, "a permuted case needs at least two variants")
		})
	}
}
