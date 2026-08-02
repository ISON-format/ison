# Changelog - ison-cs

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-08-01

### Added
- **Field Sorting in ISONCS**: `DumpsCanonical()` now sorts fields for deterministic output across implementations. Algorithm: `id` field first, then alphabetically by UTF-8 bytes.
- **UTF-8 Byte Comparison (CRITICAL)**: Uses `System.Text.Encoding.UTF8.GetBytes()` for byte-level UTF-8 comparison (NOT `CompareOrdinal` which compares UTF-16 code units). Ensures field ordering matches Python, Rust, JavaScript, TypeScript, Go, and C++ implementations.

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
