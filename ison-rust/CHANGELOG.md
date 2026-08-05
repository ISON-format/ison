# Changelog

## [1.1.0] - 2026-08-05

> **Breaking.** Serialization now rejects block and field names that cannot be
> written and read back as themselves. Documents holding such a name used to
> serialize into bytes that parsed as different data; they now raise. Names
> obtained by parsing are unaffected — the parser could never produce one.

> `dumps`, `dumps_with_delimiter` and `dumps_canonical` now return
> `Result<String>` instead of `String`. This is a compile error for callers,
> which is the loudest available signal and cannot be missed.

### Changed

- **`dumps` / `dumps_with_delimiter` / `dumps_canonical` Return `Result<String>`**: they returned a bare `String` with nowhere to report an unwritable name. `dumps_isonl` and `dumps_canonical_isonl` already returned `Result` in this same crate, so this makes the API consistent rather than introducing a new convention.

### Fixed

- **Unwritable Names Were Silently Emitted (CRITICAL)**: a field named `first name` serialized to a header reading `first name`, which parses back as two fields — a document written by one program became different data when read by another, with no error at either end. The same held for `:` (the type separator), `|` (the ISONL delimiter), a line-initial `#` (a comment), and a space in a block name. Serialization now rejects them. Still legal, and pinned by corpus cases: `.` in a field name, `#` after the first character, and `.` in a block name.
- **Name Rules Shared Across Serializers**: the rules lived only in the ISONL envelope check, so regular and canonical ISON emitted unwritable names unchecked. A name unwritable in ISON is unwritable in ISONL, so both now share one implementation; ISONL keeps its own additional rules for the quote and backslash its value escaping needs.

### Added

- **`json_to_document`**: builds a `Document` from JSON text. Every other implementation exposes a from-dict entry point; Rust only had converters that went straight to a string, which left the construction path unreachable from outside the crate — and therefore untested.

### Testing

- **built/ Corpus Now Runs Here**: the shared corpus has a third shape — a Document constructed rather than parsed, which is the only way to hold a name the parser could not produce. It previously ran only in a standalone harness that nothing invoked, which is why the bug above went unnoticed. It now runs as part of this package's own test suite.


## [1.0.3] - 2026-08-05

> **Canonical bytes change.** Documents with tied key values or non-ASCII row
> values serialize differently than in previous releases. This is the fix, not a
> regression — the previous output depended on row insertion order. Anything
> storing ISONCS hashes will see them move once.

### Fixed

- **Canonical Row Order Was Not Total (CRITICAL)**: canonical row order keyed on the first column only, so rows tying on that column fell back to input order. The same logical data serialized to different bytes depending on how the rows were built, breaking content addressing and prefix stability — the two properties canonical form exists for. Rows now sort on the full canonical field tuple, with nulls sorting last at every position rather than only the key column.
- **Row Ordering Ignored UTF-8 Encoding**: row sorting compared values in the host language's native string order while field sorting compared UTF-8 bytes, so the two disagreed. In UTF-16 languages this ordered astral values differently from the reference — `"Ａ"` (U+FF21) must precede `"😀"` (U+1F600) by UTF-8 bytes, but UTF-16 puts the emoji's lead surrogate first. All seven implementations now agree.
- **Canonical ISONL Duplicated The Row Sort**: ISONL carried its own copy of the row-ordering logic, so fixing canonical ISON silently missed it. Both forms now share one implementation.

## [1.0.2] - 2026-08-01

### Added
- **Canonical Serialization (ISONCS)**: New `dumps_canonical(doc)` and `dumps_canonical_isonl(doc)` functions produce byte-identical output across implementations by sorting blocks and rows ordinal-string and emitting with fixed settings (single-space delimiter, no alignment). Supports content addressing, prefix stability (ISONGraph), and LLM prompt caching.
- **Regression Tests**: Comprehensive test suite for canonical serialization with golden fixture verification.


### Fixed — cross-implementation parity

These were found by a new shared parity corpus (`benchmark/parity/`) whose expected output is generated from the ison-py reference. Every implementation now verifies against it byte-for-byte.

- **Over-Quoting Dotted Values**: the serializer quoted any value containing a `.`, so emails (`alice@example.com`), domains and version strings were quoted where every other implementation emits them bare — wasting tokens and breaking byte-identity. Only `ident.ident` shapes, which could be misread as a block header when alone on a line, are quoted now.
- **Canonical ISONL Used ISON Quoting Rules**: canonical ISONL reused the ISON string serializer, so it applied the block-header rule (which cannot apply in ISONL, where every line carries its own envelope) and omitted pipe escaping. ISONL now has its own canonical quoting.

- **Parity Test**: `tests/parity.rs` verifies all four renderings plus canonical idempotence against the shared corpus.

- **Literal String `"~"` Lost on Round Trip**: `~` parsed as null but the string `"~"` was never quoted on output, so it serialized bare and came back as null. Now quoted.


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
