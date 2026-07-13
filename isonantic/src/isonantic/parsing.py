"""
ISONantic Parsing

Parse ISON data into models with validation.
"""

import re
from dataclasses import dataclass
from typing import (
    Any, Dict, Generic, List, Optional, Type, TypeVar, Union
)

import ison_parser

from .models import ISONModel, TableModel
from .fields import Reference
from .exceptions import ValidationError, LLMParseError


T = TypeVar("T", bound=ISONModel)


@dataclass
class ParseResult(Generic[T]):
    """
    Result of parsing with error recovery.
    
    Contains both successfully parsed data and any errors.
    """
    success: bool
    data: Optional[List[T]] = None
    errors: List[Dict[str, Any]] = None
    partial_data: Optional[List[T]] = None  # Valid rows even with errors
    
    def __post_init__(self):
        if self.errors is None:
            self.errors = []


def parse_ison(
    data: str,
    model: Type[T],
    *,
    block: str = None,
    strict: bool = False,
    validate: bool = True,
) -> List[T]:
    """
    Parse ISON string into model instances.
    
    Args:
        data: ISON formatted string
        model: Model class to parse into
        block: Specific block name to parse (optional)
        strict: Raise on extra fields
        validate: Enable validation (default True)
        
    Returns:
        List of model instances
        
    Raises:
        ValidationError: If parsing or validation fails
    """
    # Parse raw ISON
    blocks = _parse_ison_to_blocks(data)
    
    # Find matching block
    target_block = model.__ison_block__
    if block:
        target_block = block
    
    matching_rows = []
    for parsed_block in blocks:
        full_name = f"{parsed_block['kind']}.{parsed_block['name']}"
        if full_name == target_block or parsed_block['name'] == target_block.split('.')[-1]:
            matching_rows.extend(parsed_block['rows'])
    
    if not matching_rows:
        return []
    
    # Convert to model instances
    models = []
    errors = []
    
    for row_idx, row in enumerate(matching_rows):
        try:
            instance = model(**row)
            models.append(instance)
        except ValidationError as e:
            if validate:
                # Add row context to errors
                for error in e.errors():
                    error["loc"] = (target_block, row_idx) + error.get("loc", ())
                errors.extend(e.errors())
            # Continue to next row
    
    if errors:
        raise ValidationError(errors, model=model)
    
    return models


def parse_ison_safe(
    data: str,
    model: Type[T],
    **kwargs
) -> ParseResult[T]:
    """
    Parse ISON with error recovery.
    
    Returns ParseResult with both valid data and errors.
    Does not raise exceptions.
    
    Args:
        data: ISON formatted string
        model: Model class to parse into
        **kwargs: Additional arguments for parse_ison
        
    Returns:
        ParseResult with success status, data, and errors
    """
    try:
        result = parse_ison(data, model, **kwargs)
        return ParseResult(
            success=True,
            data=result,
            errors=[],
        )
    except ValidationError as e:
        # Try to get partial data
        partial = _parse_partial(data, model)
        return ParseResult(
            success=False,
            data=None,
            errors=e.errors(),
            partial_data=partial,
        )
    except Exception as e:
        return ParseResult(
            success=False,
            data=None,
            errors=[{
                "loc": (),
                "msg": str(e),
                "type": "parse_error"
            }],
        )


def parse_llm_output(
    response: str,
    model: Type[T],
    *,
    strict: bool = False,
    auto_fix: bool = True,
) -> List[T]:
    """
    Parse LLM-generated ISON output.
    
    Handles common LLM formatting issues:
    - Extra text before/after ISON
    - Markdown code blocks
    - Minor syntax variations
    
    Args:
        response: Raw LLM response
        model: Model class to parse into
        strict: Strict validation mode
        auto_fix: Attempt to fix common issues
        
    Returns:
        List of model instances
        
    Raises:
        LLMParseError: If parsing fails
    """
    # Extract ISON from response
    ison_data = _extract_ison(response)
    
    if not ison_data:
        raise LLMParseError(
            "No ISON block found in response",
            raw_output=response,
            suggestion="Ensure the LLM outputs data in ISON format starting with table.* or object.*"
        )
    
    # Apply auto-fixes
    if auto_fix:
        ison_data = _auto_fix_ison(ison_data)
    
    # Parse
    try:
        return parse_ison(ison_data, model, strict=strict)
    except ValidationError as e:
        raise LLMParseError(
            f"Validation failed: {e}",
            raw_output=response,
            extracted_ison=ison_data,
            suggestion="Check that all required fields are present and properly formatted",
            recoverable=True,
        )
    except ison_parser.ISONSyntaxError as e:
        # LLM chatter (e.g. trailing prose) can survive extraction; drop the
        # lines the core parser rejects and retry before giving up
        if auto_fix:
            cleaned = _drop_unparseable_lines(ison_data)
            if cleaned is not None:
                try:
                    return parse_ison(cleaned, model, strict=strict)
                except ValidationError as e2:
                    raise LLMParseError(
                        f"Validation failed: {e2}",
                        raw_output=response,
                        extracted_ison=cleaned,
                        suggestion="Check that all required fields are present and properly formatted",
                        recoverable=True,
                    )
                except Exception:
                    pass
        raise LLMParseError(
            f"Parse error: {e}",
            raw_output=response,
            extracted_ison=ison_data,
        )
    except Exception as e:
        raise LLMParseError(
            f"Parse error: {e}",
            raw_output=response,
            extracted_ison=ison_data,
        )


def validate_llm_ison(
    response: str,
    model: Type[T],
) -> ParseResult[T]:
    """
    Validate LLM-generated ISON without raising exceptions.
    
    Returns ParseResult with validation status and any errors.
    Useful for implementing retry logic.
    
    Args:
        response: Raw LLM response
        model: Model class to validate against
        
    Returns:
        ParseResult with validation status
    """
    try:
        data = parse_llm_output(response, model)
        return ParseResult(
            success=True,
            data=data,
        )
    except LLMParseError as e:
        return ParseResult(
            success=False,
            errors=[{
                "loc": (),
                "msg": str(e),
                "type": "llm_parse_error",
                "suggestion": e.suggestion,
            }],
        )


# Internal parsing functions

def _parse_ison_to_blocks(data: str) -> List[Dict[str, Any]]:
    """
    Parse raw ISON string to block dictionaries.

    Delegates format parsing to the core `ison_parser` package (the single
    source of truth for ISON syntax, escaping, and type inference); this
    layer only adapts the parsed Document to isonantic's block-dict shape
    and maps core References to isonantic References.

    Returns list of blocks with:
    - kind: block kind (e.g. "table", "object", "meta")
    - name: block name
    - fields: list of field names
    - rows: list of row dictionaries (dot-path fields nested)
    """
    if not data or not data.strip():
        return []

    doc = ison_parser.loads(data)

    blocks = []
    for block in doc.blocks:
        rows = [
            {key: _from_core_value(value) for key, value in row.items()}
            for row in block.rows
        ]
        blocks.append({
            "kind": block.kind,
            "name": block.name,
            "fields": list(block.fields),
            "rows": rows,
        })

    return blocks


def _from_core_value(value: Any) -> Any:
    """Map a core ison_parser value to isonantic's types"""
    if isinstance(value, ison_parser.Reference):
        return Reference(id=value.id, ref_type=value.type)
    if isinstance(value, dict):
        return {k: _from_core_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_core_value(v) for v in value]
    return value


def _extract_ison(response: str) -> Optional[str]:
    """Extract ISON block from LLM response"""
    # Try to find code block first
    code_block_match = re.search(
        r"```(?:ison)?\s*\n(.*?)```",
        response,
        re.DOTALL | re.IGNORECASE
    )
    if code_block_match:
        return code_block_match.group(1).strip()
    
    # Look for block headers
    lines = response.split("\n")
    ison_lines = []
    in_block = False
    
    for line in lines:
        stripped = line.strip()
        
        # Check for block header
        if re.match(r"^(table|object|meta)\.[a-zA-Z_][a-zA-Z0-9_]*$", stripped):
            in_block = True
            ison_lines.append(stripped)
        elif in_block:
            # Continue collecting until empty line or obvious text
            if not stripped:
                # Empty line might be block separator
                ison_lines.append("")
            elif stripped.startswith("#"):
                # Comment
                ison_lines.append(stripped)
            elif re.match(r"^[a-zA-Z_]", stripped) and len(stripped.split()) > 1:
                # Likely a data line
                ison_lines.append(stripped)
            elif re.match(r'^[-0-9:"\[]', stripped):
                # Likely a data line
                ison_lines.append(stripped)
            else:
                # Probably end of ISON
                break
    
    if ison_lines:
        return "\n".join(ison_lines).strip()
    
    return None


def _drop_unparseable_lines(ison_data: str, max_drops: int = 20) -> Optional[str]:
    """
    Recovery pass: iteratively drop lines the core parser rejects.

    LLM responses can leave prose interleaved with the extracted ISON. The
    core parser stays the sole syntax authority — we never re-implement
    leniency, we just remove the exact lines it points at and retry.

    Returns the cleaned ISON string, or None if it cannot be salvaged.
    """
    lines = ison_data.split("\n")
    for _ in range(max_drops):
        try:
            ison_parser.loads("\n".join(lines))
            return "\n".join(lines)
        except ison_parser.ISONSyntaxError as e:
            if not e.line or not (1 <= e.line <= len(lines)):
                return None
            del lines[e.line - 1]
        except Exception:
            return None
    return None


def _auto_fix_ison(ison_data: str) -> str:
    """Apply common fixes to LLM-generated ISON"""
    lines = ison_data.split("\n")
    fixed_lines = []
    
    for line in lines:
        # Remove trailing commas (JSON habit)
        line = re.sub(r",\s*$", "", line)
        
        # Remove trailing semicolons
        line = re.sub(r";\s*$", "", line)
        
        fixed_lines.append(line)
    
    return "\n".join(fixed_lines)


def _parse_partial(data: str, model: Type[T]) -> List[T]:
    """Parse and return only valid rows"""
    blocks = _parse_ison_to_blocks(data)
    target_block = model.__ison_block__
    
    valid_models = []
    
    for parsed_block in blocks:
        full_name = f"{parsed_block['kind']}.{parsed_block['name']}"
        if full_name != target_block:
            continue
        
        for row in parsed_block["rows"]:
            try:
                instance = model(**row)
                valid_models.append(instance)
            except:
                continue
    
    return valid_models
