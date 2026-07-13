// Package ison provides a parser and serializer for the ISON (Interchange Simple Object Notation) format.
// ISON is a minimal, token-efficient data format optimized for LLMs and Agentic AI workflows.
package ison

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Version is the current version of the ison-go package
const Version = "1.0.1"

// ValueType represents the type of an ISON value
type ValueType int

const (
	TypeNull ValueType = iota
	TypeBool
	TypeInt
	TypeFloat
	TypeString
	TypeReference
)

// Reference represents an ISON reference (e.g., :1, :user:42, :OWNS:5)
type Reference struct {
	ID           string
	Namespace    string
	Relationship string
}

// ToISON converts the reference back to ISON format
func (r Reference) ToISON() string {
	if r.Relationship != "" {
		return fmt.Sprintf(":%s:%s", r.Relationship, r.ID)
	}
	if r.Namespace != "" {
		return fmt.Sprintf(":%s:%s", r.Namespace, r.ID)
	}
	return fmt.Sprintf(":%s", r.ID)
}

// IsRelationship returns true if this is a relationship reference (uppercase namespace)
func (r Reference) IsRelationship() bool {
	return r.Relationship != ""
}

// GetNamespace returns the namespace or relationship name
func (r Reference) GetNamespace() string {
	if r.Relationship != "" {
		return r.Relationship
	}
	return r.Namespace
}

// String returns the string representation of the reference
func (r Reference) String() string {
	return r.ToISON()
}

// MarshalJSON implements json.Marshaler for Reference
func (r Reference) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]interface{}{
		"_ref":         r.ID,
		"_namespace":   r.Namespace,
		"_relationship": r.Relationship,
	})
}

// Value represents an ISON value which can be null, bool, int, float, string, or reference
type Value struct {
	Type      ValueType
	BoolVal   bool
	IntVal    int64
	FloatVal  float64
	StringVal string
	RefVal    Reference
}

// Null creates a null Value
func Null() Value {
	return Value{Type: TypeNull}
}

// Bool creates a boolean Value
func Bool(v bool) Value {
	return Value{Type: TypeBool, BoolVal: v}
}

// Int creates an integer Value
func Int(v int64) Value {
	return Value{Type: TypeInt, IntVal: v}
}

// Float creates a float Value
func Float(v float64) Value {
	return Value{Type: TypeFloat, FloatVal: v}
}

// String creates a string Value
func String(v string) Value {
	return Value{Type: TypeString, StringVal: v}
}

// Ref creates a reference Value
func Ref(r Reference) Value {
	return Value{Type: TypeReference, RefVal: r}
}

// IsNull returns true if the value is null
func (v Value) IsNull() bool {
	return v.Type == TypeNull
}

// AsBool returns the boolean value
func (v Value) AsBool() (bool, bool) {
	if v.Type == TypeBool {
		return v.BoolVal, true
	}
	return false, false
}

// AsInt returns the integer value
func (v Value) AsInt() (int64, bool) {
	if v.Type == TypeInt {
		return v.IntVal, true
	}
	return 0, false
}

// AsFloat returns the float value
func (v Value) AsFloat() (float64, bool) {
	if v.Type == TypeFloat {
		return v.FloatVal, true
	}
	if v.Type == TypeInt {
		return float64(v.IntVal), true
	}
	return 0, false
}

// AsString returns the string value
func (v Value) AsString() (string, bool) {
	if v.Type == TypeString {
		return v.StringVal, true
	}
	return "", false
}

// AsRef returns the reference value
func (v Value) AsRef() (Reference, bool) {
	if v.Type == TypeReference {
		return v.RefVal, true
	}
	return Reference{}, false
}

// Interface returns the Go interface{} representation of the value
func (v Value) Interface() interface{} {
	switch v.Type {
	case TypeNull:
		return nil
	case TypeBool:
		return v.BoolVal
	case TypeInt:
		return v.IntVal
	case TypeFloat:
		return v.FloatVal
	case TypeString:
		return v.StringVal
	case TypeReference:
		return v.RefVal
	default:
		return nil
	}
}

// ToISON converts the value to its ISON string representation
func (v Value) ToISON() string {
	switch v.Type {
	case TypeNull:
		return "~"
	case TypeBool:
		if v.BoolVal {
			return "true"
		}
		return "false"
	case TypeInt:
		return strconv.FormatInt(v.IntVal, 10)
	case TypeFloat:
		return strconv.FormatFloat(v.FloatVal, 'f', -1, 64)
	case TypeString:
		if strings.ContainsAny(v.StringVal, " \t\n\"") || v.StringVal == "" {
			escaped := strings.ReplaceAll(v.StringVal, "\\", "\\\\")
			escaped = strings.ReplaceAll(escaped, "\"", "\\\"")
			escaped = strings.ReplaceAll(escaped, "\n", "\\n")
			escaped = strings.ReplaceAll(escaped, "\t", "\\t")
			return fmt.Sprintf("\"%s\"", escaped)
		}
		return v.StringVal
	case TypeReference:
		return v.RefVal.ToISON()
	default:
		return "~"
	}
}

// MarshalJSON implements json.Marshaler for Value
func (v Value) MarshalJSON() ([]byte, error) {
	return json.Marshal(v.Interface())
}

// FieldInfo represents information about a field/column in an ISON block
type FieldInfo struct {
	Name     string
	TypeHint string // "int", "float", "bool", "string", "ref", "computed", or ""
}

// Row represents a single row in an ISON block
type Row map[string]Value

// Block represents an ISON block (table or object)
type Block struct {
	Kind       string      // "table", "object", or "meta"
	Name       string      // Block name (e.g., "users", "config")
	Fields     []FieldInfo // Field definitions in order
	Rows       []Row       // Data rows
	SummaryRow Row         // Summary row after ---
}

// NewBlock creates a new Block with the given kind and name
func NewBlock(kind, name string) *Block {
	return &Block{
		Kind:   kind,
		Name:   name,
		Fields: []FieldInfo{},
		Rows:   []Row{},
	}
}

// AddField adds a field to the block
func (b *Block) AddField(name, typeHint string) {
	b.Fields = append(b.Fields, FieldInfo{Name: name, TypeHint: typeHint})
}

// AddRow adds a row to the block
func (b *Block) AddRow(row Row) {
	b.Rows = append(b.Rows, row)
}

// GetFieldNames returns the field names in order
func (b *Block) GetFieldNames() []string {
	names := make([]string, len(b.Fields))
	for i, f := range b.Fields {
		names[i] = f.Name
	}
	return names
}

// ToDict converts the block to a map representation
func (b *Block) ToDict() map[string]interface{} {
	result := map[string]interface{}{
		"kind": b.Kind,
		"name": b.Name,
	}

	// Fields with type hints
	fields := make([]map[string]interface{}, len(b.Fields))
	for i, f := range b.Fields {
		fields[i] = map[string]interface{}{
			"name":     f.Name,
			"typeHint": f.TypeHint,
		}
	}
	result["fields"] = fields

	// Rows as list of maps
	rows := make([]map[string]interface{}, len(b.Rows))
	for i, row := range b.Rows {
		rowMap := make(map[string]interface{})
		for k, v := range row {
			rowMap[k] = v.Interface()
		}
		rows[i] = rowMap
	}
	result["rows"] = rows

	if b.SummaryRow != nil {
		summary := make(map[string]interface{})
		for k, v := range b.SummaryRow {
			summary[k] = v.Interface()
		}
		result["summary"] = summary
	}

	return result
}

// Document represents a parsed ISON document containing multiple blocks
type Document struct {
	Blocks map[string]*Block
	Order  []string // Block names in order of appearance
}

// NewDocument creates a new empty Document
func NewDocument() *Document {
	return &Document{
		Blocks: make(map[string]*Block),
		Order:  []string{},
	}
}

// AddBlock adds a block to the document
func (d *Document) AddBlock(block *Block) {
	if _, exists := d.Blocks[block.Name]; !exists {
		d.Order = append(d.Order, block.Name)
	}
	d.Blocks[block.Name] = block
}

// Get returns a block by name
func (d *Document) Get(name string) (*Block, bool) {
	block, ok := d.Blocks[name]
	return block, ok
}

// ToDict converts the document to a map representation
func (d *Document) ToDict() map[string]interface{} {
	result := make(map[string]interface{})
	for name, block := range d.Blocks {
		result[name] = block.ToDict()
	}
	return result
}

// ToJSON converts the document to JSON
func (d *Document) ToJSON() (string, error) {
	result := make(map[string]interface{})
	for name, block := range d.Blocks {
		rows := make([]map[string]interface{}, len(block.Rows))
		for i, row := range block.Rows {
			rowMap := make(map[string]interface{})
			for k, v := range row {
				rowMap[k] = v.Interface()
			}
			rows[i] = rowMap
		}
		result[name] = rows
	}
	bytes, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// Parser handles parsing ISON text into Document structures
type Parser struct {
	text  string
	lines []string
	pos   int
}

// Parse parses an ISON string into a Document
func Parse(text string) (*Document, error) {
	p := &Parser{
		text:  text,
		lines: splitLines(text),
		pos:   0,
	}
	return p.parse()
}

// Load loads and parses an ISON file
func Load(path string) (*Document, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return Parse(string(data))
}

// DumpsOptions configures serialization behavior
type DumpsOptions struct {
	AlignColumns bool   // Pad columns for visual alignment
	Delimiter    string // Column separator (default: " ")
}

// DefaultDumpsOptions returns default serialization options
func DefaultDumpsOptions() DumpsOptions {
	return DumpsOptions{
		AlignColumns: false,
		Delimiter:    " ",
	}
}

// Dump serializes a Document and writes it to a file
func Dump(doc *Document, path string) error {
	text := Dumps(doc)
	return os.WriteFile(path, []byte(text), 0644)
}

// DumpWithOptions serializes a Document with options and writes to a file
func DumpWithOptions(doc *Document, path string, opts DumpsOptions) error {
	text := DumpsWithOptions(doc, opts)
	return os.WriteFile(path, []byte(text), 0644)
}

func splitLines(text string) []string {
	lines := strings.Split(text, "\n")
	result := []string{}
	for _, line := range lines {
		result = append(result, strings.TrimRight(line, "\r"))
	}
	return result
}

func (p *Parser) parse() (*Document, error) {
	doc := NewDocument()

	for p.pos < len(p.lines) {
		line := strings.TrimSpace(p.lines[p.pos])

		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			p.pos++
			continue
		}

		// Check for block header
		if strings.Contains(line, ".") && !strings.HasPrefix(line, "\"") {
			parts := strings.SplitN(line, ".", 2)
			if len(parts) == 2 && isValidKind(parts[0]) {
				block, err := p.parseBlock(parts[0], parts[1])
				if err != nil {
					return nil, err
				}
				doc.AddBlock(block)
				continue
			}
		}

		p.pos++
	}

	return doc, nil
}

func isValidKind(kind string) bool {
	return kind == "table" || kind == "object" || kind == "meta"
}

func (p *Parser) parseBlock(kind, name string) (*Block, error) {
	block := NewBlock(kind, name)
	p.pos++

	// Parse field definitions (next non-empty, non-comment line)
	for p.pos < len(p.lines) {
		line := strings.TrimSpace(p.lines[p.pos])
		if line == "" || strings.HasPrefix(line, "#") {
			p.pos++
			continue
		}
		break
	}

	if p.pos >= len(p.lines) {
		return block, nil
	}

	// Parse fields
	fieldsLine := strings.TrimSpace(p.lines[p.pos])
	fields := tokenizeLine(fieldsLine)
	for _, field := range fields {
		name, typeHint := parseFieldDef(field)
		block.AddField(name, typeHint)
	}
	p.pos++

	// Parse rows
	inSummary := false
	for p.pos < len(p.lines) {
		line := strings.TrimSpace(p.lines[p.pos])

		// Empty line ends block
		if line == "" {
			p.pos++
			break
		}

		// Comment
		if strings.HasPrefix(line, "#") {
			p.pos++
			continue
		}

		// New block starts
		if strings.Contains(line, ".") && !strings.HasPrefix(line, "\"") {
			parts := strings.SplitN(line, ".", 2)
			if len(parts) == 2 && isValidKind(parts[0]) {
				break
			}
		}

		// Summary separator
		if line == "---" {
			inSummary = true
			p.pos++
			continue
		}

		// Parse row
		tokens := tokenizeLine(line)
		row := make(Row)
		for i, token := range tokens {
			if i < len(block.Fields) {
				fieldInfo := block.Fields[i]
				value := parseValue(token, fieldInfo.TypeHint)
				row[fieldInfo.Name] = value
			}
		}

		if inSummary {
			block.SummaryRow = row
		} else {
			block.AddRow(row)
		}
		p.pos++
	}

	return block, nil
}

func parseFieldDef(field string) (name, typeHint string) {
	if idx := strings.Index(field, ":"); idx > 0 {
		return field[:idx], field[idx+1:]
	}
	return field, ""
}

func tokenizeLine(line string) []string {
	tokens, _ := tokenizeLineWithQuotes(line)
	return tokens
}

// tokenizeLineWithQuotes tokenizes a line and also reports, per token, whether
// it was quoted. Quoting information lets the ISONL parser keep quoted tokens
// like "123" or "true" as strings instead of re-inferring their type.
func tokenizeLineWithQuotes(line string) ([]string, []bool) {
	tokens := []string{}
	quoted := []bool{}
	current := strings.Builder{}
	inQuotes := false
	escaped := false
	tokenQuoted := false

	flush := func() {
		tokens = append(tokens, current.String())
		quoted = append(quoted, tokenQuoted)
		current.Reset()
		tokenQuoted = false
	}

	for i := 0; i < len(line); i++ {
		ch := line[i]

		if escaped {
			switch ch {
			case 'n':
				current.WriteByte('\n')
			case 't':
				current.WriteByte('\t')
			case 'r':
				current.WriteByte('\r')
			case '"':
				current.WriteByte('"')
			case '\\':
				current.WriteByte('\\')
			case '|':
				current.WriteByte('|')
			default:
				current.WriteByte(ch)
			}
			escaped = false
			continue
		}

		if ch == '\\' && inQuotes {
			escaped = true
			continue
		}

		if ch == '"' {
			inQuotes = !inQuotes
			tokenQuoted = true
			continue
		}

		if !inQuotes && (ch == ' ' || ch == '\t') {
			if tokenQuoted || current.Len() > 0 {
				flush()
			}
			continue
		}

		current.WriteByte(ch)
	}

	if tokenQuoted || current.Len() > 0 {
		flush()
	}

	return tokens, quoted
}

var refPattern = regexp.MustCompile(`^:([A-Z_]+):(.+)$|^:([a-z_][a-z0-9_]*):(.+)$|^:(.+)$`)

func parseValue(token string, typeHint string) Value {
	// Null
	if token == "~" || token == "null" || token == "NULL" {
		return Null()
	}

	// Boolean
	if token == "true" || token == "TRUE" {
		return Bool(true)
	}
	if token == "false" || token == "FALSE" {
		return Bool(false)
	}

	// Reference
	if strings.HasPrefix(token, ":") {
		ref := parseReference(token)
		return Ref(ref)
	}

	// Type hint handling
	switch typeHint {
	case "int":
		if v, err := strconv.ParseInt(token, 10, 64); err == nil {
			return Int(v)
		}
	case "float":
		if v, err := strconv.ParseFloat(token, 64); err == nil {
			return Float(v)
		}
	case "bool":
		if token == "true" || token == "1" {
			return Bool(true)
		}
		if token == "false" || token == "0" {
			return Bool(false)
		}
	case "string":
		return String(token)
	case "ref":
		if strings.HasPrefix(token, ":") {
			return Ref(parseReference(token))
		}
		return String(token)
	}

	// Auto-inference
	// Try integer
	if v, err := strconv.ParseInt(token, 10, 64); err == nil {
		return Int(v)
	}

	// Try float
	if v, err := strconv.ParseFloat(token, 64); err == nil {
		return Float(v)
	}

	// Default to string
	return String(token)
}

func parseReference(token string) Reference {
	if !strings.HasPrefix(token, ":") {
		return Reference{ID: token}
	}

	token = token[1:] // Remove leading :
	parts := strings.SplitN(token, ":", 2)

	if len(parts) == 1 {
		return Reference{ID: parts[0]}
	}

	namespace := parts[0]
	id := parts[1]

	// Check if it's a relationship (all uppercase)
	if strings.ToUpper(namespace) == namespace && len(namespace) > 0 {
		isUpper := true
		for _, r := range namespace {
			if r != '_' && (r < 'A' || r > 'Z') {
				isUpper = false
				break
			}
		}
		if isUpper {
			return Reference{ID: id, Relationship: namespace}
		}
	}

	return Reference{ID: id, Namespace: namespace}
}

// Dumps serializes a Document back to ISON format
func Dumps(doc *Document) string {
	return DumpsWithOptions(doc, DefaultDumpsOptions())
}

// DumpsWithOptions serializes a Document with specified options
func DumpsWithOptions(doc *Document, opts DumpsOptions) string {
	var sb strings.Builder
	delim := opts.Delimiter
	if delim == "" {
		delim = " "
	}

	for i, name := range doc.Order {
		if i > 0 {
			sb.WriteString("\n")
		}

		block := doc.Blocks[name]
		sb.WriteString(fmt.Sprintf("%s.%s\n", block.Kind, block.Name))

		// Write field headers
		for j, field := range block.Fields {
			if j > 0 {
				sb.WriteString(delim)
			}
			if field.TypeHint != "" {
				sb.WriteString(fmt.Sprintf("%s:%s", field.Name, field.TypeHint))
			} else {
				sb.WriteString(field.Name)
			}
		}
		sb.WriteString("\n")

		// Calculate column widths for alignment
		widths := make([]int, len(block.Fields))
		for i, field := range block.Fields {
			w := len(field.Name)
			if field.TypeHint != "" {
				w += len(field.TypeHint) + 1
			}
			widths[i] = w
		}
		for _, row := range block.Rows {
			for i, field := range block.Fields {
				if val, ok := row[field.Name]; ok {
					w := len(val.ToISON())
					if w > widths[i] {
						widths[i] = w
					}
				}
			}
		}

		// Write rows
		for _, row := range block.Rows {
			for j, field := range block.Fields {
				if j > 0 {
					sb.WriteString(delim)
				}
				if val, ok := row[field.Name]; ok {
					sb.WriteString(val.ToISON())
				} else {
					sb.WriteString("~")
				}
			}
			sb.WriteString("\n")
		}

		// Write summary if present
		if block.SummaryRow != nil {
			sb.WriteString("---\n")
			for j, field := range block.Fields {
				if j > 0 {
					sb.WriteString(delim)
				}
				if val, ok := block.SummaryRow[field.Name]; ok {
					sb.WriteString(val.ToISON())
				} else {
					sb.WriteString("~")
				}
			}
			sb.WriteString("\n")
		}
	}

	return sb.String()
}

func padRight(s string, width int) string {
	if len(s) >= width {
		return s
	}
	return s + strings.Repeat(" ", width-len(s))
}

// isonlEnvelopeForbidden lists the characters that would corrupt the line
// structure if they appeared raw in the envelope (kind, name, or field names).
const isonlEnvelopeForbidden = "|\"\\ \t\n\r"

// validateISONLEnvelope rejects kind/name/fields that cannot survive an ISONL
// round-trip. Values are escaped, but the envelope is written raw, so it must
// be free of delimiters and whitespace.
func validateISONLEnvelope(block *Block) error {
	for _, part := range []struct{ label, value string }{
		{"kind", block.Kind},
		{"name", block.Name},
	} {
		if part.value == "" {
			return fmt.Errorf("ISONL block %s must be non-empty", part.label)
		}
		if strings.ContainsAny(part.value, isonlEnvelopeForbidden) {
			return fmt.Errorf("ISONL block %s %q contains characters that cannot be serialized (pipe, quote, backslash, or whitespace)", part.label, part.value)
		}
	}
	if strings.Contains(block.Kind, ".") {
		return fmt.Errorf("ISONL block kind %q must not contain '.'", block.Kind)
	}
	if strings.HasPrefix(block.Kind, "#") {
		return fmt.Errorf("ISONL block kind %q must not start with '#'", block.Kind)
	}
	for _, field := range block.Fields {
		if field.Name == "" {
			return fmt.Errorf("ISONL field names must be non-empty")
		}
		if strings.ContainsAny(field.Name, isonlEnvelopeForbidden) {
			return fmt.Errorf("ISONL field name %q contains characters that cannot be serialized (pipe, quote, backslash, or whitespace)", field.Name)
		}
	}
	return nil
}

// valueToISONL converts a Value to its ISONL string representation. Unlike
// Value.ToISON, string values are quoted whenever they could be misparsed on
// the way back in (pipes, backslashes, CR, keywords, number-like, etc.).
func valueToISONL(v Value) string {
	if v.Type == TypeString {
		return quoteISONLIfNeeded(v.StringVal)
	}
	return v.ToISON()
}

// quoteISONLIfNeeded quotes and escapes a string for ISONL output if leaving
// it bare would corrupt the line structure or change its parsed type.
func quoteISONLIfNeeded(s string) string {
	if s == "" {
		return `""`
	}

	needsQuote := strings.ContainsAny(s, " \t\"\n\r\\|") ||
		s == "true" || s == "false" || s == "null" ||
		s == "TRUE" || s == "FALSE" || s == "NULL" || s == "~" ||
		strings.HasPrefix(s, ":")
	if !needsQuote {
		// Number-like strings must stay strings after re-parsing
		if _, err := strconv.ParseFloat(s, 64); err == nil {
			needsQuote = true
		}
	}
	if !needsQuote {
		return s
	}

	escaped := strings.ReplaceAll(s, "\\", "\\\\")
	escaped = strings.ReplaceAll(escaped, "\"", "\\\"")
	escaped = strings.ReplaceAll(escaped, "\n", "\\n")
	escaped = strings.ReplaceAll(escaped, "\t", "\\t")
	escaped = strings.ReplaceAll(escaped, "\r", "\\r")
	escaped = strings.ReplaceAll(escaped, "|", "\\|")
	return "\"" + escaped + "\""
}

// DumpsISONL serializes a Document to ISONL (line-based streaming format).
// It returns an error if any block's kind, name, or field names contain
// characters that cannot survive an ISONL round-trip.
func DumpsISONL(doc *Document) (string, error) {
	var sb strings.Builder

	for _, name := range doc.Order {
		block := doc.Blocks[name]

		if err := validateISONLEnvelope(block); err != nil {
			return "", err
		}

		// Build field header
		fieldHeader := strings.Builder{}
		for i, field := range block.Fields {
			if i > 0 {
				fieldHeader.WriteString(" ")
			}
			if field.TypeHint != "" {
				fieldHeader.WriteString(fmt.Sprintf("%s:%s", field.Name, field.TypeHint))
			} else {
				fieldHeader.WriteString(field.Name)
			}
		}
		fields := fieldHeader.String()

		// Write each row as a separate line
		for _, row := range block.Rows {
			sb.WriteString(fmt.Sprintf("%s.%s|%s|", block.Kind, block.Name, fields))
			for i, field := range block.Fields {
				if i > 0 {
					sb.WriteString(" ")
				}
				if val, ok := row[field.Name]; ok {
					sb.WriteString(valueToISONL(val))
				} else {
					sb.WriteString("~")
				}
			}
			sb.WriteString("\n")
		}
	}

	return sb.String(), nil
}

// splitISONLSections splits an ISONL line on unquoted pipe characters.
// Inside quotes a backslash consumes the following byte as an escape pair, so
// a value ending in an escaped backslash ("x \\") cannot desync the quote
// tracking and let a later pipe split in the wrong place.
func splitISONLSections(line string) []string {
	sections := []string{}
	current := strings.Builder{}
	inQuotes := false

	for i := 0; i < len(line); {
		ch := line[i]

		if inQuotes && ch == '\\' && i+1 < len(line) {
			// Consume the escape pair verbatim
			current.WriteByte(ch)
			current.WriteByte(line[i+1])
			i += 2
			continue
		}

		if ch == '"' {
			inQuotes = !inQuotes
			current.WriteByte(ch)
		} else if ch == '|' && !inQuotes {
			sections = append(sections, strings.TrimSpace(current.String()))
			current.Reset()
		} else {
			current.WriteByte(ch)
		}

		i++
	}

	sections = append(sections, strings.TrimSpace(current.String()))
	return sections
}

// parseISONLValue parses a single ISONL value token. Tokens that were quoted
// in the source are always strings; everything else goes through the normal
// type inference.
func parseISONLValue(token string, wasQuoted bool, typeHint string) Value {
	if wasQuoted {
		return String(token)
	}
	return parseValue(token, typeHint)
}

// ParseISONL parses ISONL (line-based streaming format)
func ParseISONL(text string) (*Document, error) {
	doc := NewDocument()
	lines := splitLines(text)

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := splitISONLSections(line)
		if len(parts) != 3 {
			continue
		}

		// Parse block header (kind.name — name may itself contain dots,
		// so split on the first dot only)
		header := parts[0]
		headerParts := strings.SplitN(header, ".", 2)
		if len(headerParts) != 2 {
			continue
		}
		kind := headerParts[0]
		name := headerParts[1]

		// Get or create block
		block, exists := doc.Get(name)
		if !exists {
			block = NewBlock(kind, name)
			doc.AddBlock(block)

			// Parse fields
			fieldTokens := tokenizeLine(parts[1])
			for _, field := range fieldTokens {
				fname, ftype := parseFieldDef(field)
				block.AddField(fname, ftype)
			}
		}

		// Parse row
		tokens, quotedFlags := tokenizeLineWithQuotes(parts[2])
		row := make(Row)
		for i, token := range tokens {
			if i < len(block.Fields) {
				fieldInfo := block.Fields[i]
				value := parseISONLValue(token, quotedFlags[i], fieldInfo.TypeHint)
				row[fieldInfo.Name] = value
			}
		}
		block.AddRow(row)
	}

	return doc, nil
}

// LoadISONL loads and parses an ISONL file
func LoadISONL(path string) (*Document, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return ParseISONL(string(data))
}

// DumpISONL serializes a Document and writes it to an ISONL file
func DumpISONL(doc *Document, path string) error {
	text, err := DumpsISONL(doc)
	if err != nil {
		return err
	}
	return os.WriteFile(path, []byte(text), 0644)
}

// ISONToISONL converts ISON format to ISONL format
func ISONToISONL(isonText string) (string, error) {
	doc, err := Parse(isonText)
	if err != nil {
		return "", err
	}
	return DumpsISONL(doc)
}

// ISONLToISON converts ISONL format to ISON format
func ISONLToISON(isonlText string) (string, error) {
	doc, err := ParseISONL(isonlText)
	if err != nil {
		return "", err
	}
	return Dumps(doc), nil
}

// ISONLRecord represents a single ISONL record (one line)
type ISONLRecord struct {
	Kind   string
	Name   string
	Fields []string
	Values map[string]Value
}

// ISONLStream provides channel-based streaming ISONL parsing
func ISONLStream(reader io.Reader) <-chan ISONLRecord {
	ch := make(chan ISONLRecord, 100)
	go func() {
		defer close(ch)
		scanner := bufio.NewScanner(reader)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}

			parts := splitISONLSections(line)
			if len(parts) != 3 {
				continue
			}

			// Parse block header
			header := parts[0]
			headerParts := strings.SplitN(header, ".", 2)
			if len(headerParts) != 2 {
				continue
			}

			// Parse fields
			fieldTokens := tokenizeLine(parts[1])
			fields := make([]string, len(fieldTokens))
			fieldTypes := make([]string, len(fieldTokens))
			for i, field := range fieldTokens {
				fname, ftype := parseFieldDef(field)
				fields[i] = fname
				fieldTypes[i] = ftype
			}

			// Parse row
			tokens, quotedFlags := tokenizeLineWithQuotes(parts[2])
			values := make(map[string]Value)
			for i, token := range tokens {
				if i < len(fields) {
					value := parseISONLValue(token, quotedFlags[i], fieldTypes[i])
					values[fields[i]] = value
				}
			}

			ch <- ISONLRecord{
				Kind:   headerParts[0],
				Name:   headerParts[1],
				Fields: fields,
				Values: values,
			}
		}
	}()
	return ch
}

// ToJSON converts an ISON string directly to JSON
func ToJSON(isonText string) (string, error) {
	doc, err := Parse(isonText)
	if err != nil {
		return "", err
	}
	return doc.ToJSON()
}

// FromJSON converts a JSON string to ISON Document
func FromJSON(jsonText string) (*Document, error) {
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(jsonText), &data); err != nil {
		return nil, err
	}

	doc := NewDocument()

	for name, value := range data {
		switch v := value.(type) {
		case []interface{}:
			// Array of objects = table
			block := NewBlock("table", name)

			// Get fields from first row
			if len(v) > 0 {
				if firstRow, ok := v[0].(map[string]interface{}); ok {
					for key := range firstRow {
						block.AddField(key, "")
					}
				}
			}

			// Add rows
			for _, item := range v {
				if rowData, ok := item.(map[string]interface{}); ok {
					row := make(Row)
					for key, val := range rowData {
						row[key] = interfaceToValue(val)
					}
					block.AddRow(row)
				}
			}

			doc.AddBlock(block)

		case map[string]interface{}:
			// Single object = object block
			block := NewBlock("object", name)
			for key := range v {
				block.AddField(key, "")
			}
			row := make(Row)
			for key, val := range v {
				row[key] = interfaceToValue(val)
			}
			block.AddRow(row)
			doc.AddBlock(block)
		}
	}

	return doc, nil
}

// FromDictOptions configures FromDict behavior
type FromDictOptions struct {
	AutoRefs   bool // Auto-detect and convert foreign keys to References
	SmartOrder bool // Reorder columns for optimal LLM comprehension
	Flatten    bool // Flatten nested objects into separate tables (default: true)
}

// DefaultFromDictOptions returns default FromDict options
func DefaultFromDictOptions() FromDictOptions {
	return FromDictOptions{
		AutoRefs:   false,
		SmartOrder: false,
		Flatten:    true,
	}
}

// smartOrderFields reorders fields for optimal LLM comprehension
// Order priority: id first, then names, then data, then references
func smartOrderFields(fields []string) []string {
	priorityNames := map[string]bool{
		"name": true, "title": true, "label": true,
		"description": true, "display_name": true, "full_name": true,
	}

	var idFields, nameFields, refFields, otherFields []string

	for _, field := range fields {
		fieldLower := strings.ToLower(field)
		if fieldLower == "id" {
			idFields = append(idFields, field)
		} else if priorityNames[fieldLower] {
			nameFields = append(nameFields, field)
		} else if strings.HasSuffix(fieldLower, "_id") && fieldLower != "id" {
			refFields = append(refFields, field)
		} else {
			otherFields = append(otherFields, field)
		}
	}

	result := make([]string, 0, len(fields))
	result = append(result, idFields...)
	result = append(result, nameFields...)
	result = append(result, otherFields...)
	result = append(result, refFields...)
	return result
}

// FromDict creates an ISON Document from a map
func FromDict(data map[string]interface{}) *Document {
	return FromDictWithOptions(data, DefaultFromDictOptions())
}

// isNestedObject checks if value is a nested object (map, not nil)
func isNestedObject(val interface{}) bool {
	if val == nil {
		return false
	}
	_, ok := val.(map[string]interface{})
	return ok
}

// isArrayOfObjects checks if value is an array of objects
func isArrayOfObjects(val interface{}) bool {
	arr, ok := val.([]interface{})
	if !ok || len(arr) == 0 {
		return false
	}
	_, isMap := arr[0].(map[string]interface{})
	return isMap
}

// isArrayOfPrimitives checks if value is an array of primitives
func isArrayOfPrimitives(val interface{}) bool {
	arr, ok := val.([]interface{})
	if !ok {
		return false
	}
	if len(arr) == 0 {
		return true
	}
	_, isMap := arr[0].(map[string]interface{})
	_, isArr := arr[0].([]interface{})
	return !isMap && !isArr
}

// isArrayOfArrays checks if value is an array of arrays
func isArrayOfArrays(val interface{}) bool {
	arr, ok := val.([]interface{})
	if !ok || len(arr) == 0 {
		return false
	}
	_, isArr := arr[0].([]interface{})
	return isArr
}

// FromDictWithOptions creates an ISON Document from a map with options
func FromDictWithOptions(data map[string]interface{}, opts FromDictOptions) *Document {
	doc := NewDocument()
	extraBlocks := []*Block{}
	refCounter := 1

	// Collect all table names for reference detection
	tableNames := make(map[string]bool)
	for name := range data {
		tableNames[name] = true
	}

	// Detect reference fields if auto_refs is enabled
	refFields := make(map[string]string)
	if opts.AutoRefs {
		for tableName, tableData := range data {
			if arr, ok := tableData.([]interface{}); ok && len(arr) > 0 {
				if firstRow, ok := arr[0].(map[string]interface{}); ok {
					for key := range firstRow {
						// Detect _id suffix pattern (e.g., customer_id -> customers)
						if strings.HasSuffix(key, "_id") && key != "id" {
							refType := key[:len(key)-3]
							if tableNames[refType+"s"] || tableNames[refType] {
								refFields[key] = refType
							}
						}
					}
				}
			}
			// Special case: nodes/edges graph pattern
			if tableName == "edges" && tableNames["nodes"] {
				refFields["source"] = "node"
				refFields["target"] = "node"
			}
		}
	}

	// Helper to add to extra blocks
	addToExtraBlock := func(blockName, blockKind string, fields []string, row Row) {
		var existingBlock *Block
		for _, b := range extraBlocks {
			if b.Name == blockName {
				existingBlock = b
				break
			}
		}

		if existingBlock != nil {
			// Add new fields if they don't exist
			existingFieldSet := make(map[string]bool)
			for _, f := range existingBlock.Fields {
				existingFieldSet[f.Name] = true
			}
			for _, k := range fields {
				if !existingFieldSet[k] {
					existingBlock.AddField(k, "")
				}
			}
			existingBlock.AddRow(row)
		} else {
			block := NewBlock(blockKind, blockName)
			for _, f := range fields {
				block.AddField(f, "")
			}
			block.AddRow(row)
			extraBlocks = append(extraBlocks, block)
		}
	}

	// Recursive flatten helper
	var flattenValue func(key string, value interface{}, parentName string, rowID interface{}, parentRef Reference)
	flattenValue = func(key string, value interface{}, parentName string, rowID interface{}, parentRef Reference) {
		nestedName := fmt.Sprintf("%s_%s", parentName, key)

		if isNestedObject(value) {
			// Nested object - create separate block and recurse
			nestedRow := make(Row)
			nestedRow[fmt.Sprintf("%s_id", parentName)] = Ref(parentRef)
			nestedFields := []string{fmt.Sprintf("%s_id", parentName)}

			for nk, nv := range value.(map[string]interface{}) {
				if isNestedObject(nv) || isArrayOfObjects(nv) || isArrayOfPrimitives(nv) {
					flattenValue(nk, nv, nestedName, rowID, parentRef)
				} else {
					nestedRow[nk] = interfaceToValue(nv)
					nestedFields = append(nestedFields, nk)
				}
			}

			if len(nestedRow) > 1 {
				addToExtraBlock(nestedName, "table", nestedFields, nestedRow)
			}

		} else if isArrayOfObjects(value) {
			// Array of objects - create separate table
			for _, item := range value.([]interface{}) {
				itemMap := item.(map[string]interface{})
				nestedRow := make(Row)
				nestedRow[fmt.Sprintf("%s_id", parentName)] = Ref(parentRef)
				nestedFields := []string{fmt.Sprintf("%s_id", parentName)}

				for nk, nv := range itemMap {
					if isNestedObject(nv) || isArrayOfObjects(nv) || isArrayOfPrimitives(nv) {
						flattenValue(nk, nv, nestedName, rowID, parentRef)
					} else {
						nestedRow[nk] = interfaceToValue(nv)
						found := false
						for _, f := range nestedFields {
							if f == nk {
								found = true
								break
							}
						}
						if !found {
							nestedFields = append(nestedFields, nk)
						}
					}
				}

				if len(nestedRow) > 1 {
					addToExtraBlock(nestedName, "table", nestedFields, nestedRow)
				}
			}

		} else if isArrayOfPrimitives(value) {
			// Array of primitives - create separate table with value column
			for _, item := range value.([]interface{}) {
				nestedRow := make(Row)
				nestedRow[fmt.Sprintf("%s_id", parentName)] = Ref(parentRef)
				nestedRow["value"] = interfaceToValue(item)
				addToExtraBlock(nestedName, "table", []string{fmt.Sprintf("%s_id", parentName), "value"}, nestedRow)
			}
		}
	}

	// Flatten a row
	flattenRow := func(rowData map[string]interface{}, parentName string, rowID interface{}) Row {
		flatRow := make(Row)
		parentRef := Reference{ID: fmt.Sprintf("%v", rowID)}

		for key, value := range rowData {
			if opts.Flatten && (isNestedObject(value) || isArrayOfObjects(value) || isArrayOfPrimitives(value)) {
				flattenValue(key, value, parentName, rowID, parentRef)
				// Skip - field is flattened to separate table
			} else if value == nil {
				flatRow[key] = Null()
			} else if opts.AutoRefs {
				// Check if this is a reference field
				if refType, isRef := refFields[key]; isRef {
					switch refVal := value.(type) {
					case int, int64, float64, string:
						flatRow[key] = Ref(Reference{ID: fmt.Sprintf("%v", refVal), Namespace: refType})
						continue
					default:
						_ = refVal
					}
				}
				flatRow[key] = interfaceToValue(value)
			} else {
				flatRow[key] = interfaceToValue(value)
			}
		}

		return flatRow
	}

	// Sort table names for consistent ordering
	names := make([]string, 0, len(data))
	for name := range data {
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		content := data[name]
		switch v := content.(type) {
		case []interface{}:
			if isArrayOfArrays(content) {
				// Array of arrays - create table with generated column names
				maxCols := 0
				for _, row := range v {
					if arr, ok := row.([]interface{}); ok && len(arr) > maxCols {
						maxCols = len(arr)
					}
				}

				block := NewBlock("table", name)
				for i := 0; i < maxCols; i++ {
					block.AddField(fmt.Sprintf("col%d", i+1), "")
				}

				for _, item := range v {
					if arr, ok := item.([]interface{}); ok {
						row := make(Row)
						for i := 0; i < maxCols; i++ {
							fieldName := fmt.Sprintf("col%d", i+1)
							if i < len(arr) {
								row[fieldName] = interfaceToValue(arr[i])
							} else {
								row[fieldName] = Null()
							}
						}
						block.AddRow(row)
					}
				}

				doc.AddBlock(block)

			} else if len(v) > 0 {
				if _, ok := v[0].(map[string]interface{}); ok {
					// Collect all unique fields from flattened rows
					fieldSet := make(map[string]bool)
					fieldOrder := []string{}
					processedRows := []Row{}

					for _, item := range v {
						if rowData, ok := item.(map[string]interface{}); ok {
							// Determine row ID
							var rowID interface{}
							if id, hasID := rowData["id"]; hasID {
								rowID = id
							} else {
								rowID = refCounter
								refCounter++
							}

							// Flatten the row
							flatRow := flattenRow(rowData, name, rowID)

							for key := range flatRow {
								if !fieldSet[key] {
									fieldSet[key] = true
									fieldOrder = append(fieldOrder, key)
								}
							}
							processedRows = append(processedRows, flatRow)
						}
					}

					// Apply smart ordering if enabled
					if opts.SmartOrder {
						fieldOrder = smartOrderFields(fieldOrder)
					}

					block := NewBlock("table", name)
					for _, field := range fieldOrder {
						block.AddField(field, "")
					}

					for _, row := range processedRows {
						block.AddRow(row)
					}

					doc.AddBlock(block)

				} else {
					// Array of primitives - create simple table
					block := NewBlock("table", name)
					block.AddField("value", "")
					for _, item := range v {
						row := make(Row)
						row["value"] = interfaceToValue(item)
						block.AddRow(row)
					}
					doc.AddBlock(block)
				}
			}

		case map[string]interface{}:
			// Single object = object block
			var rowID interface{}
			if id, hasID := v["id"]; hasID {
				rowID = id
			} else {
				rowID = name
			}

			flatRow := flattenRow(v, name, rowID)

			fields := make([]string, 0, len(flatRow))
			for key := range flatRow {
				fields = append(fields, key)
			}
			if opts.SmartOrder {
				fields = smartOrderFields(fields)
			}

			block := NewBlock("object", name)
			for _, key := range fields {
				block.AddField(key, "")
			}
			block.AddRow(flatRow)
			doc.AddBlock(block)
		}
	}

	// Add extra blocks from flattened nested structures
	for _, block := range extraBlocks {
		doc.AddBlock(block)
	}

	return doc
}

func interfaceToValue(v interface{}) Value {
	switch val := v.(type) {
	case nil:
		return Null()
	case bool:
		return Bool(val)
	case float64:
		if val == float64(int64(val)) {
			return Int(int64(val))
		}
		return Float(val)
	case int:
		return Int(int64(val))
	case int64:
		return Int(val)
	case string:
		return String(val)
	default:
		return String(fmt.Sprintf("%v", val))
	}
}
