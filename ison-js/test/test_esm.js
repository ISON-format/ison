/**
 * The published ESM bundle must export what CJS exports, and must be valid ESM.
 *
 * Both halves of this shipped broken and nothing caught it, because the bundle
 * is generated at publish time and no test ever looked at it:
 *
 *   - dumpsCanonical and dumpsCanonicalISONL were added to the CJS export
 *     object and never to the hand-maintained ESM list, so
 *     `import { dumpsCanonical }` threw for every ESM consumer from the moment
 *     canonical serialization shipped, while `require` worked fine.
 *
 *   - The strip regexes matched a bare \n. On a CRLF checkout they missed, so
 *     the CJS wrapper survived into the ES module and `module.exports = ISON`
 *     sat inside a file the runtime was parsing as ESM. Releases were correct
 *     only because CI happens to build on LF.
 *
 * Testing the built artifact rather than the source is the point: the source
 * was never wrong.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'ison-parser.esm.js');
const CJS = require('../src/ison-parser.js');

let passed = 0;
let failed = 0;

function check(label, ok, detail) {
    if (ok) {
        passed++;
        console.log(`[PASS] ${label}`);
    } else {
        failed++;
        console.log(`[FAIL] ${label}`);
        if (detail) console.log(`       ${detail}`);
    }
}

console.log('ESM bundle\n');

// Build fresh: testing a stale artifact proves nothing about what will ship.
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build-esm.js')], {
    cwd: ROOT,
    stdio: 'ignore',
});

const bundle = fs.readFileSync(DIST, 'utf8');

// --- no CJS remnants ------------------------------------------------------
check('no `module.exports` left in the ES module',
    !bundle.includes('module.exports'),
    'the CJS wrapper survived the strip - a CRLF checkout does this');
check('no IIFE wrapper left',
    !/\(function\s*\(global\)/.test(bundle),
    'the opening wrapper was not stripped');

// --- export parity with CJS ----------------------------------------------
const match = bundle.match(/export \{([^}]*)\}/);
check('bundle has a named export block', !!match);

if (match) {
    const esmNames = new Set(
        match[1].split(',').map(s => s.trim()).filter(Boolean)
    );
    // `version` is exported separately as `export const version`.
    const cjsNames = Object.keys(CJS).filter(n => n !== 'version');

    const missing = cjsNames.filter(n => !esmNames.has(n));
    check('every CJS export is exported from ESM',
        missing.length === 0,
        missing.length ? `missing from ESM: ${missing.join(', ')}` : '');

    const extra = [...esmNames].filter(n => !cjsNames.includes(n));
    check('ESM exports nothing CJS does not',
        extra.length === 0,
        extra.length ? `only in ESM: ${extra.join(', ')}` : '');

    check('version is exported', /export const version = '[^']+'/.test(bundle));
}

// --- it actually loads as ESM and works ----------------------------------
// Copied to .mjs so Node parses it as a module regardless of package type.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ison-esm-'));
const mjs = path.join(tmp, 'bundle.mjs');
fs.copyFileSync(DIST, mjs);

const probe = path.join(tmp, 'probe.mjs');
// pathToFileURL, not a bare path: on Windows an absolute path starts with a
// drive letter, which Node's ESM loader reads as an unsupported URL scheme.
const { pathToFileURL } = require('url');
fs.writeFileSync(probe, `
import { loads, dumpsCanonical, dumpsCanonicalISONL, version } from ${JSON.stringify(pathToFileURL(mjs).href)};
const doc = loads('table.t\\nid name\\n1 Alice');
const out = dumpsCanonical(doc);
if (out !== 'table.t\\nid name\\n1 Alice') throw new Error('canonical mismatch: ' + JSON.stringify(out));
if (typeof dumpsCanonicalISONL !== 'function') throw new Error('dumpsCanonicalISONL missing');
if (!version) throw new Error('version missing');
console.log('ok');
`);

try {
    const out = execFileSync(process.execPath, [probe], { encoding: 'utf8' }).trim();
    check('bundle imports as ESM and canonical round-trips', out === 'ok', out);
} catch (e) {
    check('bundle imports as ESM and canonical round-trips', false,
        (e.stderr || e.message || '').toString().split('\n').slice(0, 3).join(' | '));
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${'='.repeat(50)}`);
console.log(`ESM: ${passed + failed} checks | Passed: ${passed} | Failed: ${failed}`);
console.log('='.repeat(50));

if (failed > 0) process.exit(1);
