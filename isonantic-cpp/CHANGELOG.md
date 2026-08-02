# Changelog - isonantic-cpp (C++ validation)

All notable changes to the isonantic C++ validation library will be documented in this file.

## [1.0.1] - 2026-08-01

### Added
- **ISONCS (Canonical Serialization) Support**: Validation now includes canonical serialization checks to ensure deterministic output across implementations.
- **Canonical Field Ordering**: Validators verify that fields are properly sorted (id first, then alphabetically by UTF-8 bytes) when using canonical mode.
- **UTF-8 Safeguards**: Field ordering uses unsigned char comparison to avoid x86 signed char trap.

### Changed
- **Updated to ison-cpp 1.0.4**: Includes ISONCS field sorting implementation with unsigned char safeguards.
- **Validation Rules**: Enhanced to support canonical form validation with byte-level UTF-8 ordering checks.

## [1.0.0] - 2025-12-25

### Added
- **Schema Validation**: C++17 schema validation with type-safe builders
- **Field Types**: Support for int, string, bool, double types with constraints
- **Template Metaprogramming**: Compile-time schema definition and validation
- **Error Handling**: Detailed validation error reporting
- **Header-Only**: Single-header library like ison-cpp
