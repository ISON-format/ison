/**
 * Byte-identity checks against the shared parity corpus in benchmark/parity.
 *
 * The .expected files are generated from the ison-py reference implementation,
 * so a diff here is a genuine cross-language incompatibility rather than a
 * JavaScript-only test failure.
 */

const fs = require('fs');
const path = require('path');
const ISON = require('../src/ison-parser.js');

let passed = 0;
let failed = 0;

const CORPUS = path.join(__dirname, '..', '..', 'benchmark', 'parity');

function read(caseName, suffix) {
    return fs
        .readFileSync(path.join(CORPUS, `${caseName}.${suffix}`), 'utf8')
        .replace(/\r\n/g, '\n');
}

function check(label, expected, actual) {
    if (expected === actual) {
        passed++;
        return;
    }
    failed++;
    console.log(`[FAIL] ${label}`);
    console.log(`  Expected: ${JSON.stringify(expected)}`);
    console.log(`  Got     : ${JSON.stringify(actual)}`);
}

console.log('Cross-language parity corpus\n');

if (!fs.existsSync(CORPUS)) {
    console.log('parity corpus not found; skipping');
    process.exit(0);
}

const cases = fs
    .readdirSync(CORPUS)
    .filter((f) => f.endsWith('.ison'))
    .map((f) => f.replace(/\.ison$/, ''))
    .sort();

if (cases.length === 0) {
    console.log('parity corpus is empty');
    process.exit(1);
}

for (const name of cases) {
    let doc;
    try {
        doc = ISON.loads(read(name, 'ison'));
    } catch (e) {
        failed++;
        console.log(`[FAIL] ${name}: parse threw ${e.message}`);
        continue;
    }

    check(`${name}.canonical`, read(name, 'canonical.expected'), ISON.dumpsCanonical(doc));
    check(`${name}.dumps`, read(name, 'dumps.expected'), ISON.dumps(doc));
    check(`${name}.isonl`, read(name, 'isonl.expected'), ISON.dumpsISONL(doc));
    check(
        `${name}.canonical_isonl`,
        read(name, 'canonical_isonl.expected'),
        ISON.dumpsCanonicalISONL(doc)
    );

    // Canonicalizing already-canonical output must be a no-op, which is what
    // makes canonical form usable for content addressing.
    const once = ISON.dumpsCanonical(doc);
    check(`${name}.canonical_idempotent`, once, ISON.dumpsCanonical(ISON.loads(once)));

    // Every corpus document survives an ISON -> parse -> ISON round trip.
    const dumped = ISON.dumps(doc);
    check(`${name}.dumps_roundtrip`, dumped, ISON.dumps(ISON.loads(dumped)));
}

console.log(`\n${'='.repeat(50)}`);
console.log(`Parity: ${passed + failed} checks across ${cases.length} cases | Passed: ${passed} | Failed: ${failed}`);
console.log('='.repeat(50));

if (failed > 0) {
    process.exit(1);
}
