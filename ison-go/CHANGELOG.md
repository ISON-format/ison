# Changelog

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
