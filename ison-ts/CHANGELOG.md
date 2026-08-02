# Changelog

## [1.0.4] - 2026-08-01

### Added
- **Field Sorting in ISONCS**: `dumpsCanonical()` now sorts fields for deterministic output across implementations. Algorithm: `id` field first, then alphabetically by UTF-8 bytes.
- **UTF-8 Byte Comparison (CRITICAL)**: Uses TextEncoder for byte-level UTF-8 comparison (not native `<` operator which compares UTF-16 code units). Ensures field ordering matches Python, Rust, C#, Go, and C++ implementations.

### Changed
- **ISONCS Specification Updated**: Field ordering rules now explicit with UTF-8 vs Unicode divergence tests (e.g., Ａfield vs 😀field).
- **Tests Expanded**: Golden fixture validation confirms byte-for-byte match across all implementations (Python, Rust, JavaScript, TypeScript, C#, Go, C++).

### Testing
- All 70 tests passing
- Golden fixture: byte-for-byte match with reference implementation
- UTF-16 divergence test: Confirmed TextEncoder produces correct UTF-8 byte ordering (Ａfield < 😀field)
- Cross-language: verified against Python (v1.0.4) and other implementations

## [1.0.3] - 2026-08-01

### Added
- **Canonical Serialization (ISONCS)**: New `dumpsCanonical(doc)` and `dumpsCanonicalIsonl(doc)` functions produce byte-identical output across implementations by sorting blocks and rows ordinal-string and emitting with fixed settings (single-space delimiter, no alignment). Supports content addressing, prefix stability (ISONGraph), and LLM prompt caching.
- **Regression Tests**: Comprehensive test suite for canonical serialization with golden fixture verification.

## [1.0.2] - 2026-07-13

### Fixed
- **Extra Values Now Error**: Rows with more values than fields now throw `ISONSyntaxError` (`Row has N values but only M fields (extra value: ...)`) in both the regular and ISONL parsers instead of silently truncating data. Missing trailing values still pad with `null`
- **Inline Comments Formalized**: In data rows (regular format) and ISONL values sections, an unquoted token whose first character is `#` begins an inline comment — it and everything after it are discarded. Quoted tokens containing `#` are always data. The regular parser now tracks quoting per token, so quoted values are no longer re-interpreted as numbers/booleans/nulls/references and a mid-token `#` no longer truncates the row
- **Regular Serializer Quoting**: `dumps()` now quotes strings containing `\r` or `\\`, strings starting with `#` (which would parse back as inline comments), empty strings, and bare `kind.name` header lookalikes (which would prematurely end the block on re-parse), so these values round-trip unchanged. The ISONL serializer likewise quotes leading-`#` strings
- **ISONL Round-Trip Corruption**: Values containing trailing backslashes (`"x \\"`), carriage returns, pipes, or quote/escape combinations now survive `dumpsIsonl()` → `loadsIsonl()` unchanged. Pipe-splitting is now quote- and escape-aware, the serializer quotes and escapes `\r`, `\\`, `\|`, and empty strings, and quoted tokens are no longer re-interpreted as numbers/booleans/nulls/references (so the string `"123"` stays a string)
- **ISONL Envelope Validation**: `dumpsIsonl()` now throws `ISONSyntaxError` for block kinds, names, or field names that cannot be serialized (containing pipe, quote, backslash, or whitespace; empty; kind containing `.` or starting with `#`) instead of silently emitting corrupt output. Dots in block names remain legal (header splits on the first dot)

## [1.0.1] - 2025-12-29

### Changed
- **Default Alignment**: `dumps()` now defaults to `alignColumns=false` for token efficiency
- **Delimiter Option**: New `delimiter` parameter in `dumps(doc, { delimiter: ' ' })` for custom column separators

### Fixed
- Serializer now uses configurable delimiter instead of hardcoded space

## [1.0.0] - 2025-12-25

### Initial Release
- ISON v1.0 Parser for TypeScript
- Full TypeScript type definitions
- Full support for ISON and ISONL formats
- Reference syntax (`:id`, `:type:id`, `:RELATIONSHIP:id`)
- Type inference and annotations
- Quoted string handling with escape sequences
- JSON export via `toJson()`
- ISONL streaming support
- Works in Node.js and browser environments
- Zero runtime dependencies
