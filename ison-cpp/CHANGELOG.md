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

### Added

- **`ISONNameError`**: thrown when a name has no unambiguous ISON encoding. Derives from `ISONError`, so existing handlers keep working.

### Testing

- **built/ Corpus Now Runs Here**: added as a third ctest target. ison-cpp has no JSON reader, so unlike the other six it constructs the case Documents in code and reads only the verdicts from the corpus; a case listed in `cases.txt` with no C++ counterpart fails rather than silently skipping.


## [1.0.3] - 2026-08-05

> **Canonical bytes change.** Documents with tied key values or non-ASCII row
> values serialize differently than in previous releases. This is the fix, not a
> regression — the previous output depended on row insertion order. Anything
> storing ISONCS hashes will see them move once.

### Fixed

- **Canonical Row Order Was Not Total (CRITICAL)**: canonical row order keyed on the first column only, so rows tying on that column fell back to input order. The same logical data serialized to different bytes depending on how the rows were built, breaking content addressing and prefix stability — the two properties canonical form exists for. Rows now sort on the full canonical field tuple, with nulls sorting last at every position rather than only the key column.
- **Row Ordering Ignored UTF-8 Encoding**: row sorting compared values in the host language's native string order while field sorting compared UTF-8 bytes, so the two disagreed. In UTF-16 languages this ordered astral values differently from the reference — `"Ａ"` (U+FF21) must precede `"😀"` (U+1F600) by UTF-8 bytes, but UTF-16 puts the emoji's lead surrogate first. All seven implementations now agree.
- **Canonical ISONL Duplicated The Row Sort**: ISONL carried its own copy of the row-ordering logic, so fixing canonical ISON silently missed it. Both forms now share one implementation.

### Changed

- **`Serializer::row_less_canonical` Is Public**: `ISONLSerializer` shares the canonical row comparator rather than duplicating it.

## [1.0.2] - 2026-08-01

### Added
- **Field Sorting in ISONCS**: `dumps_canonical()` now sorts fields for deterministic output across implementations. Algorithm: `id` field first, then alphabetically by UTF-8 bytes.
- **UTF-8 Byte Comparison (CRITICAL)**: Uses unsigned char cast to avoid x86 signed char trap in byte comparisons. Ensures field ordering matches Python, Rust, JavaScript, TypeScript, C#, and Go implementations.
- **Canonical Serialization (ISONCS)**: New `dumps_canonical(const Document&)` and `dumps_canonical_isonl(const Document&)` functions produce byte-identical output across implementations by sorting blocks and rows ordinal-string and emitting with fixed settings (single-space delimiter, no alignment). Supports content addressing, prefix stability (ISONGraph), and LLM prompt caching.

### Changed
- **ISONCS Specification Updated**: Field ordering rules now explicit with UTF-8 vs Unicode divergence tests (e.g., Ａfield vs 😀field).
- **Tests Expanded**: Golden fixture validation confirms byte-for-byte match across all implementations (Python, Rust, JavaScript, TypeScript, C#, Go, C++).

### Testing
- All 45 tests passing
- Golden fixture: byte-for-byte match with reference implementation
- Cross-language: verified against Python (v1.0.4) and other implementations
- UTF-8 ordering confirmed with non-BMP character tests


### Fixed — cross-implementation parity

These were found by a new shared parity corpus (`benchmark/parity/`) whose expected output is generated from the ison-py reference. Every implementation now verifies against it byte-for-byte.

- **ISONL Dropped Type Annotations**: `dumps_isonl()` and `dumps_canonical_isonl()` emitted bare field names, making an ISON → ISONL → ISON round trip lossy, and `ISONLParser` read an annotated envelope as fields literally named `id:int`, corrupting row keys. Annotations are now emitted and parsed.

- **Parity Test**: `tests/test_parity.cpp` verifies all four renderings plus canonical idempotence against the shared corpus (C++11, reads `cases.txt`).

- **Literal String `"~"` Lost on Round Trip**: `~` parsed as null but the string `"~"` was never quoted on output, so it serialized bare and came back as null. Now quoted.


## [1.0.1] - 2026-07-13

### Fixed
- **ISONL Round-Trip Corruption**: Fixed quote-tracking desync in the ISONL section splitter — a quoted value ending in an escaped backslash (e.g. `"x \\"`) let a later `|` split the line in the wrong place. The splitter now consumes escape pairs instead of using look-behind.
- **ISONL Serialization of `\r` and `\\`**: The ISONL serializer now quotes strings containing carriage returns or backslashes (and bare numeric strings), so they survive a round-trip instead of being emitted raw.
- **Explicit `\|` Unescape**: The tokenizer now maps the `\|` escape to `|` explicitly.
- **Extra Values Now Error**: A data row (regular ISON or ISONL) with more values than fields now throws `ISONSyntaxError` (`"Row has N values but only M fields (extra value: ...)"`) instead of silently truncating. Missing trailing values still pad with `null`.
- **Regular Serializer Quoting**: `Serializer` now quotes strings containing `\r` or `\\`, strings starting with `#` (which would be re-parsed as a comment), and strings shaped like a `kind.name` block header (which, alone on a row line, would be re-parsed as the start of a new block), so they survive a round-trip.
- **ISONL Serializer Quoting**: The ISONL serializer now also quotes strings starting with `#`, which would otherwise be re-parsed as an inline comment in the values section.

### Added
- **ISONL Envelope Validation**: `dumps_isonl` now throws `ISONError` for block kind/name or field names that cannot be serialized (empty, or containing pipe, quote, backslash, or whitespace; kind additionally must not contain `.` or start with `#`) instead of silently emitting corrupt lines. Dots in the block name remain legal — the parser splits `kind.name` on the first dot.
- **Inline Comments Formalized**: In data rows (regular ISON) and ISONL values sections, an unquoted token starting with `#` begins an inline comment — it and everything after it on the line are ignored. Quoted tokens are always data, never comments.

## [1.0.1] - 2025-12-29

### Changed
- **Default Alignment**: `dumps()` now defaults to `align_columns=false` for token efficiency
- **Delimiter Support**: Added `delimiter` parameter to `dumps()` function

## [1.0.0] - 2025-12-25

### Initial Release
- ISON v1.0 Parser for C++17
- Header-only library
- Full support for ISON and ISONL formats
- Reference syntax (`:id`, `:type:id`, `:RELATIONSHIP:id`)
- Type inference and annotations
- Quoted string handling with escape sequences
- JSON export
- ISONL streaming support
- Compatible with llama.cpp and modern C++ projects
