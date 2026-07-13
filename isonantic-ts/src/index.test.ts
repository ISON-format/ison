/**
 * ISONantic TypeScript Tests
 */

import { describe, it, expect } from 'vitest';
import {
  i,
  document,
  parse,
  parseSafe,
  ValidationError,
  generatePrompt,
  VERSION,
} from './index';

describe('ISONantic', () => {
  describe('Version', () => {
    it('should have version defined', () => {
      expect(VERSION).toBe('1.1.0');
    });
  });

  describe('String Schema', () => {
    it('should parse valid strings', () => {
      const schema = i.string();
      expect(schema.parse('hello')).toBe('hello');
    });

    it('should reject non-strings', () => {
      const schema = i.string();
      expect(() => schema.parse(123)).toThrow(ValidationError);
    });

    it('should validate min length', () => {
      const schema = i.string().min(5);
      expect(schema.parse('hello')).toBe('hello');
      expect(() => schema.parse('hi')).toThrow(ValidationError);
    });

    it('should validate max length', () => {
      const schema = i.string().max(5);
      expect(schema.parse('hello')).toBe('hello');
      expect(() => schema.parse('hello world')).toThrow(ValidationError);
    });

    it('should validate email format', () => {
      const schema = i.string().email();
      expect(schema.parse('test@example.com')).toBe('test@example.com');
      expect(() => schema.parse('invalid')).toThrow(ValidationError);
    });

    it('should validate URL format', () => {
      const schema = i.string().url();
      expect(schema.parse('https://example.com')).toBe('https://example.com');
      expect(() => schema.parse('not-a-url')).toThrow(ValidationError);
    });

    it('should validate regex pattern', () => {
      const schema = i.string().regex(/^[A-Z]+$/);
      expect(schema.parse('ABC')).toBe('ABC');
      expect(() => schema.parse('abc')).toThrow(ValidationError);
    });

    it('should handle optional strings', () => {
      const schema = i.string().optional();
      expect(schema.parse(undefined)).toBeUndefined();
    });

    it('should handle default values', () => {
      const schema = i.string().default('default');
      expect(schema.parse(undefined)).toBe('default');
    });
  });

  describe('Number Schema', () => {
    it('should parse valid numbers', () => {
      const schema = i.number();
      expect(schema.parse(42)).toBe(42);
      expect(schema.parse(3.14)).toBe(3.14);
    });

    it('should reject non-numbers', () => {
      const schema = i.number();
      expect(() => schema.parse('42')).toThrow(ValidationError);
    });

    it('should validate min value', () => {
      const schema = i.number().min(10);
      expect(schema.parse(10)).toBe(10);
      expect(() => schema.parse(5)).toThrow(ValidationError);
    });

    it('should validate max value', () => {
      const schema = i.number().max(10);
      expect(schema.parse(10)).toBe(10);
      expect(() => schema.parse(15)).toThrow(ValidationError);
    });

    it('should validate integers', () => {
      const schema = i.int();
      expect(schema.parse(42)).toBe(42);
      expect(() => schema.parse(3.14)).toThrow(ValidationError);
    });

    it('should validate positive numbers', () => {
      const schema = i.number().positive();
      expect(schema.parse(1)).toBe(1);
      expect(() => schema.parse(0)).toThrow(ValidationError);
      expect(() => schema.parse(-1)).toThrow(ValidationError);
    });

    it('should validate negative numbers', () => {
      const schema = i.number().negative();
      expect(schema.parse(-1)).toBe(-1);
      expect(() => schema.parse(0)).toThrow(ValidationError);
      expect(() => schema.parse(1)).toThrow(ValidationError);
    });
  });

  describe('Boolean Schema', () => {
    it('should parse valid booleans', () => {
      const schema = i.boolean();
      expect(schema.parse(true)).toBe(true);
      expect(schema.parse(false)).toBe(false);
    });

    it('should reject non-booleans', () => {
      const schema = i.boolean();
      expect(() => schema.parse('true')).toThrow(ValidationError);
      expect(() => schema.parse(1)).toThrow(ValidationError);
    });

    it('should handle default values', () => {
      const schema = i.bool().default(true);
      expect(schema.parse(undefined)).toBe(true);
    });
  });

  describe('Null Schema', () => {
    it('should parse null', () => {
      const schema = i.null();
      expect(schema.parse(null)).toBeNull();
    });

    it('should reject non-null values', () => {
      const schema = i.null();
      expect(() => schema.parse(undefined)).toThrow(ValidationError);
      expect(() => schema.parse('')).toThrow(ValidationError);
    });
  });

  describe('Reference Schema', () => {
    it('should parse string references', () => {
      const schema = i.ref();
      expect(schema.parse(':42')).toEqual({ id: '42' });
      expect(schema.parse(':user:101')).toEqual({ type: 'user', id: '101' });
    });

    it('should parse object references', () => {
      const schema = i.ref();
      expect(schema.parse({ id: '42' })).toEqual({ id: '42' });
      expect(schema.parse({ id: '101', type: 'user' })).toEqual({ id: '101', type: 'user' });
    });

    it('should reject invalid references', () => {
      const schema = i.ref();
      expect(() => schema.parse('invalid')).toThrow(ValidationError);
      expect(() => schema.parse({})).toThrow(ValidationError);
    });
  });

  describe('Object Schema', () => {
    it('should parse valid objects', () => {
      const schema = i.object({
        name: i.string(),
        age: i.int(),
      });
      expect(schema.parse({ name: 'Alice', age: 30 })).toEqual({ name: 'Alice', age: 30 });
    });

    it('should reject invalid object fields', () => {
      const schema = i.object({
        name: i.string(),
        age: i.int(),
      });
      expect(() => schema.parse({ name: 'Alice', age: '30' })).toThrow(ValidationError);
    });

    it('should handle optional fields', () => {
      const schema = i.object({
        name: i.string(),
        email: i.string().optional(),
      });
      expect(schema.parse({ name: 'Alice' })).toEqual({ name: 'Alice', email: undefined });
    });

    it('should extend schemas', () => {
      const baseSchema = i.object({ id: i.int() });
      const extendedSchema = baseSchema.extend({ name: i.string() });
      expect(extendedSchema.parse({ id: 1, name: 'Alice' })).toEqual({ id: 1, name: 'Alice' });
    });

    it('should pick fields', () => {
      const schema = i.object({ id: i.int(), name: i.string(), email: i.string() });
      const pickedSchema = schema.pick('id', 'name');
      expect(pickedSchema.parse({ id: 1, name: 'Alice' })).toEqual({ id: 1, name: 'Alice' });
    });

    it('should omit fields', () => {
      const schema = i.object({ id: i.int(), name: i.string(), email: i.string() });
      const omittedSchema = schema.omit('email');
      expect(omittedSchema.parse({ id: 1, name: 'Alice' })).toEqual({ id: 1, name: 'Alice' });
    });
  });

  describe('Array Schema', () => {
    it('should parse valid arrays', () => {
      const schema = i.array(i.string());
      expect(schema.parse(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    });

    it('should reject invalid array items', () => {
      const schema = i.array(i.string());
      expect(() => schema.parse(['a', 1, 'c'])).toThrow(ValidationError);
    });

    it('should validate min length', () => {
      const schema = i.array(i.string()).min(2);
      expect(schema.parse(['a', 'b'])).toEqual(['a', 'b']);
      expect(() => schema.parse(['a'])).toThrow(ValidationError);
    });

    it('should validate max length', () => {
      const schema = i.array(i.string()).max(2);
      expect(schema.parse(['a', 'b'])).toEqual(['a', 'b']);
      expect(() => schema.parse(['a', 'b', 'c'])).toThrow(ValidationError);
    });
  });

  describe('Table Schema', () => {
    it('should parse array of rows', () => {
      const schema = i.table('users', {
        id: i.int(),
        name: i.string(),
      });
      const data = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];
      expect(schema.parse(data)).toEqual(data);
    });

    it('should wrap single object in array', () => {
      const schema = i.table('users', {
        id: i.int(),
        name: i.string(),
      });
      expect(schema.parse({ id: 1, name: 'Alice' })).toEqual([{ id: 1, name: 'Alice' }]);
    });

    it('should reject invalid rows', () => {
      const schema = i.table('users', {
        id: i.int(),
        name: i.string(),
      });
      expect(() => schema.parse([{ id: 'invalid', name: 'Alice' }])).toThrow(ValidationError);
    });
  });

  describe('Document Schema', () => {
    it('should parse valid documents', () => {
      const schema = document({
        users: i.table('users', {
          id: i.int(),
          name: i.string(),
        }),
      });
      const doc = {
        users: [{ id: 1, name: 'Alice' }],
      };
      expect(schema.parse(doc)).toEqual(doc);
    });

    it('should reject missing required blocks', () => {
      const schema = document({
        users: i.table('users', { id: i.int() }),
      });
      expect(() => schema.parse({})).toThrow(ValidationError);
    });

    it('should support safeParse', () => {
      const schema = document({
        users: i.table('users', { id: i.int() }),
      });

      const successResult = schema.safeParse({ users: [{ id: 1 }] });
      expect(successResult.success).toBe(true);

      const failResult = schema.safeParse({});
      expect(failResult.success).toBe(false);
    });
  });

  describe('Custom Refinements', () => {
    it('should support custom validators', () => {
      const schema = i.string().refine(
        (val) => val.startsWith('prefix_'),
        'Must start with prefix_'
      );
      expect(schema.parse('prefix_value')).toBe('prefix_value');
      expect(() => schema.parse('value')).toThrow(ValidationError);
    });
  });

  describe('SafeParse', () => {
    it('should return success result for valid data', () => {
      const schema = i.string();
      const result = schema.safeParse('hello');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('hello');
      }
    });

    it('should return error result for invalid data', () => {
      const schema = i.string();
      const result = schema.safeParse(123);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ValidationError);
      }
    });
  });

  describe('parse (ISON text, delegated to ison-ts)', () => {
    const UserSchema = i.table('users', {
      id: i.int(),
      name: i.string(),
      email: i.string().email(),
      active: i.boolean().default(true),
    });

    it('should parse valid ISON text into typed rows', () => {
      const isonText = [
        'table.users',
        'id name email active',
        '1 Alice alice@example.com true',
        '2 Bob bob@example.com false',
      ].join('\n');

      const users = parse(isonText, UserSchema);
      expect(users).toEqual([
        { id: 1, name: 'Alice', email: 'alice@example.com', active: true },
        { id: 2, name: 'Bob', email: 'bob@example.com', active: false },
      ]);
    });

    it('should apply schema defaults for missing columns', () => {
      const isonText = [
        'table.users',
        'id name email',
        '1 Alice alice@example.com',
      ].join('\n');

      const users = parse(isonText, UserSchema);
      expect(users).toEqual([
        { id: 1, name: 'Alice', email: 'alice@example.com', active: true },
      ]);
    });

    it('should keep quoted tokens as strings', () => {
      const schema = i.table('users', {
        id: i.int(),
        name: i.string(),
      });
      const isonText = [
        'table.users',
        'id name',
        '1 "Alice Smith"',
      ].join('\n');

      expect(parse(isonText, schema)).toEqual([{ id: 1, name: 'Alice Smith' }]);
    });

    it('should throw ValidationError with field info for invalid rows', () => {
      const isonText = [
        'table.users',
        'id name email',
        '1 Alice not-an-email',
        'oops Bob bob@example.com',
      ].join('\n');

      let caught: unknown;
      try {
        parse(isonText, UserSchema);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(ValidationError);
      const errors = (caught as ValidationError).errors;
      expect(errors.some((e) => e.field === '[0].email' && /email/i.test(e.message))).toBe(true);
      expect(errors.some((e) => e.field === '[1].id' && /number/i.test(e.message))).toBe(true);
    });

    it('should map ISON references to ISONReference objects', () => {
      const OrderSchema = i.table('orders', {
        id: i.int(),
        user: i.ref(),
        amount: i.number(),
      });
      const isonText = [
        'table.orders',
        'id user amount',
        '1 :user:101 250.5',
        '2 :42 100',
      ].join('\n');

      const orders = parse(isonText, OrderSchema);
      expect(orders[0].user).toEqual({ id: '101', type: 'user' });
      expect(orders[1].user).toEqual({ id: '42' });
      expect(orders[0].amount).toBe(250.5);
    });

    it('should match blocks by bare name among multiple blocks', () => {
      const isonText = [
        'table.products',
        'id title',
        '1 Widget',
        '',
        'table.users',
        'id name email',
        '7 Carol carol@example.com',
      ].join('\n');

      const users = parse(isonText, UserSchema);
      expect(users).toEqual([
        { id: 7, name: 'Carol', email: 'carol@example.com', active: true },
      ]);
    });

    it('should match blocks by full kind.name header', () => {
      const schema = i.table('table.users', {
        id: i.int(),
        name: i.string(),
      });
      const isonText = [
        'table.users',
        'id name',
        '1 Alice',
      ].join('\n');

      expect(parse(isonText, schema)).toEqual([{ id: 1, name: 'Alice' }]);
    });

    it('should throw ValidationError when the block is missing', () => {
      const isonText = [
        'table.products',
        'id title',
        '1 Widget',
      ].join('\n');

      let caught: unknown;
      try {
        parse(isonText, UserSchema);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(ValidationError);
      const errors = (caught as ValidationError).errors;
      expect(errors[0].field).toBe('users');
      expect(errors[0].message).toContain("Block 'users' not found");
    });
  });

  describe('parseSafe', () => {
    const UserSchema = i.table('users', {
      id: i.int(),
      name: i.string(),
    });

    it('should return success result for valid ISON text', () => {
      const result = parseSafe(
        ['table.users', 'id name', '1 Alice'].join('\n'),
        UserSchema
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([{ id: 1, name: 'Alice' }]);
      }
    });

    it('should return error result for invalid rows', () => {
      const result = parseSafe(
        ['table.users', 'id name', 'oops Alice'].join('\n'),
        UserSchema
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ValidationError);
        expect(result.error.errors[0].field).toBe('[0].id');
      }
    });

    it('should return error result for missing blocks', () => {
      const result = parseSafe(
        ['table.products', 'id title', '1 Widget'].join('\n'),
        UserSchema
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ValidationError);
      }
    });

    it('should return error result for malformed ISON text', () => {
      const result = parseSafe(
        ['table.users', 'id name', '1 "unterminated'].join('\n'),
        UserSchema
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ValidationError);
        expect(result.error.message).toContain('Invalid ISON');
      }
    });
  });

  describe('Prompt Generation', () => {
    it('should generate LLM prompt for table schema', () => {
      const schema = i.table('users', {
        id: i.int(),
        name: i.string(),
        email: i.string(),
      });
      const prompt = generatePrompt(schema, { description: 'User data' });
      expect(prompt).toContain('# User data');
      expect(prompt).toContain('table.users');
      expect(prompt).toContain('id name email');
    });

    it('should include example hint when requested', () => {
      const schema = i.table('users', { id: i.int() });
      const prompt = generatePrompt(schema, { examples: true });
      expect(prompt).toContain('# ... data rows here ...');
    });
  });
});
