"""
Database export utilities for ISON CLI.

Supports SQLite, PostgreSQL, MySQL via SQLAlchemy.
"""

from typing import Any, Dict, List, Optional
import json

# Optional SQLAlchemy import
try:
    from sqlalchemy import create_engine, text, inspect
    HAS_SQLALCHEMY = True
except ImportError:
    HAS_SQLALCHEMY = False


def check_sqlalchemy():
    """Check if SQLAlchemy is available."""
    if not HAS_SQLALCHEMY:
        raise ImportError(
            "SQLAlchemy not installed. Run: pip install ison-cli[db]"
        )


def list_tables(connection_string: str) -> List[str]:
    """List all tables in a database."""
    check_sqlalchemy()

    engine = create_engine(connection_string)
    inspector = inspect(engine)
    return inspector.get_table_names()


def export_table(
    connection_string: str,
    table_name: str,
    limit: Optional[int] = None
) -> Dict[str, List[Dict]]:
    """Export a table to dict format."""
    check_sqlalchemy()

    engine = create_engine(connection_string)

    query = f"SELECT * FROM {table_name}"
    if limit:
        query += f" LIMIT {limit}"

    with engine.connect() as conn:
        result = conn.execute(text(query))
        columns = result.keys()
        rows = []
        for row in result:
            row_dict = {}
            for i, col in enumerate(columns):
                value = row[i]
                # Convert non-serializable types
                if hasattr(value, 'isoformat'):
                    value = value.isoformat()
                elif isinstance(value, bytes):
                    value = value.decode('utf-8', errors='replace')
                row_dict[col] = value
            rows.append(row_dict)

    return {table_name: rows}


def export_query(
    connection_string: str,
    query: str,
    block_name: str = "query_result"
) -> Dict[str, List[Dict]]:
    """Export query results to dict format."""
    check_sqlalchemy()

    engine = create_engine(connection_string)

    with engine.connect() as conn:
        result = conn.execute(text(query))
        columns = result.keys()
        rows = []
        for row in result:
            row_dict = {}
            for i, col in enumerate(columns):
                value = row[i]
                # Convert non-serializable types
                if hasattr(value, 'isoformat'):
                    value = value.isoformat()
                elif isinstance(value, bytes):
                    value = value.decode('utf-8', errors='replace')
                row_dict[col] = value
            rows.append(row_dict)

    return {block_name: rows}


def export_database(
    connection_string: str,
    tables: Optional[List[str]] = None,
    limit: Optional[int] = None
) -> Dict[str, List[Dict]]:
    """Export entire database or selected tables to dict format."""
    check_sqlalchemy()

    if tables is None:
        tables = list_tables(connection_string)

    result = {}
    for table in tables:
        try:
            table_data = export_table(connection_string, table, limit)
            result.update(table_data)
        except Exception as e:
            # Skip tables that can't be exported
            pass

    return result


def get_connection_string_help() -> str:
    """Return help text for connection strings."""
    return """
Database Connection String Examples:

  SQLite:
    sqlite:///path/to/database.db
    sqlite:///./local.db

  PostgreSQL:
    postgresql://user:password@localhost:5432/dbname
    postgresql://user:password@host/dbname

  MySQL:
    mysql://user:password@localhost:3306/dbname
    mysql+pymysql://user:password@host/dbname

  SQL Server:
    mssql+pyodbc://user:password@host/dbname?driver=ODBC+Driver+17+for+SQL+Server
"""
