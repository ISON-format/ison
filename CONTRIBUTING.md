# Contributing to ISON

Thank you for your interest in contributing to ISON! This document provides guidelines and information for contributors.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/ISON-format/ison.git
   cd ison
   ```
3. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Project Structure

ISON is a monorepo containing parser implementations across multiple languages:

```
ison/
├── ison-js/           # JavaScript parser (NPM: ison-parser)
├── ison-ts/           # TypeScript parser (NPM: ison-ts)
├── ison-py/           # Python parser (PyPI: ison-py)
├── ison-rust/         # Rust parser (Crates.io: ison-rs)
├── ison-cpp/          # C++ header-only parser
├── ison-go/           # Go parser
├── ison-cli/          # Python CLI tool (PyPI: ison-cli)
├── ison-vscode/       # VS Code extension
├── n8n-nodes-ison/    # n8n community node
├── isonantic-rust/    # Rust validation (separate crate)
├── isonantic-cpp/     # C++ validation header
└── benchmark/         # Token efficiency benchmarks
```

## Development Setup

### JavaScript (ison-js)
```bash
cd ison-js
npm install
npm test
```

### TypeScript (ison-ts)
```bash
cd ison-ts
npm install
npm run build
npm test
```

### Python (ison-py)
```bash
cd ison-py
pip install -e ".[dev]"
pytest
```

### Rust (ison-rust)
```bash
cd ison-rust
cargo test
```

### C++ (ison-cpp)
```bash
cd ison-cpp
mkdir build && cd build
cmake ..
cmake --build .
ctest
```

### Go (ison-go)
```bash
cd ison-go
go test -v ./...
```

## Coding Standards

### General Guidelines
- Write clear, concise code with meaningful variable names
- Add comments for complex logic
- Follow existing code patterns in each package
- Maintain API consistency across language implementations

### Language-Specific

**JavaScript/TypeScript:**
- Use ES modules with CommonJS fallback
- Include TypeScript declarations
- Zero runtime dependencies for parsers

**Python:**
- Support Python 3.9+
- Use type hints throughout
- Follow PEP 8 style guide
- Use `pyproject.toml` for configuration

**Rust:**
- Use `thiserror` for error types
- Document public APIs with rustdoc
- No unsafe code in the parser

**C++:**
- C++17 minimum
- Header-only design
- Use `std::variant`, `std::optional`
- Namespace: `ison::`

**Go:**
- Go 1.21+
- Use standard library only (testify for tests)
- Follow Go naming conventions

## Making Changes

### Before Submitting

1. **Run tests** in the affected package(s)
2. **Check formatting** (if applicable)
3. **Update documentation** if you changed public APIs
4. **Add tests** for new functionality

### Commit Messages

Use clear, descriptive commit messages:

```
feat(ison-py): add support for nested references
fix(ison-ts): handle empty strings in parser
docs(README): update installation instructions
test(ison-rust): add tests for ISONL streaming
```

Prefixes:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test additions/changes
- `refactor`: Code refactoring
- `chore`: Maintenance tasks

### Pull Request Process

1. **Update the README** if needed
2. **Add tests** for your changes
3. **Ensure all tests pass** in affected packages
4. **Request a review** from maintainers
5. **Respond to feedback** and make requested changes

### Pull Request Title Format

```
[package] Brief description of changes
```

Examples:
- `[ison-py] Add ISONL streaming support`
- `[ison-ts] Fix reference parsing for namespaced IDs`
- `[docs] Update API documentation`

## Testing

### Adding Tests

When adding new functionality, include tests that cover:
- Normal use cases
- Edge cases
- Error conditions

### Test Counts by Package

| Package | Minimum Tests | Command |
|---------|---------------|---------|
| ison-js | 80+ | `npm test` |
| ison-ts | 23+ | `npm test` |
| ison-py | 31+ | `pytest` |
| ison-rust | 9+ | `cargo test` |
| ison-cpp | 30+ | `ctest` |
| ison-go | 40+ | `go test -v ./...` |

## API Consistency

When adding features, implement them consistently across all parsers where applicable:

| Function | Purpose |
|----------|---------|
| `parse(text)` / `loads(text)` | Parse ISON string to Document |
| `dumps(doc)` | Serialize Document to ISON string |
| `loads_isonl(text)` | Parse ISONL format |
| `dumps_isonl(doc)` | Serialize to ISONL format |
| `to_json(doc)` | Convert to JSON string |
| `from_json(json)` / `from_dict(obj)` | Create Document from JSON/dict |

## Reporting Issues

### Bug Reports

Include:
- Package name and version
- Language/runtime version
- Minimal reproduction code
- Expected vs actual behavior
- Error messages (if any)

### Feature Requests

Include:
- Use case description
- Proposed API (if applicable)
- Which packages should be affected

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Questions?

- Open a [GitHub Issue](https://github.com/ISON-format/ison/issues)
- Check the [Documentation](https://www.ison.dev)
- Visit [www.getison.com](https://www.getison.com)

## License

By contributing to ISON, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to ISON!
