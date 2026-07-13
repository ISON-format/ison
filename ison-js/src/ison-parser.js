/**
 * ISON v1.0 Reference Parser (JavaScript)
 * Interchange Simple Object Notation
 *
 * A minimal, LLM-friendly data serialization format optimized for
 * graph databases, multi-agent systems, and RAG pipelines.
 *
 * Usage:
 *   // Parse from string
 *   const doc = ISON.loads(isonString);
 *
 *   // Serialize to ISON
 *   const isonString = ISON.dumps(doc);
 *
 *   // Convert to JSON
 *   const jsonObj = doc.toDict();
 *
 * Author: Mahesh Vaikri
 * Version: 1.0.1
 */

(function(global) {
    'use strict';

    // =============================================================================
    // Data Structures
    // =============================================================================

    /**
     * Represents a reference to another record.
     * Syntax variants:
     *   :10              - Simple reference (id only)
     *   :user:101        - Namespaced reference (type:id)
     *   :MEMBER_OF:10    - Relationship-typed reference (relationship:target)
     */
    class Reference {
        constructor(id, type = null) {
            this.id = id;
            this.type = type;
        }

        toString() {
            if (this.type) {
                return `Reference(${this.type}:${this.id})`;
            }
            return `Reference(${this.id})`;
        }

        toISON() {
            if (this.type) {
                return `:${this.type}:${this.id}`;
            }
            return `:${this.id}`;
        }

        isRelationship() {
            return this.type !== null && this.type === this.type.toUpperCase();
        }

        get relationshipType() {
            if (this.isRelationship()) {
                return this.type;
            }
            return null;
        }

        get namespace() {
            if (this.type && !this.isRelationship()) {
                return this.type;
            }
            return null;
        }

        toJSON() {
            return this.toISON();
        }
    }

    /**
     * Represents field metadata including optional type annotation.
     * Syntax: field_name:type or field_name (untyped)
     */
    class FieldInfo {
        constructor(name, type = null, isComputed = false) {
            this.name = name;
            this.type = type;
            this.isComputed = isComputed;
        }

        static parse(fieldStr) {
            if (fieldStr.includes(':')) {
                const parts = fieldStr.split(':');
                const name = parts[0];
                const typeHint = parts.slice(1).join(':').toLowerCase();
                const isComputed = typeHint === 'computed';
                return new FieldInfo(name, typeHint, isComputed);
            }
            return new FieldInfo(fieldStr);
        }

        toString() {
            if (this.type) {
                return `FieldInfo(${this.name}:${this.type})`;
            }
            return `FieldInfo(${this.name})`;
        }
    }

    /**
     * Represents an ISON block (object, table, meta, etc.)
     */
    class Block {
        constructor(kind, name, fields, rows, fieldInfo = [], summary = null) {
            this.kind = kind;
            this.name = name;
            this.fields = fields;
            this.rows = rows;
            this.fieldInfo = fieldInfo;
            this.summary = summary;
        }

        toString() {
            return `Block(${this.kind}.${this.name}, ${this.rows.length} rows)`;
        }

        /**
         * Try to parse a string as JSON (for arrays/objects encoded as strings)
         */
        static _tryParseJSON(value) {
            if (typeof value !== 'string') return value;
            const trimmed = value.trim();
            // Only try to parse if it looks like JSON array or object
            if ((trimmed.startsWith('[') && trimmed.endsWith(']')) ||
                (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
                try {
                    return JSON.parse(trimmed);
                } catch (e) {
                    return value; // Return original if parse fails
                }
            }
            return value;
        }

        /**
         * Recursively process row values to restore JSON-encoded arrays/objects
         */
        static _processRowValues(row) {
            const result = {};
            for (const [key, value] of Object.entries(row)) {
                result[key] = Block._tryParseJSON(value);
            }
            return result;
        }

        toDict() {
            // Process rows to restore JSON-encoded values
            const processedRows = this.rows.map(row => Block._processRowValues(row));

            if (this.kind === 'object' && processedRows.length === 1) {
                return { [this.name]: processedRows[0] };
            }
            return { [this.name]: processedRows };
        }

        getFieldType(fieldName) {
            for (const fi of this.fieldInfo) {
                if (fi.name === fieldName) {
                    return fi.type;
                }
            }
            return null;
        }

        getComputedFields() {
            return this.fieldInfo
                .filter(fi => fi.isComputed)
                .map(fi => fi.name);
        }
    }

    /**
     * Represents a complete ISON document
     */
    class Document {
        constructor(blocks = []) {
            this.blocks = blocks;
        }

        getBlock(name) {
            for (const block of this.blocks) {
                if (block.name === name) {
                    return block;
                }
            }
            return null;
        }

        toDict() {
            const result = {};
            for (const block of this.blocks) {
                const blockDict = block.toDict();
                Object.assign(result, blockDict);
            }
            return result;
        }

        toJSON(indent = 2) {
            return JSON.stringify(this.toDict(), null, indent);
        }
    }

    // =============================================================================
    // Parser Errors
    // =============================================================================

    class ISONError extends Error {
        constructor(message) {
            super(message);
            this.name = 'ISONError';
        }
    }

    class ISONSyntaxError extends ISONError {
        constructor(message, line = 0, col = 0) {
            super(`Line ${line}, Col ${col}: ${message}`);
            this.name = 'ISONSyntaxError';
            this.line = line;
            this.col = col;
        }
    }

    // =============================================================================
    // Tokenizer
    // =============================================================================

    class Tokenizer {
        static ESCAPE_MAP = {
            '"': '"',
            '\\': '\\',
            'n': '\n',
            't': '\t',
            'r': '\r',
            '|': '|',
        };

        constructor(line, lineNum = 0) {
            this.line = line;
            this.lineNum = lineNum;
            this.pos = 0;
            this.tokens = [];
            this.tokenInfo = []; // Track if each token was quoted
        }

        tokenize() {
            this.tokens = [];
            this.tokenInfo = [];
            this.pos = 0;

            while (this.pos < this.line.length) {
                this._skipWhitespace();
                if (this.pos >= this.line.length) {
                    break;
                }

                const char = this.line[this.pos];

                if (char === '"') {
                    this.tokens.push(this._readQuotedString());
                    this.tokenInfo.push(true);
                } else {
                    this.tokens.push(this._readUnquotedToken());
                    this.tokenInfo.push(false);
                }
            }

            return this.tokens;
        }

        getTokenInfo() {
            return this.tokenInfo;
        }

        _skipWhitespace() {
            while (this.pos < this.line.length && (this.line[this.pos] === ' ' || this.line[this.pos] === '\t')) {
                this.pos++;
            }
        }

        _readQuotedString() {
            const startPos = this.pos;
            this.pos++; // Skip opening quote
            const result = [];

            while (this.pos < this.line.length) {
                const char = this.line[this.pos];

                if (char === '"') {
                    this.pos++; // Skip closing quote
                    return result.join('');
                }

                if (char === '\\') {
                    this.pos++;
                    if (this.pos >= this.line.length) {
                        throw new ISONSyntaxError(
                            'Unexpected end of line after backslash',
                            this.lineNum,
                            this.pos
                        );
                    }
                    const escapeChar = this.line[this.pos];
                    if (Tokenizer.ESCAPE_MAP[escapeChar] !== undefined) {
                        result.push(Tokenizer.ESCAPE_MAP[escapeChar]);
                    } else {
                        result.push(escapeChar);
                    }
                } else {
                    result.push(char);
                }

                this.pos++;
            }

            throw new ISONSyntaxError(
                'Unterminated quoted string',
                this.lineNum,
                startPos
            );
        }

        _readUnquotedToken() {
            const start = this.pos;
            while (this.pos < this.line.length && this.line[this.pos] !== ' ' && this.line[this.pos] !== '\t') {
                this.pos++;
            }
            return this.line.slice(start, this.pos);
        }
    }

    // =============================================================================
    // Type Inference
    // =============================================================================

    class TypeInferrer {
        static INTEGER_PATTERN = /^-?[0-9]+$/;
        static FLOAT_PATTERN = /^-?[0-9]+\.[0-9]+$/;
        static REFERENCE_PATTERN = /^:(.+)$/;

        static infer(token, wasQuoted = false) {
            // Quoted strings are always strings
            if (wasQuoted) {
                return token;
            }

            // Boolean
            if (token === 'true') {
                return true;
            }
            if (token === 'false') {
                return false;
            }

            // Null
            if (token === 'null') {
                return null;
            }

            // Integer
            if (TypeInferrer.INTEGER_PATTERN.test(token)) {
                return parseInt(token, 10);
            }

            // Float
            if (TypeInferrer.FLOAT_PATTERN.test(token)) {
                return parseFloat(token);
            }

            // Reference
            const refMatch = token.match(TypeInferrer.REFERENCE_PATTERN);
            if (refMatch) {
                const refValue = refMatch[1];
                if (refValue.includes(':')) {
                    const parts = refValue.split(':');
                    return new Reference(parts.slice(1).join(':'), parts[0]);
                }
                return new Reference(refValue);
            }

            // Default: string
            return token;
        }
    }

    // =============================================================================
    // Parser
    // =============================================================================

    class Parser {
        constructor(text) {
            this.text = text;
            this.lines = text.split('\n');
            this.lineNum = 0;
            this.document = new Document();
        }

        parse() {
            while (this.lineNum < this.lines.length) {
                this._skipEmptyAndComments();
                if (this.lineNum >= this.lines.length) {
                    break;
                }

                const block = this._parseBlock();
                if (block) {
                    this.document.blocks.push(block);
                }
            }

            return this.document;
        }

        _currentLine() {
            if (this.lineNum < this.lines.length) {
                return this.lines[this.lineNum];
            }
            return '';
        }

        _skipEmptyAndComments() {
            while (this.lineNum < this.lines.length) {
                const line = this._currentLine().trim();
                if (line === '' || line.startsWith('#')) {
                    this.lineNum++;
                } else {
                    break;
                }
            }
        }

        _parseBlock() {
            // Parse header
            const headerLine = this._currentLine().trim();
            if (!headerLine.includes('.')) {
                throw new ISONSyntaxError(
                    `Invalid block header: '${headerLine}' (expected 'kind.name')`,
                    this.lineNum + 1,
                    0
                );
            }

            const [kind, ...nameParts] = headerLine.split('.');
            const name = nameParts.join('.');
            this.lineNum++;

            // Parse fields
            this._skipEmptyAndComments();
            if (this.lineNum >= this.lines.length) {
                throw new ISONSyntaxError(
                    `Block '${kind}.${name}' missing field definitions`,
                    this.lineNum + 1,
                    0
                );
            }

            const fieldsLine = this._currentLine();
            const tokenizer = new Tokenizer(fieldsLine, this.lineNum + 1);
            const rawFields = tokenizer.tokenize();
            this.lineNum++;

            // Parse field info
            const fieldInfoList = [];
            const fields = [];
            for (const rawField of rawFields) {
                const fi = FieldInfo.parse(rawField);
                fieldInfoList.push(fi);
                fields.push(fi.name);
            }

            // Parse data rows
            const rows = [];
            let summary = null;

            while (this.lineNum < this.lines.length) {
                const line = this._currentLine();
                const stripped = line.trim();

                // Stop at blank line
                if (stripped === '') {
                    break;
                }

                // Skip comments
                if (stripped.startsWith('#')) {
                    this.lineNum++;
                    continue;
                }

                // Check for summary separator
                if (stripped.startsWith('---')) {
                    this.lineNum++;
                    while (this.lineNum < this.lines.length) {
                        const summaryLine = this._currentLine().trim();
                        if (summaryLine && !summaryLine.startsWith('#')) {
                            summary = summaryLine;
                            this.lineNum++;
                            break;
                        } else if (summaryLine === '') {
                            break;
                        }
                        this.lineNum++;
                    }
                    continue;
                }

                // Check for new block header
                if (stripped.includes('.') && stripped.split(/\s+/).length === 1) {
                    if (this._looksLikeHeader(stripped)) {
                        break;
                    }
                }

                const row = this._parseDataRow(fields, line);
                rows.push(row);
                this.lineNum++;
            }

            return new Block(kind, name, fields, rows, fieldInfoList, summary);
        }

        _looksLikeHeader(line) {
            if (!line.includes('.')) {
                return false;
            }
            const parts = line.split('.');
            if (parts.length !== 2) {
                return false;
            }
            const [kind, name] = parts;
            const idPattern = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;
            return idPattern.test(kind) && idPattern.test(name);
        }

        _parseDataRow(fields, line) {
            const tokenizer = new Tokenizer(line, this.lineNum + 1);
            const rawTokens = tokenizer.tokenize();
            const tokenInfo = tokenizer.getTokenInfo();

            const values = [];
            for (let i = 0; i < rawTokens.length; i++) {
                const typedValue = TypeInferrer.infer(rawTokens[i], tokenInfo[i]);
                values.push(typedValue);
            }

            // Build row dictionary
            const row = {};
            for (let i = 0; i < fields.length; i++) {
                const fieldName = fields[i];
                const value = i < values.length ? values[i] : null;

                // Handle dot-path fields
                if (fieldName.includes('.')) {
                    this._setNestedValue(row, fieldName, value);
                } else {
                    row[fieldName] = value;
                }
            }

            return row;
        }

        _setNestedValue(obj, path, value) {
            const parts = path.split('.');
            let current = obj;

            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (!(part in current)) {
                    current[part] = {};
                }
                current = current[part];
            }

            current[parts[parts.length - 1]] = value;
        }
    }

    // =============================================================================
    // Serializer
    // =============================================================================

    class Serializer {
        static dumps(doc, alignColumns = true) {
            const blocksOutput = [];

            for (const block of doc.blocks) {
                const blockStr = Serializer._serializeBlock(block, alignColumns);
                blocksOutput.push(blockStr);
            }

            return blocksOutput.join('\n\n');
        }

        static _serializeBlock(block, alignColumns) {
            const lines = [];

            // Header
            lines.push(`${block.kind}.${block.name}`);

            // Fields (with type annotations if present)
            if (block.fieldInfo && block.fieldInfo.length > 0) {
                const fieldStrs = block.fieldInfo.map(fi => {
                    if (fi.type) {
                        return `${fi.name}:${fi.type}`;
                    }
                    return fi.name;
                });
                lines.push(fieldStrs.join(' '));
            } else {
                lines.push(block.fields.join(' '));
            }

            // Calculate column widths
            let colWidths = null;
            if (alignColumns && block.rows.length > 0) {
                colWidths = Serializer._calculateColumnWidths(block);
            }

            // Data rows
            for (const row of block.rows) {
                const values = [];
                for (let i = 0; i < block.fields.length; i++) {
                    const field = block.fields[i];
                    const value = Serializer._getNestedValue(row, field);
                    let strValue = Serializer._valueToISON(value);

                    if (colWidths) {
                        strValue = strValue.padEnd(colWidths[i]);
                    }

                    values.push(strValue);
                }
                lines.push(values.join(' ').trimEnd());
            }

            // Summary row
            if (block.summary) {
                lines.push('---');
                lines.push(block.summary);
            }

            return lines.join('\n');
        }

        static _calculateColumnWidths(block) {
            const widths = block.fields.map(f => f.length);

            for (const row of block.rows) {
                for (let i = 0; i < block.fields.length; i++) {
                    const field = block.fields[i];
                    const value = Serializer._getNestedValue(row, field);
                    const strValue = Serializer._valueToISON(value);
                    widths[i] = Math.max(widths[i], strValue.length);
                }
            }

            return widths;
        }

        static _getNestedValue(obj, path) {
            const parts = path.split('.');
            let current = obj;

            for (const part of parts) {
                if (current && typeof current === 'object' && part in current) {
                    current = current[part];
                } else {
                    return null;
                }
            }

            return current;
        }

        static _valueToISON(value) {
            if (value === null || value === undefined) {
                return 'null';
            }

            if (typeof value === 'boolean') {
                return value ? 'true' : 'false';
            }

            if (value instanceof Reference) {
                return value.toISON();
            }

            if (typeof value === 'number') {
                return String(value);
            }

            if (typeof value === 'string') {
                return Serializer._quoteIfNeeded(value);
            }

            // Handle arrays - JSON encode them as a string
            if (Array.isArray(value)) {
                const jsonStr = JSON.stringify(value);
                return Serializer._quoteIfNeeded(jsonStr);
            }

            // Handle nested objects - JSON encode them as a string
            if (typeof value === 'object') {
                const jsonStr = JSON.stringify(value);
                return Serializer._quoteIfNeeded(jsonStr);
            }

            // Fallback
            return Serializer._quoteIfNeeded(String(value));
        }

        static _quoteIfNeeded(s) {
            if (!s) {
                return '""';
            }

            const needsQuote = (
                s.includes(' ') ||
                s.includes('\t') ||
                s.includes('"') ||
                s.includes('\n') ||
                s === 'true' ||
                s === 'false' ||
                s === 'null' ||
                s.startsWith(':') ||
                Serializer._looksLikeNumber(s)
            );

            if (needsQuote) {
                let escaped = s.replace(/\\/g, '\\\\');
                escaped = escaped.replace(/"/g, '\\"');
                escaped = escaped.replace(/\n/g, '\\n');
                escaped = escaped.replace(/\t/g, '\\t');
                escaped = escaped.replace(/\r/g, '\\r');
                return `"${escaped}"`;
            }

            return s;
        }

        static _looksLikeNumber(s) {
            return !isNaN(parseFloat(s)) && isFinite(s);
        }
    }

    // =============================================================================
    // Public API
    // =============================================================================

    /**
     * Parse an ISON string into a Document.
     * @param {string} text - ISON formatted string
     * @returns {Document} Document object containing parsed blocks
     * @throws {ISONSyntaxError} If parsing fails
     */
    function loads(text) {
        const parser = new Parser(text);
        return parser.parse();
    }

    /**
     * Serialize a Document to ISON string.
     * @param {Document} doc - Document to serialize
     * @param {boolean} alignColumns - Whether to align columns for readability
     * @returns {string} ISON formatted string
     */
    function dumps(doc, alignColumns = true) {
        return Serializer.dumps(doc, alignColumns);
    }

    /**
     * Create an ISON Document from a plain JavaScript object.
     * @param {Object} data - Object with block names as keys
     * @param {Object} options - Conversion options
     * @param {boolean} options.flatten - Flatten nested objects into separate tables (default: true)
     * @param {boolean} options.autoRefs - Auto-generate references for relationships (default: true)
     * @returns {Document} Document object
     */
    function fromDict(data, options = {}) {
        const opts = {
            flatten: options.flatten !== false,
            autoRefs: options.autoRefs !== false
        };

        const doc = new Document();
        const extraBlocks = []; // For flattened nested structures
        let refCounter = 1;

        // Helper: Check if value is a nested object (not array, not null)
        const isNestedObject = (val) => {
            return val !== null && typeof val === 'object' && !Array.isArray(val);
        };

        // Helper: Check if value is an array of objects
        const isArrayOfObjects = (val) => {
            return Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null;
        };

        // Helper: Check if value is an array of primitives
        const isArrayOfPrimitives = (val) => {
            return Array.isArray(val) && (val.length === 0 || typeof val[0] !== 'object');
        };

        // Helper: Add or update an extra block
        const addToExtraBlock = (blockName, blockKind, fields, row) => {
            let existingBlock = extraBlocks.find(b => b.name === blockName);
            if (existingBlock) {
                // Add new fields if they don't exist
                for (const k of fields) {
                    if (!existingBlock.fields.includes(k)) {
                        existingBlock.fields.push(k);
                    }
                }
                existingBlock.rows.push(row);
            } else {
                extraBlocks.push(new Block(blockKind, blockName, [...fields], [row]));
            }
        };

        // Helper: Recursively flatten nested structures
        const flattenValue = (key, value, parentName, rowId, parentRef) => {
            const nestedName = `${parentName}_${key}`;

            if (isNestedObject(value)) {
                // Nested object - create separate block and recurse
                const nestedRow = {};
                nestedRow[`${parentName}_id`] = parentRef;

                const nestedFields = [`${parentName}_id`];

                for (const [nk, nv] of Object.entries(value)) {
                    if (isNestedObject(nv) || isArrayOfObjects(nv) || isArrayOfPrimitives(nv)) {
                        // Recurse for deeper nesting
                        flattenValue(nk, nv, nestedName, rowId, parentRef);
                    } else {
                        nestedRow[nk] = nv;
                        nestedFields.push(nk);
                    }
                }

                // Only add if there are fields beyond the reference
                if (Object.keys(nestedRow).length > 1) {
                    addToExtraBlock(nestedName, 'table', nestedFields, nestedRow);
                }

                return { skip: true };

            } else if (isArrayOfObjects(value)) {
                // Array of objects - create separate table
                for (const item of value) {
                    const nestedRow = {};
                    nestedRow[`${parentName}_id`] = parentRef;
                    const nestedFields = [`${parentName}_id`];

                    for (const [nk, nv] of Object.entries(item)) {
                        if (isNestedObject(nv) || isArrayOfObjects(nv) || isArrayOfPrimitives(nv)) {
                            // Recurse for deeper nesting
                            flattenValue(nk, nv, nestedName, rowId, parentRef);
                        } else {
                            nestedRow[nk] = nv;
                            if (!nestedFields.includes(nk)) nestedFields.push(nk);
                        }
                    }

                    if (Object.keys(nestedRow).length > 1) {
                        addToExtraBlock(nestedName, 'table', nestedFields, nestedRow);
                    }
                }

                return { skip: true };

            } else if (isArrayOfPrimitives(value) && value.length > 0) {
                // Array of primitives - create separate table with value column
                for (const item of value) {
                    const nestedRow = {};
                    nestedRow[`${parentName}_id`] = parentRef;
                    nestedRow['value'] = item;
                    addToExtraBlock(nestedName, 'table', [`${parentName}_id`, 'value'], nestedRow);
                }

                return { skip: true };
            }

            // Not a nested structure - keep the value
            return { skip: false, value: value };
        };

        // Helper: Flatten a row, extracting nested structures
        const flattenRow = (row, parentName, rowId) => {
            const flatRow = {};
            const parentRef = new Reference(rowId);

            for (const [key, value] of Object.entries(row)) {
                if (opts.flatten && (isNestedObject(value) || isArrayOfObjects(value) || isArrayOfPrimitives(value))) {
                    const result = flattenValue(key, value, parentName, rowId, parentRef);
                    if (!result.skip) {
                        flatRow[key] = result.value;
                    }
                    // Skip - field is flattened to separate table
                } else if (value === null || value === undefined) {
                    flatRow[key] = null;
                } else {
                    flatRow[key] = value;
                }
            }

            return flatRow;
        };

        // Process main data
        for (const [name, content] of Object.entries(data)) {
            let blockKind, fields, rows;

            if (Array.isArray(content)) {
                if (content.length > 0 && Array.isArray(content[0])) {
                    // Array of arrays - create table with generated column names
                    const maxCols = Math.max(...content.map(row => row.length));

                    // Generate column names: col1, col2, col3...
                    fields = Array.from({ length: maxCols }, (_, i) => `col${i + 1}`);
                    rows = content.map(row => {
                        const obj = {};
                        fields.forEach((f, i) => obj[f] = row[i] !== undefined ? row[i] : null);
                        return obj;
                    });
                    blockKind = 'table';

                } else if (content.length > 0 && typeof content[0] === 'object' && content[0] !== null) {
                    // Table: array of objects
                    const fieldSet = new Set();
                    const processedRows = [];

                    for (let i = 0; i < content.length; i++) {
                        const item = content[i];
                        if (typeof item === 'object' && item !== null) {
                            // Determine row ID
                            const rowId = item.id !== undefined ? item.id : refCounter++;

                            // Flatten the row
                            const flatRow = flattenRow(item, name, rowId);

                            for (const key of Object.keys(flatRow)) {
                                fieldSet.add(key);
                            }
                            processedRows.push(flatRow);
                        }
                    }

                    fields = Array.from(fieldSet);
                    rows = processedRows;
                    blockKind = 'table';

                } else if (content.length > 0) {
                    // Array of primitives - create a simple table
                    fields = ['value'];
                    rows = content.map(v => ({ value: v }));
                    blockKind = 'table';
                } else {
                    continue;
                }
            } else if (typeof content === 'object' && content !== null) {
                // Object: key-value pairs
                const rowId = content.id !== undefined ? content.id : name;
                const flatRow = flattenRow(content, name, rowId);
                fields = Object.keys(flatRow);
                rows = [flatRow];
                blockKind = 'object';
            } else {
                // Skip primitives at top level
                continue;
            }

            if (fields.length > 0 && rows.length > 0) {
                const block = new Block(blockKind, name, fields, rows);
                doc.blocks.push(block);
            }
        }

        // Add extra blocks from flattened nested structures
        for (const block of extraBlocks) {
            doc.blocks.push(block);
        }

        return doc;
    }

    /**
     * Convert JSON to ISON string.
     * @param {string|Object} json - JSON string or object
     * @param {Object} options - Conversion options
     * @param {boolean} options.flatten - Flatten nested objects (default: true)
     * @param {boolean} options.autoRefs - Auto-generate references (default: true)
     * @param {boolean} options.alignColumns - Align columns in output (default: true)
     * @returns {string} ISON formatted string
     */
    function jsonToISON(json, options = {}) {
        const data = typeof json === 'string' ? JSON.parse(json) : json;
        const doc = fromDict(data, options);
        const alignColumns = options.alignColumns !== false;
        return dumps(doc, alignColumns);
    }

    /**
     * Convert ISON string to JSON object.
     * @param {string} isonText - ISON formatted string
     * @returns {Object} JavaScript object
     */
    function isonToJSON(isonText) {
        const doc = loads(isonText);
        return doc.toDict();
    }

    // =============================================================================
    // ISONL (ISON Lines) Support
    // =============================================================================

    /**
     * Represents a single ISONL record (one line)
     */
    class ISONLRecord {
        constructor(kind, name, fields, values) {
            this.kind = kind;
            this.name = name;
            this.fields = fields;
            this.values = values;
        }

        toString() {
            return `ISONLRecord(${this.kind}.${this.name}, ${JSON.stringify(this.values)})`;
        }

        toBlockKey() {
            return `${this.kind}.${this.name}`;
        }
    }

    /**
     * Parser for ISONL (ISON Lines) format
     */
    class ISONLParser {
        static ESCAPE_MAP = {
            '"': '"',
            '\\': '\\',
            'n': '\n',
            't': '\t',
            'r': '\r',
            '|': '|',
        };

        constructor() {
            this.lineNum = 0;
        }

        /**
         * Parse a single ISONL line.
         * Format: kind.name|field1 field2 field3|value1 value2 value3
         * @param {string} line - The ISONL line to parse
         * @param {number} lineNum - Line number for error reporting
         * @returns {ISONLRecord|null} ISONLRecord or null if line is empty/comment
         */
        parseLine(line, lineNum = 0) {
            this.lineNum = lineNum;
            line = line.trim();

            // Skip empty lines and comments
            if (!line || line.startsWith('#')) {
                return null;
            }

            // Split by pipe - must have exactly 3 sections
            const sections = this._splitByPipe(line);

            if (sections.length !== 3) {
                throw new ISONSyntaxError(
                    `ISONL line must have exactly 3 pipe-separated sections, got ${sections.length}`,
                    lineNum,
                    0
                );
            }

            const [header, fieldsStr, valuesStr] = sections;

            // Parse header (kind.name)
            if (!header.includes('.')) {
                throw new ISONSyntaxError(
                    `Invalid ISONL header: '${header}' (expected 'kind.name')`,
                    lineNum,
                    0
                );
            }
            const [kind, ...nameParts] = header.split('.');
            const name = nameParts.join('.');

            // Parse fields
            const fieldsTokenizer = new Tokenizer(fieldsStr, lineNum);
            const fields = fieldsTokenizer.tokenize();

            // Parse values
            const valuesTokenizer = new Tokenizer(valuesStr, lineNum);
            const rawValues = valuesTokenizer.tokenize();
            const tokenInfo = valuesTokenizer.getTokenInfo();

            // Infer types for values
            const typedValues = [];
            for (let i = 0; i < rawValues.length; i++) {
                typedValues.push(TypeInferrer.infer(rawValues[i], tokenInfo[i]));
            }

            // Zip fields and values
            const valuesDict = {};
            for (let i = 0; i < fields.length; i++) {
                valuesDict[fields[i]] = i < typedValues.length ? typedValues[i] : null;
            }

            return new ISONLRecord(kind, name, fields, valuesDict);
        }

        /**
         * Split line by unquoted pipe characters
         */
        _splitByPipe(line) {
            const sections = [];
            let current = [];
            let inQuotes = false;
            let i = 0;

            while (i < line.length) {
                const char = line[i];

                if (inQuotes && char === '\\' && i + 1 < line.length) {
                    // Consume the escape pair so an escaped backslash before a
                    // closing quote ("foo\\") can't desync the quote tracking
                    current.push(char);
                    current.push(line[i + 1]);
                    i += 2;
                    continue;
                }

                if (char === '"') {
                    inQuotes = !inQuotes;
                    current.push(char);
                } else if (char === '|' && !inQuotes) {
                    sections.push(current.join('').trim());
                    current = [];
                } else {
                    current.push(char);
                }

                i++;
            }

            // Add the last section
            sections.push(current.join('').trim());

            return sections;
        }

        /**
         * Parse multiple ISONL lines from a string.
         * @param {string} text - Multi-line ISONL string
         * @returns {ISONLRecord[]} List of ISONLRecord objects
         */
        parseString(text) {
            const records = [];
            const lines = text.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const record = this.parseLine(lines[i], i + 1);
                if (record) {
                    records.push(record);
                }
            }

            return records;
        }

        /**
         * Parse ISONL string and convert to ISON Document.
         * Groups records by block header and creates ISON blocks.
         * @param {string} text - ISONL formatted string
         * @returns {Document} Document object
         */
        parseToDocument(text) {
            const records = this.parseString(text);
            return this._recordsToDocument(records);
        }

        _recordsToDocument(records) {
            const blocksMap = new Map();

            for (const record of records) {
                const key = record.toBlockKey();
                if (!blocksMap.has(key)) {
                    blocksMap.set(key, []);
                }
                blocksMap.get(key).push(record);
            }

            const doc = new Document();

            for (const [key, recs] of blocksMap) {
                const [kind, ...nameParts] = key.split('.');
                const name = nameParts.join('.');
                // Use fields from first record
                const fields = recs[0].fields;
                const rows = recs.map(r => r.values);

                const block = new Block(kind, name, fields, rows);
                doc.blocks.push(block);
            }

            return doc;
        }
    }

    /**
     * Serializer for ISONL format
     */
    class ISONLSerializer {
        // Characters that would corrupt the line structure if they appeared
        // raw in the envelope (kind, name, or field names)
        static ENVELOPE_FORBIDDEN = ['|', '"', '\\', ' ', '\t', '\n', '\r'];

        /**
         * Reject kind/name/fields that cannot survive an ISONL round-trip
         */
        static _validateEnvelope(block) {
            for (const [label, value] of [['kind', block.kind], ['name', block.name]]) {
                if (!value) {
                    throw new ISONError(`ISONL block ${label} must be non-empty`);
                }
                if (ISONLSerializer.ENVELOPE_FORBIDDEN.some(c => value.includes(c))) {
                    throw new ISONError(
                        `ISONL block ${label} ${JSON.stringify(value)} contains characters that ` +
                        `cannot be serialized (pipe, quote, backslash, or whitespace)`
                    );
                }
            }
            if (block.kind.includes('.')) {
                throw new ISONError(
                    `ISONL block kind ${JSON.stringify(block.kind)} must not contain '.'`
                );
            }
            if (block.kind.startsWith('#')) {
                throw new ISONError(
                    `ISONL block kind ${JSON.stringify(block.kind)} must not start with '#'`
                );
            }
            for (const field of block.fields) {
                if (!field) {
                    throw new ISONError('ISONL field names must be non-empty');
                }
                if (ISONLSerializer.ENVELOPE_FORBIDDEN.some(c => field.includes(c))) {
                    throw new ISONError(
                        `ISONL field name ${JSON.stringify(field)} contains characters that ` +
                        `cannot be serialized (pipe, quote, backslash, or whitespace)`
                    );
                }
            }
        }

        /**
         * Serialize a Document to ISONL string.
         * Each row becomes a separate line.
         * @param {Document} doc - Document to serialize
         * @returns {string} ISONL formatted string
         */
        static dumps(doc) {
            const lines = [];

            for (const block of doc.blocks) {
                ISONLSerializer._validateEnvelope(block);
                const header = `${block.kind}.${block.name}`;
                const fieldsStr = block.fields.join(' ');

                for (const row of block.rows) {
                    const values = [];
                    for (const field of block.fields) {
                        const value = row[field];
                        values.push(ISONLSerializer._valueToISONL(value));
                    }

                    const valuesStr = values.join(' ');
                    lines.push(`${header}|${fieldsStr}|${valuesStr}`);
                }
            }

            return lines.join('\n');
        }

        static _valueToISONL(value) {
            if (value === null || value === undefined) {
                return 'null';
            }

            if (typeof value === 'boolean') {
                return value ? 'true' : 'false';
            }

            if (value instanceof Reference) {
                return value.toISON();
            }

            if (typeof value === 'number') {
                return String(value);
            }

            if (typeof value === 'string') {
                return ISONLSerializer._quoteIfNeeded(value);
            }

            if (Array.isArray(value) || typeof value === 'object') {
                const jsonStr = JSON.stringify(value);
                return ISONLSerializer._quoteIfNeeded(jsonStr);
            }

            return ISONLSerializer._quoteIfNeeded(String(value));
        }

        static _quoteIfNeeded(s) {
            if (!s) {
                return '""';
            }

            const needsQuote = (
                s.includes(' ') ||
                s.includes('\t') ||
                s.includes('"') ||
                s.includes('\n') ||
                s.includes('\r') ||
                s.includes('\\') ||
                s.includes('|') ||
                s === 'true' ||
                s === 'false' ||
                s === 'null' ||
                s.startsWith(':') ||
                (!isNaN(parseFloat(s)) && isFinite(s))
            );

            if (needsQuote) {
                let escaped = s.replace(/\\/g, '\\\\');
                escaped = escaped.replace(/"/g, '\\"');
                escaped = escaped.replace(/\n/g, '\\n');
                escaped = escaped.replace(/\t/g, '\\t');
                escaped = escaped.replace(/\r/g, '\\r');
                escaped = escaped.replace(/\|/g, '\\|');
                return `"${escaped}"`;
            }

            return s;
        }
    }

    /**
     * Parse an ISONL string into a Document.
     * @param {string} text - ISONL formatted string
     * @returns {Document} Document object containing parsed blocks
     */
    function loadsISONL(text) {
        const parser = new ISONLParser();
        return parser.parseToDocument(text);
    }

    /**
     * Serialize a Document to ISONL string.
     * @param {Document} doc - Document to serialize
     * @returns {string} ISONL formatted string
     */
    function dumpsISONL(doc) {
        return ISONLSerializer.dumps(doc);
    }

    /**
     * Convert ISON format to ISONL format.
     * @param {string} isonText - ISON formatted string
     * @returns {string} ISONL formatted string
     */
    function isonToISONL(isonText) {
        const doc = loads(isonText);
        return dumpsISONL(doc);
    }

    /**
     * Convert ISONL format to ISON format.
     * @param {string} isonlText - ISONL formatted string
     * @returns {string} ISON formatted string
     */
    function isonlToISON(isonlText) {
        const doc = loadsISONL(isonlText);
        return dumps(doc);
    }

    /**
     * Stream parse ISONL from an array of lines.
     * Generator function that yields ISONLRecord objects one at a time.
     * @param {string[]} lines - Array of ISONL lines
     * @yields {ISONLRecord} ISONLRecord objects
     */
    function* isonlStream(lines) {
        const parser = new ISONLParser();
        for (let i = 0; i < lines.length; i++) {
            const record = parser.parseLine(lines[i], i + 1);
            if (record) {
                yield record;
            }
        }
    }

    // =============================================================================
    // Export
    // =============================================================================

    const ISON = {
        // Classes
        Reference,
        FieldInfo,
        Block,
        Document,
        ISONError,
        ISONSyntaxError,
        ISONLRecord,
        ISONLParser,
        ISONLSerializer,

        // ISON Functions
        loads,
        dumps,
        fromDict,
        jsonToISON,
        isonToJSON,

        // ISONL Functions
        loadsISONL,
        dumpsISONL,
        isonToISONL,
        isonlToISON,
        isonlStream,

        // Version
        version: '1.0.2'
    };

    // Export for different environments
    if (typeof module !== 'undefined' && module.exports) {
        // Node.js / CommonJS
        module.exports = ISON;
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define(function() { return ISON; });
    } else {
        // Browser global
        global.ISON = ISON;
    }

})(typeof window !== 'undefined' ? window : global);
