# AGENTS.md - AI Coding Agent Guidelines

This file provides comprehensive guidance for AI coding agents (Claude Code, Cursor, GitHub Copilot, etc.) working on the ISON project.

## Project Overview

**ISON (Interchange Simple Object Notation)** is a token-efficient data format optimized for LLMs and Agentic AI workflows. The project is a monorepo containing parser implementations across 5 languages plus tooling.

- **Website:** https://www.ison.dev
- **Documentation:** https://www.getison.com
- **Author:** Mahesh Vaikri
- **License:** MIT

## Repository Structure

```
ison/
├── ison-js/           # JavaScript parser (NPM: ison-parser)
├── ison-ts/           # TypeScript parser + validation (NPM: ison-ts)
├── ison-py/           # Python parser + validation (PyPI: ison-py)
├── ison-rust/         # Rust parser (Crates.io: ison-rs)
├── ison-cpp/          # C++ header-only parser
├── ison-go/           # Go parser + validation
├── ison-cli/          # Python CLI tool (PyPI: ison-cli)
├── ison-vscode/       # VS Code extension (Marketplace: ison-lang)
├── n8n-nodes-ison/    # n8n community node
├── isonantic-ts/      # DEPRECATED - use ison-ts/validation
├── isonantic/         # DEPRECATED - use ison_parser.validation
├── isonantic-go/      # DEPRECATED - use ison-go/validation
├── isonantic-rust/    # Rust validation (NOT deprecated - separate crate)
├── isonantic-cpp/     # C++ validation (NOT deprecated - separate header)
├── benchmark/         # Token efficiency benchmarks
├── images/            # Logo and assets
└── README.md          # Main documentation
```

## Package Registry Mapping

| Directory | Package Name | Registry | Current Version |
|-----------|--------------|----------|-----------------|
| ison-js | `ison-parser` | NPM | 1.0.2 |
| ison-ts | `ison-ts` | NPM | 1.0.2 |
| ison-py | `ison-py` | PyPI | 1.0.3 |
| ison-rust | `ison-rs` | Crates.io | 1.0.2 |
| ison-go | `github.com/ISON-format/ison/ison-go` | Go Modules | - |
| ison-cli | `ison-cli` | PyPI | 1.0.0 |
| ison-vscode | `ison-lang` | VS Code Marketplace | 1.0.2 |
| n8n-nodes-ison | `n8n-nodes-ison` | NPM | 1.0.1 |
| isonantic-ts | `isonantic-ts` | NPM | 1.0.0 (deprecated) |
| isonantic | `isonantic` | PyPI | 1.0.1 (deprecated) |
| isonantic-rust | `isonantic-rs` | Crates.io | 1.0.0 |

## ISON Format Quick Reference

```ison
# Comments start with #

table.users                          # Block: kind.name
id:int name:string email active:bool # Fields with optional types
1 Alice alice@example.com true       # Data rows (space-separated)
2 "Bob Smith" bob@example.com false  # Quoted strings for spaces
3 ~ ~ true                           # ~ or null for null values

table.orders
id user_id product
1 :1 Widget                          # :1 = reference to id 1
2 :user:42 Gadget                    # :user:42 = namespaced reference
3 :OWNS:5 Gizmo                      # :OWNS:5 = relationship reference (UPPERCASE)

object.config                        # Single-row object block
key value
debug true
---                                  # Summary separator
count 100                            # Summary row
```

### ISONL (Streaming Format)
```
table.users|id name email|1 Alice alice@example.com
table.users|id name email|2 Bob bob@example.com
```

## Development Commands

### JavaScript (ison-js)
```bash
cd ison-js
npm install
npm test                    # Run tests
npm run build              # Build dist/
npm pack                   # Create tarball
npm publish                # Publish to NPM
```

### TypeScript (ison-ts)
```bash
cd ison-ts
npm install
npm run build              # tsup build
npm test                   # vitest
npm publish
```

### Python (ison-py, isonantic, ison-cli)
```bash
cd ison-py
pip install -e .           # Editable install
pytest                     # Run tests
python -m build            # Build wheel
twine upload dist/*        # Publish to PyPI
```

### Rust (ison-rust, isonantic-rust)
```bash
cd ison-rust
cargo test                 # Run tests
cargo build --release      # Build
cargo publish              # Publish to Crates.io
```

### C++ (ison-cpp, isonantic-cpp)
```bash
cd ison-cpp
mkdir build && cd build
cmake ..
cmake --build .
ctest                      # Run tests
```

### Go (ison-go, isonantic-go)
```bash
cd ison-go
go test -v ./...           # Run tests
go mod tidy                # Tidy dependencies
# Publishing: tag and push (proxy.golang.org auto-indexes)
```

### VS Code Extension (ison-vscode)
```bash
cd ison-vscode
npm install
npm run compile            # TypeScript compile
npm run package            # Create .vsix
vsce publish               # Publish to Marketplace
```

## Testing Requirements

All packages must maintain test coverage. Current test counts:

| Package | Tests | Command |
|---------|-------|---------|
| ison-js | 80 (33 parser + 47 validation) | `npm test` |
| ison-ts | 23 | `npm test` |
| ison-py | 212+ (31 parser + validation) | `pytest` |
| ison-rust | 10 (9 + doctests) | `cargo test` |
| ison-cpp | 30 | `ctest` |
| ison-go | 40+ | `go test -v ./...` |

**Total: 395+ tests across all packages**

## Coding Conventions

### General
- MIT License header not required in source files
- Use consistent naming: `parse`, `dumps`, `loads` for core functions
- Support both ISON and ISONL formats
- Include JSON conversion utilities

### JavaScript/TypeScript
- Use ES modules with CommonJS fallback
- Export both named exports and default
- Include TypeScript declarations (.d.ts)
- Zero runtime dependencies for parsers

### Python
- Support Python 3.9+
- Use type hints throughout
- Follow PEP 8 style
- Use `pyproject.toml` (not setup.py)

### Rust
- Use `thiserror` for error types
- Optional `serde` feature for JSON support
- Document public APIs with rustdoc

### C++
- C++17 minimum
- Header-only design
- Use `std::variant`, `std::optional`
- Namespace: `ison::`

### Go
- Go 1.21+
- Use standard library only (testify for tests)
- Follow Go naming conventions (exported = PascalCase)

## API Consistency

All parsers should implement these core functions:

| Function | Purpose |
|----------|---------|
| `parse(text)` / `loads(text)` | Parse ISON string to Document |
| `dumps(doc)` | Serialize Document to ISON string |
| `loads_isonl(text)` / `parse_isonl(text)` | Parse ISONL format |
| `dumps_isonl(doc)` | Serialize to ISONL format |
| `to_json(doc)` | Convert to JSON string |
| `from_json(json)` / `from_dict(obj)` | Create Document from JSON/dict |

### Value Types
All parsers recognize these types:
- `null` / `~` - Null value
- `true` / `false` - Boolean
- Integer (no decimal point)
- Float (with decimal point)
- String (quoted if contains spaces)
- Reference (`:id`, `:namespace:id`, `:RELATIONSHIP:id`)

## Validation Architecture

### Merged Packages (validation built-in)
- **ison-ts**: `import { validation } from 'ison-ts'`
- **ison-py**: `from ison_parser.validation import ...`
- **ison-go**: `import ".../ison-go/validation"`

### Separate Packages (by design)
- **isonantic-rs**: Rust crates are typically separate
- **isonantic-cpp**: Header-only libraries are separate files

### Deprecated Packages
- `isonantic-ts` → Use `ison-ts/validation`
- `isonantic` (Python) → Use `ison_parser.validation`
- `isonantic-go` → Use `ison-go/validation`

## Common Tasks

### Adding a New Feature
1. Implement in all 5 parser languages
2. Add tests in each package
3. Update README for each package
4. Update main README if significant

### Fixing a Bug
1. Write failing test first
2. Fix in affected package(s)
3. Ensure all tests pass
4. Update version if publishing

### Publishing a Release
1. Update version in package manifest (package.json, pyproject.toml, Cargo.toml)
2. Run all tests
3. Update README if needed
4. Build package
5. Publish to registry
6. Tag git commit

### Version Numbering
- Follow SemVer: MAJOR.MINOR.PATCH
- All packages don't need to be in sync
- Main README badge should reflect latest stable

## Important Files

| File | Purpose |
|------|---------|
| `README.md` | Main project documentation |
| `AGENTS.md` | This file - AI agent guidelines |
| `LICENSE` | MIT License |
| `images/ison_logo_git.png` | Logo for GitHub/dark backgrounds |
| `images/ison_logo_white_bg.png` | Logo for light backgrounds |
| `benchmark/` | Token efficiency benchmarks |

## Links

- **Website:** https://www.ison.dev
- **Documentation:** https://www.getison.com
- **Specification:** https://www.ison.dev/spec.html
- **Playground:** https://www.ison.dev/playground.html
- **GitHub:** https://github.com/ISON-format/ison

## Notes for AI Agents

1. **Validation is built-in** for Python, TypeScript, and Go parsers. Don't suggest installing separate isonantic packages.

2. **Package names differ from directory names:**
   - `ison-js` → publishes as `ison-parser`
   - `ison-rust` → publishes as `ison-rs`

3. **Go modules** don't have version numbers in go.mod - versioning is via git tags.

4. **C++ and Rust** validation packages are NOT deprecated - they remain separate by design.

5. **Test counts** in badges may need updating after adding tests.

6. When modifying parsers, **maintain API compatibility** across all languages where possible.

7. **ISONL** is for streaming/large datasets - each line is self-contained with pipe separators.

8. **References** come in three forms:
   - Simple: `:42` (reference to id 42)
   - Namespaced: `:user:42` (reference to user with id 42)
   - Relationship: `:MEMBER_OF:42` (UPPERCASE = relationship type)
