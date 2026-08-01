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

3. **Emit with canonical settings:**
   - Single-space delimiter (no custom delimiters, no alignment)
   - No comments or extra whitespace
   - UTF-8 encoding
   - Quoting rules identical to `dumps()` (space, pipe, quote, backslash, newline, leading `#`, header-shaped values, empty strings)
   - ISONL variant: `dumps_canonical_isonl()` applies identical canonical rules to ISONL format

4. **Idempotent over input order:**
   - Parsing canonical ISON and re-serializing canonically produces identical bytes
   - Field order in parsed documents does not affect output
   - `dumps_canonical(parse(dumps_canonical(doc))) == dumps_canonical(doc)`

## Implementation Notes

- **Ordinal (lexicographic) sort, not numeric**: `"1"` < `"10"` < `"2"`. Consistent across all languages.
- **Key construction is the caller's responsibility**: ISONCS does not interpret or construct keys. If you want tier prefixes, zero-padding, or relationship weighting, construct them in the key before calling `dumps_canonical()`.
- **No parsing variant**: canonical *output* is deterministic by construction; canonical *input* validation (rejecting non-canonical ISON) is optional per implementation and not in scope.
- **Golden fixtures**: each language's test suite includes a shared fixture document serialized to canonical bytes, verified against reference (ison-py).

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

All six implementations (Python, JavaScript, TypeScript, Go, Rust, C++) produce byte-identical canonical output for the same logical Document. Verified by:

- Shared golden fixture test in each language
- Each implementation parses, serializes canonically, compares to reference bytes
- CI runs these tests on every commit to catch drift

