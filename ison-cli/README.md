<p align="center">
  <img src="https://raw.githubusercontent.com/ISON-format/ison/main/images/ison_logo_git.png" alt="ISON Logo">
</p>

# ISON CLI

**Command-line interface for ISON** - Convert, validate, and work with token-efficient data formats.

[![PyPI version](https://badge.fury.io/py/ison-cli.svg)](https://badge.fury.io/py/ison-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Universal Converter** - Convert between ISON, JSON, YAML, CSV, TSV, TOML, XML
- **Token Counter** - Compare token usage across formats (for LLM cost optimization)
- **Validator** - Validate ISON/ISONL syntax
- **Database Export** - Export SQL databases to ISON
- **Pretty Printer** - Format and view ISON files

## Installation

```bash
# Basic installation
pip install ison-cli

# With token counting support
pip install ison-cli[tokens]

# With database export support
pip install ison-cli[db]

# Full installation (all features)
pip install ison-cli[all]
```

## Quick Start

```bash
# Convert JSON to ISON
ison convert data.json -o data.ison

# Convert ISON to JSON
ison convert data.ison -o data.json

# Compare token counts
ison tokens data.json --compare

# Validate ISON file
ison validate data.ison

# View ISON contents
ison view data.ison
```

## Commands

### `ison convert` - Format Conversion

Convert between any supported formats:

```bash
# JSON to ISON
ison convert users.json -o users.ison

# ISON to JSON
ison convert users.ison -o users.json

# CSV to ISON
ison convert data.csv -o data.ison --block users

# YAML to ISON
ison convert config.yaml -o config.ison

# ISON to YAML
ison convert data.ison -o data.yaml

# Output to stdout
ison convert data.json -t ison --stdout

# Compact JSON output
ison convert data.ison -o data.json --compact
```

**Supported Formats:**

| Format | Extensions | Description |
|--------|------------|-------------|
| ison | .ison | ISON - Token-efficient structured data |
| isonl | .isonl | ISON Lines - Streaming format |
| json | .json | JSON - JavaScript Object Notation |
| jsonl | .jsonl, .ndjson | JSON Lines - Newline-delimited JSON |
| yaml | .yaml, .yml | YAML - Human-readable data format |
| csv | .csv | CSV - Comma-separated values |
| tsv | .tsv | TSV - Tab-separated values |
| toml | .toml | TOML - Configuration format |
| xml | .xml | XML - Extensible Markup Language |

### `ison tokens` - Token Counting

Compare token usage across formats for LLM cost optimization:

```bash
# Count tokens in a file
ison tokens data.json

# Compare all formats
ison tokens data.json --compare

# Use specific model tokenizer
ison tokens data.json --compare -m gpt-4

# Raw output (for scripting)
ison tokens data.json --raw
```

Example output:
```
┏━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━┳━━━━━━━━━━┳━━━━━━━━━━━━┓
┃ Format           ┃   Tokens ┃    Chars ┃    vs JSON ┃
┡━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━╇━━━━━━━━━━╇━━━━━━━━━━━━┩
│ ISON             │      386 │    1,245 │    -73.7%  │
│ ISONL            │      412 │    1,380 │    -71.9%  │
│ JSON Compact     │      861 │    2,890 │    -41.3%  │
│ YAML             │    1,124 │    3,450 │    -23.4%  │
│ JSON             │    1,465 │    4,920 │   baseline │
└──────────────────┴──────────┴──────────┴────────────┘

ISON saves 73.7% tokens vs JSON
```

### `ison validate` - Validation

Validate ISON and ISONL files:

```bash
# Validate syntax
ison validate data.ison

# Quiet mode (only show errors)
ison validate data.ison -q

# Strict mode
ison validate data.ison --strict
```

### `ison view` - View Contents

View and inspect ISON files:

```bash
# View with rich formatting
ison view data.ison

# View specific block
ison view data.ison --block users

# View as JSON
ison view data.ison --json

# Limit rows
ison view data.ison -n 10

# Raw output
ison view data.ison --raw
```

### `ison fmt` - Format/Pretty Print

Format ISON files:

```bash
# Format in place
ison fmt data.ison

# Format to new file
ison fmt data.ison -o formatted.ison

# Check if formatted
ison fmt data.ison --check

# Compact output
ison fmt data.ison --compact
```

### `ison info` - File Information

Show file statistics:

```bash
ison info data.ison
```

Output:
```
╭─ data.ison ──────────────────────────╮
│ Format: ISON                         │
│ Size: 1,245 bytes                    │
│ Blocks: 2                            │
│ Total rows: 150                      │
│                                      │
│ Blocks:                              │
│   table.users: 100 rows, 5 fields    │
│   table.orders: 50 rows, 4 fields    │
╰──────────────────────────────────────╯
```

### `ison export` - Database Export

Export SQL databases to ISON:

```bash
# List tables
ison export sqlite:///data.db --list-tables

# Export specific table
ison export sqlite:///data.db -t users -o users.ison

# Export multiple tables
ison export sqlite:///data.db -t users -t orders -o data.ison

# Export with SQL query
ison export sqlite:///data.db -q "SELECT * FROM users WHERE active=1" -o active_users.ison

# Export to JSON
ison export sqlite:///data.db -t users -o users.json -f json

# PostgreSQL
ison export postgresql://user:pass@localhost/mydb -t users -o users.ison

# Limit rows
ison export sqlite:///data.db -t users -n 100 -o sample.ison
```

**Supported Databases:**
- SQLite: `sqlite:///path/to/db.sqlite`
- PostgreSQL: `postgresql://user:pass@host:5432/dbname`
- MySQL: `mysql://user:pass@host:3306/dbname`
- SQL Server: `mssql+pyodbc://user:pass@host/dbname`

### `ison formats` - List Formats

Show all supported formats:

```bash
ison formats
```

## Examples

### Convert API Response to ISON

```bash
# Fetch JSON from API and convert to ISON
curl https://api.example.com/users | ison convert - -t ison > users.ison
```

### CI/CD Validation

```bash
# Validate all ISON files in directory
for f in *.ison; do ison validate "$f" -q || exit 1; done
```

### Token Cost Estimation

```bash
# Compare formats for a large dataset
ison tokens large_dataset.json --compare -m gpt-4o

# Output for scripting
TOKENS=$(ison tokens data.ison --raw)
echo "Cost estimate: $((TOKENS * 3 / 1000000)) per 1M requests"
```

### Database Migration

```bash
# Export entire database
ison export sqlite:///legacy.db -o backup.ison

# Convert to JSON for another system
ison convert backup.ison -o backup.json
```

## Configuration

The CLI respects these environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `ISON_DEFAULT_MODEL` | Default tokenizer model | gpt-4o |
| `ISON_OUTPUT_FORMAT` | Default output format | ison |

## Programmatic Usage

The CLI modules can be used as a library:

```python
from ison_cli.formats import convert, Format

# Convert JSON to ISON
ison_text = convert(json_string, Format.JSON, Format.ISON)

# Compare token counts
from ison_cli.tokens import compare_formats
results = compare_formats(content, Format.JSON, model="gpt-4o")
```

## Links

- [ISON Documentation](https://www.ison.dev)
- [ISON Specification](https://www.ison.dev/spec.html)
- [Python Package](https://pypi.org/project/ison-py/)
- [GitHub Repository](https://github.com/ISON-format/ison)

## License

MIT License - see [LICENSE](LICENSE) for details.
