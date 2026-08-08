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

### Representable References

A reference is written as `:type:id` with **no quoting**. Every other value passes through the quoting rules, so a string containing a space is quoted and survives; a reference has no such escape and its characters land in the row raw. Whitespace therefore splits the row into extra columns, and a newline ends the row early — which truncates the reference *silently* rather than failing.

A reference `id` or `type` may not contain space, tab, newline or carriage return. In **ISONL** the pipe is additionally forbidden, because it ends the field.

That asymmetry is deliberate, and it follows from a rule that governs all of this section:

> **Each form rejects exactly what it cannot parse, and nothing more.**

`:p:a|b` parses correctly in ISON and reads back as `Reference(p:a|b)`, so ISON must keep writing it — refusing would make a valid file readable but not writable, which is a worse failure than the one being prevented. ISONL cannot parse it, so ISONL refuses it, and converting such a document from ISON to ISONL raises rather than emitting a line that will fail at read.

The practical consequence is that the two forms do not carry identical document sets. ISON is the wider one. A converter must be prepared for the narrowing, and gets a clear error at the point of conversion instead of a corrupt line discovered later by a different reader.

### References carry an id, not a type

`:people:1` is the wire form for a reference whose id is `1`, whether the target stored that id as an integer or as the string `"1"`. This is deliberate and is not going to change.

The type is not lost. It is declared once, at the target:

```ison
table.people
id:int name
1 Alice

table.orders
id:int owner
100 :people:1
```

The reference carries `1`; the `people` block declares `id:int`; a consumer resolving the reference coerces against that declaration. Typing the reference site instead would repeat, at every reference in the document, information the target already states once — in a format whose entire premise is not repeating things. It is the same reasoning that puts field names in a header rather than on every row.

The one genuinely ambiguous case is a single id column holding both `1` and `"1"`. An `id:int` annotation on that column rejects the string row, so the collision is a modelling error the target's own type declaration prevents. A consumer that permits heterogeneous ids — as a graph layer might — should guard at construction, where the mistake is, rather than expecting the wire format to disambiguate on its behalf.

Changing this would require new reference syntax in all seven implementations and would invalidate every document already written. The cost is not the implementation; it is that every existing ISON file stops being readable by the thing that wrote it.

### Where ISONL is stricter, and why

ISONL writes its envelope — `kind.name|fields|values` — raw, so it refuses characters in block and field names that ISON accepts. Two of those refusals have different justifications, and conflating them has already led to one proposed "fix" in the wrong direction.

| Character | ISON | ISONL | Why ISONL refuses |
| --- | --- | --- | --- |
| `\|` | writes | refuses | **Necessity.** Ends the field. ISONL cannot parse it. |
| `"` | writes | refuses | **Necessity.** Breaks tokenisation — the line no longer has three fields. ISONL cannot parse it. |
| `\` | writes | refuses | **Caution.** ISONL *can* parse it. |

The backslash is the odd one out. It is ISONL's escape character inside values, so keeping it out of the raw envelope is a deliberate guard rather than a parsing constraint — and by the rule above, refusing what you *can* parse is over-strict.

It is kept anyway, knowingly:

- Every backslash position round-trips through the ISONL parser — infix, leading, trailing, doubled, and adjacent to `n`. A trailing backslash immediately before the delimiter (`table.ab\|id|1`) reads back as the name `ab\` with fields `[id]`; the escape does not extend across the boundary and shift the field split.
- So there is no ambiguity for the guard to prevent. Relaxing it would mean verifying that envelope-backslash handling is byte-identical across seven independent ISONL parsers, to permit names essentially nobody writes.
- The current behaviour fails **loudly**, at write, in the process that made the mistake. That is the failure mode this specification prefers.

If a future release relaxes it, the corpus must gain envelope-backslash cases first, and all seven must agree before the rule changes in any one of them.

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

