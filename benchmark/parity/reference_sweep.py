"""The parse -> serialize invariant, swept across every implementation.

Anything the reader can produce, the writer must accept. A validator that
rejects more than its own parser can emit turns a valid file into one that can
be read but not written, which is worse than the corruption it set out to stop.

This sweeps documents an author can actually write, in every serializer, and
checks two things:

  1. no serializer refuses a document its own parser accepted
  2. serializing twice gives the same bytes (so the output is re-readable)

It found one real deviation in the published releases: a reference whose id
contains '|' emitted an ISONL line with three pipes, which is unreadable --
silently written, failing later at read, in another process.

Run:  python benchmark/parity/reference_sweep.py [path-to-ison-py-src]
"""

from __future__ import annotations

import pathlib
import sys

SRC = sys.argv[1] if len(sys.argv) > 1 else str(
    pathlib.Path(__file__).resolve().parents[2] / "ison-py" / "src"
)
sys.path.insert(0, SRC)

import ison_parser as I  # noqa: E402

#: (label, source) -- every one of these is a document the parser accepts.
CASES = [
    ("plain",            "table.t\nid name\n1 Alice"),
    ("dotted field",     "table.t\nid a.b\n1 v"),
    ("hash infix",       "table.t\nid a#b\n1 v"),
    ("reference plain",  "table.t\nid ref\n1 :42"),
    ("reference ns",     "table.t\nid ref\n1 :user:101"),
    ("reference rel",    "table.t\nid ref\n1 :MEMBER_OF:10"),
    ("reference pipe",   "table.t\nid ref\n1 :p:a|b"),
    ("reference colon",  "table.t\nid ref\n1 :p:a:b"),
    ("reference hash",   "table.t\nid ref\n1 :p:a#b"),
    ("quoted spaces",    'table.t\nid name\n1 "Bob Smith"'),
    ("null forms",       "table.t\nid a b\n1 null ~"),
    ("typed fields",     "table.t\nid:int name:string\n1 Alice"),
    ("unicode field",    "table.t\nid ünïcode\n1 v"),
    ("astral field",     "table.t\nid 😀f\n1 v"),
    ("block dot name",   "table.a.b\nid\n1"),
    ("summary row",      "table.t\nid n\n1 2\n---\ntotal 2"),
]

#: (label, dump, reload, may_refuse)
#:
#: ISONL may legitimately refuse a document ISON can hold -- a pipe ends its
#: field, so it cannot parse one either. Refusing is correct there; emitting a
#: line that cannot be re-read is not.
MODES = [
    ("dumps",           I.dumps,                        I.loads,       False),
    ("canonical",       I.dumps_canonical,              I.loads,       False),
    ("isonl",           I.dumps_isonl,                  I.loads_isonl, True),
    ("canonical_isonl", I.ISONLSerializer.dumps_canonical, I.loads_isonl, True),
]


def main() -> int:
    print(f"parse -> serialize sweep against {SRC}\n")
    deviations = 0

    for label, src in CASES:
        try:
            doc = I.loads(src)
        except Exception as exc:                     # not a document; nothing to assert
            print(f"  {label:<17} unparseable ({type(exc).__name__}) - skipped")
            continue

        for mode, dump, reload, may_refuse in MODES:
            try:
                once = dump(doc)
            except I.ISONNameError as exc:
                if not may_refuse:
                    print(f"  {label:<17} {mode:<16} REFUSED a parseable document: {exc}")
                    deviations += 1
                continue
            except Exception as exc:
                print(f"  {label:<17} {mode:<16} {type(exc).__name__}: {exc}")
                deviations += 1
                continue

            # Whatever was written must be readable, and stable on a second pass.
            try:
                twice = dump(reload(once))
            except Exception as exc:
                print(f"  {label:<17} {mode:<16} wrote something it cannot read back: "
                      f"{type(exc).__name__}")
                print(f"      {once!r}")
                deviations += 1
                continue

            if once != twice:
                print(f"  {label:<17} {mode:<16} UNSTABLE")
                print(f"      1st {once!r}")
                print(f"      2nd {twice!r}")
                deviations += 1

    print(f"\n  {len(CASES)} cases x {len(MODES)} serializers | deviations: {deviations}")
    return 1 if deviations else 0


if __name__ == "__main__":
    raise SystemExit(main())
