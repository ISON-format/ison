# ISONCS — ISON Canonical Serialization

A deterministic serialization contract for ISON documents, producing byte-identical output across all implementations when given logically identical data.

**Use cases:**
- Content addressing (checksums, deduplication)
- Prefix stability and incremental serialization (ISONGraph)
- LLM prompt caching (identical prefix = cache hit)
- Git diffs (deterministic output enables meaningful diffs)
- Cross-language verification (golden fixtures)

## Contract

`dumps_canonical(doc: Document) -> str` takes a Document and produces bytes that:

1. **Sort blocks ordinal-string on their key** (kind.name concatenated):
   - `"users"` < `"user_profiles"` < `"users_active"`
   - Blocks are emitted in this order regardless of insertion order

2. **Sort rows within each block ordinal-string on their key**:
   - The "key" is determined by the first column of the row (conventionally `id`)
   - If a row has no value in the key column (null), it sorts after all rows with values
   - Rows are emitted in this order regardless of insertion order

3. **Sort fields within each row ordinal-string on their column name:**
   - The `"id"` field (if present) is hoisted to the first column position
   - Remaining fields are sorted alphabetically by UTF-8 byte order (not Unicode code point order)
   - Fields are emitted in this order regardless of input order or implementation's iteration semantics
   - This ensures byte-identical output across implementations with different hash table iteration (Rust HashMap, Python dict, Go map, C# Dictionary, etc.)
   - Example: Input fields `{score, active, id, email, name}` → canonical order `{id, active, email, name, score}`

4. **Emit with canonical settings:**
   - Single-space delimiter (no custom delimiters, no alignment)
   - No comments or extra whitespace
   - UTF-8 encoding
   - Quoting rules identical to `dumps()` (space, pipe, quote, backslash, newline, leading `#`, header-shaped values, empty strings)
   - ISONL variant: `dumps_canonical_isonl()` applies identical canonical rules to ISONL format

5. **Idempotent over input order:**
   - Parsing canonical ISON and re-serializing canonically produces identical bytes
   - Field order in parsed documents does not affect output
   - Block insertion order, row insertion order, and field insertion order are all normalized
   - `dumps_canonical(parse(dumps_canonical(doc))) == dumps_canonical(doc)`

## Field Ordering

Field sorting is essential for byte-identical output across implementations, because hash table iteration order is unspecified:

- **Rust HashMap**: Unordered iteration (non-deterministic)
- **Go map**: Unordered iteration (randomized per run)
- **C# Dictionary**: Implementation-dependent order
- **Python dict** (3.7+): Insertion order (predictable, but implementation detail)
- **JavaScript object**: Insertion order for string keys (ES2015+), but implementation detail

Without field sorting, the same logical data produces different field orders in different implementations, breaking byte-identity.

### Field Sorting Algorithm

1. **Hoist the `"id"` field first** (if present)
   - `"id"` is conventionally the reference anchor (`:type:id` references use this column)
   - Hoisting it to first position preserves readability in canonical output
   - Rationale: readable output is a secondary benefit; determinism is primary

2. **Sort remaining fields alphabetically by UTF-8 byte order**
   - UTF-8 byte order (ordinal comparison on UTF-8 code points, not Unicode code points)
   - Example: `[name, email, score, active]` → `[active, email, name, score]`
   - NOT code-point order, NOT locale-aware order

### UTF-8 Byte vs Unicode Code Point Order

This matters for characters outside the Basic Multilingual Plane (above U+FFFF):

| Field Names | UTF-8 Bytes | UTF-16 Code Units | Correct Order (UTF-8) |
|---|---|---|---|
| `Ａfield`, `😀field` | 0xEF, 0xF0 | 0xFF, 0xD8 (surrogate) | Ａ < 😀 |

**UTF-16 languages (JavaScript, TypeScript, C#) must use explicit UTF-8 byte comparison**, not native string comparison:
- JavaScript: `TextEncoder` + byte array comparison (not `<`)
- TypeScript: same as JavaScript
- C#: `System.Text.Encoding.UTF8.GetBytes()` + byte array comparison (not `CompareOrdinal`)

**Why this matters:** 
- A port using native string `<` passes most tests
- Only characters above U+FFFF reveal the divergence (rare, but production failure when it happens)
- The golden fixture includes `Ａfield` vs `😀field` to catch this

### Reserved Field Names

The field name `"id"` is reserved in canonical serialization. If your data has an unrelated column named `"id"` that is not a reference key, canonical output will still hoist it first. Use a different name (e.g., `"_id"`, `"oid"`) if this behavior is unwanted.

### Representable Names

A name that cannot be written and read back as itself has no canonical form, so serialization **rejects** it rather than emitting bytes that parse as something else.

Names obtained by parsing are always representable — the parser could not have produced an unrepresentable one. The rule applies to the other path: a document built in code, whose names never had to survive a parse.

**Field names** may not contain:

| Character | Why |
| --- | --- |
| space, tab | the field header is whitespace-separated, so `first name` reads back as two fields |
| newline, CR | ends the header line |
| `:` | separates a field name from its type (`id:int`) |
| `\|` | the ISONL field delimiter |

and may not **begin** with `#`, which starts a comment. A `#` anywhere else is unambiguous.

**Block kind and name** may not contain space, tab, newline, or CR. The kind additionally may not contain `.`, since the header splits on the first dot — a dot in the kind would move that boundary and rename the block.

Explicitly still representable, and pinned by corpus cases so a later tightening cannot remove them silently:

- **`.` in a field name.** Dotted field names address nested values; a flat key containing a dot round-trips as itself. `a.b` is legal.
- **`#` after the first character.** `a#b` is legal.
- **`.` in a block name.** Only the kind is constrained; the header splits on the first dot, so everything after it is the name.

Implementations signal rejection idiomatically — an exception in Python, JavaScript, TypeScript, C++ and C#; an error return in Go and Rust. The shared corpus maps each onto a neutral token (`INVALID_FIELD_NAME`, `INVALID_BLOCK_NAME`) so the verdict is comparable across languages without sharing type names.

### Cross-Implementation Verification

All implementations (Python, JavaScript, TypeScript, Go, Rust, C#, C++) are verified to produce byte-identical field orders by:

1. **Golden fixture test**: Shared JSON input, expected canonical ISON output
2. **UTF-16 divergence test**: Fields named `Ａfield` and `😀field` to catch byte-order bugs
3. **Table signature independence test**: Same columns in different order produce one table, not two

## Implementation Notes

- **Ordinal (lexicographic) sort, not numeric**: `"1"` < `"10"` < `"2"`. Consistent across all languages.
- **Key construction is the caller's responsibility**: ISONCS does not interpret or construct keys. If you want tier prefixes, zero-padding, or relationship weighting, construct them in the key before calling `dumps_canonical()`.
- **No parsing variant**: canonical *output* is deterministic by construction; canonical *input* validation (rejecting non-canonical ISON) is optional per implementation and not in scope.
- **Golden fixtures**: each language's test suite includes a shared fixture document serialized to canonical bytes, verified against reference (ison-py).
- **Field sorting is orthogonal to ISON's data interchange role**: Regular `dumps()` preserves authored field order because ISON is an interchange format. `dumps_canonical()` sorts fields because determinism requires implementation-independence. This divergence is intentional and documented.

## Examples

### Basic sorting

Input (insertion order):
```
table.users
id name
2 Bob
1 Alice
3 Charlie

table.users_active
id name
10 Diana
```

Canonical output (blocks sorted, rows sorted):
```
table.users
id name
1 Alice
2 Bob
3 Charlie

table.users_active
id name
10 Diana
```

### Null values in key column

Rows with null in the key column (or missing key column) sort to the end:

```
table.items
id name
1 apple
null orphan
2 banana
```

Canonical output:
```
table.items
id name
1 apple
2 banana
null orphan
```

### Tier-prefixed keys (ISONGraph use case)

ISONGraph constructs keys with tier prefixes to control stability:

```
table.nodes
_tier_id label
0_00001 Alice
9_00147 Bob (appended later)
0_00002 Charlie
```

Canonical sort preserves order because tier prefix is part of the key:

```
table.nodes
_tier_id label
0_00001 Alice
0_00002 Charlie
9_00147 Bob (appended later)
```

Appending new nodes uses tier `9_*` (volatile), existing nodes use tier `0_*` (invariant). Stable prefix is `9_00000` — everything before that is unchanged.

## Across Implementations

All seven implementations (Python, JavaScript, TypeScript, C#, Go, Rust, C++) produce byte-identical canonical output for the same logical Document. Verified by:

- Shared golden fixture test in each language
- Each implementation parses, serializes canonically, compares to reference bytes
- CI runs these tests on every commit to catch drift

