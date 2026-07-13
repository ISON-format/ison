# Changelog

## [1.0.2] - 2026-07-13

### Fixed
- **ISONL round-trip corruption**: values containing trailing backslashes, carriage returns, pipes, or embedded quotes no longer corrupt the line structure. Pipe-splitting is now quote- and escape-aware (an escaped backslash before a closing quote can no longer desync quote tracking), the ISONL serializer now quotes strings containing `\r` or `\\` and escapes `|` as `\|`, and quoted tokens keep their string type when parsed back (e.g. `"123"` stays a string).

### Added
- **ISONL envelope validation**: `dumps_isonl()` now rejects block kinds, names, and field names that cannot survive an ISONL round-trip (pipe, quote, backslash, or whitespace; additionally `.` or a leading `#` in the kind).

### Changed
- **Breaking**: `dumps_isonl()` now returns `Result<String>` instead of `String` so envelope violations surface as errors (`ison_to_isonl()` propagates them).

## [1.0.1] - 2025-12-29

### Changed
- **Default Alignment**: `dumps()` now defaults to `align_columns=false` for token efficiency
- **Delimiter Support**: New `dumps_with_delimiter()` function for custom column separators

### Fixed
- `isonl_to_ison()` now uses `align_columns=false` by default for consistency

## [1.0.0] - 2025-12-25

### Initial Release
- ISON v1.0 Parser for Rust
- Zero-copy parsing where possible
- Full support for ISON and ISONL formats
- Reference syntax (`:id`, `:type:id`, `:RELATIONSHIP:id`)
- Type inference and annotations
- Quoted string handling with escape sequences
- Optional Serde integration for JSON export
- ISONL streaming support
- No unsafe code
