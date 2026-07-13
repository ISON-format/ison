/**
 * ISON Validation for JavaScript
 *
 * Zod-like validation and schema definitions for ISON format.
 * Provides type-safe validation with fluent API.
 *
 * Usage:
 *   const { i, document, ValidationError } = require('ison-parser/validation');
 *
 *   const UserSchema = i.table('users', {
 *     id: i.int(),
 *     name: i.string().min(1).max(100),
 *     email: i.string().email(),
 *     active: i.boolean().default(true),
 *   });
 *
 *   const users = UserSchema.parse(data);
 *
 * Author: Mahesh Vaikri
 * Version: 1.0.0
 */

(function(global) {
    'use strict';

    // =============================================================================
    // Constants
    // =============================================================================

    const VALIDATION_VERSION = '1.0.0';

    // =============================================================================
    // Validation Errors
    // =============================================================================

    /**
     * Base error for all validation errors
     */
    class ISONanticError extends Error {
        constructor(message) {
            super(message);
            this.name = 'ISONanticError';
        }
    }

    /**
     * Validation error with detailed field errors
     */
    class ValidationError extends ISONanticError {
        constructor(errors, message) {
            super(message || `Validation failed with ${errors.length} error(s)`);
            this.name = 'ValidationError';
            this.errors = errors;
        }

        /**
         * Format errors for display
         */
        format() {
            return this.errors.map(e => `${e.field}: ${e.message}`).join('\n');
        }
    }

    /**
     * Single field error
     * @typedef {Object} FieldError
     * @property {string} field - Field path
     * @property {string} message - Error message
     * @property {*} [value] - The invalid value
     */

    // =============================================================================
    // Base Schema
    // =============================================================================

    /**
     * Base class for all schema types
     */
    class Schema {
        constructor() {
            this._optional = false;
            this._default = undefined;
            this._hasDefault = false;
            this._validators = [];
            this._description = null;
        }

        /**
         * Mark field as optional
         */
        optional() {
            const schema = this._clone();
            schema._optional = true;
            return schema;
        }

        /**
         * Set default value
         */
        default(value) {
            const schema = this._clone();
            schema._default = value;
            schema._hasDefault = true;
            schema._optional = true;
            return schema;
        }

        /**
         * Add description
         */
        describe(desc) {
            this._description = desc;
            return this;
        }

        /**
         * Add custom validation
         */
        refine(validator, message) {
            this._validators.push({ fn: validator, message });
            return this;
        }

        /**
         * Parse and validate value
         */
        parse(value) {
            throw new Error('parse() must be implemented by subclass');
        }

        /**
         * Safe parse - returns result object instead of throwing
         */
        safeParse(value) {
            try {
                const data = this.parse(value);
                return { success: true, data };
            } catch (e) {
                if (e instanceof ValidationError) {
                    return { success: false, error: e };
                }
                throw e;
            }
        }

        /**
         * Clone the schema
         */
        _clone() {
            throw new Error('_clone() must be implemented by subclass');
        }

        /**
         * Run custom validators
         */
        _runValidators(value, field) {
            const errors = [];
            for (const v of this._validators) {
                if (!v.fn(value)) {
                    errors.push({ field, message: v.message, value });
                }
            }
            if (errors.length > 0) {
                throw new ValidationError(errors);
            }
        }
    }

    // =============================================================================
    // String Schema
    // =============================================================================

    class StringSchema extends Schema {
        constructor() {
            super();
            this._minLength = null;
            this._maxLength = null;
            this._pattern = null;
            this._isEmail = false;
            this._isURL = false;
        }

        min(length) {
            const schema = this._clone();
            schema._minLength = length;
            return schema;
        }

        max(length) {
            const schema = this._clone();
            schema._maxLength = length;
            return schema;
        }

        length(len) {
            const schema = this._clone();
            schema._minLength = len;
            schema._maxLength = len;
            return schema;
        }

        email() {
            const schema = this._clone();
            schema._isEmail = true;
            return schema;
        }

        url() {
            const schema = this._clone();
            schema._isURL = true;
            return schema;
        }

        regex(pattern) {
            const schema = this._clone();
            schema._pattern = pattern;
            return schema;
        }

        parse(value) {
            if (value === null || value === undefined) {
                if (this._hasDefault) {
                    return this._default;
                }
                if (this._optional) {
                    return undefined;
                }
                throw new ValidationError([{ field: '', message: 'Required', value }]);
            }

            if (typeof value !== 'string') {
                throw new ValidationError([
                    { field: '', message: `Expected string, got ${typeof value}`, value }
                ]);
            }

            if (this._minLength !== null && value.length < this._minLength) {
                throw new ValidationError([
                    { field: '', message: `String must be at least ${this._minLength} characters`, value }
                ]);
            }

            if (this._maxLength !== null && value.length > this._maxLength) {
                throw new ValidationError([
                    { field: '', message: `String must be at most ${this._maxLength} characters`, value }
                ]);
            }

            if (this._pattern && !this._pattern.test(value)) {
                throw new ValidationError([
                    { field: '', message: 'String does not match pattern', value }
                ]);
            }

            if (this._isEmail && !this._validateEmail(value)) {
                throw new ValidationError([
                    { field: '', message: 'Invalid email address', value }
                ]);
            }

            if (this._isURL && !this._validateURL(value)) {
                throw new ValidationError([
                    { field: '', message: 'Invalid URL', value }
                ]);
            }

            this._runValidators(value, '');
            return value;
        }

        _validateEmail(value) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        }

        _validateURL(value) {
            try {
                new URL(value);
                return true;
            } catch {
                return false;
            }
        }

        _clone() {
            const schema = new StringSchema();
            schema._optional = this._optional;
            schema._default = this._default;
            schema._hasDefault = this._hasDefault;
            schema._validators = [...this._validators];
            schema._minLength = this._minLength;
            schema._maxLength = this._maxLength;
            schema._pattern = this._pattern;
            schema._isEmail = this._isEmail;
            schema._isURL = this._isURL;
            return schema;
        }
    }

    // =============================================================================
    // Number Schema
    // =============================================================================

    class NumberSchema extends Schema {
        constructor() {
            super();
            this._min = null;
            this._max = null;
            this._isInt = false;
            this._isPositive = false;
            this._isNegative = false;
        }

        min(value) {
            const schema = this._clone();
            schema._min = value;
            return schema;
        }

        max(value) {
            const schema = this._clone();
            schema._max = value;
            return schema;
        }

        int() {
            const schema = this._clone();
            schema._isInt = true;
            return schema;
        }

        positive() {
            const schema = this._clone();
            schema._isPositive = true;
            return schema;
        }

        negative() {
            const schema = this._clone();
            schema._isNegative = true;
            return schema;
        }

        parse(value) {
            if (value === null || value === undefined) {
                if (this._hasDefault) {
                    return this._default;
                }
                if (this._optional) {
                    return undefined;
                }
                throw new ValidationError([{ field: '', message: 'Required', value }]);
            }

            if (typeof value !== 'number' || isNaN(value)) {
                throw new ValidationError([
                    { field: '', message: `Expected number, got ${typeof value}`, value }
                ]);
            }

            if (this._isInt && !Number.isInteger(value)) {
                throw new ValidationError([
                    { field: '', message: 'Expected integer', value }
                ]);
            }

            if (this._min !== null && value < this._min) {
                throw new ValidationError([
                    { field: '', message: `Number must be >= ${this._min}`, value }
                ]);
            }

            if (this._max !== null && value > this._max) {
                throw new ValidationError([
                    { field: '', message: `Number must be <= ${this._max}`, value }
                ]);
            }

            if (this._isPositive && value <= 0) {
                throw new ValidationError([
                    { field: '', message: 'Number must be positive', value }
                ]);
            }

            if (this._isNegative && value >= 0) {
                throw new ValidationError([
                    { field: '', message: 'Number must be negative', value }
                ]);
            }

            this._runValidators(value, '');
            return value;
        }

        _clone() {
            const schema = new NumberSchema();
            schema._optional = this._optional;
            schema._default = this._default;
            schema._hasDefault = this._hasDefault;
            schema._validators = [...this._validators];
            schema._min = this._min;
            schema._max = this._max;
            schema._isInt = this._isInt;
            schema._isPositive = this._isPositive;
            schema._isNegative = this._isNegative;
            return schema;
        }
    }

    // =============================================================================
    // Boolean Schema
    // =============================================================================

    class BooleanSchema extends Schema {
        constructor() {
            super();
        }

        parse(value) {
            if (value === null || value === undefined) {
                if (this._hasDefault) {
                    return this._default;
                }
                if (this._optional) {
                    return undefined;
                }
                throw new ValidationError([{ field: '', message: 'Required', value }]);
            }

            if (typeof value !== 'boolean') {
                throw new ValidationError([
                    { field: '', message: `Expected boolean, got ${typeof value}`, value }
                ]);
            }

            this._runValidators(value, '');
            return value;
        }

        _clone() {
            const schema = new BooleanSchema();
            schema._optional = this._optional;
            schema._default = this._default;
            schema._hasDefault = this._hasDefault;
            schema._validators = [...this._validators];
            return schema;
        }
    }

    // =============================================================================
    // Null Schema
    // =============================================================================

    class NullSchema extends Schema {
        constructor() {
            super();
        }

        parse(value) {
            if (value !== null) {
                throw new ValidationError([
                    { field: '', message: `Expected null, got ${typeof value}`, value }
                ]);
            }
            return null;
        }

        _clone() {
            return new NullSchema();
        }
    }

    // =============================================================================
    // Reference Schema
    // =============================================================================

    class ReferenceSchema extends Schema {
        constructor() {
            super();
            this._refType = null;
        }

        type(refType) {
            const schema = this._clone();
            schema._refType = refType;
            return schema;
        }

        parse(value) {
            if (value === null || value === undefined) {
                if (this._hasDefault) {
                    return this._default;
                }
                if (this._optional) {
                    return undefined;
                }
                throw new ValidationError([{ field: '', message: 'Required', value }]);
            }

            // Handle string reference format ":id" or ":type:id"
            if (typeof value === 'string' && value.startsWith(':')) {
                const parts = value.slice(1).split(':');
                if (parts.length === 1) {
                    return { id: parts[0] };
                } else {
                    return { type: parts[0], id: parts[1] };
                }
            }

            // Handle Reference object (from ison-parser)
            if (value && typeof value === 'object' && 'id' in value) {
                return { id: String(value.id), type: value.type || value.namespace };
            }

            // Handle plain object format
            if (typeof value === 'object' && value.id) {
                const ref = { id: String(value.id) };
                if (value.type) {
                    ref.type = String(value.type);
                }
                return ref;
            }

            throw new ValidationError([
                { field: '', message: 'Invalid reference format', value }
            ]);
        }

        _clone() {
            const schema = new ReferenceSchema();
            schema._optional = this._optional;
            schema._default = this._default;
            schema._hasDefault = this._hasDefault;
            schema._validators = [...this._validators];
            schema._refType = this._refType;
            return schema;
        }
    }

    // =============================================================================
    // Object Schema
    // =============================================================================

    class ObjectSchema extends Schema {
        constructor(shape) {
            super();
            this._shape = shape;
        }

        parse(value) {
            if (value === null || value === undefined) {
                if (this._hasDefault) {
                    return this._default;
                }
                if (this._optional) {
                    return undefined;
                }
                throw new ValidationError([{ field: '', message: 'Required', value }]);
            }

            if (typeof value !== 'object' || Array.isArray(value)) {
                throw new ValidationError([
                    { field: '', message: `Expected object, got ${Array.isArray(value) ? 'array' : typeof value}`, value }
                ]);
            }

            const result = {};
            const errors = [];

            for (const [key, schema] of Object.entries(this._shape)) {
                try {
                    result[key] = schema.parse(value[key]);
                } catch (e) {
                    if (e instanceof ValidationError) {
                        for (const error of e.errors) {
                            errors.push({
                                field: error.field ? `${key}.${error.field}` : key,
                                message: error.message,
                                value: error.value
                            });
                        }
                    } else {
                        throw e;
                    }
                }
            }

            if (errors.length > 0) {
                throw new ValidationError(errors);
            }

            this._runValidators(result, '');
            return result;
        }

        extend(shape) {
            return new ObjectSchema({ ...this._shape, ...shape });
        }

        pick(...keys) {
            const newShape = {};
            for (const key of keys) {
                if (this._shape[key]) {
                    newShape[key] = this._shape[key];
                }
            }
            return new ObjectSchema(newShape);
        }

        omit(...keys) {
            const keySet = new Set(keys);
            const newShape = {};
            for (const [key, schema] of Object.entries(this._shape)) {
                if (!keySet.has(key)) {
                    newShape[key] = schema;
                }
            }
            return new ObjectSchema(newShape);
        }

        _clone() {
            const schema = new ObjectSchema({ ...this._shape });
            schema._optional = this._optional;
            schema._default = this._default;
            schema._hasDefault = this._hasDefault;
            schema._validators = [...this._validators];
            return schema;
        }
    }

    // =============================================================================
    // Array Schema
    // =============================================================================

    class ArraySchema extends Schema {
        constructor(itemSchema) {
            super();
            this._itemSchema = itemSchema;
            this._minLength = null;
            this._maxLength = null;
        }

        min(length) {
            const schema = this._clone();
            schema._minLength = length;
            return schema;
        }

        max(length) {
            const schema = this._clone();
            schema._maxLength = length;
            return schema;
        }

        length(len) {
            const schema = this._clone();
            schema._minLength = len;
            schema._maxLength = len;
            return schema;
        }

        parse(value) {
            if (value === null || value === undefined) {
                if (this._hasDefault) {
                    return this._default;
                }
                if (this._optional) {
                    return undefined;
                }
                throw new ValidationError([{ field: '', message: 'Required', value }]);
            }

            if (!Array.isArray(value)) {
                throw new ValidationError([
                    { field: '', message: `Expected array, got ${typeof value}`, value }
                ]);
            }

            if (this._minLength !== null && value.length < this._minLength) {
                throw new ValidationError([
                    { field: '', message: `Array must have at least ${this._minLength} items`, value }
                ]);
            }

            if (this._maxLength !== null && value.length > this._maxLength) {
                throw new ValidationError([
                    { field: '', message: `Array must have at most ${this._maxLength} items`, value }
                ]);
            }

            const result = [];
            const errors = [];

            for (let i = 0; i < value.length; i++) {
                try {
                    result.push(this._itemSchema.parse(value[i]));
                } catch (e) {
                    if (e instanceof ValidationError) {
                        for (const error of e.errors) {
                            errors.push({
                                field: error.field ? `[${i}].${error.field}` : `[${i}]`,
                                message: error.message,
                                value: error.value
                            });
                        }
                    } else {
                        throw e;
                    }
                }
            }

            if (errors.length > 0) {
                throw new ValidationError(errors);
            }

            this._runValidators(result, '');
            return result;
        }

        _clone() {
            const schema = new ArraySchema(this._itemSchema);
            schema._optional = this._optional;
            schema._default = this._default;
            schema._hasDefault = this._hasDefault;
            schema._validators = [...this._validators];
            schema._minLength = this._minLength;
            schema._maxLength = this._maxLength;
            return schema;
        }
    }

    // =============================================================================
    // Table Schema (ISON-specific)
    // =============================================================================

    class TableSchema extends Schema {
        constructor(name, shape) {
            super();
            this.blockName = name;
            this._rowSchema = new ObjectSchema(shape);
        }

        parse(value) {
            // Accept array of rows or single row
            if (!Array.isArray(value)) {
                return [this._rowSchema.parse(value)];
            }

            const result = [];
            const errors = [];

            for (let i = 0; i < value.length; i++) {
                try {
                    result.push(this._rowSchema.parse(value[i]));
                } catch (e) {
                    if (e instanceof ValidationError) {
                        for (const error of e.errors) {
                            errors.push({
                                field: error.field ? `[${i}].${error.field}` : `[${i}]`,
                                message: error.message,
                                value: error.value
                            });
                        }
                    } else {
                        throw e;
                    }
                }
            }

            if (errors.length > 0) {
                throw new ValidationError(errors);
            }

            return result;
        }

        _clone() {
            const schema = new TableSchema(this.blockName, {});
            schema._rowSchema = this._rowSchema._clone();
            schema._optional = this._optional;
            schema._default = this._default;
            schema._hasDefault = this._hasDefault;
            schema._validators = [...this._validators];
            return schema;
        }
    }

    // =============================================================================
    // Document Schema
    // =============================================================================

    class DocumentSchema {
        constructor(shape) {
            this._shape = shape;
        }

        parse(doc) {
            const result = {};
            const errors = [];

            for (const [blockName, schema] of Object.entries(this._shape)) {
                const blockData = doc[blockName];

                if (blockData === undefined) {
                    if (!schema._optional) {
                        errors.push({
                            field: blockName,
                            message: `Missing required block: ${blockName}`
                        });
                    }
                    continue;
                }

                try {
                    result[blockName] = schema.parse(blockData);
                } catch (e) {
                    if (e instanceof ValidationError) {
                        for (const error of e.errors) {
                            errors.push({
                                field: error.field ? `${blockName}.${error.field}` : blockName,
                                message: error.message,
                                value: error.value
                            });
                        }
                    } else {
                        throw e;
                    }
                }
            }

            if (errors.length > 0) {
                throw new ValidationError(errors);
            }

            return result;
        }

        safeParse(doc) {
            try {
                const data = this.parse(doc);
                return { success: true, data };
            } catch (e) {
                if (e instanceof ValidationError) {
                    return { success: false, error: e };
                }
                throw e;
            }
        }
    }

    // =============================================================================
    // Schema Builder (Zod-like API)
    // =============================================================================

    const i = {
        // Primitives
        string: () => new StringSchema(),
        number: () => new NumberSchema(),
        int: () => new NumberSchema().int(),
        float: () => new NumberSchema(),
        boolean: () => new BooleanSchema(),
        bool: () => new BooleanSchema(),
        null: () => new NullSchema(),

        // References
        ref: () => new ReferenceSchema(),
        reference: () => new ReferenceSchema(),

        // Complex types
        object: (shape) => new ObjectSchema(shape),
        array: (schema) => new ArraySchema(schema),

        // ISON-specific
        table: (name, shape) => new TableSchema(name, shape),

        // Utilities
        optional: (schema) => schema.optional(),
    };

    /**
     * Create a document schema
     */
    function document(shape) {
        return new DocumentSchema(shape);
    }

    // =============================================================================
    // LLM Prompt Generation
    // =============================================================================

    /**
     * Generate prompt instructions for LLM
     */
    function generatePrompt(schema, options = {}) {
        const lines = [];

        if (options.description) {
            lines.push(`# ${options.description}`);
            lines.push('');
        }

        lines.push('Please respond in ISON format:');
        lines.push('');
        lines.push('```ison');

        if (schema instanceof TableSchema) {
            lines.push(`table.${schema.blockName}`);
            const fields = Object.keys(schema._rowSchema._shape);
            lines.push(fields.join(' '));

            if (options.examples) {
                lines.push('# ... data rows here ...');
            }
        }

        lines.push('```');

        return lines.join('\n');
    }

    // =============================================================================
    // Export
    // =============================================================================

    const validation = {
        // Version
        version: VALIDATION_VERSION,

        // Errors
        ISONanticError,
        ValidationError,

        // Schema classes
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

        // Builder
        i,

        // Helpers
        document,
        generatePrompt,
    };

    // Export for different environments
    if (typeof module !== 'undefined' && module.exports) {
        // Node.js / CommonJS
        module.exports = validation;
    } else if (typeof define === 'function' && define.amd) {
        // AMD
        define(function() { return validation; });
    } else {
        // Browser global
        global.ISONValidation = validation;
    }

})(typeof window !== 'undefined' ? window : global);
