"""
Format detection and conversion utilities for ISON CLI.

Supports: ISON, ISONL, JSON, JSONL, YAML, CSV, TSV, TOML, XML
"""

import json
import csv
import io
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
from enum import Enum

import ison_parser as ison

# Optional imports
try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

try:
    import toml
    HAS_TOML = True
except ImportError:
    HAS_TOML = False


class Format(Enum):
    """Supported data formats."""
    ISON = "ison"
    ISONL = "isonl"
    JSON = "json"
    JSONL = "jsonl"
    YAML = "yaml"
    CSV = "csv"
    TSV = "tsv"
    TOML = "toml"
    XML = "xml"


# File extension to format mapping
EXTENSION_MAP = {
    '.ison': Format.ISON,
    '.isonl': Format.ISONL,
    '.json': Format.JSON,
    '.jsonl': Format.JSONL,
    '.ndjson': Format.JSONL,
    '.yaml': Format.YAML,
    '.yml': Format.YAML,
    '.csv': Format.CSV,
    '.tsv': Format.TSV,
    '.toml': Format.TOML,
    '.xml': Format.XML,
}


def detect_format(file_path: str) -> Optional[Format]:
    """Detect format from file extension."""
    ext = Path(file_path).suffix.lower()
    return EXTENSION_MAP.get(ext)


def detect_format_from_content(content: str) -> Format:
    """Detect format by analyzing content."""
    content = content.strip()

    # Check for ISONL (pipe-delimited lines)
    if content and '|' in content.split('\n')[0]:
        first_line = content.split('\n')[0]
        if re.match(r'^(table|object|meta)\.\w+\|', first_line):
            return Format.ISONL

    # Check for ISON (table.name or object.name headers)
    if re.match(r'^(table|object|meta)\.\w+', content):
        return Format.ISON

    # Check for JSON
    if content.startswith('{') or content.startswith('['):
        return Format.JSON

    # Check for JSONL (multiple JSON objects on lines)
    lines = content.split('\n')
    if lines and lines[0].strip().startswith('{'):
        if all(line.strip().startswith('{') or not line.strip() for line in lines[:5]):
            return Format.JSONL

    # Check for YAML
    if content.startswith('---') or ': ' in content.split('\n')[0]:
        return Format.YAML

    # Check for XML
    if content.startswith('<?xml') or content.startswith('<'):
        return Format.XML

    # Check for TOML
    if re.match(r'^\[[\w\.-]+\]', content) or '=' in content.split('\n')[0]:
        return Format.TOML

    # Check for CSV/TSV (has header with comma or tab)
    first_line = content.split('\n')[0] if content else ''
    if '\t' in first_line:
        return Format.TSV
    if ',' in first_line:
        return Format.CSV

    # Default to JSON
    return Format.JSON


# =============================================================================
# Readers - Parse various formats to Python dict/list
# =============================================================================

def read_ison(content: str) -> Dict[str, Any]:
    """Parse ISON content to dict."""
    doc = ison.loads(content)
    return doc.to_dict()


def read_isonl(content: str) -> Dict[str, Any]:
    """Parse ISONL content to dict."""
    doc = ison.loads_isonl(content)
    return doc.to_dict()


def read_json(content: str) -> Union[Dict, List]:
    """Parse JSON content."""
    return json.loads(content)


def read_jsonl(content: str) -> List[Dict]:
    """Parse JSONL (newline-delimited JSON) content."""
    result = []
    for line in content.strip().split('\n'):
        line = line.strip()
        if line:
            result.append(json.loads(line))
    return result


def read_yaml(content: str) -> Union[Dict, List]:
    """Parse YAML content."""
    if not HAS_YAML:
        raise ImportError("PyYAML not installed. Run: pip install pyyaml")
    return yaml.safe_load(content)


def read_csv(content: str, delimiter: str = ',') -> List[Dict]:
    """Parse CSV/TSV content to list of dicts."""
    reader = csv.DictReader(io.StringIO(content), delimiter=delimiter)
    result = []
    for row in reader:
        # Type inference for values
        typed_row = {}
        for key, value in row.items():
            typed_row[key] = _infer_type(value)
        result.append(typed_row)
    return result


def read_tsv(content: str) -> List[Dict]:
    """Parse TSV content."""
    return read_csv(content, delimiter='\t')


def read_toml(content: str) -> Dict:
    """Parse TOML content."""
    if not HAS_TOML:
        raise ImportError("toml not installed. Run: pip install toml")
    return toml.loads(content)


def read_xml(content: str) -> Dict:
    """Parse XML content to dict."""
    import xml.etree.ElementTree as ET

    def element_to_dict(elem) -> Union[Dict, str, List]:
        result = {}

        # Add attributes
        if elem.attrib:
            result.update({f"@{k}": v for k, v in elem.attrib.items()})

        # Process children
        children = list(elem)
        if children:
            child_dict = {}
            for child in children:
                child_data = element_to_dict(child)
                if child.tag in child_dict:
                    # Convert to list if multiple children with same tag
                    if not isinstance(child_dict[child.tag], list):
                        child_dict[child.tag] = [child_dict[child.tag]]
                    child_dict[child.tag].append(child_data)
                else:
                    child_dict[child.tag] = child_data
            result.update(child_dict)
        elif elem.text and elem.text.strip():
            if result:
                result['#text'] = _infer_type(elem.text.strip())
            else:
                return _infer_type(elem.text.strip())

        return result if result else None

    root = ET.fromstring(content)
    return {root.tag: element_to_dict(root)}


def _infer_type(value: str) -> Any:
    """Infer Python type from string value."""
    if value is None or value == '':
        return None

    # Boolean
    if value.lower() == 'true':
        return True
    if value.lower() == 'false':
        return False

    # Null
    if value.lower() in ('null', 'none', '~'):
        return None

    # Integer
    try:
        if '.' not in value and 'e' not in value.lower():
            return int(value)
    except ValueError:
        pass

    # Float
    try:
        return float(value)
    except ValueError:
        pass

    return value


# =============================================================================
# Writers - Convert Python dict/list to various formats
# =============================================================================

def write_ison(data: Union[Dict, List], block_name: str = 'data') -> str:
    """Convert data to ISON format."""
    # If data is a list, wrap it in a dict with block_name
    if isinstance(data, list):
        data = {block_name: data}
    doc = ison.from_dict(data, kind='table')
    return ison.dumps(doc)


def write_isonl(data: Union[Dict, List], block_name: str = 'data') -> str:
    """Convert data to ISONL format."""
    # Convert to ISON first, then to ISONL
    ison_text = write_ison(data, block_name)
    return ison.ison_to_isonl(ison_text)


def write_json(data: Union[Dict, List], compact: bool = False) -> str:
    """Convert data to JSON format."""
    if compact:
        return json.dumps(data, separators=(',', ':'))
    return json.dumps(data, indent=2)


def write_jsonl(data: List[Dict]) -> str:
    """Convert list of dicts to JSONL format."""
    lines = []
    items = data if isinstance(data, list) else [data]
    for item in items:
        lines.append(json.dumps(item, separators=(',', ':')))
    return '\n'.join(lines)


def write_yaml(data: Union[Dict, List]) -> str:
    """Convert data to YAML format."""
    if not HAS_YAML:
        raise ImportError("PyYAML not installed. Run: pip install pyyaml")
    return yaml.dump(data, default_flow_style=False, allow_unicode=True)


def write_csv(data: List[Dict], delimiter: str = ',') -> str:
    """Convert list of dicts to CSV format."""
    if not data:
        return ''

    # Handle nested structure (ISON blocks)
    if isinstance(data, dict):
        # Find the first list in the dict (table data)
        for key, value in data.items():
            if isinstance(value, list) and value:
                data = value
                break
        else:
            # Single object - wrap in list
            data = [data]

    if not isinstance(data, list) or not data:
        return ''

    output = io.StringIO()
    fieldnames = list(data[0].keys())
    writer = csv.DictWriter(output, fieldnames=fieldnames, delimiter=delimiter)
    writer.writeheader()
    for row in data:
        # Convert non-string values
        str_row = {k: _to_csv_value(v) for k, v in row.items()}
        writer.writerow(str_row)
    return output.getvalue()


def write_tsv(data: List[Dict]) -> str:
    """Convert list of dicts to TSV format."""
    return write_csv(data, delimiter='\t')


def write_toml(data: Dict) -> str:
    """Convert data to TOML format."""
    if not HAS_TOML:
        raise ImportError("toml not installed. Run: pip install toml")
    return toml.dumps(data)


def write_xml(data: Union[Dict, List], root_name: str = 'root') -> str:
    """Convert data to XML format."""
    import xml.etree.ElementTree as ET

    def dict_to_element(tag: str, data: Any) -> ET.Element:
        elem = ET.Element(tag)

        if isinstance(data, dict):
            for key, value in data.items():
                if key.startswith('@'):
                    # Attribute
                    elem.set(key[1:], str(value))
                elif key == '#text':
                    elem.text = str(value)
                elif isinstance(value, list):
                    for item in value:
                        child = dict_to_element(key, item)
                        elem.append(child)
                else:
                    child = dict_to_element(key, value)
                    elem.append(child)
        elif isinstance(data, list):
            for i, item in enumerate(data):
                child = dict_to_element('item', item)
                elem.append(child)
        elif data is not None:
            elem.text = str(data)

        return elem

    # Handle ISON dict structure
    if isinstance(data, dict) and len(data) == 1:
        key = list(data.keys())[0]
        root = dict_to_element(key, data[key])
    else:
        root = dict_to_element(root_name, data)

    # Pretty print
    ET.indent(root, space="  ")
    return ET.tostring(root, encoding='unicode', xml_declaration=True)


def _to_csv_value(value: Any) -> str:
    """Convert value to CSV-safe string."""
    if value is None:
        return ''
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return str(value)


# =============================================================================
# Main conversion function
# =============================================================================

def convert(
    content: str,
    from_format: Format,
    to_format: Format,
    block_name: str = 'data',
    compact: bool = False
) -> str:
    """Convert content from one format to another."""

    # Read source format
    readers = {
        Format.ISON: read_ison,
        Format.ISONL: read_isonl,
        Format.JSON: read_json,
        Format.JSONL: read_jsonl,
        Format.YAML: read_yaml,
        Format.CSV: read_csv,
        Format.TSV: read_tsv,
        Format.TOML: read_toml,
        Format.XML: read_xml,
    }

    data = readers[from_format](content)

    # Write target format
    writers = {
        Format.ISON: lambda d: write_ison(d, block_name),
        Format.ISONL: lambda d: write_isonl(d, block_name),
        Format.JSON: lambda d: write_json(d, compact),
        Format.JSONL: write_jsonl,
        Format.YAML: write_yaml,
        Format.CSV: write_csv,
        Format.TSV: write_tsv,
        Format.TOML: write_toml,
        Format.XML: lambda d: write_xml(d, block_name),
    }

    return writers[to_format](data)
