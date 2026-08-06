package ison

import (
	"strings"
	"testing"
)

// The parse -> serialize invariant: anything the reader can produce, the writer
// must accept.
//
// A validator that rejects more than its own parser can emit turns a valid file
// into one that can be read but not written, which is worse than the corruption
// it set out to stop. ISONL is allowed to refuse a document ISON can hold -- a
// pipe ends its field, so it cannot parse one either -- but it may never write
// a line it cannot read back. That last case is a real defect found in the
// published releases: a reference id containing '|' produced an ISONL line with
// three pipes, written silently and failing later at read.
func TestParseThenSerializeInvariant(t *testing.T) {
	cases := map[string]string{
		"plain":     "table.t\nid name\n1 Alice",
		"dotted":    "table.t\nid a.b\n1 v",
		"hashInfix": "table.t\nid a#b\n1 v",
		"refPlain":  "table.t\nid ref\n1 :42",
		"refNs":     "table.t\nid ref\n1 :user:101",
		"refRel":    "table.t\nid ref\n1 :MEMBER_OF:10",
		"refPipe":   "table.t\nid ref\n1 :p:a|b",
		"refColon":  "table.t\nid ref\n1 :p:a:b",
		"quoted":    "table.t\nid name\n1 \"Bob Smith\"",
		"nulls":     "table.t\nid a b\n1 null ~",
		"typed":     "table.t\nid:int name:string\n1 Alice",
		"unicode":   "table.t\nid ünïcode\n1 v",
	}

	isonModes := []struct {
		label string
		dump  func(*Document) (string, error)
	}{{"Dumps", Dumps}, {"DumpsCanonical", DumpsCanonical}}

	isonlModes := []struct {
		label string
		dump  func(*Document) (string, error)
	}{{"DumpsISONL", DumpsISONL}, {"DumpsCanonicalISONL", DumpsCanonicalISONL}}

	for name, src := range cases {
		name, src := name, src
		t.Run(name, func(t *testing.T) {
			doc, err := Parse(src)
			if err != nil {
				t.Skipf("not a document the parser accepts: %v", err)
			}

			for _, m := range isonModes {
				out, err := m.dump(doc)
				if err != nil {
					t.Errorf("%s refused a document its own parser accepted: %v", m.label, err)
					continue
				}
				again, err := Parse(out)
				if err != nil {
					t.Errorf("%s wrote something it cannot read back: %q (%v)", m.label, out, err)
					continue
				}
				out2, err := m.dump(again)
				if err != nil {
					t.Errorf("%s failed on its own output: %v", m.label, err)
				} else if out != out2 {
					t.Errorf("%s unstable:\n  1st %q\n  2nd %q", m.label, out, out2)
				}
			}

			for _, m := range isonlModes {
				out, err := m.dump(doc)
				if err != nil {
					// A documented refusal is fine; anything else is not.
					if strings.Contains(err.Error(), "reference") ||
						strings.Contains(err.Error(), "ISONL") {
						continue
					}
					t.Errorf("%s unexpected error: %v", m.label, err)
					continue
				}
				if _, err := ParseISONL(strings.TrimRight(out, "\n")); err != nil {
					t.Errorf("%s wrote something it cannot read back: %q (%v)", m.label, out, err)
				}
			}
		})
	}
}
