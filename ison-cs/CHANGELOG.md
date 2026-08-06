# Changelog - ison-cs

All notable changes to this project will be documented in this file.

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

### Added

- **`IsonNameException`**: raised when a name has no unambiguous ISON encoding. Derives from `IsonException`, so existing `catch (IsonException)` handlers keep working. Note that xUnit's `Assert.Throws<IsonException>` requires an exact type match and will need `Assert.ThrowsAny<IsonException>`.

### Testing

- **built/ Corpus Now Runs Here**: the shared corpus has a third shape — a Document constructed rather than parsed, which is the only way to hold a name the parser could not produce. It previously ran only in a standalone harness that nothing invoked, which is why the bug above went unnoticed. It now runs as part of this package's own test suite.


## [1.0.1] - 2026-08-05

> **Canonical bytes change.** Documents with tied key values or non-ASCII row
> values serialize differently than in previous releases. This is the fix, not a
> regression — the previous output depended on row insertion order. Anything
> storing ISONCS hashes will see them move once.

### Fixed

- **Canonical Row Order Was Not Total (CRITICAL)**: canonical row order keyed on the first column only, so rows tying on that column fell back to input order. The same logical data serialized to different bytes depending on how the rows were built, breaking content addressing and prefix stability — the two properties canonical form exists for. Rows now sort on the full canonical field tuple, with nulls sorting last at every position rather than only the key column.
- **Row Ordering Ignored UTF-8 Encoding**: row sorting compared values in the host language's native string order while field sorting compared UTF-8 bytes, so the two disagreed. In UTF-16 languages this ordered astral values differently from the reference — `"Ａ"` (U+FF21) must precede `"😀"` (U+1F600) by UTF-8 bytes, but UTF-16 puts the emoji's lead surrogate first. All seven implementations now agree.
- **Canonical ISONL Duplicated The Row Sort**: ISONL carried its own copy of the row-ordering logic, so fixing canonical ISON silently missed it. Both forms now share one implementation.

## [1.0.0] - 2026-08-01

### Added
- **ISON Parser**: `Ison.Loads(text)` / `Ison.Parse(text)` / `Ison.Load(path)` parse ISON documents into a `Document`. Full support for block headers, field type annotations, type inference (int, float, bool, null, string), references (`:id`, `:type:id`, `:RELATIONSHIP:id`), quoted strings with escape sequences, dot-path nested fields, `---` summary rows, and comments.
- **ISON Serializer**: `Ison.Dumps(doc, alignColumns, delimiter)` / `Ison.Dump(doc, path)` with the full round-trip quoting rules — values containing whitespace, quotes, `\r`, `\\`, a leading `#` or `:`, literal lookalikes (`true`/`false`/`null`/numbers), and `kind.name` block-header lookalikes are all quoted so they survive re-parsing.
- **ISONL Support**: `Ison.LoadsIsonl` / `Ison.DumpsIsonl` / `Ison.DumpsCanonicalIsonl`, plus `IsonlParser.Stream()` for line-at-a-time streaming. The pipe splitter is quote- and escape-aware, so values ending in a backslash cannot desync section parsing.
- **Format Conversion**: `Ison.IsonToIsonl` and `Ison.IsonlToIson`.
- **JSON Interop**: `Ison.FromJson` / `Ison.ToJson`, with an encoder that reproduces Python's `json.dumps` defaults (`", "` / `": "` separators and `ensure_ascii` escaping) so JSON-encoded values embedded in ISON stay byte-identical across implementations.
- **Strict Row Validation**: Rows carrying more values than declared fields now throw `IsonSyntaxException` instead of silently truncating data. Missing trailing values still parse as null.
- **Inline Comments**: An unquoted token starting with `#` begins an inline comment; quoted tokens like `"#tag"` remain data.
- **Field Sorting in ISONCS**: `DumpsCanonical()` sorts fields for deterministic output across implementations. Algorithm: `id` field first, then alphabetically by UTF-8 bytes.
- **UTF-8 Byte Comparison (CRITICAL)**: Uses `System.Text.Encoding.UTF8.GetBytes()` for byte-level UTF-8 comparison (NOT `CompareOrdinal` which compares UTF-16 code units). Ensures field ordering matches Python, Rust, JavaScript, TypeScript, Go, and C++ implementations.
- **Cross-Language Parity Suite**: `TestCrossLanguageParity` asserts byte-identical output against the shared corpus in `benchmark/parity/`, whose expected files are generated from the ison-py reference. Covers all four renderings plus canonical idempotence and round-trip stability.

### Fixed
- **Culture-Sensitive Sorting (CRITICAL)**: Block and row ordering now use `StringComparer.Ordinal`. The previous `OrderBy` calls used .NET's default comparer, which is culture-sensitive and treats punctuation as ignorable — `co-op`, `co_op` and `coop` sorted differently than in every other implementation, silently breaking canonical byte-identity.
- **Culture-Sensitive Number Handling**: Number parsing and formatting now pin `CultureInfo.InvariantCulture`, so a machine with a comma decimal separator cannot change output.
- **Float Formatting**: Integral doubles serialize as `1.0` rather than `1`, and exponents use a lowercase `e`, matching the reference implementation's representation.
- **ISONL Dropped Type Annotations**: `DumpsIsonl()` emitted bare field names, making an ISON → ISONL → ISON round trip lossy, and `IsonlParser` read an annotated envelope written by another implementation as fields literally named `id:int`, corrupting row keys. Annotations are now emitted and parsed.
- **Canonical ISONL Did Not Normalize Field Order**: `DumpsCanonicalIsonl()` emitted fields in document order, so a document built from an unordered `Dictionary` produced non-deterministic canonical ISONL. Fields are now sorted and rows keyed off the first canonical column.
- **`~` Null Spelling Only Half-Supported**: `README.md` documents `~ or null for null values`, but a bare `~` parsed as the *string* `"~"`. Both spellings now parse as null, and the literal string `"~"` is quoted on output so it still round-trips. Emission stays `null`, since older published releases cannot read `~`.

### Changed
- **ISONCS Specification Updated**: Field ordering rules now explicit with UTF-8 vs Unicode divergence tests (e.g., Ａfield vs 😀field).
- **Tests Expanded**: Golden fixture validation confirms byte-for-byte match across all implementations (Python, Rust, JavaScript, TypeScript, C#, Go, C++).

### Testing
- All 4 golden fixture tests passing
- Golden fixture: byte-for-byte match with reference implementation
- UTF-16 divergence test: Confirmed UTF8.GetBytes produces correct byte ordering (Ａfield < 😀field)
- Cross-language: verified against Python (v1.0.4) and other implementations

### Added

- **ISONCS Canonical Serialization**: Complete implementation of ISON Canonical Serialization (ISONCS)
  - Field sorting: `id` field hoisted first, remaining fields sorted by UTF-8 bytes (not UTF-16)
  - Row sorting: Ordinal-string sorting by key field value
  - Block sorting: Ordinal-string sorting by kind.name
  - Empty blocks are excluded from output
  - Byte-identical output across all implementations

- **UTF-8 Byte Comparison**: Proper UTF-8 byte-level comparison for field sorting
  - Uses `System.Text.Encoding.UTF8.GetBytes()` for byte conversion
  - Custom `ByteArrayComparer` for lexicographic byte array comparison
  - Avoids UTF-16 code unit comparison which diverges from UTF-8 byte order for non-BMP characters

- **Core Classes**:
  - `Document`: Represents a complete ISON document
  - `Block`: Represents an ISON block (table, object, etc.)
  - `Serializer`: Handles canonical serialization

- **Comprehensive Test Suite**:
  - Golden fixture test: Validates against shared fixture from `benchmark/`
  - UTF-16 divergence test: Verifies Ａfield (U+FF21, UTF-8: 0xEF) < 😀field (U+1F600, UTF-8: 0xF0)
  - ID hoisting test: Confirms `id` field is positioned first
  - Row sorting test: Validates ordinal-string row sorting

### Implementation Details

- Language: C# (.NET 6.0+)
- Field sorting algorithm:
  1. Partition fields: `id` vs others
  2. Sort others by UTF-8 bytes (NOT UTF-16 code units)
  3. Concatenate: `id` first, then sorted others
  
- ByteArrayComparer implementation:
  - Lexicographic comparison (byte-by-byte)
  - Handles null byte arrays
  - Returns signed integer difference for sorting stability

- Quote-if-needed logic:
  - Quotes strings with spaces, tabs, special characters
  - Preserves numeric and reference syntax
  - Escapes backslashes, quotes, newlines, tabs, carriage returns

### Testing

All tests passing:
- ✅ TestGoldenFixtureFieldSort (golden fixture verification)
- ✅ TestUTF16Divergence (UTF-8 vs UTF-16 byte order)
- ✅ TestIdHoisting (field reordering)
- ✅ TestRowSorting (row key-based ordering)

### Notes

- C# strings are UTF-16 internally; UTF8.GetBytes() conversion is critical for byte-identical cross-language output
- Empty blocks (zero rows) are excluded from canonical output
- Field type annotations are NOT yet implemented (future enhancement)
- Row summary lines are NOT yet implemented (future enhancement)

## Version Compatibility

- Compatible with ISON v1.0.3+
- Requires .NET 6.0 or later for testing framework (xunit)
- Library targets net6.0
