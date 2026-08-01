"""
Test that canonical serialization is independent of input field order.

This test reproduces the latent parity bug: Python dict insertion-order
preservation masks the issue that a Rust HashMap or Go map would fail.
By explicitly shuffling field order before parsing, we simulate HashMap
behavior and catch the bug in Python without needing to implement six ports.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../src'))

import ison_parser


def test_field_order_independence_simple():
    """Basic test: field order should not affect canonical output."""

    # Data with fields in order: id, name, email, age
    data_original = {
        "users": [
            {"id": 1, "name": "Alice", "email": "alice@ex.com", "age": 30},
            {"id": 2, "name": "Bob", "email": "bob@ex.com", "age": 25},
        ]
    }

    # Same data but reorder fields: name, age, id, email (simulating HashMap)
    data_reordered = {
        "users": [
            {
                "name": u["name"],
                "age": u["age"],
                "id": u["id"],
                "email": u["email"],
            }
            for u in data_original["users"]
        ]
    }

    # Parse and canonicalize both
    doc_original = ison_parser.from_dict(data_original, auto_refs=True, smart_order=True)
    canonical_original = ison_parser.dumps_canonical(doc_original)

    doc_reordered = ison_parser.from_dict(data_reordered, auto_refs=True, smart_order=True)
    canonical_reordered = ison_parser.dumps_canonical(doc_reordered)

    # EXPECTED (after fix): Both should produce identical output
    # ACTUAL (before fix): They differ because fields are not sorted

    print("Original field order:")
    print(canonical_original)
    print()
    print("Reordered field order:")
    print(canonical_reordered)
    print()

    if canonical_original == canonical_reordered:
        print("[PASS] Canonical output is field-order independent")
        return True
    else:
        print("[FAIL] Field order affects canonical output (latent parity bug)")
        print(f"  Original: {len(canonical_original)} bytes")
        print(f"  Reordered: {len(canonical_reordered)} bytes")

        # Show first difference
        for i, (c1, c2) in enumerate(zip(canonical_original, canonical_reordered)):
            if c1 != c2:
                print(f"  First difference at position {i}:")
                print(f"    Original[{i-5}:{i+15}]: {repr(canonical_original[max(0,i-5):i+15])}")
                print(f"    Reordered[{i-5}:{i+15}]: {repr(canonical_reordered[max(0,i-5):i+15])}")
                break

        return False


def test_field_order_independence_large():
    """Comprehensive test with larger dataset simulating real usage."""

    # Create dataset with 350 records
    users_original = [
        {
            "id": i,
            "name": f"User_{i}",
            "email": f"user{i}@example.com",
            "active": i % 2 == 0,
            "score": float(i * 1.5),
        }
        for i in range(1, 51)
    ]

    # Reorder: score, active, name, email, id (reverse alphabetical of original)
    users_reordered = [
        {
            "score": u["score"],
            "active": u["active"],
            "name": u["name"],
            "email": u["email"],
            "id": u["id"],
        }
        for u in users_original
    ]

    data_original = {"users": users_original}
    data_reordered = {"users": users_reordered}

    doc_original = ison_parser.from_dict(data_original, auto_refs=True, smart_order=True)
    canonical_original = ison_parser.dumps_canonical(doc_original)

    doc_reordered = ison_parser.from_dict(data_reordered, auto_refs=True, smart_order=True)
    canonical_reordered = ison_parser.dumps_canonical(doc_reordered)

    print(f"Original: {len(canonical_original)} bytes")
    print(f"Reordered: {len(canonical_reordered)} bytes")

    if canonical_original == canonical_reordered:
        print("[PASS] Canonical output is field-order independent (large dataset)")
        return True
    else:
        print("[FAIL] Field order affects canonical output (large dataset)")
        return False


def test_expected_sort_order():
    """After fix: verify that fields are sorted as [id, ...alphabetical...]"""

    data = {
        "records": [
            {
                "name": "Alice",
                "email": "a@ex.com",
                "id": 1,
                "active": True,
                "score": 95.5,
            }
        ]
    }

    doc = ison_parser.from_dict(data, auto_refs=True, smart_order=True)
    canonical = ison_parser.dumps_canonical(doc)

    # Expected field order: id, active, email, name, score
    # (id first, then alphabetical)
    expected_header = "table.records\nid active email name score"

    lines = canonical.split('\n')
    actual_header = '\n'.join(lines[:2])

    print(f"Expected: {expected_header}")
    print(f"Actual: {actual_header}")

    if actual_header == expected_header:
        print("[PASS] Fields sorted correctly (id first, then alphabetical)")
        return True
    else:
        print("[FAIL] Fields not in expected sort order")
        return False


if __name__ == "__main__":
    print("=" * 80)
    print("REGRESSION TESTS: Field Order Independence in Canonical Serialization")
    print("=" * 80)
    print()

    print("TEST 1: Simple field reordering")
    print("-" * 80)
    result1 = test_field_order_independence_simple()
    print()

    print("TEST 2: Large dataset field reordering")
    print("-" * 80)
    result2 = test_field_order_independence_large()
    print()

    print("TEST 3: Expected sort order (id first, then alphabetical)")
    print("-" * 80)
    result3 = test_expected_sort_order()
    print()

    print("=" * 80)
    if result1 and result2 and result3:
        print("ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("SOME TESTS FAILED (expected before implementing field sorting)")
        sys.exit(1)
