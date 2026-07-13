"""
Token counting utilities for ISON CLI.

Provides token count comparison across formats using tiktoken.
"""

from typing import Dict, Optional
from .formats import (
    Format, read_ison, read_isonl, read_json, read_jsonl,
    write_ison, write_isonl, write_json, write_yaml, write_csv
)

# Optional tiktoken import
try:
    import tiktoken
    HAS_TIKTOKEN = True
except ImportError:
    HAS_TIKTOKEN = False


def count_tokens(text: str, model: str = "gpt-4o") -> int:
    """Count tokens in text using tiktoken."""
    if not HAS_TIKTOKEN:
        raise ImportError(
            "tiktoken not installed. Run: pip install ison-cli[tokens]"
        )

    try:
        encoding = tiktoken.encoding_for_model(model)
    except KeyError:
        # Fallback to cl100k_base for unknown models
        encoding = tiktoken.get_encoding("cl100k_base")

    return len(encoding.encode(text))


def compare_formats(
    content: str,
    source_format: Format,
    model: str = "gpt-4o",
    block_name: str = "data"
) -> Dict[str, Dict]:
    """
    Compare token counts across multiple formats.

    Returns dict with format names as keys and token info as values.
    """
    if not HAS_TIKTOKEN:
        raise ImportError(
            "tiktoken not installed. Run: pip install ison-cli[tokens]"
        )

    # Parse source content
    readers = {
        Format.ISON: read_ison,
        Format.ISONL: read_isonl,
        Format.JSON: read_json,
        Format.JSONL: read_jsonl,
    }

    if source_format not in readers:
        # Read as JSON by default for comparison
        import json
        data = json.loads(content)
    else:
        data = readers[source_format](content)

    # Generate all format versions
    formats_to_compare = {}

    # ISON
    try:
        ison_text = write_ison(data, block_name)
        formats_to_compare['ISON'] = ison_text
    except Exception:
        pass

    # ISONL
    try:
        isonl_text = write_isonl(data, block_name)
        formats_to_compare['ISONL'] = isonl_text
    except Exception:
        pass

    # JSON (pretty)
    try:
        json_text = write_json(data, compact=False)
        formats_to_compare['JSON'] = json_text
    except Exception:
        pass

    # JSON Compact
    try:
        json_compact = write_json(data, compact=True)
        formats_to_compare['JSON Compact'] = json_compact
    except Exception:
        pass

    # YAML
    try:
        yaml_text = write_yaml(data)
        formats_to_compare['YAML'] = yaml_text
    except Exception:
        pass

    # CSV (if applicable)
    try:
        csv_text = write_csv(data)
        if csv_text.strip():
            formats_to_compare['CSV'] = csv_text
    except Exception:
        pass

    # Count tokens for each format
    results = {}
    for fmt_name, text in formats_to_compare.items():
        tokens = count_tokens(text, model)
        chars = len(text)
        lines = len(text.split('\n'))
        results[fmt_name] = {
            'tokens': tokens,
            'chars': chars,
            'lines': lines,
            'text': text
        }

    # Calculate savings relative to JSON
    if 'JSON' in results:
        json_tokens = results['JSON']['tokens']
        for fmt_name, info in results.items():
            if fmt_name != 'JSON':
                savings = ((json_tokens - info['tokens']) / json_tokens) * 100
                info['savings_vs_json'] = savings
            else:
                info['savings_vs_json'] = 0.0

    return results


def format_comparison_table(results: Dict[str, Dict]) -> str:
    """Format comparison results as a table."""
    if not results:
        return "No results to display."

    # Sort by token count
    sorted_formats = sorted(results.items(), key=lambda x: x[1]['tokens'])

    # Build table
    lines = []
    lines.append("+" + "-" * 18 + "+" + "-" * 10 + "+" + "-" * 10 + "+" + "-" * 12 + "+")
    lines.append(f"| {'Format':<16} | {'Tokens':>8} | {'Chars':>8} | {'vs JSON':>10} |")
    lines.append("+" + "-" * 18 + "+" + "-" * 10 + "+" + "-" * 10 + "+" + "-" * 12 + "+")

    for fmt_name, info in sorted_formats:
        tokens = info['tokens']
        chars = info['chars']
        savings = info.get('savings_vs_json', 0)

        if savings > 0:
            savings_str = f"-{savings:.1f}%"
        elif savings < 0:
            savings_str = f"+{abs(savings):.1f}%"
        else:
            savings_str = "baseline"

        lines.append(f"| {fmt_name:<16} | {tokens:>8,} | {chars:>8,} | {savings_str:>10} |")

    lines.append("+" + "-" * 18 + "+" + "-" * 10 + "+" + "-" * 10 + "+" + "-" * 12 + "+")

    return '\n'.join(lines)
