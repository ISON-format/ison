#!/usr/bin/env node
/**
 * Tests for ISON Validation module
 */

const validation = require('../src/validation.js');
const { i, document, ValidationError, ISONanticError } = validation;

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`[PASS] ${name}`);
        passed++;
    } catch (e) {
        console.log(`[FAIL] ${name}`);
        console.log(`       ${e.message}`);
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function assertEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertThrows(fn, errorType, message) {
    try {
        fn();
        throw new Error(message || 'Expected function to throw');
    } catch (e) {
        if (errorType && !(e instanceof errorType)) {
            throw new Error(`Expected ${errorType.name}, got ${e.constructor.name}: ${e.message}`);
        }
    }
}

console.log('Running ISON Validation Tests');
console.log('========================================');

// =============================================================================
// String Schema Tests
// =============================================================================

console.log('\n--- String Schema Tests ---');

test('string - valid string', () => {
    const schema = i.string();
    const result = schema.parse('hello');
    assertEqual(result, 'hello');
});

test('string - required by default', () => {
    const schema = i.string();
    assertThrows(() => schema.parse(null), ValidationError);
    assertThrows(() => schema.parse(undefined), ValidationError);
});

test('string - optional', () => {
    const schema = i.string().optional();
    assertEqual(schema.parse(undefined), undefined);
});

test('string - default value', () => {
    const schema = i.string().default('N/A');
    assertEqual(schema.parse(undefined), 'N/A');
    assertEqual(schema.parse(null), 'N/A');
});

test('string - min length', () => {
    const schema = i.string().min(3);
    assertEqual(schema.parse('hello'), 'hello');
    assertThrows(() => schema.parse('ab'), ValidationError);
});

test('string - max length', () => {
    const schema = i.string().max(5);
    assertEqual(schema.parse('hello'), 'hello');
    assertThrows(() => schema.parse('hello world'), ValidationError);
});

test('string - email validation', () => {
    const schema = i.string().email();
    assertEqual(schema.parse('test@example.com'), 'test@example.com');
    assertThrows(() => schema.parse('invalid'), ValidationError);
    assertThrows(() => schema.parse('no@domain'), ValidationError);
});

test('string - regex pattern', () => {
    const schema = i.string().regex(/^[A-Z]{3}-\d{3}$/);
    assertEqual(schema.parse('ABC-123'), 'ABC-123');
    assertThrows(() => schema.parse('abc-123'), ValidationError);
});

// =============================================================================
// Number Schema Tests
// =============================================================================

console.log('\n--- Number Schema Tests ---');

test('number - valid number', () => {
    const schema = i.number();
    assertEqual(schema.parse(42), 42);
    assertEqual(schema.parse(3.14), 3.14);
});

test('number - required by default', () => {
    const schema = i.number();
    assertThrows(() => schema.parse(null), ValidationError);
});

test('number - optional with default', () => {
    const schema = i.number().default(0);
    assertEqual(schema.parse(undefined), 0);
});

test('number - min value', () => {
    const schema = i.number().min(10);
    assertEqual(schema.parse(10), 10);
    assertEqual(schema.parse(100), 100);
    assertThrows(() => schema.parse(5), ValidationError);
});

test('number - max value', () => {
    const schema = i.number().max(100);
    assertEqual(schema.parse(100), 100);
    assertThrows(() => schema.parse(150), ValidationError);
});

test('number - int validation', () => {
    const schema = i.int();
    assertEqual(schema.parse(42), 42);
    assertThrows(() => schema.parse(3.14), ValidationError);
});

test('number - positive', () => {
    const schema = i.number().positive();
    assertEqual(schema.parse(1), 1);
    assertThrows(() => schema.parse(0), ValidationError);
    assertThrows(() => schema.parse(-1), ValidationError);
});

test('number - negative', () => {
    const schema = i.number().negative();
    assertEqual(schema.parse(-1), -1);
    assertThrows(() => schema.parse(0), ValidationError);
    assertThrows(() => schema.parse(1), ValidationError);
});

// =============================================================================
// Boolean Schema Tests
// =============================================================================

console.log('\n--- Boolean Schema Tests ---');

test('boolean - valid values', () => {
    const schema = i.boolean();
    assertEqual(schema.parse(true), true);
    assertEqual(schema.parse(false), false);
});

test('boolean - required by default', () => {
    const schema = i.boolean();
    assertThrows(() => schema.parse(null), ValidationError);
});

test('boolean - default value', () => {
    const schema = i.bool().default(true);
    assertEqual(schema.parse(undefined), true);
});

test('boolean - rejects non-boolean', () => {
    const schema = i.boolean();
    assertThrows(() => schema.parse('true'), ValidationError);
    assertThrows(() => schema.parse(1), ValidationError);
});

// =============================================================================
// Reference Schema Tests
// =============================================================================

console.log('\n--- Reference Schema Tests ---');

test('reference - string format :id', () => {
    const schema = i.ref();
    const result = schema.parse(':123');
    assertEqual(result.id, '123');
});

test('reference - string format :type:id', () => {
    const schema = i.ref();
    const result = schema.parse(':user:123');
    assertEqual(result.id, '123');
    assertEqual(result.type, 'user');
});

test('reference - object format', () => {
    const schema = i.ref();
    const result = schema.parse({ id: '456', type: 'order' });
    assertEqual(result.id, '456');
    assertEqual(result.type, 'order');
});

test('reference - required by default', () => {
    const schema = i.ref();
    assertThrows(() => schema.parse(null), ValidationError);
});

test('reference - optional', () => {
    const schema = i.ref().optional();
    assertEqual(schema.parse(undefined), undefined);
});

// =============================================================================
// Object Schema Tests
// =============================================================================

console.log('\n--- Object Schema Tests ---');

test('object - valid object', () => {
    const schema = i.object({
        name: i.string(),
        age: i.int()
    });
    const result = schema.parse({ name: 'Alice', age: 30 });
    assertEqual(result.name, 'Alice');
    assertEqual(result.age, 30);
});

test('object - validates nested fields', () => {
    const schema = i.object({
        name: i.string().min(1),
        age: i.int().min(0)
    });
    assertThrows(() => schema.parse({ name: '', age: 30 }), ValidationError);
    assertThrows(() => schema.parse({ name: 'Bob', age: -5 }), ValidationError);
});

test('object - collects all errors', () => {
    const schema = i.object({
        name: i.string(),
        email: i.string().email(),
        age: i.int()
    });
    try {
        schema.parse({ name: null, email: 'invalid', age: 'not a number' });
        assert(false, 'Should have thrown');
    } catch (e) {
        assert(e instanceof ValidationError);
        assert(e.errors.length >= 2, 'Should have multiple errors');
    }
});

test('object - extend', () => {
    const baseSchema = i.object({
        id: i.int(),
        name: i.string()
    });
    const extendedSchema = baseSchema.extend({
        email: i.string().email()
    });
    const result = extendedSchema.parse({ id: 1, name: 'Alice', email: 'alice@test.com' });
    assertEqual(result.id, 1);
    assertEqual(result.email, 'alice@test.com');
});

test('object - pick', () => {
    const fullSchema = i.object({
        id: i.int(),
        name: i.string(),
        email: i.string()
    });
    const pickSchema = fullSchema.pick('id', 'name');
    const result = pickSchema.parse({ id: 1, name: 'Alice' });
    assertEqual(result.id, 1);
    assertEqual(result.name, 'Alice');
    assertEqual(result.email, undefined);
});

test('object - omit', () => {
    const fullSchema = i.object({
        id: i.int(),
        name: i.string(),
        password: i.string()
    });
    const safeSchema = fullSchema.omit('password');
    const result = safeSchema.parse({ id: 1, name: 'Alice' });
    assertEqual(result.id, 1);
    assertEqual(result.password, undefined);
});

// =============================================================================
// Array Schema Tests
// =============================================================================

console.log('\n--- Array Schema Tests ---');

test('array - valid array', () => {
    const schema = i.array(i.string());
    const result = schema.parse(['a', 'b', 'c']);
    assertEqual(result, ['a', 'b', 'c']);
});

test('array - validates items', () => {
    const schema = i.array(i.int());
    assertThrows(() => schema.parse([1, 'two', 3]), ValidationError);
});

test('array - min length', () => {
    const schema = i.array(i.string()).min(2);
    assertEqual(schema.parse(['a', 'b']).length, 2);
    assertThrows(() => schema.parse(['a']), ValidationError);
});

test('array - max length', () => {
    const schema = i.array(i.string()).max(2);
    assertEqual(schema.parse(['a', 'b']).length, 2);
    assertThrows(() => schema.parse(['a', 'b', 'c']), ValidationError);
});

test('array - nested objects', () => {
    const schema = i.array(i.object({
        id: i.int(),
        name: i.string()
    }));
    const result = schema.parse([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
    ]);
    assertEqual(result.length, 2);
    assertEqual(result[0].name, 'Alice');
});

// =============================================================================
// Table Schema Tests
// =============================================================================

console.log('\n--- Table Schema Tests ---');

test('table - parses array of rows', () => {
    const schema = i.table('users', {
        id: i.int(),
        name: i.string()
    });
    const result = schema.parse([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
    ]);
    assertEqual(result.length, 2);
    assertEqual(result[0].id, 1);
    assertEqual(result[1].name, 'Bob');
});

test('table - validates each row', () => {
    const schema = i.table('users', {
        id: i.int(),
        email: i.string().email()
    });
    assertThrows(() => schema.parse([
        { id: 1, email: 'valid@test.com' },
        { id: 2, email: 'invalid' }
    ]), ValidationError);
});

test('table - wraps single row in array', () => {
    const schema = i.table('config', {
        key: i.string(),
        value: i.string()
    });
    const result = schema.parse({ key: 'timeout', value: '30' });
    assertEqual(Array.isArray(result), true);
    assertEqual(result.length, 1);
});

// =============================================================================
// Document Schema Tests
// =============================================================================

console.log('\n--- Document Schema Tests ---');

test('document - parses multiple blocks', () => {
    const schema = document({
        users: i.table('users', {
            id: i.int(),
            name: i.string()
        }),
        config: i.object({
            debug: i.bool()
        })
    });

    const result = schema.parse({
        users: [
            { id: 1, name: 'Alice' }
        ],
        config: { debug: true }
    });

    assertEqual(result.users.length, 1);
    assertEqual(result.config.debug, true);
});

test('document - missing required block', () => {
    const schema = document({
        users: i.table('users', { id: i.int() }),
        orders: i.table('orders', { id: i.int() })
    });

    assertThrows(() => schema.parse({
        users: [{ id: 1 }]
        // orders is missing
    }), ValidationError);
});

test('document - optional block', () => {
    const schema = document({
        users: i.table('users', { id: i.int() }),
        logs: i.table('logs', { msg: i.string() }).optional()
    });

    const result = schema.parse({
        users: [{ id: 1 }]
        // logs is optional
    });

    assertEqual(result.users.length, 1);
    assertEqual(result.logs, undefined);
});

// =============================================================================
// SafeParse Tests
// =============================================================================

console.log('\n--- SafeParse Tests ---');

test('safeParse - success', () => {
    const schema = i.string();
    const result = schema.safeParse('hello');
    assertEqual(result.success, true);
    assertEqual(result.data, 'hello');
});

test('safeParse - failure', () => {
    const schema = i.int();
    const result = schema.safeParse('not a number');
    assertEqual(result.success, false);
    assert(result.error instanceof ValidationError);
});

test('document safeParse', () => {
    const schema = document({
        users: i.table('users', { id: i.int() })
    });

    const success = schema.safeParse({ users: [{ id: 1 }] });
    assertEqual(success.success, true);

    const failure = schema.safeParse({ users: [{ id: 'bad' }] });
    assertEqual(failure.success, false);
});

// =============================================================================
// Custom Refinement Tests
// =============================================================================

console.log('\n--- Custom Refinement Tests ---');

test('refine - custom validation', () => {
    const schema = i.string().refine(
        (val) => val.startsWith('PRO-'),
        'Must start with PRO-'
    );
    assertEqual(schema.parse('PRO-123'), 'PRO-123');
    assertThrows(() => schema.parse('ABC-123'), ValidationError);
});

test('refine - number validation', () => {
    const schema = i.int().refine(
        (val) => val % 2 === 0,
        'Must be even'
    );
    assertEqual(schema.parse(4), 4);
    assertThrows(() => schema.parse(3), ValidationError);
});

// =============================================================================
// Summary
// =============================================================================

console.log('\n========================================');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}
