# Golden Fixture for Field Sorting in ISONCS

## Files

- `golden_fixture_field_sort.json` — Input data (all implementations parse this)
- `golden_fixture_field_sort.expected.ison` — Expected canonical output (byte-for-byte comparison)

## Test Cases (Do Not Remove or "Tidy")

Each table in the fixture tests a specific property of field sorting. The weird field names and character choices are **intentional**.

### `scrambled` table

**Purpose:** Test that fields are sorted correctly when input order is scrambled.

**Input field order:** `score, active, id, email, name`
**Expected canonical order:** `id, active, email, name, score` (id first, then alphabetical)

This table validates that the sort algorithm works for typical data.

### `no_id` table

**Purpose:** Test field sorting when `id` field is absent.

**Input field order:** `city, age, name` (deliberately out of alphabetical order)
**Expected canonical order:** `age, city, name` (alphabetical only, no id to hoist)

This validates that the hoist-id rule doesn't break when id isn't present.

### `utf16_divergence` table

**PURPOSE: CATCHES UTF-16 vs UTF-8 DIVERGENCE IN JS/TS/C#**

**DO NOT REMOVE OR CHANGE THE FIELD NAMES `Ａfield` AND `😀field`.**

**Input field names:**
- `Ａfield` — fullwidth A (U+FF21), encodes to `0xEF BF A1` in UTF-8
- `😀field` — emoji (U+1F600), encodes to `0xF0 9F 98 80` in UTF-8

**Expected canonical order:** `id, Ａfield, 😀field`

**Why this catches the bug:**
- **UTF-8 byte order:** `0xEF` < `0xF0` → Ａfield comes first ✓
- **UTF-16 code units (surrogates):** `0xD83D` (emoji surrogate) < `0xFF21` (fullwidth A) → 😀field comes first ✗

If a JavaScript or C# implementation uses native string comparison instead of UTF-8 byte encoding:
- JavaScript using `<` instead of `TextEncoder`: Produces wrong order
- C# using `CompareOrdinal` instead of `UTF8.GetBytes()`: Produces wrong order

**This is the sentinel test.** If an implementation passes all other tests but fails this one, the bug is caught. If it fails silently (wrong output, test still runs), the fixture is corrupted.

### `users_order_1` and `users_order_2` tables

**Purpose:** Test table signature order-independence.

**Both tables have identical columns:** `id, email, name`
**But discovered in different orders:**
- `users_order_1`: Input order is `id, name, email`
- `users_order_2`: Input order is `email, name, id`

**Expected canonical order for both:** `id, email, name`

This validates that the same column set discovered in two different orders produces the same table structure (preventing duplicate tables from the same logical data).

### `empty` table

**Purpose:** Edge case — empty table.

Tests that the canonical serializer handles zero rows without crashing.

### `single_row` table

**Purpose:** Edge case — single row.

Tests row sorting with only one row (trivial sort, but exercises the code path).

## Maintenance

If you're tempted to "clean up" the fixture:

1. **Keep `Ａfield` and `😀field`** — these characters are the test. Changing them silently breaks UTF-16 validation.
2. **Keep the scrambled order in `scrambled`** — the point is to test sorting, not a pre-sorted table.
3. **Keep the mismatched field orders in `users_order_1/2`** — that's what makes signature independence testable.

If a test case seems unnecessary, it probably caught a bug in production. Run the fixture through all six implementations before deleting anything.

## How to Use

For each implementation (Rust, JS/TS, C++, C#, Go):

1. Load `golden_fixture_field_sort.json`
2. Parse and canonicalize (using the implementation's `dumps_canonical`)
3. Compare output byte-for-byte with `golden_fixture_field_sort.expected.ison`
4. If bytes differ, the implementation is wrong
5. If all six implementations produce identical bytes, field sorting is correct

The fixture is language-agnostic (JSON input) and deterministic (one expected output).
