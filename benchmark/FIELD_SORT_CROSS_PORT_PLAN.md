# Cross-Port Plan: Field Sorting in ISONCS

## Clarification: How the Sort Works

**Not a tuple key.** The implementation partitions then sorts:

```python
# Step 1: Partition fields into [id] and [others]
id_fields = [f for f in fields if f == "id"]
other_fields = [f for f in fields if f != "id"]

# Step 2: Sort others by UTF-8 bytes
sorted_others = sorted(other_fields, key=lambda f: f.encode("utf-8"))

# Step 3: Concatenate: id first, then sorted others
return id_fields + sorted_others
```

This is simpler to port than a computed tuple key, and it's correct: id hoists unconditionally if present, remaining fields sort alphabetically by UTF-8.

**Important for porting**: Don't collapse this into a tuple key. The two-step structure makes the intent clear: "id is special because it's the reference anchor."

## Shared Golden Fixture (Not Six Independent Tests)

One input file (JSON), one expected-output file (ISON canonical), byte-compared across all six implementations.

**Location**: `benchmark/golden_fixture_field_sort.json` (input) and `golden_fixture_field_sort.expected_canonical.ison` (output)

**Fixture must cover:**

1. **Scrambled field order**: Input has `{score, active, id, email, name}`, output must sort to `{id, active, email, name, score}`

2. **id present vs absent**: One table with id (hoisted), one without (alphabetical only):
   ```json
   {
     "with_id": [{"id": 1, "name": "Alice", "email": "a@ex.com"}],
     "no_id": [{"age": 30, "name": "Bob", "city": "NYC"}]
   }
   ```

3. **UTF-16 vs UTF-8 divergence** (CRITICAL — catches all three UTF-16 implementations):
   ```json
   {
     "utf16_divergence": [
       {
         "id": 1,
         "😀field": "non-BMP emoji U+1F600",
         "Ａfield": "fullwidth A U+FF21"
       }
     ]
   }
   ```
   Expected field order: `[id, Ａfield, 😀field]` (UTF-8 byte order)
   
   **Why this catches the bug:**
   - UTF-8: Ａ (0xEF...) < 😀 (0xF0...) → Ａfield comes first
   - UTF-16: 😀 (surrogate 0xD8...) < Ａ (0xFF21) → 😀field comes first
   - JavaScript/TypeScript using `<`: Produces `[id, 😀field, Ａfield]` (WRONG)
   - C# using `CompareOrdinal`: Produces `[id, 😀field, Ａfield]` (WRONG)
   - Python, Rust, Go, C++ using byte comparison: All produce `[id, Ａfield, 😀field]` (CORRECT)
   
   This pair diverges ONLY in UTF-16 languages.

4. **Same column set, different discovery order** (table signature independence):
   ```json
   {
     "users_order_1": [{"id": 1, "name": "Alice", "email": "a@ex.com"}],
     "users_order_2": [{"email": "a@ex.com", "name": "Alice", "id": 1}]
   }
   ```
   Both must produce one table named `table.users` (or similar), not two.

5. **Empty table and single-row table**: Edge cases for row sorting.

## Port Order (Strategic)

**Rust second** (immediately after Python):
- Rust's `HashMap` is unordered, so it would have exposed the original bug
- Strongest independent validation that the fix is real
- If Rust produces byte-identical output to Python, the fix is solid

**JavaScript / TypeScript / C# third** (UTF-16 hazard group):
- All three use UTF-16 encoding natively
- All three are caught by the `Ａfield` vs `😀field` divergence
- Most likely to fail if TextEncoder (JS/TS) or explicit byte comparison (C#) is skipped
- Run these together since they share the UTF-16 divergence risk
- C# `CompareOrdinal` uses UTF-16 code units, not UTF-8 bytes — must use `System.Text.Encoding.UTF8.GetBytes()`

**Go and C++ last**:
- Code-point order and UTF-8 byte order are identical by design — no divergence risk
- Unlikely to surprise (deterministic iteration + UTF-8 native)
- Validate "the fix works across the board" rather than "the fix is real"

## Spec Additions

Add to ISONCS_SPECIFICATION.md:

### Reserved Field Names

The field name `"id"` is reserved in canonical serialization. When present in a table, `"id"` is unconditionally hoisted to the first column in canonical output, regardless of input order.

**Rationale**: ISON reference syntax (`:type:id`) assumes the id column is the key. Hoisting it to the first position ensures canonical output is readable (readers see the anchor first) and stable (id doesn't sort with other alphabetical fields).

**Consequence**: If your data has an unrelated column named `"id"` that is not a reference key, canonical output will still hoist it first. This is intentional; use a different name if this behavior is unwanted.

### Field Ordering Algorithm

Canonical serialization sorts fields as follows:

1. If a field is named exactly `"id"`, hoist it to position 0
2. Remaining fields are sorted alphabetically by UTF-8 byte order (ordinal comparison on UTF-8 code points, not Unicode code points)
3. Within a row, values are written in the canonical field order

**UTF-8 vs Unicode**: Field names are compared byte-by-byte as UTF-8. This is distinct from Unicode code-point ordering or locale-aware ordering.

- Example: Field names `[id, emoji_😀, name]`
  - `emoji_😀` encodes to `emoji_` (UTF-8) + F0 9F 98 80 (UTF-8 for U+1F600)
  - Byte-wise: `name` (6E...) < `emoji_` (65...) NO — "name" starts with 6E, "emoji" with 65, so emoji sorts first
  - Actual order: `[id, emoji_😀, name]`

**Rationale for UTF-8 bytes**: Ensures deterministic ordering across implementations. JavaScript uses UTF-16 code units by default; Rust and Go use UTF-8. By specifying UTF-8 byte comparison, all implementations are held to one rule, and cross-platform byte-identity is guaranteed.

### Implementation Notes for Ports

- Do NOT use built-in string comparison (`<` in JavaScript, `std::sort` with default `std::string` in C++)
- DO encode field names to UTF-8 bytes and compare bytes
- Python: `sorted(fields, key=lambda f: f.encode("utf-8"))` after hoisting id
- Rust: `as_bytes()` comparison or manual UTF-8 iteration
- JavaScript/TypeScript: `TextEncoder` to produce byte arrays, compare byte-by-byte
- C++: `std::vector<uint8_t>` from UTF-8 encoding, compare byte vectors
- C#: `System.Text.Encoding.UTF8.GetBytes()`, compare byte arrays
- Go: `[]byte(field)` comparison (Go's byte slice comparison is lexicographic)

### Table Signature / Column Set Independence

If a table's name or identity is derived from its column set (e.g., frozen-column signatures), the derivation must be order-independent. Use the canonical field order (id first, then alphabetical UTF-8) as the basis for the signature, so the same column set discovered in two different input orders produces one table, not two.

## Checklist

- [ ] Create shared golden fixture (JSON input + expected canonical output)
- [ ] Verify Python passes the fixture
- [ ] Implement in Rust with UTF-8 byte comparison
- [ ] Verify Rust matches Python byte-for-byte
- [ ] Implement in JavaScript with TextEncoder
- [ ] Verify JS emoji case produces UTF-8 byte order (not UTF-16)
- [ ] Implement in TypeScript (same as JS)
- [ ] Implement in C++ with std::vector<uint8_t>
- [ ] Implement in C# with System.Text.Encoding.UTF8
- [ ] Implement in Go (byte slice comparison)
- [ ] Run all six through shared fixture, verify byte-identical output
- [ ] Update ISONCS_SPECIFICATION.md with field ordering and reserved names
- [ ] Add emoji test case to all six test suites (don't skip it as "unlikely")
