"""
Tests for canonical ISON serialization (ISONCS).

Canonical serialization produces byte-identical output across implementations
for the same logical data, by sorting blocks and rows deterministically.
"""

import pytest
from ison_parser import (
    Document, Block, Reference, FieldInfo,
    dumps_canonical, dumps_canonical_isonl,
    loads, loads_isonl
)


def test_canonical_blocks_sorted():
    """Blocks should be sorted ordinal-string by kind.name."""
    doc = Document()
    doc.blocks.append(Block(kind='table', name='users', fields=['id', 'name'], rows=[{'id': '2', 'name': 'Bob'}]))
    doc.blocks.append(Block(kind='table', name='active_users', fields=['id', 'name'], rows=[{'id': '1', 'name': 'Alice'}]))
    doc.blocks.append(Block(kind='table', name='zulu', fields=['id', 'name'], rows=[{'id': '3', 'name': 'Charlie'}]))

    canonical = dumps_canonical(doc)

    # Blocks should be in ordinal order: table.active_users < table.users < table.zulu
    assert 'table.active_users' in canonical
    assert canonical.index('table.active_users') < canonical.index('table.users')
    assert canonical.index('table.users') < canonical.index('table.zulu')


def test_canonical_rows_sorted_by_key():
    """Rows should be sorted ordinal-string by first column value."""
    doc = Document()
    block = Block(kind='table', name='items', fields=['id', 'name'], rows=[
        {'id': '10', 'name': 'ten'},
        {'id': '2', 'name': 'two'},
        {'id': '1', 'name': 'one'},
    ])
    doc.blocks.append(block)

    canonical = dumps_canonical(doc)

    # Ordinal sort: "1" < "10" < "2" (numeric strings get quoted)
    lines = canonical.split('\n')
    data_lines = [l for l in lines if l and not l.startswith('table') and l != 'id name']
    assert data_lines == ['"1" one', '"10" ten', '"2" two']


def test_canonical_null_keys_sort_last():
    """Rows with null in the key column should sort to the end."""
    doc = Document()
    block = Block(kind='table', name='items', fields=['id', 'name'], rows=[
        {'id': '2', 'name': 'two'},
        {'id': None, 'name': 'orphan'},
        {'id': '1', 'name': 'one'},
    ])
    doc.blocks.append(block)

    canonical = dumps_canonical(doc)
    lines = canonical.split('\n')
    data_lines = [l for l in lines if l and not l.startswith('table') and l != 'id name']

    # Rows with values come first, null keys last (numeric strings get quoted)
    assert data_lines == ['"1" one', '"2" two', 'null orphan']


def test_canonical_idempotent():
    """Canonical serialization is idempotent: canonical(parse(canonical(doc))) == canonical(doc)."""
    doc = Document()
    block = Block(kind='table', name='users', fields=['id', 'name'], rows=[
        {'id': '2', 'name': 'Bob'},
        {'id': '1', 'name': 'Alice'},
    ])
    doc.blocks.append(block)

    canonical1 = dumps_canonical(doc)
    parsed = loads(canonical1)
    canonical2 = dumps_canonical(parsed)

    assert canonical1 == canonical2


def test_canonical_no_alignment():
    """Canonical output should use single space, no alignment padding."""
    doc = Document()
    block = Block(kind='table', name='data', fields=['short', 'very_long_name'], rows=[{'short': 'a', 'very_long_name': 'b'}])
    doc.blocks.append(block)

    canonical = dumps_canonical(doc)

    # Should be single space between columns, not padded
    assert 'short very_long_name' in canonical
    assert 'a b' in canonical
    # No padding after 'a' (would have extra spaces for alignment)
    assert 'a  ' not in canonical


def test_canonical_isonl_blocks_sorted():
    """ISONL canonical should also sort blocks."""
    doc = Document()
    doc.blocks.append(Block(kind='table', name='zebras', fields=['id'], rows=[{'id': '1'}]))
    doc.blocks.append(Block(kind='table', name='aardvarks', fields=['id'], rows=[{'id': '2'}]))

    canonical_isonl = dumps_canonical_isonl(doc)
    lines = canonical_isonl.split('\n')

    # First line should be aardvarks (alphabetically first)
    assert 'table.aardvarks' in lines[0]
    assert 'table.zebras' in lines[1]


def test_canonical_isonl_rows_sorted():
    """ISONL canonical should sort rows by key."""
    doc = Document()
    block = Block(kind='table', name='items', fields=['id', 'val'], rows=[
        {'id': 'c', 'val': 'three'},
        {'id': 'a', 'val': 'one'},
        {'id': 'b', 'val': 'two'},
    ])
    doc.blocks.append(block)

    canonical_isonl = dumps_canonical_isonl(doc)
    lines = canonical_isonl.split('\n')

    # ISONL format: header|fields|values per line
    # Should see a, b, c in order
    assert 'table.items|id val|a one' in lines
    idx_a = next(i for i, l in enumerate(lines) if 'a one' in l)
    idx_b = next(i for i, l in enumerate(lines) if 'b two' in l)
    idx_c = next(i for i, l in enumerate(lines) if 'c three' in l)
    assert idx_a < idx_b < idx_c


def test_canonical_with_references():
    """Canonical serialization should preserve references and sort rows."""
    doc = Document()
    block = Block(kind='table', name='edges', fields=['source', 'target'], rows=[
        {'source': Reference('2'), 'target': Reference('b')},
        {'source': Reference('1'), 'target': Reference('a')},
    ])
    doc.blocks.append(block)

    canonical = dumps_canonical(doc)
    lines = canonical.split('\n')
    data_lines = [l for l in lines if l.startswith(':')]

    # Rows should be sorted by first column: :1 < :2
    assert data_lines[0] == ':1 :a'
    assert data_lines[1] == ':2 :b'


def test_canonical_empty_string_handling():
    """Empty strings should be quoted in canonical output."""
    doc = Document()
    block = Block(kind='table', name='test', fields=['id', 'name'], rows=[
        {'id': '1', 'name': ''},
        {'id': '2', 'name': 'value'},
    ])
    doc.blocks.append(block)

    canonical = dumps_canonical(doc)

    # Empty string should be quoted
    assert '""' in canonical


def test_canonical_field_info_preserved():
    """Field type annotations should be preserved in canonical output."""
    doc = Document()
    block = Block(kind='table', name='typed', fields=['id', 'count'], rows=[{'id': '1', 'count': 42}])
    block.field_info = [
        FieldInfo('id', 'string'),
        FieldInfo('count', 'int'),
    ]
    doc.blocks.append(block)

    canonical = dumps_canonical(doc)

    assert 'id:string count:int' in canonical


def test_canonical_golden_fixture():
    """
    Golden fixture: a standard document serialized to canonical form.
    This fixture is used for cross-implementation byte-identity verification.
    """
    doc = Document()

    # Users block
    users = Block(kind='table', name='users', fields=['id', 'name', 'active'], rows=[
        {'id': '2', 'name': 'Bob', 'active': True},
        {'id': '1', 'name': 'Alice', 'active': True},
        {'id': '3', 'name': 'Charlie', 'active': False},
    ])
    doc.blocks.append(users)

    # Edges block (added second, should sort to come before users alphabetically)
    edges = Block(kind='table', name='edges', fields=['source', 'target'], rows=[
        {'source': Reference('2'), 'target': Reference('1')},
        {'source': Reference('1'), 'target': Reference('3')},
    ])
    doc.blocks.append(edges)

    canonical = dumps_canonical(doc)

    # Expected order: blocks sorted (edges < users), rows sorted within each
    # Note: numeric strings like "1", "2", "3" are quoted by the serializer
    expected_lines = [
        'table.edges',
        'source target',
        ':1 :3',
        ':2 :1',
        '',
        'table.users',
        'id name active',
        '"1" Alice true',
        '"2" Bob true',
        '"3" Charlie false',
    ]
    expected = '\n'.join(expected_lines)

    assert canonical == expected


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
