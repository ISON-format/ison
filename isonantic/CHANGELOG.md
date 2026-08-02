# Changelog - isonantic (Python validation)

All notable changes to the isonantic Python validation library will be documented in this file.

## [1.0.1] - 2026-08-01

### Added
- **ISONCS (Canonical Serialization) Support**: Validation now includes canonical serialization checks to ensure deterministic output.
- **Canonical Field Ordering**: Validators verify that fields are properly sorted (id first, then alphabetically) when using canonical mode.

### Changed
- **Updated to ison-py 1.0.1**: Includes ISONCS field sorting implementation.
- **Validation Rules**: Enhanced to support canonical form validation with UTF-8 byte ordering checks.

## [1.0.0] - 2025-12-25

### Added
- **Schema Validation**: Fluent API for defining and validating ISON table schemas
- **Field Types**: Support for int, string, bool, float types with constraints
- **Type Coercion**: Automatic type conversion for common patterns
- **Error Messages**: Clear, actionable validation error messages
- **Decorators**: Python dataclass decorators for schema definition
