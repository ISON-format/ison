# Changelog

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
