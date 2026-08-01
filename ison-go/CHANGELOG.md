# Changelog

## [1.0.2] - 2026-08-01

### Added
- **Canonical Serialization (ISONCS)**: New `DumpsCanonical(doc)` and `DumpsCanonicalISONL(doc)` functions produce byte-identical output across implementations by sorting blocks and rows ordinal-string and emitting with fixed settings (single-space delimiter, no alignment). Supports content addressing, prefix stability (ISONGraph), and LLM prompt caching.
- **Regression Tests**: Comprehensive test suite for canonical serialization with golden fixture verification.

## [1.0.1] - 2026-07-13

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
