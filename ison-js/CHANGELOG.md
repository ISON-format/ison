# Changelog

## [1.0.2] - 2026-07-13

### Fixed
- **ISONL Round-Trip Corruption**: Values ending in a backslash (e.g. `C:\path\`) no longer desync quote tracking in the ISONL line splitter, which caused parse errors or silent corruption when a later `|` appeared on the same line
- **ISONL Quoting**: The ISONL serializer now quotes strings containing `\r` or `\`, so carriage returns and backslashes survive a round-trip instead of being emitted raw
- **Extra Values Now Error**: Rows with more values than declared fields now throw `ISONSyntaxError` (e.g. `Row has 3 values but only 2 fields`) in both ISON and ISONL instead of silently truncating the extra data; missing trailing values still parse as `null`
- **Serializer Quoting (ISON)**: The regular ISON serializer now quotes strings containing `\r` or `\`, strings starting with `#`, and lone `kind.name`-shaped strings that would otherwise be misread as a block header or comment on re-parse

### Added
- **ISONL Envelope Validation**: `dumpsISONL` now throws `ISONError` for block kind/name/field names that cannot be serialized (containing pipe, quote, backslash, or whitespace; kind additionally must not contain `.` or start with `#`) instead of writing corrupt lines
- **Inline Comments Formalized**: In data rows (ISON) and values sections (ISONL), an unquoted token starting with `#` begins an inline comment — it and everything after it is ignored; quoted tokens like `"#tag"` are always data. Serializers quote leading-`#` strings so they round-trip as data

## [1.0.1] - 2025-12-29

### Fixed
- **ESM Build**: Fixed IIFE wrapper removal in ESM build script for proper ES module support

### Changed
- **Default Alignment**: `dumps()` now defaults to `alignColumns=false` for token efficiency

## [1.0.0] - 2025-12-25

### Initial Release
- ISON v1.0 Reference Parser for JavaScript
- Full support for ISON and ISONL formats
- Reference syntax (`:id`, `:type:id`, `:RELATIONSHIP:id`)
- Type inference (int, float, bool, string, null)
- Quoted string handling with escape sequences
- JSON to ISON and ISON to JSON conversion
- ISONL streaming support
- Works in Node.js and browser environments
- Zero dependencies
