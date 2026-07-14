"""
CivicPulse Rwanda — database layer.
Uses SQLite for zero-config local storage, good enough for an MVP prototype.
"""
import sqlite3
import os
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "civicpulse.db")

# Category -> responsible ministry routing table.
# This is deterministic routing logic (not AI triage) so every complaint
# lands on a ministry the moment it's submitted.
CATEGORY_MINISTRY_MAP = {
    "Water & Sanitation": "Ministry of Infrastructure (MININFRA)",
    "Roads & Infrastructure": "Ministry of Infrastructure (MININFRA)",
    "Electricity": "Ministry of Infrastructure (MININFRA)",
    "Health": "Ministry of Health (MINISANTE)",
    "Education": "Ministry of Education (MINEDUC)",
    "Security": "Ministry of Internal Security (MININTER)",
    "Land & Housing": "Ministry of Environment (MOE) / Land Authority",
    "Local Governance": "Ministry of Local Government (MINALOC)",
    "Other": "Office of the Prime Minister",
}

CATEGORIES = list(CATEGORY_MINISTRY_MAP.keys())

RWANDA_DISTRICTS = [
    "Nyarugenge", "Gasabo", "Kicukiro",  # Kigali City
    "Nyanza", "Gisagara", "Nyaruguru", "Huye", "Nyamagabe", "Ruhango",
    "Muhanga", "Kamonyi",  # Southern
    "Karongi", "Rutsiro", "Rubavu", "Nyabihu", "Ngororero", "Rusizi", "Nyamasheke",  # Western
    "Rulindo", "Gakenke", "Musanze", "Burera", "Gicumbi",  # Northern
    "Rwamagana", "Nyagatare", "Gatsibo", "Kayonza", "Kirehe", "Ngoma", "Bugesera",  # Eastern
]

STATUSES = ["Pending", "In Progress", "Resolved", "Rejected"]


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_connection()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS complaints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT UNIQUE NOT NULL,
            full_name TEXT,
            phone TEXT,
            district TEXT NOT NULL,
            category TEXT NOT NULL,
            ministry TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Pending',
            admin_notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def next_ticket_id(conn):
    year = datetime.now(timezone.utc).year
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM complaints WHERE ticket_id LIKE ?",
        (f"CP-{year}-%",),
    ).fetchone()
    seq = row["c"] + 1
    return f"CP-{year}-{seq:05d}"


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
