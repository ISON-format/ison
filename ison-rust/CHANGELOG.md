# Changelog

## [1.0.2] - 2026-07-13

### Fixed
- **ISONL round-trip corruption**: values containing trailing backslashes, carriage returns, pipes, or embedded quotes no longer corrupt the line structure. Pipe-splitting is now quote- and escape-aware (an escaped backslash before a closing quote can no longer desync quote tracking), the ISONL serializer now quotes strings containing `\r` or `\\` and escapes `|` as `\|`, and quoted tokens keep their string type when parsed back (e.g. `"123"` stays a string).
- **Inline comment corruption**: inline comments are now handled at the token level in both formats — an *unquoted* token whose first character is `#` begins an inline comment; quoted tokens are always data. The old string-level `#` strip in the regular-format tokenizer could truncate quoted values containing `#` (its quote tracking desynced on an escaped backslash before a closing quote).
- **Regular serializer round-trip safety**: `dumps()` now quotes strings containing `\r` or `\\`, strings starting with `#`, and empty strings, so they survive a re-parse instead of corrupting the row or being silently dropped as comments.
- **Quoted tokens keep their string type in regular format**: `"true"`, `"123"`, `":ref"` etc. parse back as strings, matching the ISONL parser and the Python implementation.

### Added
- **ISONL envelope validation**: `dumps_isonl()` now rejects block kinds, names, and field names that cannot survive an ISONL round-trip (pipe, quote, backslash, or whitespace; additionally `.` or a leading `#` in the kind).

### Changed
- **Breaking**: `dumps_isonl()` now returns `Result<String>` instead of `String` so envelope violations surface as errors (`ison_to_isonl()` propagates them).
- **Breaking**: rows with more values than fields now return an error (`Row has N values but only M fields (extra value: ...)`) in both the regular and ISONL parsers instead of silently truncating the extras. Missing trailing values still pad with `null` (and are now inserted into the row as `Value::Null` instead of being omitted).
- Block-header detection inside a block now matches the Python parser (`_looks_like_header`): a line only ends the current block if it is a single `ident.ident` token, so data rows that merely contain a `.` are no longer misread as new block headers.
- `isonl_quote_if_needed` now also quotes strings starting with `#` so they cannot be mistaken for inline comments.

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
