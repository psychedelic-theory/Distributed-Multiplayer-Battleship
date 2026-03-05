"""
db.py — Database connection pool and helpers.
Reads DATABASE_URL from environment. All queries use raw SQL via psycopg3.
"""

import os
import psycopg
from psycopg.rows import dict_row


def get_conn():
    """Open and return a new psycopg3 connection (dict row factory)."""
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL environment variable is not set.")
    return psycopg.connect(dsn, row_factory=dict_row)


def init_db():
    """
    Run the SQL schema file against the configured database.
    Safe to call on every startup (all statements use IF NOT EXISTS).
    """
    schema_path = os.path.join(os.path.dirname(__file__), "..", "sql", "schema.sql")
    schema_path = os.path.normpath(schema_path)
    with open(schema_path, "r") as f:
        sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
