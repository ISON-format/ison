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

// Replace the export section with ESM exports
const exportSection = `
// =============================================================================
// Export (ESM)
// =============================================================================

export {
    Reference,
    FieldInfo,
    Block,
    Document,
    ISONError,
    ISONSyntaxError,
    ISONNameError,
    ISONLRecord,
    ISONLParser,
    ISONLSerializer,
    loads,
    dumps,
    fromDict,
    jsonToISON,
    isonToJSON,
    loadsISONL,
    dumpsISONL,
    isonToISONL,
    isonlToISON,
    isonlStream,
};

export const version = '${version}';

export default {
    Reference,
    FieldInfo,
    Block,
    Document,
    ISONError,
    ISONSyntaxError,
    ISONNameError,
    ISONLRecord,
    ISONLParser,
    ISONLSerializer,
    loads,
    dumps,
    fromDict,
    jsonToISON,
    isonToJSON,
    loadsISONL,
    dumpsISONL,
    isonToISONL,
    isonlToISON,
    isonlStream,
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
