"""
ISON CLI - Main entry point.

A comprehensive command-line interface for ISON format operations.
"""

import sys
from pathlib import Path
from typing import Optional

import click
from rich.console import Console
from rich.table import Table
from rich.syntax import Syntax
from rich.panel import Panel

import ison_parser as ison
from . import __version__
from .formats import (
    Format, EXTENSION_MAP, detect_format, detect_format_from_content,
    convert, read_ison, read_isonl, write_ison, write_json
)

console = Console()
error_console = Console(stderr=True)


def print_error(message: str):
    """Print error message to stderr."""
    error_console.print(f"[red]Error:[/red] {message}")


def print_success(message: str):
    """Print success message."""
    console.print(f"[green]{message}[/green]")


def get_format_from_option(fmt: Optional[str], file_path: Optional[str] = None) -> Optional[Format]:
    """Get format from option or detect from file."""
    if fmt:
        try:
            return Format(fmt.lower())
        except ValueError:
            return None
    if file_path:
        return detect_format(file_path)
    return None


# =============================================================================
# Main CLI Group
# =============================================================================

@click.group()
@click.version_option(__version__, prog_name="ison")
def cli():
    """
    ISON CLI - Token-efficient data format for AI/LLM workflows.

    Convert, validate, and work with ISON, JSON, YAML, CSV, and more.

    \b
    Examples:
      ison convert data.json -o data.ison
      ison tokens data.json
      ison validate data.ison
      ison view data.ison

    Documentation: https://www.ison.dev
    """
    pass


# =============================================================================
# Convert Command
# =============================================================================

@cli.command('convert')
@click.argument('input_file', type=click.Path(exists=True))
@click.option('-o', '--output', type=click.Path(), help='Output file path')
@click.option('-f', '--from', 'from_fmt', help='Source format (auto-detected if omitted)')
@click.option('-t', '--to', 'to_fmt', help='Target format (from output extension if omitted)')
@click.option('--block', default='data', help='Block name for ISON output')
@click.option('--compact', is_flag=True, help='Compact output (no indentation)')
@click.option('--stdout', is_flag=True, help='Write to stdout instead of file')
def convert_cmd(input_file, output, from_fmt, to_fmt, block, compact, stdout):
    """
    Convert between data formats.

    \b
    Supported formats:
      ison, isonl, json, jsonl, yaml, csv, tsv, toml, xml

    \b
    Examples:
      ison convert data.json -o data.ison
      ison convert data.yaml -o data.json
      ison convert data.csv -o data.ison --block users
      ison convert data.ison -t json --stdout
    """
    try:
        # Read input
        content = Path(input_file).read_text(encoding='utf-8')

        # Determine source format
        source_format = get_format_from_option(from_fmt, input_file)
        if not source_format:
            source_format = detect_format_from_content(content)

        # Determine target format
        if to_fmt:
            target_format = Format(to_fmt.lower())
        elif output:
            target_format = detect_format(output)
            if not target_format:
                print_error(f"Cannot determine format from: {output}")
                sys.exit(1)
        else:
            print_error("Specify output file (-o) or target format (-t)")
            sys.exit(1)

        # Convert
        result = convert(content, source_format, target_format, block, compact)

        # Output
        if stdout or not output:
            console.print(result)
        else:
            Path(output).write_text(result, encoding='utf-8')
            print_success(f"Converted {source_format.value} -> {target_format.value}: {output}")

    except Exception as e:
        print_error(str(e))
        sys.exit(1)


# =============================================================================
# Validate Command
# =============================================================================

@cli.command()
@click.argument('input_file', type=click.Path(exists=True))
@click.option('--schema', type=click.Path(exists=True), help='Schema file for validation')
@click.option('--strict', is_flag=True, help='Strict validation mode')
@click.option('-q', '--quiet', is_flag=True, help='Only show errors')
def validate(input_file, schema, strict, quiet):
    """
    Validate ISON/ISONL files.

    \b
    Examples:
      ison validate data.ison
      ison validate data.ison --schema schema.ison
      ison validate data.isonl --strict
    """
    try:
        content = Path(input_file).read_text(encoding='utf-8')

        # Detect format
        fmt = detect_format(input_file)
        if fmt not in (Format.ISON, Format.ISONL):
            fmt = detect_format_from_content(content)

        # Parse to validate syntax
        if fmt == Format.ISONL:
            doc = ison.loads_isonl(content)
        else:
            doc = ison.loads(content)

        # Count blocks and rows
        block_count = len(doc.blocks)
        row_count = sum(len(b.rows) for b in doc.blocks)

        if not quiet:
            console.print(Panel(
                f"[green]Valid {fmt.value.upper()}[/green]\n\n"
                f"Blocks: {block_count}\n"
                f"Total rows: {row_count}",
                title=f"[bold]{input_file}[/bold]"
            ))

        # TODO: Schema validation when schema file provided

    except ison.ISONError as e:
        print_error(f"Syntax error: {e}")
        sys.exit(1)
    except Exception as e:
        print_error(str(e))
        sys.exit(1)


# =============================================================================
# Format Command
# =============================================================================

@cli.command()
@click.argument('input_file', type=click.Path(exists=True))
@click.option('-o', '--output', type=click.Path(), help='Output file (default: overwrite input)')
@click.option('--compact', is_flag=True, help='Compact output')
@click.option('--check', is_flag=True, help='Check if file is formatted, exit 1 if not')
def fmt(input_file, output, compact, check):
    """
    Format/pretty-print ISON files.

    \b
    Examples:
      ison fmt data.ison
      ison fmt data.ison --compact
      ison fmt data.ison -o formatted.ison
      ison fmt data.ison --check
    """
    try:
        content = Path(input_file).read_text(encoding='utf-8')

        # Parse and re-serialize
        fmt_type = detect_format(input_file) or detect_format_from_content(content)

        if fmt_type == Format.ISONL:
            doc = ison.loads_isonl(content)
            formatted = ison.dumps_isonl(doc)
        elif fmt_type == Format.ISON:
            doc = ison.loads(content)
            formatted = ison.dumps(doc)
        elif fmt_type == Format.JSON:
            import json
            data = json.loads(content)
            if compact:
                formatted = json.dumps(data, separators=(',', ':'))
            else:
                formatted = json.dumps(data, indent=2)
        else:
            print_error(f"Format command only supports ISON, ISONL, and JSON")
            sys.exit(1)

        if check:
            if content.strip() != formatted.strip():
                print_error("File is not formatted")
                sys.exit(1)
            print_success("File is properly formatted")
            return

        output_path = output or input_file
        Path(output_path).write_text(formatted, encoding='utf-8')
        print_success(f"Formatted: {output_path}")

    except Exception as e:
        print_error(str(e))
        sys.exit(1)


# =============================================================================
# View Command
# =============================================================================

@cli.command()
@click.argument('input_file', type=click.Path(exists=True))
@click.option('--block', '-b', help='Show specific block only')
@click.option('--json', 'as_json', is_flag=True, help='Output as JSON')
@click.option('--raw', is_flag=True, help='Raw output without styling')
@click.option('--limit', '-n', type=int, help='Limit number of rows')
def view(input_file, block, as_json, raw, limit):
    """
    View ISON file contents.

    \b
    Examples:
      ison view data.ison
      ison view data.ison --block users
      ison view data.ison --json
      ison view data.ison -n 10
    """
    try:
        content = Path(input_file).read_text(encoding='utf-8')

        # Parse
        fmt = detect_format(input_file) or detect_format_from_content(content)
        if fmt == Format.ISONL:
            doc = ison.loads_isonl(content)
        else:
            doc = ison.loads(content)

        # Filter by block
        if block:
            doc.blocks = [b for b in doc.blocks if b.name == block]
            if not doc.blocks:
                print_error(f"Block not found: {block}")
                sys.exit(1)

        # Apply limit
        if limit:
            for b in doc.blocks:
                b.rows = b.rows[:limit]

        # Output
        if as_json:
            import json
            data = doc.to_dict()
            if raw:
                console.print(json.dumps(data, indent=2))
            else:
                syntax = Syntax(json.dumps(data, indent=2), "json", theme="monokai")
                console.print(syntax)
        else:
            if raw:
                console.print(ison.dumps(doc))
            else:
                # Rich table display
                for b in doc.blocks:
                    table = Table(title=f"[bold]{b.kind}.{b.name}[/bold]")

                    for field in b.fields:
                        table.add_column(field, style="cyan")

                    for row in b.rows:
                        values = [str(row.get(f, '')) for f in b.fields]
                        table.add_row(*values)

                    console.print(table)
                    console.print()

    except Exception as e:
        print_error(str(e))
        sys.exit(1)


# =============================================================================
# Tokens Command
# =============================================================================

@cli.command()
@click.argument('input_file', type=click.Path(exists=True))
@click.option('--model', '-m', default='gpt-4o', help='Model for tokenization (default: gpt-4o)')
@click.option('--compare', '-c', is_flag=True, help='Compare with other formats')
@click.option('--raw', is_flag=True, help='Raw output without styling')
def tokens(input_file, model, compare, raw):
    """
    Count tokens and compare formats.

    \b
    Examples:
      ison tokens data.json
      ison tokens data.ison --compare
      ison tokens data.json -m gpt-4
    """
    try:
        from .tokens import count_tokens, compare_formats, format_comparison_table

        content = Path(input_file).read_text(encoding='utf-8')
        fmt = detect_format(input_file) or detect_format_from_content(content)

        if compare:
            results = compare_formats(content, fmt, model)

            if raw:
                console.print(format_comparison_table(results))
            else:
                # Rich table
                table = Table(title=f"[bold]Token Comparison ({model})[/bold]")
                table.add_column("Format", style="cyan")
                table.add_column("Tokens", justify="right")
                table.add_column("Chars", justify="right")
                table.add_column("vs JSON", justify="right")

                sorted_results = sorted(results.items(), key=lambda x: x[1]['tokens'])
                for fmt_name, info in sorted_results:
                    savings = info.get('savings_vs_json', 0)
                    if savings > 0:
                        savings_str = f"[green]-{savings:.1f}%[/green]"
                    elif savings < 0:
                        savings_str = f"[red]+{abs(savings):.1f}%[/red]"
                    else:
                        savings_str = "[dim]baseline[/dim]"

                    table.add_row(
                        fmt_name,
                        f"{info['tokens']:,}",
                        f"{info['chars']:,}",
                        savings_str
                    )

                console.print(table)

                # Summary
                if 'ISON' in results and 'JSON' in results:
                    ison_tokens = results['ISON']['tokens']
                    json_tokens = results['JSON']['tokens']
                    savings = ((json_tokens - ison_tokens) / json_tokens) * 100
                    console.print(f"\n[bold green]ISON saves {savings:.1f}% tokens vs JSON[/bold green]")

        else:
            token_count = count_tokens(content, model)
            char_count = len(content)

            if raw:
                console.print(f"{token_count}")
            else:
                console.print(Panel(
                    f"Tokens: [bold cyan]{token_count:,}[/bold cyan]\n"
                    f"Characters: {char_count:,}\n"
                    f"Model: {model}",
                    title=f"[bold]{input_file}[/bold]"
                ))

    except ImportError as e:
        print_error(f"{e}\nInstall with: pip install ison-cli[tokens]")
        sys.exit(1)
    except Exception as e:
        print_error(str(e))
        sys.exit(1)


# =============================================================================
# Export Command (Database)
# =============================================================================

@cli.command()
@click.argument('connection')
@click.option('--table', '-t', multiple=True, help='Tables to export (default: all)')
@click.option('--query', '-q', help='Custom SQL query')
@click.option('--output', '-o', type=click.Path(), help='Output file')
@click.option('--format', '-f', 'out_format', default='ison', help='Output format (default: ison)')
@click.option('--limit', '-n', type=int, help='Limit rows per table')
@click.option('--list-tables', is_flag=True, help='List available tables')
def export(connection, table, query, output, out_format, limit, list_tables):
    """
    Export database tables to ISON or other formats.

    \b
    Examples:
      ison export sqlite:///data.db --list-tables
      ison export sqlite:///data.db -t users -o users.ison
      ison export postgresql://user:pass@host/db -q "SELECT * FROM users"
      ison export sqlite:///data.db -o all_tables.json -f json
    """
    try:
        from .database import list_tables as db_list_tables, export_table, export_query, export_database

        if list_tables:
            tables = db_list_tables(connection)
            console.print("[bold]Available tables:[/bold]")
            for t in tables:
                console.print(f"  - {t}")
            return

        if query:
            data = export_query(connection, query)
        elif table:
            data = {}
            for t in table:
                table_data = export_table(connection, t, limit)
                data.update(table_data)
        else:
            data = export_database(connection, limit=limit)

        # Convert to target format
        target_format = Format(out_format.lower())

        if target_format == Format.ISON:
            result = write_ison(data)
        elif target_format == Format.JSON:
            result = write_json(data)
        else:
            from .formats import convert
            json_str = write_json(data)
            result = convert(json_str, Format.JSON, target_format)

        if output:
            Path(output).write_text(result, encoding='utf-8')
            print_success(f"Exported to: {output}")
        else:
            console.print(result)

    except ImportError as e:
        print_error(f"{e}\nInstall with: pip install ison-cli[db]")
        sys.exit(1)
    except Exception as e:
        print_error(str(e))
        sys.exit(1)


# =============================================================================
# Info Command
# =============================================================================

@cli.command()
@click.argument('input_file', type=click.Path(exists=True))
def info(input_file):
    """
    Show file information and statistics.

    \b
    Examples:
      ison info data.ison
    """
    try:
        content = Path(input_file).read_text(encoding='utf-8')
        file_size = Path(input_file).stat().st_size

        fmt = detect_format(input_file) or detect_format_from_content(content)

        # Parse
        if fmt == Format.ISONL:
            doc = ison.loads_isonl(content)
        elif fmt == Format.ISON:
            doc = ison.loads(content)
        else:
            console.print(Panel(
                f"Format: {fmt.value}\n"
                f"Size: {file_size:,} bytes\n"
                f"Lines: {len(content.splitlines())}",
                title=f"[bold]{input_file}[/bold]"
            ))
            return

        # ISON-specific stats
        block_info = []
        total_rows = 0
        for b in doc.blocks:
            row_count = len(b.rows)
            total_rows += row_count
            block_info.append(f"  {b.kind}.{b.name}: {row_count} rows, {len(b.fields)} fields")

        info_text = (
            f"Format: {fmt.value.upper()}\n"
            f"Size: {file_size:,} bytes\n"
            f"Blocks: {len(doc.blocks)}\n"
            f"Total rows: {total_rows}\n\n"
            f"[bold]Blocks:[/bold]\n" + "\n".join(block_info)
        )

        console.print(Panel(info_text, title=f"[bold]{input_file}[/bold]"))

    except Exception as e:
        print_error(str(e))
        sys.exit(1)


# =============================================================================
# Formats Command
# =============================================================================

@cli.command()
def formats():
    """
    Show supported formats.
    """
    table = Table(title="[bold]Supported Formats[/bold]")
    table.add_column("Format", style="cyan")
    table.add_column("Extensions")
    table.add_column("Description")

    formats_info = [
        ("ison", ".ison", "ISON - Token-efficient structured data"),
        ("isonl", ".isonl", "ISON Lines - Streaming format"),
        ("json", ".json", "JSON - JavaScript Object Notation"),
        ("jsonl", ".jsonl, .ndjson", "JSON Lines - Newline-delimited JSON"),
        ("yaml", ".yaml, .yml", "YAML - Human-readable data format"),
        ("csv", ".csv", "CSV - Comma-separated values"),
        ("tsv", ".tsv", "TSV - Tab-separated values"),
        ("toml", ".toml", "TOML - Configuration format"),
        ("xml", ".xml", "XML - Extensible Markup Language"),
    ]

    for fmt, ext, desc in formats_info:
        table.add_row(fmt, ext, desc)

    console.print(table)

    console.print("\n[bold]Conversion Matrix:[/bold]")
    console.print("  All formats can be converted to/from each other.")
    console.print("  Use: ison convert <input> -o <output>")


# =============================================================================
# Entry Point
# =============================================================================

if __name__ == '__main__':
    cli()
