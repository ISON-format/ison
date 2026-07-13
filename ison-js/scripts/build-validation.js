#!/usr/bin/env node
/**
 * Build script to create CJS and ESM versions of ISON validation
 */

const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '..', 'src', 'validation.js');
const distCjsPath = path.join(__dirname, '..', 'dist', 'validation.js');
const distEsmPath = path.join(__dirname, '..', 'dist', 'validation.esm.js');

// Copy CJS version
fs.copyFileSync(srcPath, distCjsPath);
console.log('CJS build complete: dist/validation.js');

// Create ESM version
let content = fs.readFileSync(srcPath, 'utf8');

// Replace the export section with ESM exports
const exportSection = `
// =============================================================================
// Export (ESM)
// =============================================================================

export {
    ISONanticError,
    ValidationError,
    Schema,
    StringSchema,
    NumberSchema,
    BooleanSchema,
    NullSchema,
    ReferenceSchema,
    ObjectSchema,
    ArraySchema,
    TableSchema,
    DocumentSchema,
    i,
    document,
    generatePrompt,
};

export const version = '1.0.0';

export default {
    version: '1.0.0',
    ISONanticError,
    ValidationError,
    Schema,
    StringSchema,
    NumberSchema,
    BooleanSchema,
    NullSchema,
    ReferenceSchema,
    ObjectSchema,
    ArraySchema,
    TableSchema,
    DocumentSchema,
    i,
    document,
    generatePrompt,
};
`;

// Remove the IIFE wrapper and existing exports
content = content.replace(/\(function\s*\(global\)\s*\{\s*'use strict';/m, '');
content = content.replace(/\}\)\(typeof window !== 'undefined' \? window : global\);\s*$/m, '');

// Remove the existing export section
content = content.replace(/\/\/ =============================================================================\n\s*\/\/ Export\n[\s\S]*$/, '');

// Add ESM exports
content = content.trim() + '\n' + exportSection;

fs.writeFileSync(distEsmPath, content, 'utf8');
console.log('ESM build complete: dist/validation.esm.js');
