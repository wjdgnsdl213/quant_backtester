"""저장된 전략 보관소 (SQLite).

AI로 만들었거나 마음에 든 전략 DSL을 이름과 함께 보관한다.
DB 파일은 storage/strategies.db (gitignore 대상 — 로컬 상태).
"""

import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "storage" / "strategies.db"

MAX_STRATEGIES = 200  # 로컬 도구 수준의 안전장치


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE IF NOT EXISTS strategies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            dsl TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        )"""
    )
    return conn


def save(name: str, dsl_dict: dict) -> int:
    with _conn() as conn:
        count = conn.execute("SELECT COUNT(*) FROM strategies").fetchone()[0]
        if count >= MAX_STRATEGIES:
            raise ValueError(f"저장 한도({MAX_STRATEGIES}개)에 도달했습니다. 안 쓰는 전략을 삭제해 주세요.")
        cur = conn.execute(
            "INSERT INTO strategies (name, dsl) VALUES (?, ?)",
            (name, json.dumps(dsl_dict, ensure_ascii=False)),
        )
        return cur.lastrowid


def list_all() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT id, name, dsl, created_at FROM strategies ORDER BY id DESC"
        ).fetchall()
    return [
        {"id": r["id"], "name": r["name"], "dsl": json.loads(r["dsl"]), "created_at": r["created_at"]}
        for r in rows
    ]


def delete(strategy_id: int) -> bool:
    with _conn() as conn:
        cur = conn.execute("DELETE FROM strategies WHERE id = ?", (strategy_id,))
        return cur.rowcount > 0
