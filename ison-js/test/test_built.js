/**
 * The benchmark/parity/built corpus: Documents constructed, not parsed.
 *
 * Everything in the flat corpus arrives via loads(), so its names are safe by
 * construction -- the parser could not have produced an unwritable one. These
 * cases feed a plain data JSON through fromDict() instead, which is the only
 * path that can put a name like "first name" or "a:b" into a Document.
 *
 * A case declares either an output or a rejection, never both.
 */

const fs = require('fs');
const path = require('path');
const ISON = require('../src/ison-parser.js');

let passed = 0;
let failed = 0;

const BUILT = path.join(__dirname, '..', '..', 'benchmark', 'parity', 'built');

const MODES = {
    canonical: (doc) => ISON.dumpsCanonical(doc),
    canonical_isonl: (doc) => ISON.ISONLSerializer.dumpsCanonical(doc),
};

function read(file) {
    return fs.readFileSync(path.join(BUILT, file), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Map an exception onto the corpus's neutral token. Class names are not shared
 * across seven languages, so the corpus holds a token and each implementation
 * supplies this shim.
 */
function classify(err) {
    const text = String(err && err.message).toLowerCase();
    if (text.includes('field')) return 'INVALID_FIELD_NAME';
    if (text.includes('block')) return 'INVALID_BLOCK_NAME';
    return `UNCLASSIFIED(${err && err.name})`;
}

function fail(label, detail) {
    failed++;
    console.log(`[FAIL] ${label}`);
    console.log(`       ${detail}`);
}

console.log('built/ corpus - Documents constructed, not parsed\n');

if (!fs.existsSync(BUILT)) {
    console.log('built/ corpus not available - skipping');
    process.exit(0);
}

const names = read('cases.txt').split('\n').filter((s) => s.trim());

for (const name of names) {
    const data = JSON.parse(read(`${name}.build.json`));

    for (const [mode, dump] of Object.entries(MODES)) {
        const errFile = path.join(BUILT, `${name}.${mode}.expect-error`);
        const okFile = path.join(BUILT, `${name}.${mode}.expected`);
        const label = `built/${name}.${mode}`;

        if (fs.existsSync(errFile) && fs.existsSync(okFile)) {
            fail(label, 'declares both an output and a rejection');
            continue;
        }

        let got = null;
        let err = null;
        try {
            got = dump(ISON.fromDict(data));
        } catch (e) {
            err = e;
        }

        if (fs.existsSync(errFile)) {
            const want = read(`${name}.${mode}.expect-error`).trim();
            const token = err ? classify(err) : 'NO_ERROR';
            if (token === want) {
                passed++;
                console.log(`[PASS] ${label} rejected as ${want}`);
            } else {
                fail(label, `expected ${want}, got ${token}`);
            }
        } else if (fs.existsSync(okFile)) {
            const want = read(`${name}.${mode}.expected`);
            if (err) {
                fail(label, `unexpected error: ${err.message}`);
            } else if (got === want) {
                passed++;
                console.log(`[PASS] ${label}`);
            } else {
                fail(label, `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
            }
        }
    }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`built/: ${passed + failed} checks across ${names.length} cases | Passed: ${passed} | Failed: ${failed}`);
console.log('='.repeat(50));

if (failed > 0) {
    process.exit(1);
}
