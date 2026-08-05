package ison

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The benchmark/parity/built corpus: Documents constructed, not parsed.
//
// Everything in the flat corpus arrives via Parse, so its names are safe by
// construction -- the parser could not have produced an unwritable one. These
// cases feed a plain data JSON through FromDict instead, which is the only path
// that can put a name like "first name" or "a:b" into a Document.
//
// A case declares either an output or a rejection, never both.

const builtDir = "../benchmark/parity/built"

func builtCases(t *testing.T) []string {
	t.Helper()

	b, err := os.ReadFile(filepath.Join(builtDir, "cases.txt"))
	if err != nil {
		t.Skipf("built corpus not available: %v", err)
	}

	var names []string
	for _, line := range strings.Split(strings.ReplaceAll(string(b), "\r\n", "\n"), "\n") {
		if strings.TrimSpace(line) != "" {
			names = append(names, strings.TrimSpace(line))
		}
	}
	return names
}

func builtRead(t *testing.T, file string) (string, bool) {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(builtDir, file))
	if err != nil {
		return "", false
	}
	return strings.ReplaceAll(string(b), "\r\n", "\n"), true
}

// classifyNameError maps an error onto the corpus's neutral token. Error types
// are not shared across seven languages, so the corpus holds a token and each
// implementation supplies this shim.
func classifyNameError(err error) string {
	text := strings.ToLower(err.Error())
	if strings.Contains(text, "field") {
		return "INVALID_FIELD_NAME"
	}
	if strings.Contains(text, "block") {
		return "INVALID_BLOCK_NAME"
	}
	return "UNCLASSIFIED(" + err.Error() + ")"
}

func TestBuiltCorpus(t *testing.T) {
	modes := map[string]func(*Document) (string, error){
		"canonical": DumpsCanonical,
		"canonical_isonl": func(d *Document) (string, error) {
			s, err := DumpsCanonicalISONL(d)
			return strings.TrimRight(s, "\n"), err
		},
	}

	for _, name := range builtCases(t) {
		name := name
		t.Run(name, func(t *testing.T) {
			raw, ok := builtRead(t, name+".build.json")
			require.True(t, ok, "missing %s.build.json", name)

			var data map[string]interface{}
			require.NoError(t, json.Unmarshal([]byte(raw), &data))

			for mode, dump := range modes {
				wantErr, hasErr := builtRead(t, name+"."+mode+".expect-error")
				wantOut, hasOut := builtRead(t, name+"."+mode+".expected")

				require.False(t, hasErr && hasOut,
					"%s.%s declares both an output and a rejection", name, mode)

				got, err := dump(FromDict(data))

				switch {
				case hasErr:
					require.Error(t, err,
						"%s.%s serialized instead of being rejected", name, mode)
					assert.Equal(t, strings.TrimSpace(wantErr), classifyNameError(err),
						"%s.%s", name, mode)
				case hasOut:
					require.NoError(t, err, "%s.%s", name, mode)
					assert.Equal(t, wantOut, got, "%s.%s", name, mode)
				}
			}
		})
	}
}
