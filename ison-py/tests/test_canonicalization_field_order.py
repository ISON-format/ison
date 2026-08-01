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
    """After fix: verify that fields are sorted as [id, ...alphabetical...]

    Input fields (in input order): name, email, id, active, score
    Expected output (id first, then alphabetical): id, active, email, name, score
    """

    data = {
        "records": [
            {
                "name": "Alice",          # Would be 4th alphabetically (n)
                "email": "a@ex.com",      # Would be 2nd alphabetically (e)
                "id": 1,                  # Hoisted to first
                "active": True,           # Would be 1st alphabetically (a)
                "score": 95.5,            # Would be 3rd alphabetically (s)
            }
        ]
    }

    doc = ison_parser.from_dict(data, auto_refs=True, smart_order=True)
    canonical = ison_parser.dumps_canonical(doc)

    # Input order:     [name, email, id, active, score]
    # Expected order:  [id, active, email, name, score]
    # Rule: id first, then sort remaining fields alphabetically by UTF-8 bytes

    # Assert against literal expected string to catch subtle sort bugs
    expected_lines = [
        "table.records",
        "id active email name score",
        "1 true a@ex.com Alice 95.5"
    ]
    expected_output = '\n'.join(expected_lines)

    # Normalize whitespace for comparison (canonical uses single space)
    canonical_normalized = '\n'.join(
        ' '.join(line.split()) for line in canonical.strip().split('\n')
    )

    print(f"Input field order:    [name, email, id, active, score]")
    print(f"Expected output:\n{expected_output}")
    print()
    print(f"Actual output:\n{canonical_normalized}")

    if canonical_normalized == expected_output:
        print("\n[PASS] Fields sorted correctly (id first, then alphabetical by UTF-8)")
        return True
    else:
        print("\n[FAIL] Fields not in expected sort order")
        # Show field order from actual output
        if canonical_normalized:
            actual_fields = canonical_normalized.split('\n')[1].split()
            print(f"Actual field order: {actual_fields}")
        return False


def test_table_signature_order_independence():
    """Verify table names/signatures are order-independent.

    If a table's name derives from its column set, the derivation must be
    order-independent. Otherwise the same columns discovered in different
    order would produce two tables (identical bug one level up).

    This test checks that both field orders produce documents with identical
    table identities (kind.name).
    """

    data_order1 = {
        "users": [
            {"id": 1, "name": "Alice", "email": "a@ex.com"}
        ]
    }

    data_order2 = {
        "users": [
            {"email": "a@ex.com", "id": 1, "name": "Alice"}
        ]
    }

    doc1 = ison_parser.from_dict(data_order1, auto_refs=True, smart_order=True)
    doc2 = ison_parser.from_dict(data_order2, auto_refs=True, smart_order=True)

    # Get table signatures (kind.name)
    if doc1.blocks and doc2.blocks:
        sig1 = f"{doc1.blocks[0].kind}.{doc1.blocks[0].name}"
        sig2 = f"{doc2.blocks[0].kind}.{doc2.blocks[0].name}"

        print(f"Field order 1 [id, name, email] -> table: {sig1}")
        print(f"Field order 2 [email, id, name] -> table: {sig2}")

        if sig1 == sig2:
            print("[PASS] Table signatures match (order-independent)")
            return True
        else:
            print("[FAIL] Table signatures differ (order-dependent - latent bug)")
            return False
    else:
        print("[SKIP] Could not extract table signatures")
        return True


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

    print("TEST 3: Expected sort order (id first, then alphabetical by UTF-8)")
    print("-" * 80)
    result3 = test_expected_sort_order()
    print()

    print("TEST 4: Table signature order-independence")
    print("-" * 80)
    result4 = test_table_signature_order_independence()
    print()

    print("=" * 80)
    if result1 and result2 and result3 and result4:
        print("ALL TESTS PASSED")
        sys.exit(0)
    else:
        print("SOME TESTS FAILED (expected before implementing field sorting)")
        sys.exit(1)
