<p align="center">
  <img src="https://raw.githubusercontent.com/ISON-format/ison/main/images/ison_logo_git.png" alt="ISON Logo">
</p>

# ISON Parser (JavaScript)

**ISON (Interchange Simple Object Notation)** - A token-efficient data format optimized for AI/LLM workflows.

[![npm version](https://badge.fury.io/js/ison-parser.svg)](https://badge.fury.io/js/ison-parser)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-80%20passed-brightgreen.svg)]()

## Features

- **30-70% fewer tokens** than JSON for structured data
- **ISONL streaming format** for fine-tuning datasets and event streams
- **Native references** for relational data (`:ID` syntax)
- **Type inference** for clean, minimal syntax
- **Zero dependencies** - works in Node.js and browser
- **Built-in validation** - Zod-like schema validation included

## Installation

```bash
npm install ison-parser
```

Or via CDN:
```html
<script src="https://unpkg.com/ison-parser/dist/ison-parser.js"></script>
```

## Quick Start

### Node.js

```javascript
const ISON = require('ison-parser');

// Parse ISON
const isonText = `
table.users
id name email
1 Alice alice@example.com
2 Bob bob@example.com
`;

const doc = ISON.loads(isonText);
console.log(doc.blocks[0].rows[0].name); // "Alice"

// Convert to JSON
const jsonData = doc.toDict();
```

### ES Modules

```javascript
import ISON from 'ison-parser';

const doc = ISON.loads(isonText);
```

### Browser

```html
<script src="https://unpkg.com/ison-parser/dist/ison-parser.js"></script>
<script>
  const doc = ISON.loads(isonText);
  console.log(doc.toDict());
</script>
```

## Built-in Validation (Zod-like)

ISON Parser includes a Zod-like validation module for schema validation:

```javascript
const { i, document, ValidationError } = require('ison-parser/validation');

// Define schemas
const userSchema = i.object({
    id: i.int().min(1),
    name: i.string().min(1).max(100),
    email: i.string().email(),
    role: i.string().default('user')
});

// Validate data
const user = userSchema.parse({
    id: 1,
    name: 'Alice',
    email: 'alice@example.com'
});

// SafeParse (non-throwing)
const result = userSchema.safeParse(data);
if (result.success) {
    console.log(result.data);
} else {
    console.log(result.error.errors);
}
```

### Schema Types

```javascript
// Primitives
i.string()                    // String validation
i.string().min(1).max(100)    // With length constraints
i.string().email()            // Email validation
i.string().regex(/pattern/)   // Regex validation

i.number()                    // Number validation
i.int()                       // Integer validation
i.number().min(0).max(100)    // With range constraints
i.number().positive()         // Must be > 0
i.number().negative()         // Must be < 0

i.boolean()                   // Boolean validation
i.bool()                      // Alias

i.null()                      // Null validation

// ISON References
i.ref()                       // Reference validation (:id or :type:id)

// Complex types
i.object({ ... })             // Object with shape
i.array(i.string())           // Array of strings
i.table('name', { ... })      // ISON table block
```

### Document Validation

Validate complete ISON documents with multiple blocks:

```javascript
const schema = document({
    users: i.table('users', {
        id: i.int(),
        name: i.string(),
        email: i.string().email()
    }),
    config: i.object({
        debug: i.bool().default(false)
    }).optional()
});

const doc = schema.parse(ISON.loads(isonText).toDict());
```

### Schema Composition

```javascript
// Extend objects
const baseSchema = i.object({ id: i.int(), name: i.string() });
const userSchema = baseSchema.extend({ email: i.string().email() });

// Pick/Omit fields
const publicUser = userSchema.pick('id', 'name');
const safeUser = userSchema.omit('password');

// Custom refinements
const evenNumber = i.int().refine(n => n % 2 === 0, 'Must be even');
```

## ISONL Streaming

ISONL is perfect for fine-tuning datasets, event streams, and logs:

```javascript
const ISON = require('ison-parser');

// Parse ISONL
const isonlText = `table.examples|instruction response|"Summarize this" "Brief summary..."
table.examples|instruction response|"Translate to Spanish" "Hola mundo"`;

const doc = ISON.loadsISONL(isonlText);

// Stream records
const lines = isonlText.split('\n');
for (const record of ISON.isonlStream(lines)) {
  console.log(record.values);
}
```

### Format Conversion

```javascript
// ISON to ISONL
const isonl = ISON.isonToISONL(isonText);

// ISONL to ISON
const ison = ISON.isonlToISON(isonlText);

// JSON to ISON
const isonFromJson = ISON.jsonToISON(jsonObject);

// ISON to JSON
const jsonFromIson = ISON.isonToJSON(isonText);
```

## API Reference

### Core Functions

```javascript
// Parse ISON string
const doc = ISON.loads(isonText);

// Serialize to ISON
const text = ISON.dumps(doc);

// Convert JSON to ISON
const ison = ISON.jsonToISON(jsonObject);

// Convert ISON to JSON
const json = ISON.isonToJSON(isonText);
```

### ISONL Functions

```javascript
// Parse ISONL
const doc = ISON.loadsISONL(isonlText);

// Serialize to ISONL
const isonl = ISON.dumpsISONL(doc);

// Stream ISONL
for (const record of ISON.isonlStream(lines)) {
  // process record
}

// Convert between formats
const isonl = ISON.isonToISONL(isonText);
const ison = ISON.isonlToISON(isonlText);
```

### Classes

```javascript
// Document - container for blocks
const doc = new ISON.Document();
doc.blocks.push(block);

// Block - single data block
const block = new ISON.Block('table', 'users', ['id', 'name'], rows);

// Reference - pointer to another record
const ref = new ISON.Reference('123', 'user');
console.log(ref.toISON()); // ":user:123"

// ISONLRecord - single streaming record
const record = new ISON.ISONLRecord('table', 'users', ['id', 'name'], values);
```

## ISON Format

### Tables (Structured Data)

```
table.users
id name email active
1 Alice alice@example.com true
2 Bob bob@example.com false
```

### Objects (Key-Value)

```
object.config
timeout 30
debug true
api_key "sk-xxx"
```

### References

```
table.orders
id customer_id total
O1 :C1 99.99
O2 :C2 149.50
```

## ISONL Format

Each line is a self-contained record:

```
kind.name|field1 field2 field3|value1 value2 value3
```

Example:
```
table.users|id name email|1 Alice alice@example.com
table.users|id name email|2 Bob bob@example.com
```

## Token Efficiency

| Records | JSON Tokens | ISON Tokens | Savings |
|---------|-------------|-------------|---------|
| 10 | ~200 | ~60-140 | 30-70% |
| 100 | ~2000 | ~600-1400 | 30-70% |
| 1000 | ~20000 | ~6000-14000 | 30-70% |

## TypeScript Support

TypeScript declarations are included:

```typescript
import ISON, { Document, Block, Reference } from 'ison-parser';

const doc: Document = ISON.loads(text);
const block: Block = doc.blocks[0];
```

## Test Results

All 80 tests passing (33 parser + 47 validation):

```
Running ISON v1.0 Parser Tests
========================================
Results: 33 passed, 0 failed

Running ISON Validation Tests
========================================
Results: 47 passed, 0 failed
```

Run tests with:
```bash
npm test
```

## Links

- [Documentation](https://www.ison.dev) | [www.getison.com](https://www.getison.com)
- [Specification](https://www.ison.dev/spec.html)
- [ISONL Spec](https://www.ison.dev/isonl.html)
- [Python Package](https://pypi.org/project/ison-py/)
- [GitHub](https://github.com/ISON-format/ison)

## License

MIT License - see [LICENSE](LICENSE) for details.
