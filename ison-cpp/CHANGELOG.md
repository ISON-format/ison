# Changelog

## [1.0.2] - 2026-07-13

### Fixed
- **ISONL Round-Trip Corruption**: Fixed quote-tracking desync in the ISONL section splitter — a quoted value ending in an escaped backslash (e.g. `"x \\"`) let a later `|` split the line in the wrong place. The splitter now consumes escape pairs instead of using look-behind.
- **ISONL Serialization of `\r` and `\\`**: The ISONL serializer now quotes strings containing carriage returns or backslashes (and bare numeric strings), so they survive a round-trip instead of being emitted raw.
- **Explicit `\|` Unescape**: The tokenizer now maps the `\|` escape to `|` explicitly.

### Added
- **ISONL Envelope Validation**: `dumps_isonl` now throws `ISONError` for block kind/name or field names that cannot be serialized (empty, or containing pipe, quote, backslash, or whitespace; kind additionally must not contain `.` or start with `#`) instead of silently emitting corrupt lines. Dots in the block name remain legal — the parser splits `kind.name` on the first dot.

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
