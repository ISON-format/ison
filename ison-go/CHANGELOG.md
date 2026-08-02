# Changelog

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
