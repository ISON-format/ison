/**
 * Tests for canonical ISON serialization (ISONCS).
 *
 * Canonical serialization produces byte-identical output across implementations
 * for the same logical data, by sorting blocks and rows deterministically.
 *
 * Golden fixture test verifies cross-implementation byte-identity against ison-py reference.
 */

const ISON = require('../src/ison-parser.js');
const { Reference, Block, Document } = ISON;

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        const actualRepr = JSON.stringify(actual);
        const expectedRepr = JSON.stringify(expected);
        throw new Error(`${message || 'Assertion failed'}\n  Expected: ${expectedRepr}\n  Got: ${actualRepr}`);
    }
}

function assertIncludes(text, substring, message) {
    if (!text.includes(substring)) {
        throw new Error(`${message || 'Assertion failed'}: expected to find ${JSON.stringify(substring)} in ${JSON.stringify(text)}`);
    }
}

function test(name, fn) {
    try {
        fn();
        console.log(`[PASS] ${name}`);
        passed++;
    } catch (e) {
        console.log(`[FAIL] ${name}: ${e.message}`);
        failed++;
    }
}

// =============================================================================
// Tests
// =============================================================================

test('test_canonical_blocks_sorted', () => {
    const doc = new Document();
    doc.blocks.push(new Block('table', 'users', ['id', 'name'], [{ id: '2', name: 'Bob' }]));
    doc.blocks.push(new Block('table', 'active_users', ['id', 'name'], [{ id: '1', name: 'Alice' }]));
    doc.blocks.push(new Block('table', 'zulu', ['id', 'name'], [{ id: '3', name: 'Charlie' }]));

    const canonical = ISON.dumpsCanonical(doc);

    // Blocks should be in ordinal order: table.active_users < table.users < table.zulu
    assertIncludes(canonical, 'table.active_users', 'should contain active_users block');
    assertIncludes(canonical, 'table.users', 'should contain users block');
    assertIncludes(canonical, 'table.zulu', 'should contain zulu block');

    const indexActiveUsers = canonical.indexOf('table.active_users');
    const indexUsers = canonical.indexOf('table.users');
    const indexZulu = canonical.indexOf('table.zulu');

    assert(indexActiveUsers < indexUsers, 'active_users should come before users');
    assert(indexUsers < indexZulu, 'users should come before zulu');
});

test('test_canonical_rows_sorted_by_key', () => {
    const doc = new Document();
    const block = new Block('table', 'items', ['id', 'name'], [
        { id: '10', name: 'ten' },
        { id: '2', name: 'two' },
        { id: '1', name: 'one' },
    ]);
    doc.blocks.push(block);

    const canonical = ISON.dumpsCanonical(doc);

    // Ordinal sort: "1" < "10" < "2"
    const lines = canonical.split('\n');
    const dataLines = lines.filter(l => l && !l.startsWith('table') && l !== 'id name');

    // Should see rows in order: 1, 10, 2
    const idx1 = dataLines.findIndex(l => l.includes('"1"'));
    const idx10 = dataLines.findIndex(l => l.includes('"10"'));
    const idx2 = dataLines.findIndex(l => l.includes('"2"'));

    assert(idx1 >= 0, 'should find row with "1"');
    assert(idx10 >= 0, 'should find row with "10"');
    assert(idx2 >= 0, 'should find row with "2"');
    assert(idx1 < idx10, '"1" should come before "10"');
    assert(idx10 < idx2, '"10" should come before "2"');
});

test('test_canonical_null_keys_sort_last', () => {
    const doc = new Document();
    const block = new Block('table', 'items', ['id', 'name'], [
        { id: '2', name: 'two' },
        { id: null, name: 'orphan' },
        { id: '1', name: 'one' },
    ]);
    doc.blocks.push(block);

    const canonical = ISON.dumpsCanonical(doc);
    const lines = canonical.split('\n');
    const dataLines = lines.filter(l => l && !l.startsWith('table') && l !== 'id name');

    // Rows with values come first, null keys last
    const idx1 = dataLines.findIndex(l => l.includes('"1"'));
    const idx2 = dataLines.findIndex(l => l.includes('"2"'));
    const idxNull = dataLines.findIndex(l => l.includes('null'));

    assert(idx1 >= 0, 'should find row with "1"');
    assert(idx2 >= 0, 'should find row with "2"');
    assert(idxNull >= 0, 'should find row with null');
    assert(idx1 < idxNull, '"1" should come before null');
    assert(idx2 < idxNull, '"2" should come before null');
});

test('test_canonical_idempotent', () => {
    const doc = new Document();
    const block = new Block('table', 'users', ['id', 'name'], [
        { id: '2', name: 'Bob' },
        { id: '1', name: 'Alice' },
    ]);
    doc.blocks.push(block);

    const canonical1 = ISON.dumpsCanonical(doc);
    const parsed = ISON.loads(canonical1);
    const canonical2 = ISON.dumpsCanonical(parsed);

    assertEqual(canonical1, canonical2, 'canonical form should be idempotent');
});

test('test_canonical_no_alignment', () => {
    const doc = new Document();
    const block = new Block('table', 'data', ['short', 'very_long_name'], [
        { short: 'a', very_long_name: 'b' },
    ]);
    doc.blocks.push(block);

    const canonical = ISON.dumpsCanonical(doc);

    // Should be single space between columns, not padded
    assertIncludes(canonical, 'short very_long_name', 'header should have single space');
    assertIncludes(canonical, 'a b', 'row should have single space');

    // No padding after 'a' (would have extra spaces for alignment)
    assert(!canonical.includes('a  '), 'should not have double spaces (no alignment)');
});

test('test_canonical_isonl_blocks_sorted', () => {
    const doc = new Document();
    doc.blocks.push(new Block('table', 'zebras', ['id'], [{ id: '1' }]));
    doc.blocks.push(new Block('table', 'aardvarks', ['id'], [{ id: '2' }]));

    const canonicalISONL = ISON.dumpsCanonicalISONL(doc);
    const lines = canonicalISONL.split('\n');

    // First line should be aardvarks (alphabetically first)
    assertIncludes(lines[0], 'table.aardvarks', 'first line should be aardvarks');
    assertIncludes(lines[1], 'table.zebras', 'second line should be zebras');
});

test('test_canonical_isonl_rows_sorted', () => {
    const doc = new Document();
    const block = new Block('table', 'items', ['id', 'val'], [
        { id: 'c', val: 'three' },
        { id: 'a', val: 'one' },
        { id: 'b', val: 'two' },
    ]);
    doc.blocks.push(block);

    const canonicalISONL = ISON.dumpsCanonicalISONL(doc);
    const lines = canonicalISONL.split('\n');

    // Find lines with each id
    const idxA = lines.findIndex(l => l.includes('a') && l.includes('one'));
    const idxB = lines.findIndex(l => l.includes('b') && l.includes('two'));
    const idxC = lines.findIndex(l => l.includes('c') && l.includes('three'));

    assert(idxA >= 0, 'should find row with a');
    assert(idxB >= 0, 'should find row with b');
    assert(idxC >= 0, 'should find row with c');
    assert(idxA < idxB && idxB < idxC, 'rows should be in order a, b, c');
});

test('test_canonical_with_references', () => {
    const doc = new Document();
    const block = new Block('table', 'edges', ['source', 'target'], [
        { source: new Reference('2'), target: new Reference('b') },
        { source: new Reference('1'), target: new Reference('a') },
    ]);
    doc.blocks.push(block);

    const canonical = ISON.dumpsCanonical(doc);
    const lines = canonical.split('\n');
    const dataLines = lines.filter(l => l.startsWith(':'));

    // Rows should be sorted by first column: :1 < :2
    assert(dataLines.length >= 2, 'should have at least 2 data lines with references');
    assertEqual(dataLines[0], ':1 :a', 'first row should be :1 :a');
    assertEqual(dataLines[1], ':2 :b', 'second row should be :2 :b');
});

test('test_canonical_empty_string_handling', () => {
    const doc = new Document();
    const block = new Block('table', 'test', ['id', 'name'], [
        { id: '1', name: '' },
        { id: '2', name: 'value' },
    ]);
    doc.blocks.push(block);

    const canonical = ISON.dumpsCanonical(doc);

    // Empty string should be quoted
    assertIncludes(canonical, '""', 'should quote empty string');
});

test('test_canonical_field_info_preserved', () => {
    const doc = new Document();
    const block = new Block('table', 'typed', ['id', 'count'], [
        { id: '1', count: 42 },
    ]);
    block.fieldInfo = [
        new ISON.FieldInfo('id', 'string'),
        new ISON.FieldInfo('count', 'int'),
    ];
    doc.blocks.push(block);

    const canonical = ISON.dumpsCanonical(doc);

    assertIncludes(canonical, 'id:string count:int', 'should preserve field type annotations');
});

test('test_canonical_golden_fixture', () => {
    /**
     * Golden fixture: a standard document serialized to canonical form.
     * This fixture is used for cross-implementation byte-identity verification.
     *
     * The expected output matches ison-py's reference test_canonical_golden_fixture
     * to ensure byte-identical canonical serialization across implementations.
     *
     * Fields are sorted canonically: 'id' first, then others by UTF-8 byte order.
     * 'active' (0x61...) comes before 'name' (0x6E...) in UTF-8 byte order.
     */
    const doc = new Document();

    // Users block (added second in doc.blocks order, but alphabetically last)
    const users = new Block('table', 'users', ['id', 'name', 'active'], [
        { id: '2', name: 'Bob', active: true },
        { id: '1', name: 'Alice', active: true },
        { id: '3', name: 'Charlie', active: false },
    ]);
    doc.blocks.push(users);

    // Edges block (added first in doc.blocks order, but alphabetically first)
    const edges = new Block('table', 'edges', ['source', 'target'], [
        { source: new Reference('2'), target: new Reference('1') },
        { source: new Reference('1'), target: new Reference('3') },
    ]);
    doc.blocks.push(edges);

    const canonical = ISON.dumpsCanonical(doc);

    // Expected output: blocks sorted (edges < users), rows sorted within each
    // Fields sorted canonically: id first, then by UTF-8 bytes (active < name)
    // Numeric strings like "1", "2", "3" are quoted by the serializer
    const expectedLines = [
        'table.edges',
        'source target',
        ':1 :3',
        ':2 :1',
        '',
        'table.users',
        'id active name',
        '"1" true Alice',
        '"2" true Bob',
        '"3" false Charlie',
    ];
    const expected = expectedLines.join('\n');

    assertEqual(canonical, expected, 'canonical output should match golden fixture exactly');
});

test('test_canonical_utf16_divergence', () => {
    /**
     * UTF-16 divergence test: critical for cross-language byte-identity.
     *
     * JavaScript strings are UTF-16 internally. Native string comparison (<)
     * uses UTF-16 code unit order, which diverges from UTF-8 byte order above U+FFFF.
     *
     * Test case:
     *   - Ａfield (U+FF21 fullwidth A): 0xEF 0xBF 0xA1 in UTF-8
     *   - 😀field (U+1F600 emoji): 0xF0 0x9F 0x98 0x80 in UTF-8
     *
     * UTF-8 byte comparison (correct): Ａfield < 😀field (0xEF < 0xF0)
     * UTF-16 code unit comparison (wrong): 😀field < Ａfield (surrogate 0xD8 < 0xFF)
     *
     * This test verifies TextEncoder is used (not native string <).
     */
    const doc = new Document();
    const block = new Block('table', 'utf16_divergence', ['id', 'Ａfield', '😀field'], [
        { id: '101', 'Ａfield': 'fullwidth A (U+FF21)', '😀field': 'emoji (U+1F600)' },
    ]);
    doc.blocks.push(block);

    const canonical = ISON.dumpsCanonical(doc);

    // Fields should be sorted: id, Ａfield (0xEF), 😀field (0xF0) - UTF-8 order
    // If using native string <, would get: id, 😀field, Ａfield (wrong)
    assertIncludes(canonical, 'id Ａfield 😀field', 'fields must be in UTF-8 byte order (not UTF-16)');

    const lines = canonical.split('\n');
    const headerLine = lines[1];
    const idIndex = headerLine.indexOf('id');
    const afieldIndex = headerLine.indexOf('Ａfield');
    const emojiIndex = headerLine.indexOf('😀field');

    assert(idIndex < afieldIndex, 'id should come before Ａfield');
    assert(afieldIndex < emojiIndex, 'Ａfield should come before 😀field (UTF-8 byte order)');
});

// =============================================================================
// Summary
// =============================================================================

console.log('\n' + '='.repeat(50));
console.log(`Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
console.log('='.repeat(50));

if (failed > 0) {
    process.exit(1);
}
