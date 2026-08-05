import { describe, it, expect } from "vitest";
import {
  parse,
  loads,
  dumps,
  loadsIsonl,
  dumpsIsonl,
  isonToIsonl,
  isonlToIson,
  fromDict,
  dumpsCanonical,
  dumpsCanonicalIsonl,
  Reference,
  Document,
  Block,
  Row,
  isNull,
  isBool,
  isInt,
  isFloat,
  isString,
  isReference,
  ISONSyntaxError,
  ISONError,
} from "./index";

describe("Basic Parsing", () => {
  it("should parse a simple table", () => {
    const ison = `table.users
id name email
1 Alice alice@example.com
2 Bob bob@example.com`;

    const doc = parse(ison);
    const users = doc.getBlock("users");

    expect(users).toBeDefined();
    expect(users!.kind).toBe("table");
    expect(users!.name).toBe("users");
    expect(users!.size()).toBe(2);
    expect(users!.fields).toEqual(["id", "name", "email"]);

    expect(users!.rows[0]["id"]).toBe(1);
    expect(users!.rows[0]["name"]).toBe("Alice");
    expect(users!.rows[0]["email"]).toBe("alice@example.com");
  });

  it("should parse an object block", () => {
    const ison = `object.config
name version debug
MyApp 1.0 true`;

    const doc = parse(ison);
    const config = doc.getBlock("config");

    expect(config!.kind).toBe("object");
    expect(config!.size()).toBe(1);
    expect(config!.rows[0]["name"]).toBe("MyApp");
    expect(config!.rows[0]["debug"]).toBe(true);
  });

  it("should parse multiple blocks", () => {
    const ison = `table.users
id name
1 Alice
2 Bob

table.orders
id user_id
100 :1`;

    const doc = parse(ison);
    expect(doc.size()).toBe(2);
    expect(doc.has("users")).toBe(true);
    expect(doc.has("orders")).toBe(true);
  });
});

describe("Type Inference", () => {
  it("should infer integers", () => {
    const ison = `table.test
value
42
-17
0`;

    const doc = parse(ison);
    const test = doc.getBlock("test")!;

    expect(isInt(test.rows[0]["value"])).toBe(true);
    expect(test.rows[0]["value"]).toBe(42);
    expect(test.rows[1]["value"]).toBe(-17);
    expect(test.rows[2]["value"]).toBe(0);
  });

  it("should infer floats", () => {
    const ison = `table.test
value
3.14
-2.5`;

    const doc = parse(ison);
    const test = doc.getBlock("test")!;

    expect(isFloat(test.rows[0]["value"])).toBe(true);
    expect(test.rows[0]["value"]).toBeCloseTo(3.14);
    expect(test.rows[1]["value"]).toBeCloseTo(-2.5);
  });

  it("should infer booleans", () => {
    const ison = `table.test
active verified
true false`;

    const doc = parse(ison);
    const test = doc.getBlock("test")!;

    expect(isBool(test.rows[0]["active"])).toBe(true);
    expect(test.rows[0]["active"]).toBe(true);
    expect(test.rows[0]["verified"]).toBe(false);
  });

  it("should infer null values", () => {
    const ison = `table.test
value1 value2
null ~`;

    const doc = parse(ison);
    const test = doc.getBlock("test")!;

    expect(isNull(test.rows[0]["value1"])).toBe(true);
    expect(isNull(test.rows[0]["value2"])).toBe(true);
  });

  it("should infer strings", () => {
    const ison = `table.test
name
hello
"quoted string"
"with spaces"`;

    const doc = parse(ison);
    const test = doc.getBlock("test")!;

    expect(isString(test.rows[0]["name"])).toBe(true);
    expect(test.rows[0]["name"]).toBe("hello");
    expect(test.rows[1]["name"]).toBe("quoted string");
    expect(test.rows[2]["name"]).toBe("with spaces");
  });
});

describe("References", () => {
  it("should parse simple references", () => {
    const ison = `table.orders
id user_id
1 :42`;

    const doc = parse(ison);
    const orders = doc.getBlock("orders")!;
    const ref = orders.rows[0]["user_id"] as Reference;

    expect(isReference(ref)).toBe(true);
    expect(ref.id).toBe("42");
    expect(ref.type).toBeUndefined();
    expect(ref.toIson()).toBe(":42");
  });

  it("should parse namespaced references", () => {
    const ison = `table.orders
id user
1 :user:101`;

    const doc = parse(ison);
    const orders = doc.getBlock("orders")!;
    const ref = orders.rows[0]["user"] as Reference;

    expect(ref.id).toBe("101");
    expect(ref.type).toBe("user");
    expect(ref.isRelationship()).toBe(false);
    expect(ref.getNamespace()).toBe("user");
    expect(ref.toIson()).toBe(":user:101");
  });

  it("should parse relationship references", () => {
    const ison = `table.memberships
id relationship
1 :MEMBER_OF:10`;

    const doc = parse(ison);
    const memberships = doc.getBlock("memberships")!;
    const ref = memberships.rows[0]["relationship"] as Reference;

    expect(ref.id).toBe("10");
    expect(ref.type).toBe("MEMBER_OF");
    expect(ref.isRelationship()).toBe(true);
    expect(ref.relationshipType()).toBe("MEMBER_OF");
  });
});

describe("Field Type Annotations", () => {
  it("should parse type annotations", () => {
    const ison = `table.products
id:int name:string price:float
1 Widget 29.99`;

    const doc = parse(ison);
    const products = doc.getBlock("products")!;

    expect(products.getFieldType("id")).toBe("int");
    expect(products.getFieldType("name")).toBe("string");
    expect(products.getFieldType("price")).toBe("float");
  });

  it("should identify computed fields", () => {
    const ison = `table.products
id name total:computed
1 Widget 100`;

    const doc = parse(ison);
    const products = doc.getBlock("products")!;

    expect(products.getComputedFields()).toEqual(["total"]);
  });
});

describe("Escape Sequences", () => {
  it("should handle escape sequences", () => {
    const ison = `table.test
content
"line1\\nline2"
"tab\\there"
"quote\\"inside"`;

    const doc = parse(ison);
    const test = doc.getBlock("test")!;

    expect(test.rows[0]["content"]).toBe("line1\nline2");
    expect(test.rows[1]["content"]).toBe("tab\there");
    expect(test.rows[2]["content"]).toBe('quote"inside');
  });
});

describe("Comments", () => {
  it("should skip comment lines", () => {
    const ison = `# This is a comment
table.users
id name
# Another comment
1 Alice`;

    const doc = parse(ison);
    const users = doc.getBlock("users")!;

    expect(users.size()).toBe(1);
    expect(users.rows[0]["name"]).toBe("Alice");
  });
});

describe("Serialization", () => {
  it("should round-trip serialize", () => {
    const original = `table.users
id name email
1 Alice alice@example.com
2 Bob bob@example.com`;

    const doc = parse(original);
    const serialized = dumps(doc);
    const doc2 = parse(serialized);

    expect(doc2.getBlock("users")!.size()).toBe(2);
    expect(doc2.getBlock("users")!.rows[0]["name"]).toBe("Alice");
  });

  it("should quote strings when needed", () => {
    const doc = new Document();
    const block = new Block("table", "test");
    block.fields = ["name"];
    block.fieldInfo = [{ name: "name", type: undefined, isComputed: false }];
    block.rows = [{ name: "hello world" }];
    doc.blocks.push(block);

    const serialized = dumps(doc);
    expect(serialized).toContain('"hello world"');
  });
});

describe("ISONL", () => {
  it("should parse ISONL format", () => {
    const isonl = `table.users|id name|1 Alice
table.users|id name|2 Bob`;

    const doc = loadsIsonl(isonl);
    const users = doc.getBlock("users")!;

    expect(users.size()).toBe(2);
    expect(users.rows[0]["name"]).toBe("Alice");
    expect(users.rows[1]["name"]).toBe("Bob");
  });

  it("should serialize to ISONL format", () => {
    const ison = `table.users
id name
1 Alice
2 Bob`;

    const doc = parse(ison);
    const isonl = dumpsIsonl(doc);

    expect(isonl).toContain("table.users|id name|1 Alice");
    expect(isonl).toContain("table.users|id name|2 Bob");
  });

  it("should convert between formats", () => {
    const ison = `table.events
id type
1 click
2 view`;

    const isonl = isonToIsonl(ison);
    const backToIson = isonlToIson(isonl);
    const doc = parse(backToIson);

    expect(doc.getBlock("events")!.size()).toBe(2);
  });
});

// Helper: build a Document with a single block (the way this package does)
function makeIsonlDoc(kind: string, name: string, fields: string[], rows: Row[]): Document {
  const doc = new Document();
  const block = new Block(kind, name);
  block.fields = [...fields];
  block.fieldInfo = fields.map(f => ({ name: f, type: undefined, isComputed: false }));
  block.rows = rows;
  doc.blocks.push(block);
  return doc;
}

describe("ISONL Escaping Integrity", () => {
  it("should round-trip delimiter/escape chars in values", () => {
    const adversarial = [
      'C:\\path\\',            // trailing backslash used to desync quote tracking
      '\\',
      'a\\',
      'ends with backslash \\',
      'pipe|inside',
      'quote " inside',
      'mix \\" of both',
      'line1\nline2',
      'tab\there',
      'cr\rhere',
      'crlf\r\nend',
      '123',
      'true',
      ':ref',
      '',
      '\\|',
      ' leading and trailing ',
    ];
    const doc = makeIsonlDoc(
      'table', 'adversarial', ['v'],
      adversarial.map(s => ({ v: s }))
    );
    const parsed = loadsIsonl(dumpsIsonl(doc));
    const got = parsed.blocks[0].rows.map(r => r['v']);
    expect(got).toEqual(adversarial);

    // Compound case: a quoted value ending in an escaped backslash followed by
    // a pipe-bearing value on the same line — the exact shape that desynced
    // quote tracking and corrupted section splitting
    const compoundRows = [
      { a: 'x \\', b: 'y|z' },
      { a: 'x\\', b: 'y|z' },
    ];
    const doc2 = makeIsonlDoc('table', 'compound', ['a', 'b'], compoundRows);
    const parsed2 = loadsIsonl(dumpsIsonl(doc2));
    expect(parsed2.blocks[0].rows).toEqual(compoundRows);
  });
});

describe("ISONL Round-Trip Property", () => {
  it("should round-trip random strings over a hostile alphabet", () => {
    // Deterministic LCG (no Math.random)
    let state = 20260713;
    const nextState = (): number => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state;
    };
    const randInt = (lo: number, hi: number): number => lo + (nextState() % (hi - lo + 1));

    const alphabet = ['a', 'b', ' ', '|', '"', '\\', '\n', '\r', '\t', '.', ':', '#', '0', '1', 'true', 'null'];

    for (let trial = 0; trial < 300; trial++) {
      const numFields = randInt(1, 4);
      const fields = Array.from({ length: numFields }, (_, i) => `f${i}`);
      const rows: Row[] = [];
      const numRows = randInt(1, 3);
      for (let r = 0; r < numRows; r++) {
        const row: Row = {};
        for (const f of fields) {
          const len = randInt(0, 12);
          let value = '';
          for (let c = 0; c < len; c++) {
            value += alphabet[randInt(0, alphabet.length - 1)];
          }
          row[f] = value;
        }
        rows.push(row);
      }

      const doc = makeIsonlDoc('table', 't', fields, rows);
      const out = dumpsIsonl(doc);
      const parsed = loadsIsonl(out);
      expect(parsed.blocks[0].rows, `trial ${trial}: ${JSON.stringify(rows)} -> ${JSON.stringify(out)}`).toEqual(rows);
    }
  });
});

describe("ISONL Envelope Validation", () => {
  const makeDoc = (opts: { kind?: string; name?: string; fields?: string[] } = {}): Document => {
    const { kind = 'table', name = 't', fields = ['id'] } = opts;
    const row: Row = {};
    for (const f of fields) row[f] = 1;
    return makeIsonlDoc(kind, name, fields, [row]);
  };

  it("should reject envelopes that cannot survive a round-trip", () => {
    const badCases: Array<{ kind?: string; name?: string; fields?: string[] }> = [
      { kind: 'ta|ble' }, { kind: 'ta ble' }, { kind: 't.able' },
      { kind: '#table' }, { kind: '' },
      { name: 'na|me' }, { name: 'na\nme' }, { name: 'na me' }, { name: '' },
      { fields: ['bad field'] }, { fields: ['bad|field'] }, { fields: [''] },
    ];
    // ISONError, not ISONSyntaxError: an unwritable *name* now raises the more
    // specific ISONNameError, while ISONL's own extras (quote, backslash) still
    // raise ISONSyntaxError. The contract is that the envelope is rejected.
    for (const kwargs of badCases) {
      expect(() => dumpsIsonl(makeDoc(kwargs)), `should have rejected envelope ${JSON.stringify(kwargs)}`)
        .toThrow(ISONError);
    }
  });

  it("should allow dots in the block name (split on first dot)", () => {
    const parsed = loadsIsonl(dumpsIsonl(makeDoc({ name: 'v1.2' })));
    expect(parsed.blocks[0].kind).toBe('table');
    expect(parsed.blocks[0].name).toBe('v1.2');
  });
});

describe("Extra Values Rejected", () => {
  it("should reject regular rows with more values than fields", () => {
    // Regression: rows with more values than fields must error, not truncate
    expect(() => loads("table.t\na b\n1 2 3")).toThrow(/3 values/);
  });

  it("should reject a quoted extra value (quoted tokens are data, never comments)", () => {
    expect(() => loads('table.t\na b\n1 2 "#not-a-comment"')).toThrow(ISONSyntaxError);
  });

  it("should reject ISONL rows with more values than fields", () => {
    expect(() => loadsIsonl("table.t|a b|1 2 3")).toThrow(/3 values/);
  });
});

describe("Inline Trailing Comments", () => {
  it("should ignore an unquoted '#' token and everything after it", () => {
    const doc = loads("table.t\na b\n1 2 # note ignored");
    expect(doc.blocks[0].rows[0]).toEqual({ a: 1, b: 2 });

    const docL = loadsIsonl("table.t|a b|1 2 # note ignored");
    expect(docL.blocks[0].rows[0]).toEqual({ a: 1, b: 2 });
  });

  it("should treat fields after a mid-row comment as missing, not data", () => {
    const doc = loads("table.t\na b\n1 #tag");
    expect(doc.blocks[0].rows[0]).toEqual({ a: 1, b: null });
  });

  it("should keep quoted tokens as data, never comments", () => {
    const doc = loads('table.t\na b\n1 "#tag"');
    expect(doc.blocks[0].rows[0]).toEqual({ a: 1, b: "#tag" });
  });

  it("should quote leading-'#' strings so they round-trip as data", () => {
    const doc = makeIsonlDoc('table', 't', ['a'], [{ a: '#tag' }]);
    expect(loads(dumps(doc)).blocks[0].rows[0]).toEqual({ a: '#tag' });
  });
});

describe("ISON Round-Trip Property", () => {
  it("should round-trip random strings over a hostile alphabet (regular format)", () => {
    // Explicit check first: values shaped like a block header ('kind.name')
    // must be quoted by the serializer, or re-parsing would split the block
    const headerRows: Row[] = [{ v: 'a.true' }, { v: 'object.config' }];
    const headerParsed = loads(dumps(makeIsonlDoc('table', 't', ['v'], headerRows)));
    expect(headerParsed.blocks.length).toBe(1);
    expect(headerParsed.blocks[0].rows).toEqual(headerRows);

    // Deterministic LCG (no Math.random) — twin of the ISONL property test
    let state = 20260713;
    const nextState = (): number => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state;
    };
    const randInt = (lo: number, hi: number): number => lo + (nextState() % (hi - lo + 1));

    const alphabet = ['a', 'b', ' ', '|', '"', '\\', '\n', '\r', '\t', '.', ':', '#', '0', '1', 'true', 'null'];

    for (let trial = 0; trial < 300; trial++) {
      const numFields = randInt(1, 4);
      const fields = Array.from({ length: numFields }, (_, i) => `f${i}`);
      const rows: Row[] = [];
      const numRows = randInt(1, 3);
      for (let r = 0; r < numRows; r++) {
        const row: Row = {};
        for (const f of fields) {
          const len = randInt(0, 12);
          let value = '';
          for (let c = 0; c < len; c++) {
            value += alphabet[randInt(0, alphabet.length - 1)];
          }
          row[f] = value;
        }
        rows.push(row);
      }

      const doc = makeIsonlDoc('table', 't', fields, rows);
      const out = dumps(doc);
      const parsed = loads(out);
      expect(parsed.blocks[0].rows, `trial ${trial}: ${JSON.stringify(rows)} -> ${JSON.stringify(out)}`).toEqual(rows);
    }
  });
});

describe("fromDict", () => {
  it("should create document from plain object", () => {
    const data = {
      products: [
        { id: 1, name: "Widget", price: 29.99 },
        { id: 2, name: "Gadget", price: 49.99 },
      ],
    };

    const doc = fromDict(data);
    const products = doc.getBlock("products")!;

    expect(products.kind).toBe("table");
    expect(products.size()).toBe(2);
    expect(products.rows[0]["name"]).toBe("Widget");
    expect(products.rows[1]["price"]).toBe(49.99);
  });
});

describe("Document Methods", () => {
  it("should convert to JSON", () => {
    const ison = `table.users
id name
1 Alice`;

    const doc = parse(ison);
    const json = doc.toJson();
    const parsed = JSON.parse(json);

    expect(parsed.users[0].id).toBe(1);
    expect(parsed.users[0].name).toBe("Alice");
  });

  it("should convert to dict", () => {
    const ison = `table.users
id name team
1 Alice :10`;

    const doc = parse(ison);
    const dict = doc.toDict();

    expect(dict.users[0].id).toBe(1);
    expect(dict.users[0].team.$ref).toBe("10");
  });
});

describe("Canonical Serialization (ISONCS)", () => {
  it("should sort blocks ordinal-string by kind.name", () => {
    const doc = new Document();
    doc.blocks.push(new Block("table", "users"));
    doc.blocks[0].fields = ["id", "name"];
    doc.blocks[0].rows = [{ id: 2, name: "Bob" }];

    doc.blocks.push(new Block("table", "active_users"));
    doc.blocks[1].fields = ["id", "name"];
    doc.blocks[1].rows = [{ id: 1, name: "Alice" }];

    doc.blocks.push(new Block("table", "zulu"));
    doc.blocks[2].fields = ["id", "name"];
    doc.blocks[2].rows = [{ id: 3, name: "Charlie" }];

    const canonical = dumpsCanonical(doc);

    // Blocks should be in ordinal order: table.active_users < table.users < table.zulu
    expect(canonical.indexOf("table.active_users")).toBeLessThan(canonical.indexOf("table.users"));
    expect(canonical.indexOf("table.users")).toBeLessThan(canonical.indexOf("table.zulu"));
  });

  it("should sort rows ordinal-string by first column value", () => {
    const doc = new Document();
    const block = new Block("table", "items");
    block.fields = ["id", "name"];
    block.rows = [
      { id: "10", name: "ten" },
      { id: "2", name: "two" },
      { id: "1", name: "one" },
    ];
    doc.blocks.push(block);

    const canonical = dumpsCanonical(doc);
    const lines = canonical.split("\n");
    const dataLines = lines.filter(l => l && !l.startsWith("table") && l !== "id name");

    // Ordinal sort: "1" < "10" < "2"
    expect(dataLines).toEqual(['"1" one', '"10" ten', '"2" two']);
  });

  it("should put null keys at the end", () => {
    const doc = new Document();
    const block = new Block("table", "items");
    block.fields = ["id", "name"];
    block.rows = [
      { id: "2", name: "two" },
      { id: null, name: "orphan" },
      { id: "1", name: "one" },
    ];
    doc.blocks.push(block);

    const canonical = dumpsCanonical(doc);
    const lines = canonical.split("\n");
    const dataLines = lines.filter(l => l && !l.startsWith("table") && l !== "id name");

    // Rows with values come first, null keys last
    expect(dataLines).toEqual(['"1" one', '"2" two', "null orphan"]);
  });

  it("should be idempotent", () => {
    const doc = new Document();
    const block = new Block("table", "users");
    block.fields = ["id", "name"];
    block.rows = [
      { id: "2", name: "Bob" },
      { id: "1", name: "Alice" },
    ];
    doc.blocks.push(block);

    const canonical1 = dumpsCanonical(doc);
    const parsed = parse(canonical1);
    const canonical2 = dumpsCanonical(parsed);

    expect(canonical1).toBe(canonical2);
  });

  it("should use single space delimiter and no alignment", () => {
    const doc = new Document();
    const block = new Block("table", "data");
    block.fields = ["short", "very_long_name"];
    block.rows = [{ short: "a", very_long_name: "b" }];
    doc.blocks.push(block);

    const canonical = dumpsCanonical(doc);

    // Should be single space between columns, not padded
    expect(canonical).toContain("short very_long_name");
    expect(canonical).toContain("a b");
    // No padding after 'a' (would have extra spaces for alignment)
    expect(canonical).not.toContain("a  ");
  });

  it("should handle references in canonical form", () => {
    const doc = new Document();
    const block = new Block("table", "edges");
    block.fields = ["source", "target"];
    block.rows = [
      { source: new Reference("2"), target: new Reference("1") },
      { source: new Reference("1"), target: new Reference("3") },
    ];
    doc.blocks.push(block);

    const canonical = dumpsCanonical(doc);
    const lines = canonical.split("\n");
    const dataLines = lines.filter(l => l.startsWith(":"));

    // Rows should be sorted by first column: :1 < :2
    expect(dataLines[0]).toBe(":1 :3");
    expect(dataLines[1]).toBe(":2 :1");
  });

  it("should preserve empty strings with quotes", () => {
    const doc = new Document();
    const block = new Block("table", "test");
    block.fields = ["id", "name"];
    block.rows = [
      { id: "1", name: "" },
      { id: "2", name: "value" },
    ];
    doc.blocks.push(block);

    const canonical = dumpsCanonical(doc);

    // Empty string should be quoted
    expect(canonical).toContain('""');
  });

  it("should preserve field type annotations in canonical form", () => {
    const doc = new Document();
    const block = new Block("table", "typed");
    block.fields = ["id", "count"];
    block.fieldInfo = [
      { name: "id", type: "string", isComputed: false },
      { name: "count", type: "int", isComputed: false },
    ];
    block.rows = [{ id: "1", count: 42 }];
    doc.blocks.push(block);

    const canonical = dumpsCanonical(doc);

    expect(canonical).toContain("id:string count:int");
  });

  it("should match golden fixture from ison-py", () => {
    /**
     * Golden fixture: a standard document serialized to canonical form.
     * This fixture is used for cross-implementation byte-identity verification.
     * Expected output from ison-py reference implementation.
     */
    const doc = new Document();

    // Users block
    const users = new Block("table", "users");
    users.fields = ["id", "name", "active"];
    users.rows = [
      { id: "2", name: "Bob", active: true },
      { id: "1", name: "Alice", active: true },
      { id: "3", name: "Charlie", active: false },
    ];
    doc.blocks.push(users);

    // Edges block (added second, should sort to come before users alphabetically)
    const edges = new Block("table", "edges");
    edges.fields = ["source", "target"];
    edges.rows = [
      { source: new Reference("2"), target: new Reference("1") },
      { source: new Reference("1"), target: new Reference("3") },
    ];
    doc.blocks.push(edges);

    const canonical = dumpsCanonical(doc);

    // Expected order: blocks sorted (edges < users), rows sorted within each,
    // and fields sorted per ISONCS -- 'id' hoisted first, remaining fields by
    // UTF-8 byte order, so 'active' precedes 'name' regardless of input order.
    const expected = `table.edges
source target
:1 :3
:2 :1

table.users
id active name
"1" true Alice
"2" true Bob
"3" false Charlie`;

    expect(canonical).toBe(expected);
  });

  it("should sort blocks in canonical ISONL", () => {
    const doc = new Document();
    doc.blocks.push(new Block("table", "zebras"));
    doc.blocks[0].fields = ["id"];
    doc.blocks[0].rows = [{ id: "1" }];

    doc.blocks.push(new Block("table", "aardvarks"));
    doc.blocks[1].fields = ["id"];
    doc.blocks[1].rows = [{ id: "2" }];

    const canonicalIsonl = dumpsCanonicalIsonl(doc);
    const lines = canonicalIsonl.split("\n");

    // First line should be aardvarks (alphabetically first)
    expect(lines[0]).toContain("table.aardvarks");
    expect(lines[1]).toContain("table.zebras");
  });

  it("should sort rows in canonical ISONL", () => {
    const doc = new Document();
    const block = new Block("table", "items");
    block.fields = ["id", "val"];
    block.rows = [
      { id: "c", val: "three" },
      { id: "a", val: "one" },
      { id: "b", val: "two" },
    ];
    doc.blocks.push(block);

    const canonicalIsonl = dumpsCanonicalIsonl(doc);
    const lines = canonicalIsonl.split("\n");

    // ISONL format: header|fields|values per line
    // Should see a, b, c in order
    const idxA = lines.findIndex(l => l.includes("a one"));
    const idxB = lines.findIndex(l => l.includes("b two"));
    const idxC = lines.findIndex(l => l.includes("c three"));

    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });

  it("should produce canonical ISONL that round-trips correctly", () => {
    const doc = new Document();
    const block = new Block("table", "users");
    block.fields = ["id", "name"];
    block.rows = [
      { id: "2", name: "Bob" },
      { id: "1", name: "Alice" },
    ];
    doc.blocks.push(block);

    const canonicalIsonl = dumpsCanonicalIsonl(doc);
    const parsed = loadsIsonl(canonicalIsonl);
    const canonicalIsonl2 = dumpsCanonicalIsonl(parsed);

    expect(canonicalIsonl).toBe(canonicalIsonl2);
  });
});
