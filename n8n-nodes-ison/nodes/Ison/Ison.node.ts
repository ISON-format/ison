import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

// ISON Parser - inline implementation for n8n compatibility
// This avoids external dependency issues in n8n environment

interface ISONBlock {
	kind: string;
	name: string;
	fields: string[];
	rows: Record<string, any>[];
}

interface ISONDocument {
	blocks: ISONBlock[];
}

function parseISON(text: string): ISONDocument {
	const doc: ISONDocument = { blocks: [] };
	let currentBlock: ISONBlock | null = null;

	const lines = text.split('\n');
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		if (trimmed === '---') continue;

		// Block header: table.name or object.name
		// Name comes after the first dot and may itself contain dots
		const blockMatch = trimmed.match(/^(table|object|list)\.(\S+)$/);
		if (blockMatch) {
			if (currentBlock) {
				doc.blocks.push(currentBlock);
			}
			currentBlock = {
				kind: blockMatch[1],
				name: blockMatch[2],
				fields: [],
				rows: [],
			};
			continue;
		}

		if (!currentBlock) continue;

		// First line after block header = field definitions
		if (currentBlock.fields.length === 0) {
			currentBlock.fields = trimmed.split(/\s+/).map(f => f.split(':')[0]);
		} else {
			// Data row
			const tokens = stripInlineComment(parseValues(trimmed));
			checkExtraTokens(tokens, currentBlock.fields.length);
			const row: Record<string, any> = {};
			currentBlock.fields.forEach((field, i) => {
				row[field] = i < tokens.length ? tokens[i].value : null;
			});
			currentBlock.rows.push(row);
		}
	}

	if (currentBlock) {
		doc.blocks.push(currentBlock);
	}

	return doc;
}

// Escape sequences recognized inside quoted strings
const ESCAPE_MAP: Record<string, string> = {
	'"': '"',
	'\\': '\\',
	n: '\n',
	t: '\t',
	r: '\r',
	'|': '|',
};

interface ValueToken {
	// Typed value (quoted tokens stay verbatim strings, unquoted are inferred)
	value: any;
	// Raw token text (unescaped content for quoted tokens)
	raw: string;
	// Whether the token started with a quote — quoted tokens are always data
	quoted: boolean;
}

function parseValues(line: string): ValueToken[] {
	const tokens: ValueToken[] = [];
	let current = '';
	let inQuotes = false;
	let quoteChar = '';
	let tokenQuoted = false;

	const pushToken = () => {
		if (current || tokenQuoted) {
			tokens.push({
				value: tokenQuoted ? current : parseValue(current),
				raw: current,
				quoted: tokenQuoted,
			});
		}
		current = '';
		tokenQuoted = false;
	};

	for (let i = 0; i < line.length; i++) {
		const char = line[i];

		if (inQuotes) {
			if (char === '\\' && i + 1 < line.length) {
				const next = line[++i];
				// Unknown escapes keep the character as-is
				current += ESCAPE_MAP[next] ?? next;
			} else if (char === quoteChar) {
				inQuotes = false;
			} else {
				current += char;
			}
		} else if (char === '"' || char === "'") {
			inQuotes = true;
			quoteChar = char;
			// Only a quote at the start of a token marks it as quoted data
			if (current === '') {
				tokenQuoted = true;
			}
		} else if (char === ' ' || char === '\t') {
			pushToken();
		} else {
			current += char;
		}
	}

	pushToken();

	return tokens;
}

// An unquoted token whose first character is '#' begins an inline comment:
// it and every token after it are discarded. Quoted tokens are always data.
function stripInlineComment(tokens: ValueToken[]): ValueToken[] {
	for (let i = 0; i < tokens.length; i++) {
		if (!tokens[i].quoted && tokens[i].raw.startsWith('#')) {
			return tokens.slice(0, i);
		}
	}
	return tokens;
}

// Reject rows with more values than fields instead of silently truncating
function checkExtraTokens(tokens: ValueToken[], fieldCount: number): void {
	if (tokens.length <= fieldCount) return;
	throw new Error(
		`Row has ${tokens.length} values but only ${fieldCount} fields ` +
			`(extra value: ${JSON.stringify(tokens[fieldCount].raw)})`,
	);
}

function parseValue(str: string): any {
	if (str === 'null' || str === '~') return null;
	if (str === 'true') return true;
	if (str === 'false') return false;
	if (str.startsWith(':')) {
		// Reference - return as object
		const parts = str.slice(1).split(':');
		if (parts.length === 1) {
			return { _ref: parts[0] };
		} else {
			return { _ref: parts[1], _type: parts[0] };
		}
	}
	const num = Number(str);
	if (!isNaN(num)) return num;
	return str;
}

function isonToJson(doc: ISONDocument): Record<string, any[]> {
	const result: Record<string, any[]> = {};
	for (const block of doc.blocks) {
		result[block.name] = block.rows;
	}
	return result;
}

function jsonToIson(data: Record<string, any[]>): string {
	const lines: string[] = [];

	for (const [name, records] of Object.entries(data)) {
		if (!Array.isArray(records) || records.length === 0) continue;

		lines.push(`table.${name}`);

		// Get fields from first record
		const fields = Object.keys(records[0]);
		lines.push(fields.join(' '));

		// Add data rows
		for (const record of records) {
			const values = fields.map(f => formatValue(record[f]));
			lines.push(values.join(' '));
		}

		lines.push('');
	}

	return lines.join('\n').trim();
}

function formatValue(value: any, isonl = false): string {
	if (value === null || value === undefined) return 'null';
	if (typeof value === 'boolean') return value.toString();
	if (typeof value === 'number') return value.toString();
	if (typeof value === 'object' && value._ref) {
		// Reference
		if (value._type) {
			return `:${value._type}:${value._ref}`;
		}
		return `:${value._ref}`;
	}
	if (typeof value === 'string') {
		return quoteIfNeeded(value, isonl);
	}
	return quoteIfNeeded(JSON.stringify(value), isonl);
}

function quoteIfNeeded(value: string, isonl: boolean): string {
	if (value === '') return '""';

	// CR and backslash would be emitted raw and corrupt on re-parse; a leading
	// '#' would turn the value into an inline comment and silently lose data
	let needsQuote =
		value.includes(' ') ||
		value.includes('\t') ||
		value.includes('"') ||
		value.includes('\n') ||
		value.includes('\r') ||
		value.includes('\\') ||
		value.startsWith('#') ||
		value === 'true' ||
		value === 'false' ||
		value === 'null' ||
		value.startsWith(':') ||
		!isNaN(Number(value));

	if (isonl) {
		// Pipe would corrupt the single-line pipe structure
		needsQuote = needsQuote || value.includes('|');
	}

	if (!needsQuote) return value;

	let escaped = value
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\n/g, '\\n')
		.replace(/\t/g, '\\t')
		.replace(/\r/g, '\\r');
	if (isonl) {
		escaped = escaped.replace(/\|/g, '\\|');
	}
	return `"${escaped}"`;
}

function splitIsonlSections(line: string): string[] {
	// Split on unquoted pipes, escape-aware: consume escape pairs inside quotes
	// so an escaped backslash before a closing quote ("foo\\") cannot desync
	// the quote tracking and let a later | split sections wrongly
	const sections: string[] = [];
	let current = '';
	let inQuotes = false;
	let i = 0;

	while (i < line.length) {
		const char = line[i];

		if (inQuotes && char === '\\' && i + 1 < line.length) {
			current += char + line[i + 1];
			i += 2;
			continue;
		}

		if (char === '"') {
			inQuotes = !inQuotes;
			current += char;
		} else if (char === '|' && !inQuotes) {
			sections.push(current.trim());
			current = '';
		} else {
			current += char;
		}

		i++;
	}

	sections.push(current.trim());
	return sections;
}

function parseISONL(text: string): any[] {
	const results: any[] = [];

	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;

		// Format: table.name|field1 field2|value1 value2
		const parts = splitIsonlSections(trimmed);
		if (parts.length !== 3) continue;

		// Header splits on the first dot, so block names may contain dots
		const blockMatch = parts[0].match(/^(table|object|list)\.(.+)$/);
		if (!blockMatch) continue;

		const blockName = blockMatch[2];
		const fields = parts[1].split(/\s+/).map(f => f.split(':')[0]);
		const tokens = stripInlineComment(parseValues(parts[2]));
		checkExtraTokens(tokens, fields.length);

		const row: Record<string, any> = { _block: blockName };
		fields.forEach((field, i) => {
			row[field] = i < tokens.length ? tokens[i].value : null;
		});

		results.push(row);
	}

	return results;
}

// Characters that would corrupt the line structure if they appeared raw in
// the envelope (kind, name, or field names)
const ISONL_ENVELOPE_FORBIDDEN = /[|"\\ \t\n\r]/;

function validateIsonlEnvelope(kind: string, name: string, fields: string[]): void {
	for (const [label, value] of [['kind', kind], ['name', name]]) {
		if (!value) {
			throw new Error(`ISONL block ${label} must be non-empty`);
		}
		if (ISONL_ENVELOPE_FORBIDDEN.test(value)) {
			throw new Error(
				`ISONL block ${label} "${value}" contains characters that cannot be serialized (pipe, quote, backslash, or whitespace)`,
			);
		}
	}
	if (kind.includes('.')) {
		throw new Error(`ISONL block kind "${kind}" must not contain '.'`);
	}
	if (kind.startsWith('#')) {
		throw new Error(`ISONL block kind "${kind}" must not start with '#'`);
	}
	for (const field of fields) {
		if (!field) {
			throw new Error('ISONL field names must be non-empty');
		}
		if (ISONL_ENVELOPE_FORBIDDEN.test(field)) {
			throw new Error(
				`ISONL field name "${field}" contains characters that cannot be serialized (pipe, quote, backslash, or whitespace)`,
			);
		}
	}
}

function jsonToIsonl(data: Record<string, any[]>): string {
	const lines: string[] = [];

	for (const [name, records] of Object.entries(data)) {
		if (!Array.isArray(records) || records.length === 0) continue;

		const fields = Object.keys(records[0]);
		validateIsonlEnvelope('table', name, fields);
		const fieldsStr = fields.join(' ');

		for (const record of records) {
			const values = fields.map(f => formatValue(record[f], true));
			lines.push(`table.${name}|${fieldsStr}|${values.join(' ')}`);
		}
	}

	return lines.join('\n');
}

function countTokens(text: string): number {
	// Approximate token count (~4 chars per token)
	return Math.ceil(text.length / 4);
}

export class Ison implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ISON',
		name: 'ison',
		icon: 'file:ison.png',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Convert between ISON and JSON formats - token-efficient data for LLMs',
		defaults: {
			name: 'ISON',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Parse ISON',
						value: 'parseIson',
						description: 'Parse ISON text to JSON',
						action: 'Parse ISON text to JSON',
					},
					{
						name: 'Convert to ISON',
						value: 'toIson',
						description: 'Convert JSON to ISON format',
						action: 'Convert JSON to ISON format',
					},
					{
						name: 'Parse ISONL',
						value: 'parseIsonl',
						description: 'Parse ISONL (streaming) to JSON array',
						action: 'Parse ISONL streaming to JSON array',
					},
					{
						name: 'Convert to ISONL',
						value: 'toIsonl',
						description: 'Convert JSON to ISONL streaming format',
						action: 'Convert JSON to ISONL streaming format',
					},
					{
						name: 'Count Tokens',
						value: 'countTokens',
						description: 'Count tokens and compare ISON vs JSON',
						action: 'Count tokens and compare ISON vs JSON',
					},
				],
				default: 'parseIson',
			},
			// Parse ISON options
			{
				displayName: 'ISON Text',
				name: 'isonText',
				type: 'string',
				typeOptions: {
					rows: 10,
				},
				default: '',
				placeholder: `table.users
id name email
1 Alice alice@example.com
2 Bob bob@example.com`,
				description: 'The ISON text to parse',
				displayOptions: {
					show: {
						operation: ['parseIson'],
					},
				},
			},
			// Convert to ISON options
			{
				displayName: 'JSON Data',
				name: 'jsonData',
				type: 'json',
				default: '{}',
				description: 'JSON object with arrays to convert to ISON',
				displayOptions: {
					show: {
						operation: ['toIson'],
					},
				},
			},
			{
				displayName: 'Use Input Data',
				name: 'useInputData',
				type: 'boolean',
				default: true,
				description: 'Whether to use incoming data instead of JSON Data field',
				displayOptions: {
					show: {
						operation: ['toIson'],
					},
				},
			},
			// Parse ISONL options
			{
				displayName: 'ISONL Text',
				name: 'isonlText',
				type: 'string',
				typeOptions: {
					rows: 10,
				},
				default: '',
				placeholder: `table.users|id name|1 Alice
table.users|id name|2 Bob`,
				description: 'The ISONL text to parse (one record per line)',
				displayOptions: {
					show: {
						operation: ['parseIsonl'],
					},
				},
			},
			// Convert to ISONL options
			{
				displayName: 'JSON Data',
				name: 'jsonDataIsonl',
				type: 'json',
				default: '{}',
				description: 'JSON object with arrays to convert to ISONL',
				displayOptions: {
					show: {
						operation: ['toIsonl'],
					},
				},
			},
			{
				displayName: 'Use Input Data',
				name: 'useInputDataIsonl',
				type: 'boolean',
				default: true,
				description: 'Whether to use incoming data instead of JSON Data field',
				displayOptions: {
					show: {
						operation: ['toIsonl'],
					},
				},
			},
			// Count Tokens options
			{
				displayName: 'Text',
				name: 'tokenText',
				type: 'string',
				typeOptions: {
					rows: 10,
				},
				default: '',
				description: 'Text to count tokens (ISON or JSON)',
				displayOptions: {
					show: {
						operation: ['countTokens'],
					},
				},
			},
			{
				displayName: 'Compare With JSON',
				name: 'compareJson',
				type: 'boolean',
				default: true,
				description: 'Whether to compare token count with JSON equivalent',
				displayOptions: {
					show: {
						operation: ['countTokens'],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let result: any;

				switch (operation) {
					case 'parseIson': {
						const isonText = this.getNodeParameter('isonText', i) as string;
						const doc = parseISON(isonText);
						result = isonToJson(doc);
						break;
					}

					case 'toIson': {
						const useInputData = this.getNodeParameter('useInputData', i) as boolean;
						let jsonData: Record<string, any[]>;

						if (useInputData) {
							// Use input item data
							const inputData = items[i].json;
							// Wrap in object if it's an array
							if (Array.isArray(inputData)) {
								jsonData = { data: inputData };
							} else {
								jsonData = inputData as Record<string, any[]>;
							}
						} else {
							const jsonStr = this.getNodeParameter('jsonData', i) as string;
							jsonData = JSON.parse(jsonStr);
						}

						const isonText = jsonToIson(jsonData);
						result = { ison: isonText };
						break;
					}

					case 'parseIsonl': {
						const isonlText = this.getNodeParameter('isonlText', i) as string;
						const records = parseISONL(isonlText);
						result = { records };
						break;
					}

					case 'toIsonl': {
						const useInputData = this.getNodeParameter('useInputDataIsonl', i) as boolean;
						let jsonData: Record<string, any[]>;

						if (useInputData) {
							const inputData = items[i].json;
							if (Array.isArray(inputData)) {
								jsonData = { data: inputData };
							} else {
								jsonData = inputData as Record<string, any[]>;
							}
						} else {
							const jsonStr = this.getNodeParameter('jsonDataIsonl', i) as string;
							jsonData = JSON.parse(jsonStr);
						}

						const isonlText = jsonToIsonl(jsonData);
						result = { isonl: isonlText };
						break;
					}

					case 'countTokens': {
						const text = this.getNodeParameter('tokenText', i) as string;
						const compareJson = this.getNodeParameter('compareJson', i) as boolean;

						const tokens = countTokens(text);
						result = {
							tokens,
							characters: text.length,
						};

						if (compareJson) {
							// Try to parse as ISON and convert to JSON for comparison
							try {
								const doc = parseISON(text);
								const jsonData = isonToJson(doc);
								const jsonText = JSON.stringify(jsonData, null, 2);
								const jsonTokens = countTokens(jsonText);
								const savings = Math.round((1 - tokens / jsonTokens) * 100);

								result.jsonTokens = jsonTokens;
								result.savings = `${savings}%`;
								result.jsonEquivalent = jsonText;
							} catch {
								// If not valid ISON, just return token count
							}
						}
						break;
					}

					default:
						throw new NodeOperationError(
							this.getNode(),
							`Unknown operation: ${operation}`,
						);
				}

				returnData.push({ json: result });
			} catch (error: any) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
						},
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), error.message, {
					itemIndex: i,
				});
			}
		}

		return [returnData];
	}
}
