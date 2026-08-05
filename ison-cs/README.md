# ison-cs: ISON for C# — Official Implementation

The **official C# implementation of ISON** (Interchange Simple Object Notation), from the authors of the ISON format.

This is part of the **original ISON family** — developed in the [ISON-format/ison](https://github.com/ISON-format/ison) monorepo and released and versioned alongside every other first-party implementation:

| Language | Package | Registry |
| --- | --- | --- |
| Python | `ison-py` | PyPI |
| JavaScript | `ison-parser` | npm |
| TypeScript | `ison-ts` | npm |
| Rust | `ison-rs` | crates.io |
| Go | `ison-go` | Go modules |
| C++ | `ison-cpp` | header-only |
| **C#** | **`Ison.Parser`** | **NuGet** |

Because all seven are developed together against a shared cross-language golden fixture, they produce **byte-identical ISONCS canonical output**.

## Installation

```bash
dotnet add package Ison.Parser
```

## Usage

```csharp
using IsonParser;

// Parse
var doc = Ison.Loads(@"
table.users
id:int name:string active:bool
1 Alice true
2 Bob false
");

Block? users = doc["users"];
Console.WriteLine(users!.Rows[0]["name"]);   // Alice
Console.WriteLine(users.GetFieldType("id")); // int

// Serialize
string ison      = Ison.Dumps(doc);              // compact, token-efficient
string aligned   = Ison.Dumps(doc, alignColumns: true);
string canonical = Ison.DumpsCanonical(doc);     // ISONCS, byte-identical across languages

// ISONL (one record per line)
string isonl = Ison.DumpsIsonl(doc);
var back     = Ison.LoadsIsonl(isonl);

// Conversion and JSON interop
string asIsonl = Ison.IsonToIsonl(ison);
var fromJson   = Ison.FromJson(@"{""users"": [{""id"": 1, ""name"": ""Alice""}]}");
string asJson  = Ison.ToJson(doc);
```

Streaming large ISONL files a line at a time:

```csharp
using var reader = File.OpenText("events.isonl");
foreach (IsonlRecord record in new IsonlParser().Stream(reader))
{
    Process(record.Values);
}
```

`Parse` and `Stringify` are provided as .NET-idiomatic aliases for `Loads` and `Dumps`.

## API

| Member | Purpose |
| --- | --- |
| `Ison.Loads` / `Parse` / `Load` | Parse ISON from a string or file |
| `Ison.Dumps` / `Stringify` / `Dump` | Serialize to ISON |
| `Ison.DumpsCanonical` | Canonical ISON (ISONCS) |
| `Ison.LoadsIsonl` / `LoadIsonl` | Parse ISONL |
| `Ison.DumpsIsonl` / `DumpIsonl` | Serialize to ISONL |
| `Ison.DumpsCanonicalIsonl` | Canonical ISONL |
| `Ison.IsonToIsonl` / `IsonlToIson` | Convert between the two forms |
| `Ison.FromJson` / `ToJson` | JSON interop |
| `IsonlParser.Stream` | Line-at-a-time streaming |
| `Document`, `Block`, `Reference`, `FieldInfo` | Data model |
| `IsonException`, `IsonSyntaxException` | Errors |

## Staying current

ISON is an evolving specification. Parser fixes, canonical-form corrections, edge-case hardening, hotfixes, and security patches are released here **in lockstep with the spec itself** — usually the same day they land across the rest of the family.

Practically, that means a routine package update picks up every correction, instead of you having to track spec changes and decide whether they affect you.

A concrete example of the kind of fix that ships this way: **canonical field ordering** must sort by UTF-8 bytes, not UTF-16 code units. In C# that distinction is easy to get wrong — `CompareOrdinal` compares UTF-16 code units and silently produces a different field order than every other implementation for non-BMP field names. That is a cross-language divergence bug, and pinning to a version from before the fix keeps it.

- Watch [releases](https://github.com/ISON-format/ison/releases) for update notifications
- Read the [changelog](https://github.com/ISON-format/ison/blob/main/ison-cs/CHANGELOG.md) before upgrading
- Report a problem via [issues](https://github.com/ISON-format/ison/issues) — fixes land in the whole family, not just C#

Third-party ports of ISON exist and are genuinely welcome; a format is healthier for having them. Just be aware they track the spec on their own schedule, so the fixes above may reach them later, or not at all.

## Features

- **ISONCS Canonical Serialization**: Produces byte-identical output across all implementations
- **UTF-8 Byte Comparison**: Field sorting uses UTF-8 bytes, not UTF-16 code units
- **Field Hoisting**: `id` field is hoisted to first position in canonical form
- **Row Sorting**: Rows are sorted ordinal-string by the key field
- **Comprehensive Tests**: Golden fixture testing with shared test data

## Implementation Notes

### UTF-16 vs UTF-8 Divergence

C# strings are UTF-16 internally. To ensure byte-identical output across all implementations, the canonical serialization uses `System.Text.Encoding.UTF8.GetBytes()` for field sorting, NOT `string.CompareTo()` or `StringComparer.Ordinal`.

**Critical Test Case**: Ａfield (U+FF21, UTF-8: 0xEF...) vs 😀field (U+1F600, UTF-8: 0xF0...)

- Expected order: Ａfield, 😀field (0xEF < 0xF0 in UTF-8)
- WRONG (using `CompareTo` or `CompareOrdinal`): 😀field, Ａfield (UTF-16 code units)

### Field Sorting Algorithm

```csharp
private static List<string> SortFieldsCanonical(List<string> fields)
{
    // Step 1: Partition fields into [id] and [others]
    var idFields = fields.Where(f => f == "id").ToList();
    var otherFields = fields.Where(f => f != "id").ToList();

    // Step 2: Sort others by UTF-8 bytes, NOT UTF-16 code units
    var sortedOthers = otherFields
        .OrderBy(f => Encoding.UTF8.GetBytes(f), new ByteArrayComparer())
        .ToList();

    // Step 3: Concatenate: id first, then sorted others
    var result = new List<string>(idFields);
    result.AddRange(sortedOthers);
    return result;
}
```

### ByteArrayComparer

Compares byte arrays lexicographically (byte-by-byte):

```csharp
private class ByteArrayComparer : IComparer<byte[]>
{
    public int Compare(byte[] a, byte[] b)
    {
        int minLen = Math.Min(a.Length, b.Length);
        for (int i = 0; i < minLen; i++)
        {
            if (a[i] != b[i])
                return a[i] - b[i];  // Unsigned comparison
        }
        return a.Length - b.Length;  // Shorter comes first
    }
}
```

## Building

```bash
dotnet build ison-cs.sln
```

## Testing

```bash
dotnet test tests/IsonParser.Tests.csproj
```

## Test Coverage

- **TestGoldenFixtureFieldSort**: Validates against shared golden fixture (JSON input, expected ISON output)
- **TestUTF16Divergence**: Verifies Ａfield vs 😀field produces correct UTF-8 byte order
- **TestIdHoisting**: Confirms id field is hoisted to first position
- **TestRowSorting**: Validates ordinal-string row sorting by key field

## References

Absolute links, so they resolve on the NuGet package page as well as on GitHub:

- [ISON format home](https://www.ison.dev)
- [Documentation](https://www.getison.com)
- [ISON monorepo](https://github.com/ISON-format/ison)
- [ISONCS Specification](https://github.com/ISON-format/ison/blob/main/ISONCS.md)
- [Field Sort Cross-Port Plan](https://github.com/ISON-format/ison/blob/main/benchmark/FIELD_SORT_CROSS_PORT_PLAN.md)
- [Golden Fixture](https://github.com/ISON-format/ison/blob/main/benchmark/golden_fixture_field_sort.json)

## License

MIT — Copyright (c) 2025 Mahesh Vaikri

## Version

Compatible with ISON v1.0.4+
