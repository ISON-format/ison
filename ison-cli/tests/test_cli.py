"""
Tests for ISON CLI.
"""

import json
import tempfile
from pathlib import Path

import pytest
from click.testing import CliRunner

from ison_cli.main import cli
from ison_cli.formats import (
    Format, detect_format, detect_format_from_content,
    read_ison, read_json, read_csv, read_yaml,
    write_ison, write_json, write_csv, write_yaml,
    convert
)


# =============================================================================
# Test Data
# =============================================================================

SAMPLE_ISON = """table.users
id name email active
1 Alice alice@example.com true
2 Bob bob@example.com false
3 "Charlie Brown" charlie@example.com true
"""

SAMPLE_ISONL = """table.users|id name email|1 Alice alice@example.com
table.users|id name email|2 Bob bob@example.com
"""

SAMPLE_JSON = """{
  "users": [
    {"id": 1, "name": "Alice", "email": "alice@example.com", "active": true},
    {"id": 2, "name": "Bob", "email": "bob@example.com", "active": false}
  ]
}"""

SAMPLE_CSV = """id,name,email,active
1,Alice,alice@example.com,true
2,Bob,bob@example.com,false
"""

SAMPLE_YAML = """users:
  - id: 1
    name: Alice
    email: alice@example.com
    active: true
  - id: 2
    name: Bob
    email: bob@example.com
    active: false
"""


# =============================================================================
# Format Detection Tests
# =============================================================================

class TestFormatDetection:
    def test_detect_from_extension(self):
        assert detect_format("data.ison") == Format.ISON
        assert detect_format("data.isonl") == Format.ISONL
        assert detect_format("data.json") == Format.JSON
        assert detect_format("data.jsonl") == Format.JSONL
        assert detect_format("data.yaml") == Format.YAML
        assert detect_format("data.yml") == Format.YAML
        assert detect_format("data.csv") == Format.CSV
        assert detect_format("data.tsv") == Format.TSV
        assert detect_format("data.toml") == Format.TOML
        assert detect_format("data.xml") == Format.XML

    def test_detect_from_content_ison(self):
        assert detect_format_from_content(SAMPLE_ISON) == Format.ISON

    def test_detect_from_content_isonl(self):
        assert detect_format_from_content(SAMPLE_ISONL) == Format.ISONL

    def test_detect_from_content_json(self):
        assert detect_format_from_content(SAMPLE_JSON) == Format.JSON

    def test_detect_from_content_yaml(self):
        content = "key: value\nother: data"
        assert detect_format_from_content(content) == Format.YAML


# =============================================================================
# Reader Tests
# =============================================================================

class TestReaders:
    def test_read_ison(self):
        data = read_ison(SAMPLE_ISON)
        assert "users" in data
        assert len(data["users"]) == 3
        assert data["users"][0]["name"] == "Alice"

    def test_read_json(self):
        data = read_json(SAMPLE_JSON)
        assert "users" in data
        assert len(data["users"]) == 2

    def test_read_csv(self):
        data = read_csv(SAMPLE_CSV)
        assert len(data) == 2
        assert data[0]["name"] == "Alice"
        assert data[0]["id"] == 1  # Type inference
        assert data[0]["active"] == True  # Boolean inference


# =============================================================================
# Writer Tests
# =============================================================================

class TestWriters:
    def test_write_ison(self):
        data = {"users": [{"id": 1, "name": "Alice"}]}
        result = write_ison(data)
        assert "table.users" in result
        assert "Alice" in result

    def test_write_json(self):
        data = {"name": "Alice", "age": 30}
        result = write_json(data)
        parsed = json.loads(result)
        assert parsed["name"] == "Alice"

    def test_write_json_compact(self):
        data = {"name": "Alice", "age": 30}
        result = write_json(data, compact=True)
        assert "\n" not in result
        assert " " not in result.replace('"', '')


# =============================================================================
# Conversion Tests
# =============================================================================

class TestConversion:
    def test_json_to_ison(self):
        result = convert(SAMPLE_JSON, Format.JSON, Format.ISON)
        assert "table.users" in result
        assert "Alice" in result

    def test_ison_to_json(self):
        result = convert(SAMPLE_ISON, Format.ISON, Format.JSON)
        data = json.loads(result)
        assert "users" in data

    def test_csv_to_ison(self):
        result = convert(SAMPLE_CSV, Format.CSV, Format.ISON, block_name="users")
        assert "table." in result
        assert "Alice" in result

    def test_ison_to_csv(self):
        result = convert(SAMPLE_ISON, Format.ISON, Format.CSV)
        assert "id,name,email" in result or "name" in result


# =============================================================================
# CLI Command Tests
# =============================================================================

class TestCLICommands:
    @pytest.fixture
    def runner(self):
        return CliRunner()

    @pytest.fixture
    def temp_files(self, tmp_path):
        """Create temporary test files."""
        ison_file = tmp_path / "test.ison"
        ison_file.write_text(SAMPLE_ISON)

        json_file = tmp_path / "test.json"
        json_file.write_text(SAMPLE_JSON)

        csv_file = tmp_path / "test.csv"
        csv_file.write_text(SAMPLE_CSV)

        return {
            "ison": str(ison_file),
            "json": str(json_file),
            "csv": str(csv_file),
            "tmp_path": tmp_path
        }

    def test_version(self, runner):
        result = runner.invoke(cli, ["--version"])
        assert result.exit_code == 0
        assert "1.0.0" in result.output

    def test_formats(self, runner):
        result = runner.invoke(cli, ["formats"])
        assert result.exit_code == 0
        assert "ison" in result.output.lower()
        assert "json" in result.output.lower()
        assert "csv" in result.output.lower()

    def test_convert_json_to_ison(self, runner, temp_files):
        output_file = str(temp_files["tmp_path"] / "output.ison")
        result = runner.invoke(cli, [
            "convert", temp_files["json"],
            "-o", output_file
        ])
        assert result.exit_code == 0
        content = Path(output_file).read_text()
        assert "table." in content

    def test_convert_ison_to_json(self, runner, temp_files):
        output_file = str(temp_files["tmp_path"] / "output.json")
        result = runner.invoke(cli, [
            "convert", temp_files["ison"],
            "-o", output_file
        ])
        assert result.exit_code == 0
        content = Path(output_file).read_text()
        data = json.loads(content)
        assert "users" in data

    def test_convert_stdout(self, runner, temp_files):
        result = runner.invoke(cli, [
            "convert", temp_files["json"],
            "-t", "ison", "--stdout"
        ])
        assert result.exit_code == 0
        assert "table." in result.output

    def test_validate_ison(self, runner, temp_files):
        result = runner.invoke(cli, ["validate", temp_files["ison"]])
        assert result.exit_code == 0
        assert "Valid" in result.output or "valid" in result.output.lower()

    def test_view_ison(self, runner, temp_files):
        result = runner.invoke(cli, ["view", temp_files["ison"], "--raw"])
        assert result.exit_code == 0
        assert "users" in result.output

    def test_view_as_json(self, runner, temp_files):
        result = runner.invoke(cli, ["view", temp_files["ison"], "--json", "--raw"])
        assert result.exit_code == 0
        data = json.loads(result.output)
        assert "users" in data

    def test_info(self, runner, temp_files):
        result = runner.invoke(cli, ["info", temp_files["ison"]])
        assert result.exit_code == 0
        assert "ISON" in result.output
        assert "Blocks" in result.output

    def test_fmt(self, runner, temp_files):
        output_file = str(temp_files["tmp_path"] / "formatted.ison")
        result = runner.invoke(cli, [
            "fmt", temp_files["ison"],
            "-o", output_file
        ])
        assert result.exit_code == 0
        assert Path(output_file).exists()


# =============================================================================
# Error Handling Tests
# =============================================================================

class TestErrorHandling:
    @pytest.fixture
    def runner(self):
        return CliRunner()

    def test_missing_file(self, runner):
        result = runner.invoke(cli, ["view", "nonexistent.ison"])
        assert result.exit_code != 0

    def test_invalid_format(self, runner, tmp_path):
        bad_file = tmp_path / "bad.ison"
        bad_file.write_text("this is not valid ison {{{{")
        result = runner.invoke(cli, ["validate", str(bad_file)])
        assert result.exit_code != 0


# =============================================================================
# Run Tests
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
