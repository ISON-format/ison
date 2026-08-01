# Field Sort Design Decisions for ISONCS

## Problem
`dumps_canonical` does not sort fields within records. Python dict insertion-order preservation masks the issue, but Rust HashMap and Go map iterations are unordered. Cross-language byte-identity fails on first port.

## Decisions

### Decision 1: Sort Order (id-first-then-alphabetical)

**Recommendation**: Sort as `id` first, then alphabetical for remaining fields.

**Rationale**:
- Pure alphabetical (e.g., `active`, `email`, `id`, `name`, `score`) is implementation-independent ✓
- `id`-first-then-alphabetical (e.g., `id`, `active`, `email`, `name`, `score`) is equally implementation-independent ✓
- Second option preserves one piece of readability: `:type:id` references resolve against the id column (the "anchor"), so readers scanning canonical output still find it first
- Narrows divergence between `dumps` (preserve order) and `dumps_canonical` (sort for determinism)

**Spec clause**:
> When sorting fields within a row, place the `id` field first (if present),
> then sort remaining fields alphabetically by field name (see Decision 2).
> Fields present in output but not in Document definition are not sorted.

### Decision 2: Sort Comparison (UTF-8 Byte-wise Ordinal)

**Recommendation**: UTF-8 byte-wise comparison (ordinal ordering on UTF-8 code points).

**Rationale**:
- Spec already commits to ordinal for IDs: `"1" < "10" < "2"` (not numeric)
- Must be consistent across all implementations
- **Critical issue**: JavaScript `<` compares UTF-16 code units; Rust compares UTF-8 bytes
- **They disagree above U+FFFF** (emoji, rare CJK characters)
  - Example: A field named with rare CJK character U+20000 sorts differently in JS (UTF-16) vs Rust (UTF-8)
  - This is exactly the kind of production bug that surfaces late and is expensive to fix
- Specifying UTF-8 ordinal explicitly forces JS/TS to implement comparison correctly

**Spec clause**:
> Fields are sorted using UTF-8 byte-wise comparison (ordinal ordering on UTF-8
> code points), not lexicographic or locale-aware comparison. JavaScript and
> TypeScript implementations must explicitly compare UTF-8 byte sequences, not
> use built-in string comparison. This ensures deterministic ordering across
> implementations regardless of their native string representation (UTF-8 vs UTF-16).
>
> Example: Field names `["name", "emoji_😀", "id"]` sort as:
> - UTF-8 bytes: `id` (0x6964) < `emoji_😀` (0xF0...) < `name` (0x6E...)
> - Correct: `["id", "emoji_😀", "name"]`
> - JavaScript without explicit UTF-8 handling sorts UTF-16 code units differently

### Decision 3: Regression Test (Python Field Shuffling)

**Approach**: Python test that shuffles field order *before* parsing to simulate HashMap behavior.

**Advantage**: No need to implement field sorting in six ports to catch the bug. Python can reproduce the issue today by simulating unordered iteration.

**Test structure**:
```python
def test_field_order_independence():
    """Verify canonical form is independent of input field order."""
    data = {
        "users": [
            {"id": 1, "name": "Alice", "email": "a@ex.com"},
            {"id": 2, "name": "Bob", "email": "b@ex.com"},
        ]
    }
    
    # Parse with original field order
    doc1 = ison_parser.from_dict(data)
    canonical1 = ison_parser.dumps_canonical(doc1)
    
    # Reorder fields before parsing (simulating HashMap)
    data_reordered = {
        "users": [
            {"name": u["name"], "email": u["email"], "id": u["id"]}
            for u in data["users"]
        ]
    }
    doc2 = ison_parser.from_dict(data_reordered)
    canonical2 = ison_parser.dumps_canonical(doc2)
    
    # After fix: both should produce identical output
    assert canonical1 == canonical2
```

### Decision 4: Documentation Rationale

**Docs should explain WHY**:

`dumps`: Preserves field order as authored because ISON is an interchange format.
Reordering someone's data is wrong. If you write `{name, age}`, you expect
`{name, age}` back, not `{age, name}`.

`dumps_canonical`: Sorts fields because deterministic output requires
implementation-independence. HashMap iteration order is unspecified. To guarantee
byte-identical output across Go, Rust, Python, JavaScript, TypeScript, and C#,
we must sort explicitly.

**Frame it as design, not inconsistency**: The divergence between `dumps` and
`dumps_canonical` is intentional and necessary, not a limitation.

## ADR-004 Interaction (To Investigate)

If ADR-004 defines table naming based on column signature (frozen column set),
and signatures must be order-independent, then:

**Question**: Are table names stable if the same columns appear in different order?
- If table names are hash-based or order-independent: ✓ no issue
- If table names are order-dependent (e.g., concatenated field names): ⚠ risk of duplicate tables

**Action**: Check whether field sorting here affects table signature naming. If
it does, coordinate so signature naming is also order-independent.

## Spec Location

Add these clauses to ISONCS_SPECIFICATION.md under a new section:
`## Canonical Field Ordering`

## Implementation Checklist

- [ ] Write regression test (field shuffling in Python)
- [ ] Implement field sorting in ison-py `dumps_canonical`
- [ ] Verify test fails before fix, passes after
- [ ] Port field sorting to Go, Rust, C++, JS, TS, C#
- [ ] Cross-language test: same fixture through all ports
- [ ] Update spec with field sorting rules and UTF-8 comparison clause
- [ ] Document WHY in API docs (not just WHAT)
- [ ] Check ADR-004 table signature naming for order-independence
