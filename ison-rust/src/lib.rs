//! # ISON Parser for Rust
//!
//! A Rust implementation of the ISON (Interchange Simple Object Notation) parser.
//! ISON is a minimal, LLM-friendly data serialization format optimized for AI/ML workflows.
//!
//! ## Quick Start
//!
//! ```rust
//! use ison_rs::{parse, dumps, Value};
//!
//! let ison_text = r#"
//! table.users
//! id name email
//! 1 Alice alice@example.com
//! 2 Bob bob@example.com
//! "#;
//!
//! let doc = parse(ison_text).unwrap();
//! let users = doc.get("users").unwrap();
//!
//! for row in &users.rows {
//!     println!("{}: {}", row.get("id").unwrap(), row.get("name").unwrap());
//! }
//!
//! // Serialize back
//! let output = dumps(&doc, true);
//! ```

use std::collections::HashMap;
use std::fmt;

// Plugins module (feature-gated)
pub mod plugins;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

pub const VERSION: &str = "1.0.2";

// =============================================================================
// Error Types
// =============================================================================

/// Errors that can occur during ISON parsing
#[derive(Debug, Clone)]
pub struct ISONError {
    pub message: String,
    pub line: Option<usize>,
}

impl fmt::Display for ISONError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.line {
            Some(line) => write!(f, "Line {}: {}", line, self.message),
            None => write!(f, "{}", self.message),
        }
    }
}

impl std::error::Error for ISONError {}

pub type Result<T> = std::result::Result<T, ISONError>;

// =============================================================================
// Types
// =============================================================================

/// Reference to another record in the document
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct Reference {
    pub id: String,
    pub ref_type: Option<String>,
}

impl Reference {
    /// Create a new simple reference
    pub fn new(id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            ref_type: None,
        }
    }

    /// Create a new typed reference
    pub fn with_type(id: impl Into<String>, ref_type: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            ref_type: Some(ref_type.into()),
        }
    }

    /// Check if this is a relationship reference (UPPERCASE type)
    pub fn is_relationship(&self) -> bool {
        match &self.ref_type {
            Some(t) => t.chars().all(|c| c.is_uppercase() || c == '_'),
            None => false,
        }
    }

    /// Get namespace (for non-relationship references)
    pub fn get_namespace(&self) -> Option<&str> {
        if self.is_relationship() {
            None
        } else {
            self.ref_type.as_deref()
        }
    }

    /// Get relationship type (for relationship references)
    pub fn relationship_type(&self) -> Option<&str> {
        if self.is_relationship() {
            self.ref_type.as_deref()
        } else {
            None
        }
    }

    /// Convert to ISON string representation
    pub fn to_ison(&self) -> String {
        match &self.ref_type {
            Some(t) => format!(":{}:{}", t, self.id),
            None => format!(":{}", self.id),
        }
    }
}

impl fmt::Display for Reference {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_ison())
    }
}

/// Value types in ISON
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(untagged))]
pub enum Value {
    Null,
    Bool(bool),
    Int(i64),
    Float(f64),
    String(String),
    Reference(Reference),
}

impl Value {
    pub fn is_null(&self) -> bool {
        matches!(self, Value::Null)
    }

    pub fn is_bool(&self) -> bool {
        matches!(self, Value::Bool(_))
    }

    pub fn is_int(&self) -> bool {
        matches!(self, Value::Int(_))
    }

    pub fn is_float(&self) -> bool {
        matches!(self, Value::Float(_))
    }

    pub fn is_string(&self) -> bool {
        matches!(self, Value::String(_))
    }

    pub fn is_reference(&self) -> bool {
        matches!(self, Value::Reference(_))
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Value::Bool(b) => Some(*b),
            _ => None,
        }
    }

    pub fn as_int(&self) -> Option<i64> {
        match self {
            Value::Int(i) => Some(*i),
            _ => None,
        }
    }

    pub fn as_float(&self) -> Option<f64> {
        match self {
            Value::Float(f) => Some(*f),
            Value::Int(i) => Some(*i as f64),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_reference(&self) -> Option<&Reference> {
        match self {
            Value::Reference(r) => Some(r),
            _ => None,
        }
    }
}

impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Value::Null => write!(f, "null"),
            Value::Bool(b) => write!(f, "{}", b),
            Value::Int(i) => write!(f, "{}", i),
            Value::Float(fl) => write!(f, "{}", fl),
            Value::String(s) => write!(f, "{}", s),
            Value::Reference(r) => write!(f, "{}", r),
        }
    }
}

/// A row of data (field name -> value mapping)
pub type Row = HashMap<String, Value>;

/// Field information including optional type annotation
#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct FieldInfo {
    pub name: String,
    pub field_type: Option<String>,
    pub is_computed: bool,
}

impl FieldInfo {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            field_type: None,
            is_computed: false,
        }
    }

    pub fn with_type(name: impl Into<String>, field_type: impl Into<String>) -> Self {
        let ft: String = field_type.into();
        let is_computed = ft == "computed";
        Self {
            name: name.into(),
            field_type: Some(ft),
            is_computed,
        }
    }
}

/// A block of structured data
#[derive(Debug, Clone)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct Block {
    pub kind: String,
    pub name: String,
    pub fields: Vec<String>,
    pub field_info: Vec<FieldInfo>,
    pub rows: Vec<Row>,
    pub summary_rows: Vec<Row>,
}

impl Block {
    pub fn new(kind: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            kind: kind.into(),
            name: name.into(),
            fields: Vec::new(),
            field_info: Vec::new(),
            rows: Vec::new(),
            summary_rows: Vec::new(),
        }
    }

    /// Number of data rows
    pub fn len(&self) -> usize {
        self.rows.len()
    }

    /// Check if block has no rows
    pub fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }

    /// Get row by index
    pub fn get_row(&self, index: usize) -> Option<&Row> {
        self.rows.get(index)
    }

    /// Get field type annotation
    pub fn get_field_type(&self, field_name: &str) -> Option<&str> {
        self.field_info
            .iter()
            .find(|fi| fi.name == field_name)
            .and_then(|fi| fi.field_type.as_deref())
    }

    /// Get list of computed fields
    pub fn get_computed_fields(&self) -> Vec<&str> {
        self.field_info
            .iter()
            .filter(|fi| fi.is_computed)
            .map(|fi| fi.name.as_str())
            .collect()
    }
}

impl std::ops::Index<usize> for Block {
    type Output = Row;

    fn index(&self, index: usize) -> &Self::Output {
        &self.rows[index]
    }
}

/// A complete ISON document
#[derive(Debug, Clone, Default)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub struct Document {
    pub blocks: Vec<Block>,
}

impl Document {
    pub fn new() -> Self {
        Self { blocks: Vec::new() }
    }

    /// Get block by name
    pub fn get(&self, name: &str) -> Option<&Block> {
        self.blocks.iter().find(|b| b.name == name)
    }

    /// Get mutable block by name
    pub fn get_mut(&mut self, name: &str) -> Option<&mut Block> {
        self.blocks.iter_mut().find(|b| b.name == name)
    }

    /// Check if block exists
    pub fn has(&self, name: &str) -> bool {
        self.blocks.iter().any(|b| b.name == name)
    }

    /// Number of blocks
    pub fn len(&self) -> usize {
        self.blocks.len()
    }

    /// Check if document is empty
    pub fn is_empty(&self) -> bool {
        self.blocks.is_empty()
    }

    /// Convert to JSON string (requires serde feature)
    #[cfg(feature = "serde")]
    pub fn to_json(&self, pretty: bool) -> String {
        let map: HashMap<&str, Vec<&Row>> = self
            .blocks
            .iter()
            .map(|b| (b.name.as_str(), b.rows.iter().collect()))
            .collect();

        if pretty {
            serde_json::to_string_pretty(&map).unwrap_or_default()
        } else {
            serde_json::to_string(&map).unwrap_or_default()
        }
    }
}

impl std::ops::Index<&str> for Document {
    type Output = Block;

    fn index(&self, name: &str) -> &Self::Output {
        self.get(name).expect("Block not found")
    }
}

// =============================================================================
// Parser
// =============================================================================

struct Parser<'a> {
    text: &'a str,
    pos: usize,
    line: usize,
}

impl<'a> Parser<'a> {
    fn new(text: &'a str) -> Self {
        Self {
            text,
            pos: 0,
            line: 1,
        }
    }

    fn parse(&mut self) -> Result<Document> {
        let mut doc = Document::new();

        self.skip_whitespace_and_comments();

        while self.pos < self.text.len() {
            if let Some(block) = self.parse_block()? {
                doc.blocks.push(block);
            }
            self.skip_whitespace_and_comments();
        }

        Ok(doc)
    }

    fn parse_block(&mut self) -> Result<Option<Block>> {
        let header_line = match self.read_line() {
            Some(line) => line,
            None => return Ok(None),
        };

        if header_line.starts_with('#') || header_line.is_empty() {
            return Ok(None);
        }

        let dot_index = header_line.find('.').ok_or_else(|| ISONError {
            message: format!("Invalid block header: {}", header_line),
            line: Some(self.line),
        })?;

        let kind = header_line[..dot_index].trim().to_string();
        let name = header_line[dot_index + 1..].trim().to_string();

        if kind.is_empty() || name.is_empty() {
            return Err(ISONError {
                message: format!("Invalid block header: {}", header_line),
                line: Some(self.line),
            });
        }

        let mut block = Block::new(kind, name);

        // Parse field definitions
        self.skip_empty_lines();
        let fields_line = match self.read_line() {
            Some(line) => line,
            None => return Ok(Some(block)),
        };

        let field_tokens = self.tokenize_line(&fields_line);
        for token in field_tokens {
            if let Some(colon_idx) = token.find(':') {
                let field_name = token[..colon_idx].to_string();
                let field_type = token[colon_idx + 1..].to_string();
                block.fields.push(field_name.clone());
                block.field_info.push(FieldInfo::with_type(field_name, field_type));
            } else {
                block.fields.push(token.clone());
                block.field_info.push(FieldInfo::new(token));
            }
        }

        // Parse data rows
        let mut in_summary = false;
        while self.pos < self.text.len() {
            let line = match self.peek_line() {
                Some(line) => line,
                None => break,
            };

            // Empty line or new block = end of current block
            if line.is_empty() || (line.chars().next().map(|c| c.is_alphabetic()).unwrap_or(false)
                && line.contains('.'))
            {
                break;
            }

            self.read_line(); // consume the line

            // Skip comments
            if line.starts_with('#') {
                continue;
            }

            // Summary separator
            if line.trim() == "---" {
                in_summary = true;
                continue;
            }

            let values = self.tokenize_line(&line);
            if values.is_empty() {
                break;
            }

            let mut row = Row::new();
            for (i, field) in block.fields.iter().enumerate() {
                if i < values.len() {
                    row.insert(field.clone(), self.parse_value(&values[i])?);
                }
            }

            if in_summary {
                block.summary_rows.push(row);
            } else {
                block.rows.push(row);
            }
        }

        Ok(Some(block))
    }

    fn tokenize_line(&self, line: &str) -> Vec<String> {
        let mut tokens = Vec::new();
        let mut chars: Vec<char> = line.chars().collect();
        let mut i = 0;

        // Remove inline comments
        let mut in_quote = false;
        let mut comment_start = None;
        for (idx, &ch) in chars.iter().enumerate() {
            if ch == '"' && (idx == 0 || chars[idx - 1] != '\\') {
                in_quote = !in_quote;
            } else if ch == '#' && !in_quote {
                comment_start = Some(idx);
                break;
            }
        }
        if let Some(start) = comment_start {
            chars.truncate(start);
        }

        while i < chars.len() {
            // Skip whitespace
            while i < chars.len() && (chars[i] == ' ' || chars[i] == '\t') {
                i += 1;
            }

            if i >= chars.len() {
                break;
            }

            // Quoted string
            if chars[i] == '"' {
                let (token, new_pos) = self.parse_quoted_string(&chars, i);
                tokens.push(token);
                i = new_pos;
            } else {
                // Unquoted token
                let start = i;
                while i < chars.len() && chars[i] != ' ' && chars[i] != '\t' {
                    i += 1;
                }
                tokens.push(chars[start..i].iter().collect());
            }
        }

        tokens
    }

    fn parse_quoted_string(&self, chars: &[char], start: usize) -> (String, usize) {
        let mut result = String::new();
        let mut i = start + 1; // skip opening quote

        while i < chars.len() {
            if chars[i] == '\\' {
                if i + 1 < chars.len() {
                    let next = chars[i + 1];
                    match next {
                        'n' => result.push('\n'),
                        't' => result.push('\t'),
                        'r' => result.push('\r'),
                        '\\' => result.push('\\'),
                        '"' => result.push('"'),
                        '|' => result.push('|'),
                        _ => result.push(next),
                    }
                    i += 2;
                } else {
                    result.push('\\');
                    i += 1;
                }
            } else if chars[i] == '"' {
                return (result, i + 1);
            } else {
                result.push(chars[i]);
                i += 1;
            }
        }

        (result, i)
    }

    fn parse_value(&self, token: &str) -> Result<Value> {
        // Null
        if token == "null" || token == "~" {
            return Ok(Value::Null);
        }

        // Boolean
        if token == "true" {
            return Ok(Value::Bool(true));
        }
        if token == "false" {
            return Ok(Value::Bool(false));
        }

        // Reference
        if token.starts_with(':') {
            return self.parse_reference(token);
        }

        // Integer
        if let Ok(i) = token.parse::<i64>() {
            return Ok(Value::Int(i));
        }

        // Float
        if let Ok(f) = token.parse::<f64>() {
            return Ok(Value::Float(f));
        }

        // String
        Ok(Value::String(token.to_string()))
    }

    fn parse_reference(&self, token: &str) -> Result<Value> {
        let content = &token[1..]; // skip ':'
        let parts: Vec<&str> = content.split(':').collect();

        match parts.len() {
            1 => Ok(Value::Reference(Reference::new(parts[0]))),
            2 => Ok(Value::Reference(Reference::with_type(parts[1], parts[0]))),
            _ => Err(ISONError {
                message: format!("Invalid reference: {}", token),
                line: Some(self.line),
            }),
        }
    }

    fn read_line(&mut self) -> Option<String> {
        if self.pos >= self.text.len() {
            return None;
        }

        let start = self.pos;
        while self.pos < self.text.len() && self.text.as_bytes()[self.pos] != b'\n' {
            self.pos += 1;
        }

        let line = self.text[start..self.pos].trim().to_string();

        if self.pos < self.text.len() {
            self.pos += 1; // skip newline
        }
        self.line += 1;

        Some(line)
    }

    fn peek_line(&self) -> Option<String> {
        if self.pos >= self.text.len() {
            return None;
        }

        let mut end = self.pos;
        while end < self.text.len() && self.text.as_bytes()[end] != b'\n' {
            end += 1;
        }

        Some(self.text[self.pos..end].trim().to_string())
    }

    fn skip_whitespace_and_comments(&mut self) {
        while self.pos < self.text.len() {
            let ch = self.text.as_bytes()[self.pos];
            match ch {
                b' ' | b'\t' | b'\r' => self.pos += 1,
                b'\n' => {
                    self.pos += 1;
                    self.line += 1;
                }
                b'#' => {
                    while self.pos < self.text.len() && self.text.as_bytes()[self.pos] != b'\n' {
                        self.pos += 1;
                    }
                }
                _ => break,
            }
        }
    }

    fn skip_empty_lines(&mut self) {
        while self.pos < self.text.len() {
            let ch = self.text.as_bytes()[self.pos];
            match ch {
                b' ' | b'\t' | b'\r' => self.pos += 1,
                b'\n' => {
                    self.pos += 1;
                    self.line += 1;
                }
                b'#' => {
                    while self.pos < self.text.len() && self.text.as_bytes()[self.pos] != b'\n' {
                        self.pos += 1;
                    }
                }
                _ => break,
            }
        }
    }
}

// =============================================================================
// Serializer
// =============================================================================

struct Serializer {
    align_columns: bool,
    delimiter: String,
}

impl Serializer {
    fn new(align_columns: bool) -> Self {
        Self { align_columns, delimiter: " ".to_string() }
    }

    fn with_delimiter(align_columns: bool, delimiter: &str) -> Self {
        Self { align_columns, delimiter: delimiter.to_string() }
    }

    fn serialize(&self, doc: &Document) -> String {
        let parts: Vec<String> = doc.blocks.iter().map(|b| self.serialize_block(b)).collect();
        parts.join("\n\n")
    }

    fn serialize_block(&self, block: &Block) -> String {
        let mut lines = Vec::new();

        // Header
        lines.push(format!("{}.{}", block.kind, block.name));

        // Fields with types
        let field_defs: Vec<String> = block
            .field_info
            .iter()
            .map(|fi| {
                if let Some(ref ft) = fi.field_type {
                    format!("{}:{}", fi.name, ft)
                } else {
                    fi.name.clone()
                }
            })
            .collect();
        lines.push(field_defs.join(&self.delimiter));

        // Calculate column widths for alignment
        let widths = if self.align_columns {
            self.calculate_widths(block)
        } else {
            vec![]
        };

        // Data rows
        for row in &block.rows {
            lines.push(self.serialize_row(row, &block.fields, &widths));
        }

        // Summary separator and rows
        if !block.summary_rows.is_empty() {
            lines.push("---".to_string());
            for row in &block.summary_rows {
                lines.push(self.serialize_row(row, &block.fields, &widths));
            }
        }

        lines.join("\n")
    }

    fn calculate_widths(&self, block: &Block) -> Vec<usize> {
        let mut widths: Vec<usize> = block.fields.iter().map(|f| f.len()).collect();

        for row in block.rows.iter().chain(block.summary_rows.iter()) {
            for (i, field) in block.fields.iter().enumerate() {
                if let Some(value) = row.get(field) {
                    let str_val = self.serialize_value(value);
                    if i < widths.len() {
                        widths[i] = widths[i].max(str_val.len());
                    }
                }
            }
        }

        widths
    }

    fn serialize_row(&self, row: &Row, fields: &[String], widths: &[usize]) -> String {
        let mut values = Vec::new();

        for (i, field) in fields.iter().enumerate() {
            let value = row.get(field).cloned().unwrap_or(Value::Null);
            let mut str_val = self.serialize_value(&value);

            if self.align_columns && !widths.is_empty() && i < fields.len() - 1 {
                while str_val.len() < widths[i] {
                    str_val.push(' ');
                }
            }
            values.push(str_val);
        }

        values.join(&self.delimiter)
    }

    fn serialize_value(&self, value: &Value) -> String {
        match value {
            Value::Null => "null".to_string(),
            Value::Bool(b) => if *b { "true" } else { "false" }.to_string(),
            Value::Int(i) => i.to_string(),
            Value::Float(f) => f.to_string(),
            Value::Reference(r) => r.to_ison(),
            Value::String(s) => self.serialize_string(s),
        }
    }

    fn serialize_string(&self, s: &str) -> String {
        let needs_quotes = s.contains(' ')
            || s.contains('\t')
            || s.contains('\n')
            || s.contains('"')
            || s.contains('\\')
            || s.contains('.')  // Avoid confusion with block headers (type.name)
            || s == "true"
            || s == "false"
            || s == "null"
            || s.starts_with(':')
            || s.parse::<f64>().is_ok();

        if !needs_quotes {
            return s.to_string();
        }

        let escaped = s
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\t', "\\t")
            .replace('\r', "\\r");

        format!("\"{}\"", escaped)
    }
}

// =============================================================================
// ISONL Parser/Serializer
// =============================================================================

/// Characters that would corrupt the line structure if they appeared raw in
/// the envelope (kind, name, or field names)
const ISONL_ENVELOPE_FORBIDDEN: &[char] = &['|', '"', '\\', ' ', '\t', '\n', '\r'];

/// Split an ISONL line by unquoted pipe characters.
///
/// The scanner is both quote-aware and escape-aware: while inside quotes, a
/// backslash consumes the escape pair (both chars are pushed and the cursor
/// advances by two) so a value ending in an escaped backslash (`"x \\"`)
/// cannot desync the quote tracking and let a later `|` split wrongly.
fn split_isonl_sections(line: &str) -> Vec<String> {
    let chars: Vec<char> = line.chars().collect();
    let mut sections = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut i = 0;

    while i < chars.len() {
        let ch = chars[i];

        if in_quotes && ch == '\\' && i + 1 < chars.len() {
            // Consume the escape pair so an escaped backslash before a
            // closing quote ("foo\\") can't desync the quote tracking
            current.push(ch);
            current.push(chars[i + 1]);
            i += 2;
            continue;
        }

        if ch == '"' {
            in_quotes = !in_quotes;
            current.push(ch);
        } else if ch == '|' && !in_quotes {
            sections.push(current.trim().to_string());
            current = String::new();
        } else {
            current.push(ch);
        }

        i += 1;
    }

    sections.push(current.trim().to_string());
    sections
}

/// Tokenize the values section of an ISONL line.
///
/// Returns `(token, was_quoted)` pairs. Unlike regular ISON lines, ISONL has
/// no inline comments (comments are whole lines only), so `#` is never
/// stripped here. Quoted tokens keep their string type during parsing.
fn tokenize_isonl_values(line: &str) -> Vec<(String, bool)> {
    let chars: Vec<char> = line.chars().collect();
    let mut tokens = Vec::new();
    let mut i = 0;

    while i < chars.len() {
        // Skip whitespace
        while i < chars.len() && (chars[i] == ' ' || chars[i] == '\t') {
            i += 1;
        }
        if i >= chars.len() {
            break;
        }

        if chars[i] == '"' {
            // Quoted string with escape handling
            let mut result = String::new();
            i += 1; // skip opening quote
            while i < chars.len() {
                let ch = chars[i];
                if ch == '"' {
                    i += 1; // skip closing quote
                    break;
                }
                if ch == '\\' {
                    if i + 1 < chars.len() {
                        let next = chars[i + 1];
                        match next {
                            'n' => result.push('\n'),
                            't' => result.push('\t'),
                            'r' => result.push('\r'),
                            '\\' => result.push('\\'),
                            '"' => result.push('"'),
                            '|' => result.push('|'),
                            _ => result.push(next),
                        }
                        i += 2;
                    } else {
                        result.push('\\');
                        i += 1;
                    }
                } else {
                    result.push(ch);
                    i += 1;
                }
            }
            tokens.push((result, true));
        } else {
            // Unquoted token
            let start = i;
            while i < chars.len() && chars[i] != ' ' && chars[i] != '\t' {
                i += 1;
            }
            tokens.push((chars[start..i].iter().collect(), false));
        }
    }

    tokens
}

/// Quote and escape a string for the ISONL values section if needed
fn isonl_quote_if_needed(s: &str) -> String {
    if s.is_empty() {
        return "\"\"".to_string();
    }

    let needs_quote = s.contains(' ')
        || s.contains('\t')
        || s.contains('"')
        || s.contains('\n')
        || s.contains('\r')
        || s.contains('\\')
        || s.contains('|')
        || s == "true"
        || s == "false"
        || s == "null"
        || s.starts_with(':')
        || s.parse::<f64>().is_ok();

    if !needs_quote {
        return s.to_string();
    }

    let escaped = s
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\t', "\\t")
        .replace('\r', "\\r")
        .replace('|', "\\|");

    format!("\"{}\"", escaped)
}

/// Serialize a value for the ISONL values section
fn isonl_serialize_value(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(b) => if *b { "true" } else { "false" }.to_string(),
        Value::Int(i) => i.to_string(),
        Value::Float(f) => f.to_string(),
        Value::Reference(r) => r.to_ison(),
        Value::String(s) => isonl_quote_if_needed(s),
    }
}

/// Reject kind/name/fields that cannot survive an ISONL round-trip
fn validate_isonl_envelope(block: &Block) -> Result<()> {
    for (label, value) in [("kind", &block.kind), ("name", &block.name)] {
        if value.is_empty() {
            return Err(ISONError {
                message: format!("ISONL block {} must be non-empty", label),
                line: None,
            });
        }
        if value.contains(ISONL_ENVELOPE_FORBIDDEN) {
            return Err(ISONError {
                message: format!(
                    "ISONL block {} '{}' contains characters that cannot be serialized (pipe, quote, backslash, or whitespace)",
                    label, value
                ),
                line: None,
            });
        }
    }
    if block.kind.contains('.') {
        return Err(ISONError {
            message: format!("ISONL block kind '{}' must not contain '.'", block.kind),
            line: None,
        });
    }
    if block.kind.starts_with('#') {
        return Err(ISONError {
            message: format!("ISONL block kind '{}' must not start with '#'", block.kind),
            line: None,
        });
    }
    for field in &block.fields {
        if field.is_empty() {
            return Err(ISONError {
                message: "ISONL field names must be non-empty".to_string(),
                line: None,
            });
        }
        if field.contains(ISONL_ENVELOPE_FORBIDDEN) {
            return Err(ISONError {
                message: format!(
                    "ISONL field name '{}' contains characters that cannot be serialized (pipe, quote, backslash, or whitespace)",
                    field
                ),
                line: None,
            });
        }
    }
    Ok(())
}

/// Parse ISONL format
pub fn parse_isonl(text: &str) -> Result<Document> {
    let mut doc = Document::new();
    let mut block_map: HashMap<String, usize> = HashMap::new();

    for (line_num, line) in text.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let sections = split_isonl_sections(line);
        if sections.len() != 3 {
            return Err(ISONError {
                message: format!("Invalid ISONL line: {}", line),
                line: Some(line_num + 1),
            });
        }

        let header = sections[0].as_str();
        let fields_part = sections[1].as_str();
        let values_part = sections[2].as_str();

        let dot_index = header.find('.').ok_or_else(|| ISONError {
            message: format!("Invalid ISONL header: {}", header),
            line: Some(line_num + 1),
        })?;

        let kind = &header[..dot_index];
        let name = &header[dot_index + 1..];
        let key = format!("{}.{}", kind, name);

        let block_idx = if let Some(&idx) = block_map.get(&key) {
            idx
        } else {
            let mut block = Block::new(kind, name);

            // Parse fields
            for f in fields_part.split_whitespace() {
                if let Some(colon_idx) = f.find(':') {
                    let field_name = f[..colon_idx].to_string();
                    let field_type = f[colon_idx + 1..].to_string();
                    block.fields.push(field_name.clone());
                    block.field_info.push(FieldInfo::with_type(field_name, field_type));
                } else {
                    block.fields.push(f.to_string());
                    block.field_info.push(FieldInfo::new(f));
                }
            }

            let idx = doc.blocks.len();
            block_map.insert(key, idx);
            doc.blocks.push(block);
            idx
        };

        // Parse values (quoted tokens keep their string type)
        let parser = Parser::new("");
        let values = tokenize_isonl_values(values_part);
        let mut row = Row::new();

        let block = &doc.blocks[block_idx];
        for (i, field) in block.fields.iter().enumerate() {
            if i < values.len() {
                let (token, was_quoted) = &values[i];
                let value = if *was_quoted {
                    Value::String(token.clone())
                } else {
                    parser.parse_value(token)?
                };
                row.insert(field.clone(), value);
            }
        }

        doc.blocks[block_idx].rows.push(row);
    }

    Ok(doc)
}

/// Serialize to ISONL format
///
/// Returns an error if any block's kind, name, or field names contain
/// characters that cannot survive an ISONL round-trip (pipe, quote,
/// backslash, or whitespace; additionally `.` or a leading `#` in the kind).
pub fn dumps_isonl(doc: &Document) -> Result<String> {
    let mut lines = Vec::new();

    for block in &doc.blocks {
        validate_isonl_envelope(block)?;
        let header = format!("{}.{}", block.kind, block.name);
        let fields: Vec<String> = block
            .field_info
            .iter()
            .map(|fi| {
                if let Some(ref ft) = fi.field_type {
                    format!("{}:{}", fi.name, ft)
                } else {
                    fi.name.clone()
                }
            })
            .collect();
        let fields_str = fields.join(" ");

        for row in &block.rows {
            let values: Vec<String> = block
                .fields
                .iter()
                .map(|f| {
                    row.get(f)
                        .map(isonl_serialize_value)
                        .unwrap_or_else(|| "null".to_string())
                })
                .collect();
            lines.push(format!("{}|{}|{}", header, fields_str, values.join(" ")));
        }
    }

    Ok(lines.join("\n"))
}

// =============================================================================
// Public API
// =============================================================================

/// Parse an ISON string into a Document
pub fn parse(text: &str) -> Result<Document> {
    Parser::new(text).parse()
}

/// Parse an ISON string into a Document (alias for parse)
pub fn loads(text: &str) -> Result<Document> {
    parse(text)
}

/// Serialize a Document to an ISON string
///
/// # Arguments
/// * `doc` - The document to serialize
/// * `align_columns` - Whether to align columns with padding (default: false for token efficiency)
pub fn dumps(doc: &Document, align_columns: bool) -> String {
    Serializer::new(align_columns).serialize(doc)
}

/// Serialize a Document to an ISON string with custom delimiter
///
/// # Arguments
/// * `doc` - The document to serialize
/// * `align_columns` - Whether to align columns with padding
/// * `delimiter` - Column separator (default: " ", alternatives: ",")
pub fn dumps_with_delimiter(doc: &Document, align_columns: bool, delimiter: &str) -> String {
    Serializer::with_delimiter(align_columns, delimiter).serialize(doc)
}

/// Parse ISONL string (alias for parse_isonl)
pub fn loads_isonl(text: &str) -> Result<Document> {
    parse_isonl(text)
}

/// Convert ISON text to ISONL text
pub fn ison_to_isonl(ison_text: &str) -> Result<String> {
    let doc = parse(ison_text)?;
    dumps_isonl(&doc)
}

/// Convert ISONL text to ISON text
pub fn isonl_to_ison(isonl_text: &str) -> Result<String> {
    let doc = parse_isonl(isonl_text)?;
    Ok(dumps(&doc, false))
}

/// Options for json_to_ison conversion
#[cfg(feature = "serde")]
#[derive(Debug, Clone)]
pub struct JsonToIsonOptions {
    /// Whether to flatten nested objects into separate tables (default: true)
    pub flatten: bool,
    /// Whether to align columns in output (default: false)
    pub align_columns: bool,
}

#[cfg(feature = "serde")]
impl Default for JsonToIsonOptions {
    fn default() -> Self {
        Self {
            flatten: true,
            align_columns: false,
        }
    }
}

/// Convert JSON to ISON format (requires serde feature)
///
/// Converts a JSON object where keys are block names and values are arrays of objects
/// into ISON format. Nested objects and arrays are flattened into separate tables
/// with references.
#[cfg(feature = "serde")]
pub fn json_to_ison(json_text: &str) -> Result<String> {
    json_to_ison_with_options(json_text, JsonToIsonOptions::default())
}

/// Convert JSON to ISON format with options (requires serde feature)
#[cfg(feature = "serde")]
pub fn json_to_ison_with_options(json_text: &str, opts: JsonToIsonOptions) -> Result<String> {
    let json_value: serde_json::Value = serde_json::from_str(json_text)
        .map_err(|e| ISONError { message: format!("JSON parse error: {}", e), line: None })?;

    let obj = json_value.as_object()
        .ok_or_else(|| ISONError { message: "JSON must be an object".to_string(), line: None })?;

    let mut doc = Document::new();
    let mut extra_blocks: Vec<Block> = Vec::new();
    let mut ref_counter: i64 = 1;

    // Helper to check if value is a nested object
    fn is_nested_object(val: &serde_json::Value) -> bool {
        val.is_object()
    }

    // Helper to check if value is an array of objects
    fn is_array_of_objects(val: &serde_json::Value) -> bool {
        if let Some(arr) = val.as_array() {
            !arr.is_empty() && arr[0].is_object()
        } else {
            false
        }
    }

    // Helper to check if value is an array of primitives
    fn is_array_of_primitives(val: &serde_json::Value) -> bool {
        if let Some(arr) = val.as_array() {
            arr.is_empty() || (!arr[0].is_object() && !arr[0].is_array())
        } else {
            false
        }
    }

    // Helper to check if value is an array of arrays
    fn is_array_of_arrays(val: &serde_json::Value) -> bool {
        if let Some(arr) = val.as_array() {
            !arr.is_empty() && arr[0].is_array()
        } else {
            false
        }
    }

    // Helper to convert JSON value to ISON Value
    fn json_to_value(val: &serde_json::Value) -> Value {
        match val {
            serde_json::Value::Null => Value::Null,
            serde_json::Value::Bool(b) => Value::Bool(*b),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Value::Int(i)
                } else if let Some(f) = n.as_f64() {
                    Value::Float(f)
                } else {
                    Value::String(n.to_string())
                }
            }
            serde_json::Value::String(s) => {
                if s.starts_with(':') {
                    let parts: Vec<&str> = s[1..].splitn(2, ':').collect();
                    if parts.len() == 2 {
                        Value::Reference(Reference::with_type(parts[1], parts[0]))
                    } else {
                        Value::Reference(Reference::new(parts[0]))
                    }
                } else {
                    Value::String(s.clone())
                }
            }
            _ => Value::String(val.to_string()),
        }
    }

    for (block_name, block_value) in obj {
        if let Some(arr) = block_value.as_array() {
            // Handle array of arrays
            if is_array_of_arrays(block_value) {
                let max_cols = arr.iter()
                    .filter_map(|r| r.as_array())
                    .map(|a| a.len())
                    .max()
                    .unwrap_or(0);

                let fields: Vec<String> = (1..=max_cols).map(|i| format!("col{}", i)).collect();
                let field_info: Vec<FieldInfo> = fields.iter()
                    .map(|f| FieldInfo::new(f))
                    .collect();

                let mut rows = Vec::new();
                for item in arr {
                    if let Some(inner_arr) = item.as_array() {
                        let mut row = Row::new();
                        for (i, field) in fields.iter().enumerate() {
                            if i < inner_arr.len() {
                                row.insert(field.clone(), json_to_value(&inner_arr[i]));
                            } else {
                                row.insert(field.clone(), Value::Null);
                            }
                        }
                        rows.push(row);
                    }
                }

                doc.blocks.push(Block {
                    kind: "table".to_string(),
                    name: block_name.clone(),
                    fields,
                    field_info,
                    rows,
                    summary_rows: vec![],
                });
                continue;
            }

            // Handle array of objects
            if arr.is_empty() {
                continue;
            }

            if !arr[0].is_object() {
                // Array of primitives at top level
                let fields = vec!["value".to_string()];
                let field_info = vec![FieldInfo::new("value")];
                let rows: Vec<Row> = arr.iter()
                    .map(|v| {
                        let mut row = Row::new();
                        row.insert("value".to_string(), json_to_value(v));
                        row
                    })
                    .collect();

                doc.blocks.push(Block {
                    kind: "table".to_string(),
                    name: block_name.clone(),
                    fields,
                    field_info,
                    rows,
                    summary_rows: vec![],
                });
                continue;
            }

            // Collect all fields from all objects
            let mut field_set: Vec<String> = Vec::new();
            let mut rows = Vec::new();

            for item in arr {
                if let Some(item_obj) = item.as_object() {
                    // Determine row ID
                    let row_id: i64 = if let Some(id_val) = item_obj.get("id") {
                        id_val.as_i64().unwrap_or_else(|| {
                            let id = ref_counter;
                            ref_counter += 1;
                            id
                        })
                    } else {
                        let id = ref_counter;
                        ref_counter += 1;
                        id
                    };

                    let parent_ref = Reference::new(row_id.to_string());

                    let mut row = Row::new();
                    for (key, val) in item_obj {
                        if opts.flatten && (is_nested_object(val) || is_array_of_objects(val) || is_array_of_primitives(val)) {
                            let nested_name = format!("{}_{}", block_name, key);

                            if is_nested_object(val) {
                                // Nested object - create separate table
                                if let Some(nested_obj) = val.as_object() {
                                    let parent_id_field = format!("{}_id", block_name);
                                    let mut nested_fields = vec![parent_id_field.clone()];
                                    let mut nested_row = Row::new();
                                    nested_row.insert(parent_id_field.clone(), Value::Reference(parent_ref.clone()));

                                    for (nk, nv) in nested_obj {
                                        if !is_nested_object(nv) && !is_array_of_objects(nv) && !is_array_of_primitives(nv) {
                                            nested_row.insert(nk.clone(), json_to_value(nv));
                                            if !nested_fields.contains(nk) {
                                                nested_fields.push(nk.clone());
                                            }
                                        }
                                    }

                                    // Add to extra blocks
                                    if nested_row.len() > 1 {
                                        if let Some(existing) = extra_blocks.iter_mut().find(|b| b.name == nested_name) {
                                            for f in &nested_fields {
                                                if !existing.fields.contains(f) {
                                                    existing.fields.push(f.clone());
                                                    existing.field_info.push(FieldInfo::new(f));
                                                }
                                            }
                                            existing.rows.push(nested_row);
                                        } else {
                                            let field_info = nested_fields.iter().map(|f| FieldInfo::new(f)).collect();
                                            extra_blocks.push(Block {
                                                kind: "table".to_string(),
                                                name: nested_name.clone(),
                                                fields: nested_fields,
                                                field_info,
                                                rows: vec![nested_row],
                                                summary_rows: vec![],
                                            });
                                        }
                                    }
                                }
                            } else if is_array_of_objects(val) {
                                // Array of objects - create separate table
                                if let Some(arr) = val.as_array() {
                                    for arr_item in arr {
                                        if let Some(nested_obj) = arr_item.as_object() {
                                            let parent_id_field = format!("{}_id", block_name);
                                            let mut nested_fields = vec![parent_id_field.clone()];
                                            let mut nested_row = Row::new();
                                            nested_row.insert(parent_id_field.clone(), Value::Reference(parent_ref.clone()));

                                            for (nk, nv) in nested_obj {
                                                if !is_nested_object(nv) && !is_array_of_objects(nv) && !is_array_of_primitives(nv) {
                                                    nested_row.insert(nk.clone(), json_to_value(nv));
                                                    if !nested_fields.contains(nk) {
                                                        nested_fields.push(nk.clone());
                                                    }
                                                }
                                            }

                                            if nested_row.len() > 1 {
                                                if let Some(existing) = extra_blocks.iter_mut().find(|b| b.name == nested_name) {
                                                    for f in &nested_fields {
                                                        if !existing.fields.contains(f) {
                                                            existing.fields.push(f.clone());
                                                            existing.field_info.push(FieldInfo::new(f));
                                                        }
                                                    }
                                                    existing.rows.push(nested_row);
                                                } else {
                                                    let field_info = nested_fields.iter().map(|f| FieldInfo::new(f)).collect();
                                                    extra_blocks.push(Block {
                                                        kind: "table".to_string(),
                                                        name: nested_name.clone(),
                                                        fields: nested_fields,
                                                        field_info,
                                                        rows: vec![nested_row],
                                                        summary_rows: vec![],
                                                    });
                                                }
                                            }
                                        }
                                    }
                                }
                            } else if is_array_of_primitives(val) {
                                // Array of primitives - create separate table with value column
                                if let Some(arr) = val.as_array() {
                                    let parent_id_field = format!("{}_id", block_name);
                                    for prim in arr {
                                        let mut nested_row = Row::new();
                                        nested_row.insert(parent_id_field.clone(), Value::Reference(parent_ref.clone()));
                                        nested_row.insert("value".to_string(), json_to_value(prim));

                                        if let Some(existing) = extra_blocks.iter_mut().find(|b| b.name == nested_name) {
                                            existing.rows.push(nested_row);
                                        } else {
                                            let nested_fields = vec![parent_id_field.clone(), "value".to_string()];
                                            let field_info = nested_fields.iter().map(|f| FieldInfo::new(f)).collect();
                                            extra_blocks.push(Block {
                                                kind: "table".to_string(),
                                                name: nested_name.clone(),
                                                fields: nested_fields,
                                                field_info,
                                                rows: vec![nested_row],
                                                summary_rows: vec![],
                                            });
                                        }
                                    }
                                }
                            }
                            // Don't add this field to the main row
                        } else {
                            row.insert(key.clone(), json_to_value(val));
                            if !field_set.contains(key) {
                                field_set.push(key.clone());
                            }
                        }
                    }
                    rows.push(row);
                }
            }

            let field_info: Vec<FieldInfo> = field_set.iter()
                .map(|f| FieldInfo::new(f))
                .collect();

            doc.blocks.push(Block {
                kind: "table".to_string(),
                name: block_name.clone(),
                fields: field_set,
                field_info,
                rows,
                summary_rows: vec![],
            });
        } else if let Some(obj_value) = block_value.as_object() {
            // Single object
            let row_id = obj_value.get("id")
                .and_then(|v| v.as_i64())
                .map(|i| i.to_string())
                .unwrap_or_else(|| block_name.clone());
            let parent_ref = Reference::new(row_id);

            let mut fields: Vec<String> = Vec::new();
            let mut row = Row::new();

            for (key, val) in obj_value {
                if opts.flatten && (is_nested_object(val) || is_array_of_objects(val) || is_array_of_primitives(val)) {
                    // Handle nested structures similar to above
                    let nested_name = format!("{}_{}", block_name, key);
                    let parent_id_field = format!("{}_id", block_name);

                    if is_nested_object(val) {
                        if let Some(nested_obj) = val.as_object() {
                            let mut nested_fields = vec![parent_id_field.clone()];
                            let mut nested_row = Row::new();
                            nested_row.insert(parent_id_field.clone(), Value::Reference(parent_ref.clone()));

                            for (nk, nv) in nested_obj {
                                if !is_nested_object(nv) && !is_array_of_objects(nv) && !is_array_of_primitives(nv) {
                                    nested_row.insert(nk.clone(), json_to_value(nv));
                                    nested_fields.push(nk.clone());
                                }
                            }

                            if nested_row.len() > 1 {
                                let field_info = nested_fields.iter().map(|f| FieldInfo::new(f)).collect();
                                extra_blocks.push(Block {
                                    kind: "table".to_string(),
                                    name: nested_name,
                                    fields: nested_fields,
                                    field_info,
                                    rows: vec![nested_row],
                                    summary_rows: vec![],
                                });
                            }
                        }
                    } else if is_array_of_primitives(val) {
                        if let Some(arr) = val.as_array() {
                            let nested_fields = vec![parent_id_field.clone(), "value".to_string()];
                            let field_info = nested_fields.iter().map(|f| FieldInfo::new(f)).collect();
                            let nested_rows: Vec<Row> = arr.iter().map(|prim| {
                                let mut r = Row::new();
                                r.insert(parent_id_field.clone(), Value::Reference(parent_ref.clone()));
                                r.insert("value".to_string(), json_to_value(prim));
                                r
                            }).collect();

                            extra_blocks.push(Block {
                                kind: "table".to_string(),
                                name: nested_name,
                                fields: nested_fields,
                                field_info,
                                rows: nested_rows,
                                summary_rows: vec![],
                            });
                        }
                    }
                } else {
                    row.insert(key.clone(), json_to_value(val));
                    fields.push(key.clone());
                }
            }

            let field_info: Vec<FieldInfo> = fields.iter()
                .map(|f| FieldInfo::new(f))
                .collect();

            doc.blocks.push(Block {
                kind: "object".to_string(),
                name: block_name.clone(),
                fields,
                field_info,
                rows: vec![row],
                summary_rows: vec![],
            });
        }
    }

    // Add extra blocks from flattened structures
    for block in extra_blocks {
        doc.blocks.push(block);
    }

    Ok(dumps(&doc, opts.align_columns))
}

/// Convert ISON to JSON format (requires serde feature)
#[cfg(feature = "serde")]
pub fn ison_to_json(ison_text: &str, pretty: bool) -> Result<String> {
    let doc = parse(ison_text)?;
    Ok(doc.to_json(pretty))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_table() {
        let ison = r#"table.users
id name email
1 Alice alice@example.com
2 Bob bob@example.com"#;

        let doc = parse(ison).unwrap();
        let users = doc.get("users").unwrap();

        assert_eq!(users.kind, "table");
        assert_eq!(users.name, "users");
        assert_eq!(users.len(), 2);
        assert_eq!(users.fields, vec!["id", "name", "email"]);

        assert_eq!(users[0].get("id").unwrap().as_int(), Some(1));
        assert_eq!(users[0].get("name").unwrap().as_str(), Some("Alice"));
    }

    #[test]
    fn test_parse_references() {
        let ison = r#"table.orders
id user_id
1 :42
2 :user:101
3 :MEMBER_OF:10"#;

        let doc = parse(ison).unwrap();
        let orders = doc.get("orders").unwrap();

        let ref1 = orders[0].get("user_id").unwrap().as_reference().unwrap();
        assert_eq!(ref1.id, "42");
        assert!(ref1.ref_type.is_none());

        let ref2 = orders[1].get("user_id").unwrap().as_reference().unwrap();
        assert_eq!(ref2.id, "101");
        assert_eq!(ref2.ref_type, Some("user".to_string()));
        assert!(!ref2.is_relationship());

        let ref3 = orders[2].get("user_id").unwrap().as_reference().unwrap();
        assert_eq!(ref3.id, "10");
        assert!(ref3.is_relationship());
    }

    #[test]
    fn test_type_inference() {
        let ison = r#"table.test
int_val float_val bool_val null_val str_val
42 3.14 true null hello"#;

        let doc = parse(ison).unwrap();
        let test = doc.get("test").unwrap();

        assert!(test[0].get("int_val").unwrap().is_int());
        assert!(test[0].get("float_val").unwrap().is_float());
        assert!(test[0].get("bool_val").unwrap().is_bool());
        assert!(test[0].get("null_val").unwrap().is_null());
        assert!(test[0].get("str_val").unwrap().is_string());
    }

    #[test]
    fn test_roundtrip() {
        let original = r#"table.users
id name email
1 Alice alice@example.com
2 Bob bob@example.com"#;

        let doc = parse(original).unwrap();
        let serialized = dumps(&doc, true);
        let doc2 = parse(&serialized).unwrap();

        assert_eq!(doc2.get("users").unwrap().len(), 2);
    }

    #[test]
    fn test_isonl() {
        let isonl = "table.users|id name|1 Alice\ntable.users|id name|2 Bob";

        let doc = parse_isonl(isonl).unwrap();
        let users = doc.get("users").unwrap();

        assert_eq!(users.len(), 2);
        assert_eq!(users[0].get("name").unwrap().as_str(), Some("Alice"));
    }

    #[test]
    fn test_dumps_with_delimiter() {
        let ison = r#"table.users
id name email
1 Alice "alice@example.com"
2 Bob "bob@example.com""#;

        let doc = parse(ison).unwrap();

        // Test with comma delimiter (emails get quoted because they contain '.')
        let comma_output = dumps_with_delimiter(&doc, false, ",");
        assert!(comma_output.contains("id,name,email"));
        assert!(comma_output.contains("1,Alice,\"alice@example.com\""));

        // Test with default space delimiter
        let space_output = dumps_with_delimiter(&doc, false, " ");
        assert!(space_output.contains("id name email"));
        assert!(space_output.contains("1 Alice \"alice@example.com\""));
    }

    #[test]
    fn test_version() {
        assert_eq!(VERSION, "1.0.2");
    }

    #[test]
    fn test_json_to_ison() {
        let json = r#"{
            "users": [
                {"id": 1, "name": "Alice", "email": "alice@example.com"},
                {"id": 2, "name": "Bob", "email": "bob@example.com"}
            ]
        }"#;

        let ison = json_to_ison(json).unwrap();
        assert!(ison.contains("table.users"));

        // Parse it back to verify
        let doc = parse(&ison).unwrap();
        let users = doc.get("users").unwrap();
        assert_eq!(users.len(), 2);
    }

    #[test]
    fn test_ison_to_json() {
        let ison = r#"table.users
id name email
1 Alice alice@example.com
2 Bob bob@example.com"#;

        let json = ison_to_json(ison, false).unwrap();
        assert!(json.contains("Alice"));
        assert!(json.contains("Bob"));

        // Verify it's valid JSON
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert!(parsed.get("users").is_some());
    }

    fn make_string_block(kind: &str, name: &str, fields: &[&str], rows: Vec<Row>) -> Document {
        let mut block = Block::new(kind, name);
        for f in fields {
            block.fields.push(f.to_string());
            block.field_info.push(FieldInfo::new(*f));
        }
        block.rows = rows;
        let mut doc = Document::new();
        doc.blocks.push(block);
        doc
    }

    #[test]
    fn test_isonl_escaping_integrity() {
        // Regression: delimiter/escape chars in values must survive a round-trip
        let adversarial: Vec<&str> = vec![
            "C:\\path\\", // trailing backslash used to desync quote tracking
            "\\",
            "a\\",
            "ends with backslash \\",
            "pipe|inside",
            "quote \" inside",
            "mix \\\" of both",
            "line1\nline2",
            "tab\there",
            "cr\rhere",
            "crlf\r\nend",
            "123",
            "true",
            ":ref",
            "",
            "\\|",
            " leading and trailing ",
        ];

        let rows: Vec<Row> = adversarial
            .iter()
            .map(|s| {
                let mut row = Row::new();
                row.insert("v".to_string(), Value::String(s.to_string()));
                row
            })
            .collect();
        let doc = make_string_block("table", "adversarial", &["v"], rows);

        let out = dumps_isonl(&doc).unwrap();
        let parsed = parse_isonl(&out).unwrap();
        let got: Vec<String> = parsed.blocks[0]
            .rows
            .iter()
            .map(|r| r.get("v").unwrap().as_str().unwrap().to_string())
            .collect();
        assert_eq!(got, adversarial, "round-trip corrupted values");

        // Compound case: a quoted value ending in an escaped backslash followed
        // by a pipe-bearing value on the same line — the exact shape that
        // desynced quote tracking and corrupted section splitting
        let compound_rows: Vec<Row> = [("x \\", "y|z"), ("x\\", "y|z")]
            .iter()
            .map(|(a, b)| {
                let mut row = Row::new();
                row.insert("a".to_string(), Value::String(a.to_string()));
                row.insert("b".to_string(), Value::String(b.to_string()));
                row
            })
            .collect();
        let doc = make_string_block("table", "compound", &["a", "b"], compound_rows.clone());

        let out = dumps_isonl(&doc).unwrap();
        let parsed = parse_isonl(&out).unwrap();
        assert_eq!(parsed.blocks[0].rows, compound_rows);
    }

    #[test]
    fn test_isonl_roundtrip_property() {
        // Property test: random strings over a hostile alphabet must round-trip.
        // Deterministic LCG so no rand crate is needed.
        struct Lcg {
            state: u64,
        }
        impl Lcg {
            fn next_int(&mut self, lo: u64, hi: u64) -> u64 {
                self.state = (self.state * 1103515245 + 12345) % 2147483648;
                lo + (self.state % (hi - lo + 1))
            }
        }

        let alphabet: [&str; 16] = [
            "a", "b", " ", "|", "\"", "\\", "\n", "\r", "\t", ".", ":", "#", "0", "1", "true",
            "null",
        ];
        let mut rng = Lcg { state: 20260713 };

        for trial in 0..300 {
            let num_fields = rng.next_int(1, 4) as usize;
            let fields: Vec<String> = (0..num_fields).map(|i| format!("f{}", i)).collect();
            let field_refs: Vec<&str> = fields.iter().map(|f| f.as_str()).collect();

            let num_rows = rng.next_int(1, 3) as usize;
            let mut rows: Vec<Row> = Vec::new();
            for _ in 0..num_rows {
                let mut row = Row::new();
                for f in &fields {
                    let len = rng.next_int(0, 12) as usize;
                    let mut s = String::new();
                    for _ in 0..len {
                        s.push_str(alphabet[rng.next_int(0, alphabet.len() as u64 - 1) as usize]);
                    }
                    row.insert(f.clone(), Value::String(s));
                }
                rows.push(row);
            }

            let doc = make_string_block("table", "t", &field_refs, rows.clone());
            let out = dumps_isonl(&doc).unwrap();
            let parsed = parse_isonl(&out)
                .unwrap_or_else(|e| panic!("trial {}: parse failed ({}) for {:?}", trial, e, out));
            assert_eq!(
                parsed.blocks[0].rows, rows,
                "trial {}: {:?} -> {:?}",
                trial, rows, out
            );
        }
    }

    #[test]
    fn test_isonl_envelope_validation() {
        // Envelope values that can't be serialized must be rejected, not corrupted
        fn make_doc(kind: &str, name: &str, fields: &[&str]) -> Document {
            let mut row = Row::new();
            for f in fields {
                row.insert(f.to_string(), Value::Int(1));
            }
            make_string_block(kind, name, fields, vec![row])
        }

        let bad_cases: Vec<Document> = vec![
            make_doc("ta|ble", "t", &["id"]),
            make_doc("ta ble", "t", &["id"]),
            make_doc("t.able", "t", &["id"]),
            make_doc("#table", "t", &["id"]),
            make_doc("", "t", &["id"]),
            make_doc("table", "na|me", &["id"]),
            make_doc("table", "na\nme", &["id"]),
            make_doc("table", "na me", &["id"]),
            make_doc("table", "", &["id"]),
            make_doc("table", "t", &["bad field"]),
            make_doc("table", "t", &["bad|field"]),
            make_doc("table", "t", &[""]),
        ];
        for doc in &bad_cases {
            assert!(
                dumps_isonl(doc).is_err(),
                "should have rejected envelope kind={:?} name={:?} fields={:?}",
                doc.blocks[0].kind,
                doc.blocks[0].name,
                doc.blocks[0].fields
            );
        }

        // Dots in the block NAME are legal — the parser splits on the first dot
        let doc = make_doc("table", "v1.2", &["id"]);
        let parsed = parse_isonl(&dumps_isonl(&doc).unwrap()).unwrap();
        assert_eq!(parsed.blocks[0].kind, "table");
        assert_eq!(parsed.blocks[0].name, "v1.2");
    }
}
