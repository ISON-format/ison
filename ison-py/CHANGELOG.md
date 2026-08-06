# Changelog

## [1.1.0] - 2026-08-05

> **Breaking.** Serialization now rejects block and field names that cannot be
> written and read back as themselves. Documents holding such a name used to
> serialize into bytes that parsed as different data; they now raise. Names
> obtained by parsing are unaffected — the parser could never produce one.

### Fixed

- **References Could Not Encode Whitespace, And A Newline Destroyed Them (CRITICAL)**: a reference emits as `:type:id` with no quoting, so unlike every other value its characters land in the row raw. A space or tab split the row into extra columns and failed to parse; a newline ended the row early and truncated the reference *silently* -- `Reference(id="a" + newline + "b")` came back as `Reference(p:a)`, data gone, no error. Both the id and the type are now rejected at write when they hold whitespace.
- **ISONL Wrote Lines It Could Not Read (CRITICAL)**: a reference id containing `|` is valid ISON and round-trips there, but ISONL ends its field at a pipe -- so ISON -> ISONL emitted `table.t|id ref|1 :p:a|b`, a line with three pipes where the format allows two. It was written silently and failed later at read, in a different process, pointing at the reader. ISONL now refuses it at the point of conversion. ISON is unchanged and still writes it, because the rule is that each form rejects exactly what it cannot parse and nothing more: refusing in ISON would make a valid file readable but not writable.
- **Unwritable Names Were Silently Emitted (CRITICAL)**: a field named `first name` serialized to a header reading `first name`, which parses back as two fields — a document written by one program became different data when read by another, with no error at either end. The same held for `:` (the type separator), `|` (the ISONL delimiter), a line-initial `#` (a comment), and a space in a block name. Serialization now rejects them. Still legal, and pinned by corpus cases: `.` in a field name, `#` after the first character, and `.` in a block name.
- **Name Rules Shared Across Serializers**: the rules lived only in the ISONL envelope check, so regular and canonical ISON emitted unwritable names unchecked. A name unwritable in ISON is unwritable in ISONL, so both now share one implementation; ISONL keeps its own additional rules for the quote and backslash its value escaping needs.

### Testing

- **built/ Corpus Now Runs Here**: the shared corpus has a third shape — a Document constructed rather than parsed, which is the only way to hold a name the parser could not produce. It previously ran only in a standalone harness that nothing invoked, which is why the bug above went unnoticed. It now runs as part of this package's own test suite.


## [1.0.5] - 2026-08-05

> **Canonical bytes change.** Documents with tied key values or non-ASCII row
> values serialize differently than in previous releases. This is the fix, not a
> regression — the previous output depended on row insertion order. Anything
> storing ISONCS hashes will see them move once.

### Fixed

- **Canonical Row Order Was Not Total (CRITICAL)**: canonical row order keyed on the first column only, so rows tying on that column fell back to input order. The same logical data serialized to different bytes depending on how the rows were built, breaking content addressing and prefix stability — the two properties canonical form exists for. Rows now sort on the full canonical field tuple, with nulls sorting last at every position rather than only the key column.
- **Row Ordering Ignored UTF-8 Encoding**: row sorting compared values in the host language's native string order while field sorting compared UTF-8 bytes, so the two disagreed. In UTF-16 languages this ordered astral values differently from the reference — `"Ａ"` (U+FF21) must precede `"😀"` (U+1F600) by UTF-8 bytes, but UTF-16 puts the emoji's lead surrogate first. All seven implementations now agree.
- **Canonical ISONL Duplicated The Row Sort**: ISONL carried its own copy of the row-ordering logic, so fixing canonical ISON silently missed it. Both forms now share one implementation.
- **Flat Row Keys Containing A Dot Were Destroyed**: `_get_nested_value` treated a dotted field name purely as a nested path, so a row with the literal key `"a.b"` emitted `null`. It now falls back to the literal key when the dot path does not resolve; genuinely nested values still take precedence.

### Performance

- **Canonical Serialization Fast Path**: a first column that already distinguishes every row leaves no ties to break, so the remaining columns cannot affect the result. Detecting that is O(rows) against O(rows × columns) to build full sort keys. Canonical overhead measured on the project benchmark: +3.7% before this release's correctness fix, +35.4% with the naive fix, +8.7% with the fast path.

## [1.0.4] - 2026-08-01

### Added
- **Canonical Serialization (ISONCS)**: New `dumps_canonical(doc)` and `dumps_canonical_isonl(doc)` functions produce byte-identical output across implementations by sorting blocks and rows ordinal-string and emitting with fixed settings (single-space delimiter, no alignment). Supports content addressing, prefix stability (ISONGraph), and LLM prompt caching.
- **Field Sorting in ISONCS**: `dumps_canonical()` now sorts fields within each row for deterministic output across implementations with unordered hash tables (Rust HashMap, Go map, C# Dictionary). Algorithm: `id` field first (if present), then remaining fields alphabetically by UTF-8 byte order. This ensures byte-identical canonical output regardless of iteration order semantics.
- **UTF-8 Byte Comparison**: Field sorting explicitly uses UTF-8 byte comparison (ordinal), not Unicode code points, to avoid divergence in UTF-16 languages (JavaScript, TypeScript, C#). All implementations verified to produce byte-identical output on golden fixture including UTF-16 divergence test case (Ａfield vs 😀field).

### Changed
- **ISONCS Specification Updated**: ISONCS.md now documents field ordering rules, reserved field names (`id`), UTF-8 byte vs Unicode code point divergence, and cross-implementation verification approach.
- **Regression Tests Expanded**: Added field-order independence tests, table signature order-independence tests, and UTF-16 divergence sentinel tests. All six implementations (Python, Rust, JavaScript, TypeScript, C#, Go, C++) verified on shared golden fixture.


### Fixed — cross-implementation parity

These were found by a new shared parity corpus (`benchmark/parity/`) whose expected output is generated from the ison-py reference. Every implementation now verifies against it byte-for-byte.

- **ISONL Dropped Type Annotations**: `dumps_isonl()` emitted bare field names, making an ISON → ISONL → ISON round trip lossy, and `ISONLParser` read an annotated envelope written by another implementation as fields literally named `id:int`, silently corrupting row keys. Annotations are now emitted and parsed.
- **Canonical ISONL Did Not Normalize Field Order**: `ISONLSerializer.dumps_canonical()` emitted fields in document order while canonical ISON sorted them. ISONCS requires field insertion order to be normalized in canonical form, so a document built from an unordered map produced non-deterministic canonical ISONL.

- **`~` Null Spelling Only Half-Supported**: `README.md` documents `~ or null for null values`, but a bare `~` parsed as the *string* `"~"` — so the README's own example misparsed. Both spellings now parse as null, and the literal string `"~"` is quoted on output so it still round-trips. Emission stays `null`, since older published releases cannot read `~`.


## [1.0.3] - 2026-07-13

### Fixed
- **ISONL Round-Trip Integrity**: Serialized values ending in a backslash (e.g. `"x \\"`) no longer desync the ISONL quote tracking, which previously caused a later `|` on the same line to split sections incorrectly (parse errors or silently corrupted rows). The pipe-splitter now consumes escape pairs inside quoted strings.
- **ISONL Quoting**: String values containing carriage returns or backslashes are now quoted and escaped on serialization; previously they were emitted raw and could be corrupted or lost on parse.
- **Explicit `\|` Escape**: The tokenizer now decodes `\|` explicitly instead of relying on the unknown-escape fallback.

### Added
- **ISONL Envelope Validation**: `dumps_isonl()` now raises `ISONError` when a block kind, name, or field name contains characters that cannot survive an ISONL round-trip (pipe, quote, backslash, whitespace; plus `.` or leading `#` in kind) instead of silently emitting a corrupt line. Dots remain legal in block names (the parser splits the header on the first dot).
- **Regression Tests**: Adversarial escaping round-trip test, a seeded 300-trial property test over a hostile character alphabet, and envelope validation tests.

### Changed
- **Extra Values Are Errors**: Rows (ISON and ISONL) with more values than declared fields now raise `ISONSyntaxError` instead of silently truncating the extras. Missing trailing values still parse as `null`.
- **Inline Comments Formalized**: In a data row or ISONL values section, an unquoted token starting with `#` begins an inline comment (it and everything after it is ignored). Quoted tokens are always data. Previously inline comments only "worked" as a side effect of silent extra-value truncation.
- **Regular ISON Quoting Hardened**: `dumps()` now quotes string values containing carriage returns or backslashes, values starting with `#` (previously a leading-`#` value at line start silently turned the whole row into a comment on re-parse), and values shaped like a `kind.name` block header (previously a single-field row value like `a.true` was re-parsed as a new block header).

## [1.0.1] - 2025-12-29

### Fixed
- **Field Order Preservation**: `from_dict()` now preserves the insertion order of fields instead of using a `set()` which randomized column order. This ensures consistent output matching the original data structure.

### Changed
- **Default Alignment**: `dumps()` now defaults to `align_columns=False` for token efficiency. Single space delimiter between columns is now the default. Use `align_columns=True` for human-readable padded output.

### Added
- **Delimiter Option**: New `delimiter` parameter in `dumps(doc, delimiter=' ')`:
  - Default is single space `' '` for maximum token efficiency
  - Use comma `','` for clearer column separation in data with quoted strings
  - Delimiter choice affects tokenization - space is generally more efficient

- **Auto-Reference Detection**: New `auto_refs` parameter in `from_dict(data, auto_refs=True)`:
  - Detects `*_id` suffix fields and converts to ISON references (e.g., `customer_id: 1` -> `:customer:1`)
  - Detects `nodes`/`edges` graph pattern and converts `source`/`target` to `:node:id` references
  - Improves LLM comprehension of relational data by making relationships explicit

- **Smart Column Ordering**: New `smart_order` parameter in `from_dict(data, smart_order=True)`:
  - Reorders columns for optimal LLM comprehension
  - Priority order: `id` (primary anchor) → `name/title/label` (human-readable) → data fields → `*_id` references
  - Reduces "column confusion" where LLMs return the correct row but wrong column value
  - No token overhead - just reordering existing columns

### Example
```python
import ison_parser

data = {
    "customers": [{"id": 1, "name": "Alice"}],
    "orders": [{"id": 101, "customer_id": 1, "total": 99.99}]
}

# With auto_refs=True
doc = ison_parser.from_dict(data, auto_refs=True)
print(ison_parser.dumps(doc, align_columns=False))

# Output:
# table.customers
# id name
# 1 Alice
#
# table.orders
# id customer_id total
# 101 :customer:1 99.99
```

## [1.0.0] - 2025-12-25

### Initial Release
- ISON v1.0 Reference Parser
- Full support for ISON and ISONL formats
- Reference syntax (`:id`, `:type:id`, `:RELATIONSHIP:id`)
- Type inference (int, float, bool, string, null)
- Quoted string handling with escape sequences
- CLI interface for parsing and conversion
- Plugins for SQLite, PostgreSQL, Chroma, Pinecone, Qdrant
- Integrations for OpenAI, Anthropic, LangChain, LlamaIndex
