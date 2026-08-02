# Changelog - ison-cli

All notable changes to the ISON command-line tool will be documented in this file.

## [1.0.0] - 2026-08-01

### Added
- **ISONCS (Canonical Serialization) Support**: New `--canonical` flag for `ison-cli dump` command produces byte-identical canonical ISON output across all platforms. Supports content addressing and deterministic serialization workflows.
  ```bash
  ison-cli dump --canonical data.json
  # Outputs canonical ISON with sorted fields and rows
  ```
- **Field Sorting Display**: When using `--canonical`, fields are displayed in deterministic order: `id` field first, then alphabetically by UTF-8 bytes.

### Changed
- **Updated to ison-py 1.0.4**: Includes ISONCS field sorting implementation with UTF-8 byte comparison.

### Added
- **Initial CLI Tool**: Command-line interface for ISON format conversion and validation
- **Subcommands**: dump, validate, convert
- **Format Support**: JSON to ISON conversion, ISON validation, pretty-printing
- **Type Annotations**: Display type information for validated ISON documents
