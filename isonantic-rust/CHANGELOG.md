# Changelog - isonantic-rs (Rust validation)

All notable changes to the isonantic Rust validation crate will be documented in this file.

> Unlike the Python, TypeScript, and Go validation packages (which were merged into
> their parser packages and deprecated), `isonantic-rs` remains a separately
> maintained crate because of Rust's module system.

## [1.0.0] - 2025-12-25

### Added

- **Schema Validation**: Type-safe validation and schema definitions for the ISON format
- **Derive Support**: Schema derivation for Rust structs
- **Serde Integration**: Optional `serde` feature (enabled by default) for interop with `serde`/`serde_json`
- **Typed Errors**: Structured validation error reporting
