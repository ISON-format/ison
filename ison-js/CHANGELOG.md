# Changelog

## [1.1.1] - 2026-08-08

### Fixed

- **ESM Bundle Was Missing Canonical Exports (CRITICAL for ESM consumers)**: `dumpsCanonical` and `dumpsCanonicalISONL` were added to the CommonJS export object and never to the hand-maintained list in the ESM build script, so `import { dumpsCanonical } from 'ison-parser'` has thrown since canonical serialization shipped, while `require` worked. The list is now derived from the CJS object, so the two cannot diverge.
- **ESM Build Produced An Invalid Module On CRLF Checkouts**: the strip regexes matched a bare `
`. On Windows the CommonJS wrapper survived into the ES module, leaving `module.exports = ISON` inside a file the runtime parses as ESM, and every `import` threw. Published bundles were correct only because CI builds on LF.

### Testing

- **The ESM Bundle Is Now Tested**: no test touched `dist/` before, which is why both bugs above shipped -- the bundle is generated at publish time from a source that was never wrong. The new test rebuilds it and checks export parity with CJS in both directions, absence of CommonJS remnants, and a real `import` that calls `dumpsCanonical` and compares bytes.

## [1.1.0] - 2026-08-05

> **Breaking.** Serialization now rejects block and field names that cannot be
> written and read back as themselves. Documents holding such a name used to
> serialize into bytes that parsed as different data; they now raise. Names
> obtained by parsing are unaffected — the parser could never produce one.

### Fixed

- **References Could Not Encode Whitespace, And A Newline Destroyed Them (CRITICAL)**: a reference emits as `:type:id` with no quoting, so unlike every other value its characters land in the row raw. A space or tab split the row into extra columns and failed to parse; a newline ended the row early and truncated the reference *silently* -- `Reference(id="a" + newline + "b")` came back as `Reference(p:a)`, data gone, no error. Both the id and the type are now rejected at write when they hold whitespace.
- **ISONL Wrote Lines It Could Not Read (CRITICAL)**: a reference id containing `|` is valid ISON and round-trips there, but ISONL ends its field at a pipe -- so ISON -> ISONL emitted `table.t|id ref|1 :p:a|b`, a line with three pipes where the format allows two. It was written silently and failed later at read, in a different process, pointing at the reader. ISONL now refuses it at the point of conversion. ISON is unchanged and still writes it, because the rule is that each form rejects exactly what it cannot parse and nothing more: refusing in ISON would make a valid file readable but not writable.
- **Unwritable Names Were Silently Emitted (CRITICAL)**: a field named `first name` serialized to a header reading `first name`, which parses back as two fields — a document written by one program became different data when read by another, with no error at either end. The same held for `:` (the type separator), `|` (the ISONL delimiter), a line-initial `#` (a comment), and a space in a block name. Serialization now rejects them. Still legal, and pinned by corpus cases: `.` in a field name, `#` after the first character, and `.` in a block name.
- **Name Rules Shared Across Serializers**: the rules lived only in the ISONL envelope check, so regular and canonical ISON emitted unwritable names unchecked. A name unwritable in ISON is unwritable in ISONL, so both now share one implementation; ISONL keeps its own additional rules for the quote and backslash its value escaping needs.
- **Flat Row Keys Containing A Dot Were Destroyed**: a field named `a.b` was resolved purely as a dot path, so a row holding that literal key emitted `null` — the value was lost at write time, silently. The lookup now falls back to the literal key when the dot path does not resolve; genuinely nested values still take precedence. This was fixed in ison-py 1.0.5 but not ported, so it shipped in this package.
- **ESM Bundle Reported A Stale Version**: the ESM build script hardcoded `1.0.2` while the package shipped `1.0.3`, so the bundle advertised a version that was never released. It now reads from package.json, and exports `ISONNameError`.

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
- **Source Header Version Drift**: the file header reported 1.0.1 while package.json reported 1.0.2.

## [1.0.2] - 2026-08-01

### Added
- **Canonical Serialization (ISONCS)**: New `dumpsCanonical(doc)` and `dumpsCanonicalISONL(doc)` functions produce byte-identical output across implementations by sorting blocks and rows ordinal-string and emitting with fixed settings (single-space delimiter, no alignment). Supports content addressing, prefix stability (ISONGraph), and LLM prompt caching.
- **Regression Tests**: Comprehensive test suite for canonical serialization with SHA256-verified golden fixture cross-implementation verification.


### Fixed — cross-implementation parity

These were found by a new shared parity corpus (`benchmark/parity/`) whose expected output is generated from the ison-py reference. Every implementation now verifies against it byte-for-byte.

- **`dumps()` Defaulted to Aligned Output**: `dumps(doc)` defaulted to `alignColumns = true` while every other implementation defaults to `false`, contradicting the v1.0.1 changelog entry and emitting padded, token-inefficient output by default. Now defaults to `false`; pass `true` explicitly for aligned output.
- **ISONL Dropped Type Annotations**: `dumpsISONL()` emitted bare field names, making an ISON → ISONL → ISON round trip lossy, and `ISONLParser` read an annotated envelope as fields literally named `id:int`, corrupting row keys. Annotations are now emitted and parsed.

- **`~` Null Spelling Only Half-Supported**: `README.md` documents `~ or null for null values`, but a bare `~` parsed as the *string* `"~"` — so the README's own example misparsed. Both spellings now parse as null, and the literal string `"~"` is quoted on output so it still round-trips. Emission stays `null`, since older published releases cannot read `~`.


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
