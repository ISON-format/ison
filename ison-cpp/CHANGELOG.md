# Changelog

## [1.0.2] - 2026-07-13

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
