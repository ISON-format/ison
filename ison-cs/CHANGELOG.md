# Changelog - ison-cs

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-08-01

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

### Changed
- **ISONCS Specification Updated**: Field ordering rules now explicit with UTF-8 vs Unicode divergence tests (e.g., Ａfield vs 😀field).
- **Tests Expanded**: Golden fixture validation confirms byte-for-byte match across all implementations (Python, Rust, JavaScript, TypeScript, C#, Go, C++).

### Testing
- All 4 golden fixture tests passing
- Golden fixture: byte-for-byte match with reference implementation
- UTF-16 divergence test: Confirmed UTF8.GetBytes produces correct byte ordering (Ａfield < 😀field)
- Cross-language: verified against Python (v1.0.4) and other implementations

## [1.0.0] - 2026-08-01

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
