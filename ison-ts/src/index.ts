/**
 * ISON Parser for TypeScript
 *
 * A TypeScript implementation of the ISON (Interchange Simple Object Notation) parser.
 * ISON is a minimal, LLM-friendly data serialization format optimized for AI/ML workflows.
 */

export const VERSION = "1.0.2";

// =============================================================================
// Types
// =============================================================================

/**
 * Reference to another record in the document
 */
export class Reference {
  constructor(
    public readonly id: string,
    public readonly type?: string
  ) {}

  /**
   * Check if this is a relationship reference (UPPERCASE type)
   */
  isRelationship(): boolean {
    if (!this.type) return false;
    return this.type === this.type.toUpperCase() && /^[A-Z_]+$/.test(this.type);
  }

  /**
   * Get namespace (for non-relationship references)
   */
  getNamespace(): string | undefined {
    if (this.isRelationship()) return undefined;
    return this.type;
  }

  /**
   * Get relationship type (for relationship references)
   */
  relationshipType(): string | undefined {
    if (!this.isRelationship()) return undefined;
    return this.type;
  }

  /**
   * Convert to ISON string representation
   */
  toIson(): string {
    if (this.type) {
      return `:${this.type}:${this.id}`;
    }
    return `:${this.id}`;
  }

  toString(): string {
    return this.toIson();
  }
}

/**
 * Possible value types in ISON
 */
export type Value = null | boolean | number | string | Reference;

/**
 * A row of data (field name -> value mapping)
 */
export type Row = Record<string, Value>;

/**
 * Field information including optional type annotation
 */
export interface FieldInfo {
  name: string;
  type?: string;
  isComputed: boolean;
}

/**
 * A block of structured data
 */
export class Block {
  public rows: Row[] = [];
  public fields: string[] = [];
  public fieldInfo: FieldInfo[] = [];
  public summaryRows: Row[] = [];

  constructor(
    public readonly kind: string,
    public readonly name: string
  ) {}

  /**
   * Number of data rows
   */
  size(): number {
    return this.rows.length;
  }

  /**
   * Get row by index
   */
  getRow(index: number): Row | undefined {
    return this.rows[index];
  }

  /**
   * Get field type annotation
   */
  getFieldType(fieldName: string): string | undefined {
    const info = this.fieldInfo.find(f => f.name === fieldName);
    return info?.type;
  }

  /**
   * Get list of computed fields
   */
  getComputedFields(): string[] {
    return this.fieldInfo.filter(f => f.isComputed).map(f => f.name);
  }
}

/**
 * A complete ISON document
 */
export class Document {
  public blocks: Block[] = [];

  /**
   * Get block by name
   */
  getBlock(name: string): Block | undefined {
    return this.blocks.find(b => b.name === name);
  }

  /**
   * Check if block exists
   */
  has(name: string): boolean {
    return this.blocks.some(b => b.name === name);
  }

  /**
   * Number of blocks
   */
  size(): number {
    return this.blocks.length;
  }

  /**
   * Convert document to plain object
   */
  toDict(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const block of this.blocks) {
      result[block.name] = block.rows.map(row => {
        const obj: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
          if (value instanceof Reference) {
            obj[key] = { $ref: value.id, type: value.type };
          } else {
            obj[key] = value;
          }
        }
        return obj;
      });
    }
    return result;
  }

  /**
   * Convert to JSON string
   */
  toJson(indent: number = 2): string {
    return JSON.stringify(this.toDict(), null, indent);
  }
}

// =============================================================================
// Parser
// =============================================================================

export class ISONSyntaxError extends Error {
  constructor(
    message: string,
    public readonly line?: number,
    public readonly column?: number
  ) {
    super(line !== undefined ? `Line ${line}: ${message}` : message);
    this.name = "ISONSyntaxError";
  }
}

class Parser {
  private pos = 0;
  private line = 1;
  private col = 1;

  constructor(private readonly text: string) {}

  parse(): Document {
    const doc = new Document();

    this.skipWhitespaceAndComments();

    while (this.pos < this.text.length) {
      const block = this.parseBlock();
      if (block) {
        doc.blocks.push(block);
      }
      this.skipWhitespaceAndComments();
    }

    return doc;
  }

  private parseBlock(): Block | null {
    // Parse block header: kind.name
    const headerLine = this.readLine();
    if (!headerLine || headerLine.startsWith("#")) {
      return null;
    }

    const dotIndex = headerLine.indexOf(".");
    if (dotIndex === -1) {
      throw new ISONSyntaxError(`Invalid block header: ${headerLine}`, this.line);
    }

    const kind = headerLine.substring(0, dotIndex).trim();
    const name = headerLine.substring(dotIndex + 1).trim();

    if (!kind || !name) {
      throw new ISONSyntaxError(`Invalid block header: ${headerLine}`, this.line);
    }

    const block = new Block(kind, name);

    // Parse field definitions
    this.skipEmptyLines();
    const fieldsLine = this.readLine();
    if (!fieldsLine) {
      return block;
    }

    const fieldTokens = this.tokenizeLine(fieldsLine);
    for (const token of fieldTokens) {
      const colonIndex = token.indexOf(":");
      if (colonIndex !== -1) {
        const fieldName = token.substring(0, colonIndex);
        const fieldType = token.substring(colonIndex + 1);
        block.fields.push(fieldName);
        block.fieldInfo.push({
          name: fieldName,
          type: fieldType,
          isComputed: fieldType === "computed"
        });
      } else {
        block.fields.push(token);
        block.fieldInfo.push({
          name: token,
          type: undefined,
          isComputed: false
        });
      }
    }

    // Parse data rows
    let inSummary = false;
    while (this.pos < this.text.length) {
      const line = this.peekLine();

      // Empty line or new block = end of current block
      if (!line || line.match(/^[a-z]+\./)) {
        break;
      }

      this.readLine(); // consume the line

      // Skip comments
      if (line.startsWith("#")) {
        continue;
      }

      // Summary separator
      if (line.trim() === "---") {
        inSummary = true;
        continue;
      }

      const values = this.tokenizeLine(line);
      if (values.length === 0) {
        break; // empty line ends block
      }

      const row: Row = {};
      for (let i = 0; i < block.fields.length && i < values.length; i++) {
        row[block.fields[i]] = this.parseValue(values[i]);
      }

      if (inSummary) {
        block.summaryRows.push(row);
      } else {
        block.rows.push(row);
      }
    }

    return block;
  }

  private tokenizeLine(line: string): string[] {
    const tokens: string[] = [];
    let i = 0;

    // Remove inline comments
    const commentIndex = this.findCommentStart(line);
    if (commentIndex !== -1) {
      line = line.substring(0, commentIndex);
    }

    while (i < line.length) {
      // Skip whitespace
      while (i < line.length && (line[i] === " " || line[i] === "\t")) {
        i++;
      }

      if (i >= line.length) break;

      // Quoted string
      if (line[i] === '"') {
        const [token, newPos] = this.parseQuotedString(line, i);
        tokens.push(token);
        i = newPos;
      } else {
        // Unquoted token
        const start = i;
        while (i < line.length && line[i] !== " " && line[i] !== "\t") {
          i++;
        }
        tokens.push(line.substring(start, i));
      }
    }

    return tokens;
  }

  private findCommentStart(line: string): number {
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"' && (i === 0 || line[i-1] !== '\\')) {
        inQuote = !inQuote;
      } else if (line[i] === '#' && !inQuote) {
        return i;
      }
    }
    return -1;
  }

  private parseQuotedString(line: string, start: number): [string, number] {
    let result = "";
    let i = start + 1; // skip opening quote

    while (i < line.length) {
      if (line[i] === "\\") {
        if (i + 1 < line.length) {
          const next = line[i + 1];
          switch (next) {
            case "n": result += "\n"; break;
            case "t": result += "\t"; break;
            case "r": result += "\r"; break;
            case "\\": result += "\\"; break;
            case '"': result += '"'; break;
            default: result += next;
          }
          i += 2;
        } else {
          result += "\\";
          i++;
        }
      } else if (line[i] === '"') {
        return [result, i + 1];
      } else {
        result += line[i];
        i++;
      }
    }

    throw new ISONSyntaxError("Unterminated string", this.line);
  }

  private parseValue(token: string): Value {
    // Null
    if (token === "null" || token === "~") {
      return null;
    }

    // Boolean
    if (token === "true") return true;
    if (token === "false") return false;

    // Reference
    if (token.startsWith(":")) {
      return this.parseReference(token);
    }

    // Number
    if (/^-?\d+$/.test(token)) {
      return parseInt(token, 10);
    }
    if (/^-?\d+\.\d+$/.test(token)) {
      return parseFloat(token);
    }

    // String
    return token;
  }

  private parseReference(token: string): Reference {
    const parts = token.substring(1).split(":");
    if (parts.length === 1) {
      return new Reference(parts[0]);
    } else if (parts.length === 2) {
      return new Reference(parts[1], parts[0]);
    }
    throw new ISONSyntaxError(`Invalid reference: ${token}`, this.line);
  }

  private readLine(): string | null {
    if (this.pos >= this.text.length) return null;

    const start = this.pos;
    while (this.pos < this.text.length && this.text[this.pos] !== "\n") {
      this.pos++;
    }

    const line = this.text.substring(start, this.pos);

    if (this.pos < this.text.length) {
      this.pos++; // skip newline
    }
    this.line++;

    return line.trim();
  }

  private peekLine(): string | null {
    const savedPos = this.pos;
    const savedLine = this.line;
    const result = this.readLine();
    this.pos = savedPos;
    this.line = savedLine;
    return result;
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos];
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
        if (ch === "\n") this.line++;
        this.pos++;
      } else if (ch === "#") {
        // Skip comment line
        while (this.pos < this.text.length && this.text[this.pos] !== "\n") {
          this.pos++;
        }
      } else {
        break;
      }
    }
  }

  private skipEmptyLines(): void {
    while (this.pos < this.text.length) {
      const ch = this.text[this.pos];
      if (ch === " " || ch === "\t" || ch === "\r") {
        this.pos++;
      } else if (ch === "\n") {
        this.pos++;
        this.line++;
      } else if (ch === "#") {
        while (this.pos < this.text.length && this.text[this.pos] !== "\n") {
          this.pos++;
        }
      } else {
        break;
      }
    }
  }
}

// =============================================================================
// Serializer
// =============================================================================

class Serializer {
  constructor(
    private readonly alignColumns: boolean = false,
    private readonly delimiter: string = ' '
  ) {}

  serialize(doc: Document): string {
    const parts: string[] = [];

    for (const block of doc.blocks) {
      parts.push(this.serializeBlock(block));
    }

    return parts.join("\n\n");
  }

  private serializeBlock(block: Block): string {
    const lines: string[] = [];

    // Header
    lines.push(`${block.kind}.${block.name}`);

    // Fields with types
    const fieldDefs = block.fieldInfo.map(fi => {
      if (fi.type) {
        return `${fi.name}:${fi.type}`;
      }
      return fi.name;
    });
    lines.push(fieldDefs.join(this.delimiter));

    // Calculate column widths for alignment
    const widths = this.alignColumns ? this.calculateWidths(block) : [];

    // Data rows
    for (const row of block.rows) {
      lines.push(this.serializeRow(row, block.fields, widths));
    }

    // Summary separator and rows
    if (block.summaryRows.length > 0) {
      lines.push("---");
      for (const row of block.summaryRows) {
        lines.push(this.serializeRow(row, block.fields, widths));
      }
    }

    return lines.join("\n");
  }

  private calculateWidths(block: Block): number[] {
    const widths: number[] = block.fields.map(f => f.length);

    for (const row of [...block.rows, ...block.summaryRows]) {
      for (let i = 0; i < block.fields.length; i++) {
        const value = row[block.fields[i]];
        const str = this.serializeValue(value);
        widths[i] = Math.max(widths[i], str.length);
      }
    }

    return widths;
  }

  private serializeRow(row: Row, fields: string[], widths: number[]): string {
    const values: string[] = [];

    for (let i = 0; i < fields.length; i++) {
      let str = this.serializeValue(row[fields[i]]);
      if (this.alignColumns && widths.length > 0 && i < fields.length - 1) {
        str = str.padEnd(widths[i]);
      }
      values.push(str);
    }

    return values.join(this.delimiter);
  }

  private serializeValue(value: Value): string {
    if (value === null || value === undefined) {
      return "null";
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    if (typeof value === "number") {
      return value.toString();
    }
    if (value instanceof Reference) {
      return value.toIson();
    }
    // String
    return this.serializeString(value);
  }

  private serializeString(s: string): string {
    // Check if quoting is needed
    const needsQuotes =
      s.includes(" ") ||
      s.includes("\t") ||
      s.includes("\n") ||
      s.includes('"') ||
      s.includes("\\") ||
      s === "true" ||
      s === "false" ||
      s === "null" ||
      s.startsWith(":") ||
      /^-?\d+(\.\d+)?$/.test(s);

    if (!needsQuotes) {
      return s;
    }

    // Escape and quote
    let escaped = s
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t")
      .replace(/\r/g, "\\r");

    return `"${escaped}"`;
  }
}

// =============================================================================
// ISONL Parser/Serializer
// =============================================================================

class ISONLParser {
  parse(text: string): Document {
    const doc = new Document();
    const blockMap = new Map<string, Block>();

    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const parts = this.splitByPipe(trimmed);
      if (parts.length !== 3) {
        throw new ISONSyntaxError(`Invalid ISONL line: ${line}`);
      }

      const [header, fieldsPart, valuesPart] = parts;
      const dotIndex = header.indexOf(".");
      if (dotIndex === -1) {
        throw new ISONSyntaxError(`Invalid ISONL header: ${header}`);
      }

      const kind = header.substring(0, dotIndex);
      const name = header.substring(dotIndex + 1);
      const key = `${kind}.${name}`;

      let block = blockMap.get(key);
      if (!block) {
        block = new Block(kind, name);
        const fields = fieldsPart.trim().split(/\s+/);
        for (const f of fields) {
          const colonIdx = f.indexOf(":");
          if (colonIdx !== -1) {
            const fieldName = f.substring(0, colonIdx);
            const fieldType = f.substring(colonIdx + 1);
            block.fields.push(fieldName);
            block.fieldInfo.push({ name: fieldName, type: fieldType, isComputed: fieldType === "computed" });
          } else {
            block.fields.push(f);
            block.fieldInfo.push({ name: f, type: undefined, isComputed: false });
          }
        }
        blockMap.set(key, block);
        doc.blocks.push(block);
      }

      // Parse values
      const values = this.tokenizeValues(valuesPart);
      const row: Row = {};
      for (let i = 0; i < block.fields.length && i < values.length; i++) {
        row[block.fields[i]] = this.parseValue(values[i].token, values[i].wasQuoted);
      }
      block.rows.push(row);
    }

    return doc;
  }

  /**
   * Split an ISONL line on unquoted pipes.
   *
   * Quote-aware AND escape-aware: while inside quotes a backslash consumes
   * the following character as an escape pair, so a value ending in an
   * escaped backslash ("foo\\") cannot desync the quote tracking and let a
   * later '|' split the line in the wrong place.
   */
  private splitByPipe(line: string): string[] {
    const sections: string[] = [];
    let current = "";
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];

      if (inQuotes && char === "\\" && i + 1 < line.length) {
        // Consume the escape pair (both characters) so the next char is
        // never mistaken for a closing quote
        current += char + line[i + 1];
        i += 2;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        current += char;
      } else if (char === "|" && !inQuotes) {
        sections.push(current.trim());
        current = "";
      } else {
        current += char;
      }

      i++;
    }

    // Add the last section
    sections.push(current.trim());

    return sections;
  }

  private tokenizeValues(line: string): Array<{ token: string; wasQuoted: boolean }> {
    const tokens: Array<{ token: string; wasQuoted: boolean }> = [];
    let i = 0;

    while (i < line.length) {
      while (i < line.length && (line[i] === " " || line[i] === "\t")) i++;
      if (i >= line.length) break;

      if (line[i] === '"') {
        let result = "";
        i++;
        while (i < line.length && line[i] !== '"') {
          if (line[i] === "\\" && i + 1 < line.length) {
            const next = line[i + 1];
            switch (next) {
              case "n": result += "\n"; break;
              case "t": result += "\t"; break;
              case "r": result += "\r"; break;
              case "\\": result += "\\"; break;
              case '"': result += '"'; break;
              case "|": result += "|"; break;
              default: result += next;
            }
            i += 2;
          } else {
            result += line[i++];
          }
        }
        i++; // skip closing quote
        tokens.push({ token: result, wasQuoted: true });
      } else {
        const start = i;
        while (i < line.length && line[i] !== " " && line[i] !== "\t") i++;
        tokens.push({ token: line.substring(start, i), wasQuoted: false });
      }
    }

    return tokens;
  }

  private parseValue(token: string, wasQuoted: boolean): Value {
    // Quoted tokens are always literal strings — never re-interpreted as
    // null/bool/number/reference (otherwise "123" could not round-trip)
    if (wasQuoted) return token;
    if (token === "null" || token === "~") return null;
    if (token === "true") return true;
    if (token === "false") return false;
    if (token.startsWith(":")) {
      const parts = token.substring(1).split(":");
      if (parts.length === 1) return new Reference(parts[0]);
      return new Reference(parts[1], parts[0]);
    }
    if (/^-?\d+$/.test(token)) return parseInt(token, 10);
    if (/^-?\d+\.\d+$/.test(token)) return parseFloat(token);
    return token;
  }
}

class ISONLSerializer {
  // Characters that would corrupt the line structure if they appeared raw
  // in the envelope (kind, name, or field names): pipe, quote, backslash,
  // space, tab, newline, carriage return
  private static readonly ENVELOPE_FORBIDDEN = /[|"\\ \t\n\r]/;

  /**
   * Reject kind/name/fields that cannot survive an ISONL round-trip
   */
  private validateEnvelope(block: Block): void {
    const parts: Array<[string, string]> = [["kind", block.kind], ["name", block.name]];
    for (const [label, value] of parts) {
      if (!value) {
        throw new ISONSyntaxError(`ISONL block ${label} must be non-empty`);
      }
      if (ISONLSerializer.ENVELOPE_FORBIDDEN.test(value)) {
        throw new ISONSyntaxError(
          `ISONL block ${label} '${value}' contains characters that cannot be serialized (pipe, quote, backslash, or whitespace)`
        );
      }
    }
    if (block.kind.includes(".")) {
      throw new ISONSyntaxError(`ISONL block kind '${block.kind}' must not contain '.'`);
    }
    if (block.kind.startsWith("#")) {
      throw new ISONSyntaxError(`ISONL block kind '${block.kind}' must not start with '#'`);
    }
    for (const field of block.fields) {
      if (!field) {
        throw new ISONSyntaxError("ISONL field names must be non-empty");
      }
      if (ISONLSerializer.ENVELOPE_FORBIDDEN.test(field)) {
        throw new ISONSyntaxError(
          `ISONL field name '${field}' contains characters that cannot be serialized (pipe, quote, backslash, or whitespace)`
        );
      }
    }
  }

  serialize(doc: Document): string {
    const lines: string[] = [];

    for (const block of doc.blocks) {
      this.validateEnvelope(block);
      const header = `${block.kind}.${block.name}`;
      const fields = block.fieldInfo.map(fi => fi.type ? `${fi.name}:${fi.type}` : fi.name).join(" ");

      for (const row of block.rows) {
        const values = block.fields.map(f => this.serializeValue(row[f])).join(" ");
        lines.push(`${header}|${fields}|${values}`);
      }
    }

    return lines.join("\n");
  }

  private serializeValue(value: Value): string {
    if (value === null || value === undefined) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return value.toString();
    if (value instanceof Reference) return value.toIson();
    return this.quoteIfNeeded(value);
  }

  private quoteIfNeeded(s: string): string {
    if (s === "") return '""';

    const needsQuotes =
      s.includes(" ") ||
      s.includes("\t") ||
      s.includes("|") ||
      s.includes("\n") ||
      s.includes("\r") ||
      s.includes('"') ||
      s.includes("\\") ||
      s === "true" ||
      s === "false" ||
      s === "null" ||
      s.startsWith(":") ||
      /^-?\d+(\.\d+)?$/.test(s);

    if (!needsQuotes) return s;

    const escaped = s
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t")
      .replace(/\r/g, "\\r")
      .replace(/\|/g, "\\|");
    return `"${escaped}"`;
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Parse an ISON string into a Document
 */
export function parse(text: string): Document {
  return new Parser(text).parse();
}

/**
 * Parse an ISON string into a Document (alias for parse)
 */
export function loads(text: string): Document {
  return parse(text);
}

/**
 * Options for serialization
 */
export interface DumpsOptions {
  /** Whether to align columns with padding (default: false) */
  alignColumns?: boolean;
  /** Column delimiter (default: ' ') */
  delimiter?: string;
}

/**
 * Serialize a Document to an ISON string
 */
export function dumps(doc: Document, options: DumpsOptions | boolean = {}): string {
  // Handle legacy boolean parameter for backwards compatibility
  if (typeof options === 'boolean') {
    return new Serializer(options, ' ').serialize(doc);
  }
  const { alignColumns = false, delimiter = ' ' } = options;
  return new Serializer(alignColumns, delimiter).serialize(doc);
}

/**
 * Parse an ISONL string into a Document
 */
export function loadsIsonl(text: string): Document {
  return new ISONLParser().parse(text);
}

/**
 * Serialize a Document to an ISONL string
 */
export function dumpsIsonl(doc: Document): string {
  return new ISONLSerializer().serialize(doc);
}

/**
 * Convert ISON text to ISONL text
 */
export function isonToIsonl(isonText: string): string {
  const doc = parse(isonText);
  return dumpsIsonl(doc);
}

/**
 * Convert ISONL text to ISON text
 */
export function isonlToIson(isonlText: string): string {
  const doc = loadsIsonl(isonlText);
  return dumps(doc);
}

/**
 * Reorder fields for optimal LLM comprehension
 * Priority: id first, then name/title/label, then data fields, then *_id references
 */
function smartOrderFields(fields: string[]): string[] {
  const idFields: string[] = [];
  const nameFields: string[] = [];
  const refFields: string[] = [];
  const otherFields: string[] = [];

  const priorityNames = new Set(['name', 'title', 'label', 'description', 'display_name', 'full_name']);

  for (const field of fields) {
    const lowerField = field.toLowerCase();
    if (lowerField === 'id') {
      idFields.push(field);
    } else if (priorityNames.has(lowerField)) {
      nameFields.push(field);
    } else if (lowerField.endsWith('_id') && lowerField !== 'id') {
      refFields.push(field);
    } else {
      otherFields.push(field);
    }
  }

  return [...idFields, ...nameFields, ...otherFields, ...refFields];
}

/**
 * Options for fromDict
 */
export interface FromDictOptions {
  /** Block kind (default: 'table') */
  kind?: string;
  /** Auto-detect and convert foreign keys to References (default: false) */
  autoRefs?: boolean;
  /** Reorder columns for optimal LLM comprehension (default: false) */
  smartOrder?: boolean;
  /** Flatten nested objects into separate tables (default: true) */
  flatten?: boolean;
}

/**
 * Create a Document from a plain JavaScript object with recursive flattening
 */
export function fromDict(
  data: Record<string, any>,
  options: FromDictOptions | string = {}
): Document {
  // Handle legacy string parameter for backwards compatibility
  const opts: FromDictOptions = typeof options === 'string'
    ? { kind: options }
    : options;

  const { kind = 'table', autoRefs = false, smartOrder = false, flatten = true } = opts;
  const doc = new Document();
  const extraBlocks: Block[] = [];
  let refCounter = 1;

  // Helper: Check if value is a nested object (not array, not null)
  const isNestedObject = (val: any): boolean => {
    return val !== null && typeof val === 'object' && !Array.isArray(val);
  };

  // Helper: Check if value is an array of objects
  const isArrayOfObjects = (val: any): boolean => {
    return Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null && !Array.isArray(val[0]);
  };

  // Helper: Check if value is an array of primitives
  const isArrayOfPrimitives = (val: any): boolean => {
    return Array.isArray(val) && (val.length === 0 || typeof val[0] !== 'object');
  };

  // Helper: Check if value is an array of arrays
  const isArrayOfArrays = (val: any): boolean => {
    return Array.isArray(val) && val.length > 0 && Array.isArray(val[0]);
  };

  // Helper: Add or update an extra block
  const addToExtraBlock = (blockName: string, blockKind: string, fields: string[], row: Row) => {
    let existingBlock = extraBlocks.find(b => b.name === blockName);
    if (existingBlock) {
      // Add new fields if they don't exist
      for (const k of fields) {
        if (!existingBlock.fields.includes(k)) {
          existingBlock.fields.push(k);
          existingBlock.fieldInfo.push({ name: k, type: undefined, isComputed: false });
        }
      }
      existingBlock.rows.push(row);
    } else {
      const block = new Block(blockKind, blockName);
      block.fields = [...fields];
      block.fieldInfo = fields.map(f => ({ name: f, type: undefined, isComputed: false }));
      block.rows.push(row);
      extraBlocks.push(block);
    }
  };

  // Helper: Recursively flatten nested structures
  const flattenValue = (key: string, value: any, parentName: string, rowId: any, parentRef: Reference): { skip: boolean; value?: any } => {
    const nestedName = `${parentName}_${key}`;

    if (isNestedObject(value)) {
      // Nested object - create separate block and recurse
      const nestedRow: Row = {};
      nestedRow[`${parentName}_id`] = parentRef;

      const nestedFields = [`${parentName}_id`];

      for (const [nk, nv] of Object.entries(value)) {
        if (isNestedObject(nv) || isArrayOfObjects(nv) || isArrayOfPrimitives(nv)) {
          // Recurse for deeper nesting
          flattenValue(nk, nv, nestedName, rowId, parentRef);
        } else {
          nestedRow[nk] = nv as Value;
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
        const nestedRow: Row = {};
        nestedRow[`${parentName}_id`] = parentRef;
        const nestedFields = [`${parentName}_id`];

        for (const [nk, nv] of Object.entries(item)) {
          if (isNestedObject(nv) || isArrayOfObjects(nv) || isArrayOfPrimitives(nv)) {
            // Recurse for deeper nesting
            flattenValue(nk, nv, nestedName, rowId, parentRef);
          } else {
            nestedRow[nk] = nv as Value;
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
        const nestedRow: Row = {};
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
  const flattenRow = (row: any, parentName: string, rowId: any): Row => {
    const flatRow: Row = {};
    const parentRef = new Reference(String(rowId));

    for (const [key, value] of Object.entries(row)) {
      if (flatten && (isNestedObject(value) || isArrayOfObjects(value) || isArrayOfPrimitives(value))) {
        const result = flattenValue(key, value, parentName, rowId, parentRef);
        if (!result.skip) {
          flatRow[key] = result.value;
        }
        // Skip - field is flattened to separate table
      } else if (value === null || value === undefined) {
        flatRow[key] = null;
      } else {
        flatRow[key] = value as Value;
      }
    }

    return flatRow;
  };

  // Process main data
  for (const [name, content] of Object.entries(data)) {
    let blockKind: string;
    let fields: string[];
    let rows: Row[];

    if (Array.isArray(content)) {
      if (isArrayOfArrays(content)) {
        // Array of arrays - create table with generated column names
        const maxCols = Math.max(...content.map(row => row.length));

        // Generate column names: col1, col2, col3...
        fields = Array.from({ length: maxCols }, (_, i) => `col${i + 1}`);
        rows = content.map(row => {
          const obj: Row = {};
          fields.forEach((f, i) => obj[f] = row[i] !== undefined ? row[i] : null);
          return obj;
        });
        blockKind = 'table';

      } else if (content.length > 0 && typeof content[0] === 'object' && content[0] !== null) {
        // Table: array of objects
        const fieldSet = new Set<string>();
        const processedRows: Row[] = [];

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

    // Apply smart ordering if enabled
    if (smartOrder) {
      fields = smartOrderFields(fields);
    }

    if (fields.length > 0 && rows.length > 0) {
      const block = new Block(blockKind, name);
      block.fields = fields;
      block.fieldInfo = fields.map(f => ({ name: f, type: undefined, isComputed: false }));
      block.rows = rows;
      doc.blocks.push(block);
    }
  }

  // Add extra blocks from flattened nested structures
  for (const block of extraBlocks) {
    doc.blocks.push(block);
  }

  return doc;
}

// Type guards
export function isNull(value: Value): value is null {
  return value === null;
}

export function isBool(value: Value): value is boolean {
  return typeof value === "boolean";
}

export function isInt(value: Value): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function isFloat(value: Value): value is number {
  return typeof value === "number";
}

export function isString(value: Value): value is string {
  return typeof value === "string";
}

export function isReference(value: Value): value is Reference {
  return value instanceof Reference;
}

// Re-export validation module
export * as validation from './validation';
