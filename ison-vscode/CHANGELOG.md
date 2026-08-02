# Changelog - ison-lang (VS Code Extension)

All notable changes to the ISON language support extension for VS Code will be documented in this file.

## [1.0.3] - 2026-08-01

### Added
- **ISONCS Syntax Support**: Syntax highlighting now recognizes canonical ISON format with properly sorted fields and rows.
- **Canonical Format Hints**: Extension displays hints when ISON document is in canonical form (deterministic field order).
- **Documentation Links**: Updated snippets and hover documentation to reference ISONCS specification for deterministic serialization workflows.

### Changed
- **Updated Syntax Grammar**: Enhanced to support canonical field ordering patterns (id field first, then alphabetical).

## [1.0.0] - 2025-12-25

### Added
- **ISON Language Support**: Syntax highlighting for ISON format
- **Snippets**: Common ISON patterns for tables, references, and type annotations
- **Validation**: Basic ISON document validation via language server
- **Hover Information**: Type and structure information on hover
- **Formatting**: Document formatter for consistent ISON style
