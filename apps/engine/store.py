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
    conn.execute(
        """CREATE TABLE IF NOT EXISTS watches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            strategy_id INTEGER NOT NULL,
            source TEXT NOT NULL,
            symbol TEXT NOT NULL,
            interval TEXT NOT NULL,
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
        conn.execute("DELETE FROM watches WHERE strategy_id = ?", (strategy_id,))
        return cur.rowcount > 0


MAX_WATCHES = 50


def add_watch(strategy_id: int, source: str, symbol: str, interval: str) -> int:
    with _conn() as conn:
        count = conn.execute("SELECT COUNT(*) FROM watches").fetchone()[0]
        if count >= MAX_WATCHES:
            raise ValueError(f"감시 한도({MAX_WATCHES}개)에 도달했습니다. 안 쓰는 항목을 삭제해 주세요.")
        dup = conn.execute(
            "SELECT COUNT(*) FROM watches WHERE strategy_id=? AND source=? AND symbol=? AND interval=?",
            (strategy_id, source, symbol, interval),
        ).fetchone()[0]
        if dup:
            raise ValueError("이미 같은 전략·종목·주기 조합이 등록되어 있습니다.")
        cur = conn.execute(
            "INSERT INTO watches (strategy_id, source, symbol, interval) VALUES (?, ?, ?, ?)",
            (strategy_id, source, symbol, interval),
        )
        return cur.lastrowid


def list_watches() -> list[dict]:
    """저장된 감시 목록 (전략 이름·DSL 조인, 삭제된 전략의 감시는 자동 정리)."""
    with _conn() as conn:
        conn.execute(
            "DELETE FROM watches WHERE strategy_id NOT IN (SELECT id FROM strategies)"
        )
        rows = conn.execute(
            """SELECT w.id, w.strategy_id, w.source, w.symbol, w.interval, w.created_at,
                      s.name AS strategy_name, s.dsl
               FROM watches w JOIN strategies s ON s.id = w.strategy_id
               ORDER BY w.id DESC"""
        ).fetchall()
    return [
        {
            "id": r["id"], "strategy_id": r["strategy_id"],
            "strategy_name": r["strategy_name"], "dsl": json.loads(r["dsl"]),
            "source": r["source"], "symbol": r["symbol"], "interval": r["interval"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def delete_watch(watch_id: int) -> bool:
    with _conn() as conn:
        cur = conn.execute("DELETE FROM watches WHERE id = ?", (watch_id,))
        return cur.rowcount > 0
