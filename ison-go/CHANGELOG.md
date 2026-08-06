# Changelog

## [1.1.0] - 2026-08-05

> **Breaking.** Serialization now rejects block and field names that cannot be
> written and read back as themselves. Documents holding such a name used to
> serialize into bytes that parsed as different data; they now raise. Names
> obtained by parsing are unaffected — the parser could never produce one.

> `Dumps`, `DumpsWithOptions` and `DumpsCanonical` now return
> `(string, error)` instead of `string`. This is a compile error for callers,
> which is the loudest available signal and cannot be missed.

### Changed

- **`Dumps` / `DumpsWithOptions` / `DumpsCanonical` Return `(string, error)`**: they returned a bare `string` with nowhere to report an unwritable name. `DumpsISONL` and `DumpsCanonicalISONL` already returned an error in this same package, so this makes the API consistent rather than introducing a new convention. `Dump` and `DumpWithOptions` propagate it.

### Fixed

- **References Could Not Encode Whitespace, And A Newline Destroyed Them (CRITICAL)**: a reference emits as `:type:id` with no quoting, so unlike every other value its characters land in the row raw. A space or tab split the row into extra columns and failed to parse; a newline ended the row early and truncated the reference *silently* -- `Reference(id="a" + newline + "b")` came back as `Reference(p:a)`, data gone, no error. Both the id and the type are now rejected at write when they hold whitespace.
- **ISONL Wrote Lines It Could Not Read (CRITICAL)**: a reference id containing `|` is valid ISON and round-trips there, but ISONL ends its field at a pipe -- so ISON -> ISONL emitted `table.t|id ref|1 :p:a|b`, a line with three pipes where the format allows two. It was written silently and failed later at read, in a different process, pointing at the reader. ISONL now refuses it at the point of conversion. ISON is unchanged and still writes it, because the rule is that each form rejects exactly what it cannot parse and nothing more: refusing in ISON would make a valid file readable but not writable.
- **Unwritable Names Were Silently Emitted (CRITICAL)**: a field named `first name` serialized to a header reading `first name`, which parses back as two fields — a document written by one program became different data when read by another, with no error at either end. The same held for `:` (the type separator), `|` (the ISONL delimiter), a line-initial `#` (a comment), and a space in a block name. Serialization now rejects them. Still legal, and pinned by corpus cases: `.` in a field name, `#` after the first character, and `.` in a block name.
- **Name Rules Shared Across Serializers**: the rules lived only in the ISONL envelope check, so regular and canonical ISON emitted unwritable names unchecked. A name unwritable in ISON is unwritable in ISONL, so both now share one implementation; ISONL keeps its own additional rules for the quote and backslash its value escaping needs.

### Testing

- **built/ Corpus Now Runs Here**: the shared corpus has a third shape — a Document constructed rather than parsed, which is the only way to hold a name the parser could not produce. It previously ran only in a standalone harness that nothing invoked, which is why the bug above went unnoticed. It now runs as part of this package's own test suite.


## [1.0.2] - 2026-08-05

> **Canonical bytes change.** Documents with tied key values or non-ASCII row
> values serialize differently than in previous releases. This is the fix, not a
> regression — the previous output depended on row insertion order. Anything
> storing ISONCS hashes will see them move once.

### Fixed

- **Canonical Row Order Was Not Total (CRITICAL)**: canonical row order keyed on the first column only, so rows tying on that column fell back to input order. The same logical data serialized to different bytes depending on how the rows were built, breaking content addressing and prefix stability — the two properties canonical form exists for. Rows now sort on the full canonical field tuple, with nulls sorting last at every position rather than only the key column.
- **Row Ordering Ignored UTF-8 Encoding**: row sorting compared values in the host language's native string order while field sorting compared UTF-8 bytes, so the two disagreed. In UTF-16 languages this ordered astral values differently from the reference — `"Ａ"` (U+FF21) must precede `"😀"` (U+1F600) by UTF-8 bytes, but UTF-16 puts the emoji's lead surrogate first. All seven implementations now agree.
- **Canonical ISONL Duplicated The Row Sort**: ISONL carried its own copy of the row-ordering logic, so fixing canonical ISON silently missed it. Both forms now share one implementation.
- **Version Constant Drift**: the `validation` subpackage reported 1.0.0 while the root package reported 1.0.1.

### Changed

- **Row Comparison Uses strings.Compare**: identical to `bytes.Compare` on Go's UTF-8 strings, without allocating a `[]byte` per value on every comparison.

## [1.0.1] - 2026-08-01

### Added
- **Field Sorting in ISONCS**: `DumpsCanonical()` now sorts fields for deterministic output across implementations. Algorithm: `id` field first, then alphabetically by UTF-8 bytes.
- **UTF-8 Byte Comparison**: Uses Go's native `bytes.Compare()` for consistent UTF-8 byte ordering, ensuring field ordering matches Python, Rust, JavaScript, TypeScript, C#, and C++ implementations.
- **Canonical Serialization (ISONCS)**: New `DumpsCanonical(doc)` and `DumpsCanonicalISONL(doc)` functions produce byte-identical output across implementations by sorting blocks and rows ordinal-string and emitting with fixed settings (single-space delimiter, no alignment). Supports content addressing, prefix stability (ISONGraph), and LLM prompt caching.

### Changed
- **ISONCS Specification Updated**: Field ordering rules now explicit with UTF-8 vs Unicode divergence tests (e.g., Ａfield vs 😀field).
- **Tests Expanded**: Golden fixture validation confirms byte-for-byte match across all implementations (Python, Rust, JavaScript, TypeScript, C#, Go, C++).

### Testing
- All 54 tests passing
- Golden fixture: byte-for-byte match with reference implementation
- Cross-language: verified against Python (v1.0.4) and other implementations
- UTF-8 ordering confirmed with non-BMP character tests


### Fixed — cross-implementation parity

These were found by a new shared parity corpus (`benchmark/parity/`) whose expected output is generated from the ison-py reference. Every implementation now verifies against it byte-for-byte.

- **Null Emitted as `~` (CRITICAL)**: `Value.ToISON()` emitted the `~` alias for null, which ison-py and ison-js parse as the *string* `"~"` — silently turning every null into a string when a document crossed implementations. Null is now emitted as `null`; `~` is still accepted on input for backward compatibility.
- **Canonical ISONL Did Not Normalize Field Order**: `DumpsCanonicalISONL()` emitted fields in document order, so a document built from a Go map produced non-deterministic canonical ISONL. Fields are now sorted and rows keyed off the first canonical column.
- **Inconsistent Trailing Newlines**: `Dumps`, `DumpsISONL` and `DumpsCanonicalISONL` appended a trailing newline while `DumpsCanonical` did not, and no other implementation emits one. All four now end at the last row.

- **Parity Test**: `parity_test.go` verifies all four renderings plus canonical idempotence against the shared corpus.


## [1.0.0] - 2026-07-13

### Fixed
- **ISONL Round-Trip Corruption**: Values ending in escaped backslashes no longer desync quote tracking in the line splitter, which previously caused parse errors when a later `|` appeared on the same line.
- **Extra Values Error**: Rows with more values than fields now return an error instead of silently truncating.
- **Quoted Token Preservation**: Quoted tokens like `"123"` now stay strings on re-parse.
- **Inline Comment Formalization**: Unquoted tokens starting with `#` begin inline comments; quoted tokens are always data.

### Added
- **ISONL Envelope Validation**: Envelope field validation for serialization safety.

## [1.0.0] - 2025-12-25

### Initial Release
- ISON v1.0 Parser for Go
- Full support for ISON and ISONL formats
- Reference syntax (`:id`, `:type:id`)
- Type inference
- Quoted string handling with escape sequences
