#!/usr/bin/env node
/**
 * Build script to create ESM version of ISON parser
 */

const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'src', 'ison-parser.js');
const distPath = path.join(__dirname, '..', 'dist', 'ison-parser.esm.js');

// Read from package.json rather than hardcoding: this was pinned at 1.0.2
// while the package shipped 1.0.3, so the ESM bundle reported a version that
// had never been released.
const { version } = require('../package.json');

let content = fs.readFileSync(srcPath, 'utf8');

// The export list is derived from the CJS `const ISON = { ... }` object
// rather than repeated here. Hand-maintaining it drifted once already:
// dumpsCanonical and dumpsCanonicalISONL were added to CJS and never
// reached ESM, so `import { dumpsCanonical }` failed for every ESM
// consumer while `require` worked.
const objectMatch = content.match(/const ISON = \{([\s\S]*?)\n    \};/);
if (!objectMatch) {
    throw new Error('build-esm: could not find the `const ISON = { ... }` export object');
}
const names = objectMatch[1]
    .split('\n')
    .map(line => line.replace(/\/\/.*$/, '').trim())
    .filter(line => /^[A-Za-z_$][\w$]*,?$/.test(line))
    .map(line => line.replace(/,$/, ''))
    .filter(name => name !== 'version');

if (names.length < 15) {
    throw new Error(`build-esm: only found ${names.length} exports, expected the full set`);
}

const exportSection = `
// =============================================================================
// Export (ESM)
// =============================================================================

export {
${names.map(n => `    ${n},`).join('\n')}
};

export const version = '${version}';

export default {
${names.map(n => `    ${n},`).join('\n')}
    version: '${version}'
};
`;

// Remove the IIFE wrapper and existing exports
content = content.replace(/\(function\s*\(global\)\s*\{\s*'use strict';/m, '');
content = content.replace(/\}\)\(typeof window !== 'undefined' \? window : global\);\s*$/m, '');

// Remove the existing export section
content = content.replace(/\/\/ =============================================================================\n\s*\/\/ Export\n[\s\S]*$/, '');

// Add ESM exports
content = content.trim() + '\n' + exportSection;

fs.writeFileSync(distPath, content, 'utf8');
console.log('ESM build complete: dist/ison-parser.esm.js');
