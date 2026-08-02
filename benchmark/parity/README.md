# Cross-Language Parity Corpus

A shared corpus for verifying that every ISON implementation produces
**byte-identical output** for the same logical document.

Where `golden_fixture_field_sort.json` targets one algorithm (canonical field
sorting), this corpus covers the full surface: parsing, regular serialization,
canonical serialization, and both ISONL forms.

## Layout

Each case `<name>` consists of:

| File | Meaning |
| --- | --- |
| `<name>.ison` | Input document |
| `<name>.canonical.expected` | `dumps_canonical(loads(input))` |
| `<name>.dumps.expected` | `dumps(loads(input))` |
| `<name>.isonl.expected` | `dumps_isonl(loads(input))` |
| `<name>.canonical_isonl.expected` | `ISONLSerializer.dumps_canonical(loads(input))` |

All `.expected` files are generated from **ison-py**, the reference
implementation, with LF line endings and UTF-8 encoding.

## Cases

| Case | Covers |
| --- | --- |
| `basic` | Minimal table, ints, strings, bools |
| `types` | Full type inference incl. negative int and float |
| `quoting` | Every condition that forces a value to be quoted |
| `escapes` | `\n`, `\t`, `\"`, `\\` round-tripping |
| `references` | Simple, namespaced, and relationship references |
| `annotations` | Field type annotations, including `computed` |
| `scrambled_fields` | Field order normalization in canonical form |
| `unicode_fields` | UTF-8 vs UTF-16 ordering (Ａfield before 😀field) |
| `summary` | `---` summary rows |
| `multi_block` | Block ordering across several blocks |
| `null_keys` | Rows with a null key sort last |
| `numeric_keys` | Ordinal (not numeric) row ordering: `1 < 10 < 2` |
| `ordinal_keys` | Ordinal vs culture-sensitive ordering (`co-op`/`co_op`/`coop`) |
| `missing_trailing` | Missing trailing values become null |
| `header_lookalike` | Values shaped like `kind.name` must be quoted |

## Regenerating

Run against the reference implementation, writing LF endings and UTF-8:

```python
from ison_parser import loads, dumps, dumps_canonical, dumps_isonl, ISONLSerializer
doc = loads(source)
canonical       = dumps_canonical(doc)
regular         = dumps(doc)
isonl           = dumps_isonl(doc)
canonical_isonl = ISONLSerializer.dumps_canonical(doc)
```

Regenerate only when the reference behaviour intentionally changes — a
diff here is otherwise a bug in whichever implementation disagrees.

## Consumers

All six first-party implementations verify against this corpus:

| Implementation | Test |
| --- | --- |
| ison-py | reference — generates the `.expected` files |
| ison-js | `ison-js/test/test_parity.js` |
| ison-ts | `ison-ts/src/parity.test.ts` |
| ison-go | `ison-go/parity_test.go` |
| ison-rust | `ison-rust/tests/parity.rs` |
| ison-cpp | `ison-cpp/tests/test_parity.cpp` |
| ison-cs | `ison-cs/tests/TestCrossLanguageParity.cs` |

Each runs as part of that package's normal test command, so CI covers them
without extra wiring.

`cases.txt` lists every case name, so consumers can enumerate the corpus
without directory iteration (ison-cpp targets C++11, which has no
`<filesystem>`).

## Divergences this corpus caught

Every one of these was a real cross-implementation bug, found by running the
corpus and since fixed. They are listed as regression history — the corpus now
passes byte-for-byte everywhere.

1. **Locale-sensitive canonical ordering (ison-ts).** Canonical block and row
   sorting used `String.prototype.localeCompare`, which is culture-aware and
   treats punctuation as ignorable, ordering `co_op` before `co-op`. Output was
   also machine-locale dependent. Now ordinal. See the `ordinal_keys` case.

2. **Missing field sorting entirely (ison-ts).** `dumpsCanonical` emitted
   fields in document order, so canonical output differed from every other
   implementation whenever input field order did. See `scrambled_fields`.

3. **Null emitted as `~` (ison-go).** `Value.ToISON()` emitted the `~` alias
   for null, which ison-py and ison-js parse as the *string* `"~"` — silently
   corrupting every null that crossed implementations. Now emits `null`; `~` is
   still accepted on input.

4. **ISONL dropped type annotations (ison-py, ison-js, ison-cpp, ison-cs).**
   The ISONL serializer emitted bare field names, making an
   ISON → ISONL → ISON round trip lossy; and those parsers read an annotated
   envelope as fields literally named `id:int`, corrupting row keys. See the
   `annotations` case.

5. **Canonical ISONL did not normalize field order (ison-py, ison-go,
   ison-ts).** `ISONCS.md` requires field insertion order to be normalized in
   canonical form; only ISON did so.

6. **Over-quoting every dotted value (ison-rust).** Any value containing `.`
   was quoted, so emails, domains and version strings were quoted where other
   implementations emit them bare — costing tokens and breaking byte-identity.
   Only `ident.ident` shapes need quoting. See `header_lookalike`.

7. **`dumps()` default alignment (ison-js).** Defaulted to
   `alignColumns = true` while every other implementation defaulted to `false`,
   contradicting its own changelog and losing the token efficiency ISON exists
   for.

8. **Trailing newlines (ison-go).** `Dumps`, `DumpsISONL` and
   `DumpsCanonicalISONL` appended a trailing newline while `DumpsCanonical` did
   not, and no other implementation does. Now consistent.
