from __future__ import annotations

import base64
import hashlib
import hmac
import json
import mimetypes
import os
import secrets
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("CRM_DB_PATH", ROOT / "crm.sqlite3")).resolve()
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
HOST = os.environ.get("CRM_HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT") or os.environ.get("CRM_PORT", "5173"))
SESSION_DAYS = 7
SESSION_COOKIE = "crm_session"
COOKIE_SECURE = os.environ.get("CRM_COOKIE_SECURE", "0") == "1"
MAX_ACTIVITY_ATTACHMENTS = 3
MAX_ATTACHMENT_BYTES = 900_000

STAGES = ["广告", "3天免费 Webinar", "Booster", "Closing", "Follow up"]
DEFAULT_SETTINGS = {
    "companyName": "Sales CRM",
    "tagline": "团队销售工作台",
    "monthTarget": 180000,
    "stages": STAGES,
    "statuses": [
        {"name": "潜在客户", "color": "#176b87", "isWon": False},
        {"name": "客户", "color": "#16805c", "isWon": False},
        {"name": "已成交", "color": "#16805c", "isWon": True},
        {"name": "暂停", "color": "#b42318", "isWon": False},
    ],
    "activityTypes": ["通话", "微信", "会议", "备注"],
    "logoDataUrl": "",
    "ownerTargets": {},
}

SEED_USERS = [
    {"username": "admin", "password": "admin123", "displayName": "Admin", "role": "admin", "ownerName": ""},
    {"username": "mei", "password": "sales123", "displayName": "Mei", "role": "sales", "ownerName": "Mei"},
    {"username": "jason", "password": "sales123", "displayName": "Jason", "role": "sales", "ownerName": "Jason"},
    {"username": "alicia", "password": "sales123", "displayName": "Alicia", "role": "sales", "ownerName": "Alicia"},
]

SEED_DATA = {
    "customers": [
        {
            "id": "c1",
            "name": "林慧敏",
            "phone": "012-338 1098",
            "email": "huimin@example.com",
            "source": "Facebook 广告",
            "status": "潜在客户",
            "owner": "Mei",
            "dealValue": 28000,
            "stage": "3天免费 Webinar",
            "expectedClose": "2026-06-25",
            "nextFollowUp": "2026-06-15",
            "note": "报名了免费 webinar，对团队管理课程感兴趣。",
        },
        {
            "id": "c2",
            "name": "陈志强",
            "phone": "016-772 9011",
            "email": "zc.chan@example.com",
            "source": "转介绍",
            "status": "客户",
            "owner": "Jason",
            "dealValue": 52000,
            "stage": "Closing",
            "expectedClose": "2026-06-21",
            "nextFollowUp": "2026-06-16",
            "note": "老板亲自参与，需要确认付款安排。",
        },
        {
            "id": "c3",
            "name": "Nur Aina",
            "phone": "011-2288 4400",
            "email": "aina@example.com",
            "source": "Instagram",
            "status": "潜在客户",
            "owner": "Alicia",
            "dealValue": 18000,
            "stage": "广告",
            "expectedClose": "2026-07-02",
            "nextFollowUp": "2026-06-18",
            "note": "刚留下资料，等待第一次通话。",
        },
        {
            "id": "c4",
            "name": "王佩珊",
            "phone": "017-889 1038",
            "email": "peishan@example.com",
            "source": "3天 Webinar",
            "status": "潜在客户",
            "owner": "Mei",
            "dealValue": 36000,
            "stage": "Booster",
            "expectedClose": "2026-06-28",
            "nextFollowUp": "2026-06-15",
            "note": "完成 booster，需要整理 objections。",
        },
        {
            "id": "c5",
            "name": "Lim Kok Wei",
            "phone": "019-673 8002",
            "email": "kwlim@example.com",
            "source": "线下活动",
            "status": "客户",
            "owner": "Jason",
            "dealValue": 46000,
            "stage": "Follow up",
            "expectedClose": "2026-06-30",
            "nextFollowUp": "2026-06-17",
            "note": "已报价，等待股东确认。",
        },
        {
            "id": "c6",
            "name": "Siti Mariam",
            "phone": "013-512 6601",
            "email": "siti@example.com",
            "source": "WhatsApp 社群",
            "status": "潜在客户",
            "owner": "Alicia",
            "dealValue": 22000,
            "stage": "3天免费 Webinar",
            "expectedClose": "2026-07-05",
            "nextFollowUp": "2026-06-20",
            "note": "需要英文资料。",
        },
    ],
    "activities": [
        {"id": "a1", "customerId": "c1", "type": "微信", "date": "2026-06-14", "owner": "Mei", "note": "发送 webinar replay 和报名链接。"},
        {"id": "a2", "customerId": "c2", "type": "通话", "date": "2026-06-14", "owner": "Jason", "note": "确认预算，客户要求明天再跟进付款。"},
        {"id": "a3", "customerId": "c4", "type": "会议", "date": "2026-06-13", "owner": "Mei", "note": "Booster 后对 closing package 有兴趣。"},
        {"id": "a4", "customerId": "c5", "type": "备注", "date": "2026-06-12", "owner": "Jason", "note": "Follow up 重点：案例、付款期限、团队名额。"},
    ],
}


class Database:
    def __init__(self) -> None:
        self.is_postgres = bool(DATABASE_URL)
        if self.is_postgres:
            import psycopg
            from psycopg.rows import dict_row

            self.conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        else:
            self.conn = sqlite3.connect(DB_PATH)
            self.conn.row_factory = sqlite3.Row

    def execute(self, sql: str, params: tuple = ()):
        if self.is_postgres:
            sql = sql.replace("?", "%s")
        return self.conn.execute(sql, params)

    def execute_statements(self, statements: str) -> None:
        for statement in statements.split(";"):
            if statement.strip():
                self.execute(statement)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        if exc_type is None:
            self.conn.commit()
        else:
            self.conn.rollback()
        self.conn.close()


def db() -> Database:
    return Database()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return base64.b64encode(salt).decode("ascii"), base64.b64encode(digest).decode("ascii")


def verify_password(password: str, salt_b64: str, hash_b64: str) -> bool:
    salt = base64.b64decode(salt_b64.encode("ascii"))
    _, candidate = hash_password(password, salt)
    return hmac.compare_digest(candidate, hash_b64)


def public_user(row) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "displayName": row["display_name"],
        "role": row["role"],
        "ownerName": row["owner_name"],
    }


def init_db() -> None:
    with db() as conn:
        if not conn.is_postgres:
            conn.execute("PRAGMA foreign_keys = ON")
        conn.execute_statements(
            """
            CREATE TABLE IF NOT EXISTS customers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT,
                source TEXT NOT NULL,
                status TEXT NOT NULL,
                owner TEXT NOT NULL,
                deal_value REAL NOT NULL DEFAULT 0,
                collected_value REAL NOT NULL DEFAULT 0,
                stage TEXT NOT NULL,
                expected_close TEXT NOT NULL,
                next_follow_up TEXT NOT NULL,
                note TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS activities (
                id TEXT PRIMARY KEY,
                customer_id TEXT NOT NULL,
                type TEXT NOT NULL,
                date TEXT NOT NULL,
                owner TEXT NOT NULL,
                note TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'sales')),
                owner_name TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )
        ensure_schema(conn)
        ensure_settings(conn)
        if conn.execute("SELECT COUNT(*) AS count FROM customers").fetchone()["count"] == 0:
            replace_all(conn, SEED_DATA)
        if DATABASE_URL:
            sync_cloud_admin(conn)
        elif conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"] == 0:
            for user in SEED_USERS:
                create_user(conn, user)


def column_exists(conn, table: str, column: str) -> bool:
    if conn.is_postgres:
        row = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ? AND column_name = ?
            """,
            (table, column),
        ).fetchone()
        return row["count"] > 0
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(row["name"] == column for row in rows)


def ensure_schema(conn) -> None:
    if not column_exists(conn, "customers", "collected_value"):
        conn.execute("ALTER TABLE customers ADD COLUMN collected_value REAL NOT NULL DEFAULT 0")
    if not column_exists(conn, "customers", "booster_comment"):
        conn.execute("ALTER TABLE customers ADD COLUMN booster_comment TEXT")
    if not column_exists(conn, "activities", "attachments"):
        conn.execute("ALTER TABLE activities ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'")


def ensure_settings(conn) -> None:
    for key, value in DEFAULT_SETTINGS.items():
        conn.execute(
            """
            INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO NOTHING
            """,
            (key, json.dumps(value, ensure_ascii=False)),
        )


def read_settings(conn=None) -> dict:
    if conn is None:
        with db() as connection:
            return read_settings(connection)

    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    settings = dict(DEFAULT_SETTINGS)
    for row in rows:
        settings[row["key"]] = json.loads(row["value"])
    settings["statuses"] = [
        {
            "name": str(item.get("name") or "").strip(),
            "color": str(item.get("color") or "#176b87"),
            "isWon": bool(item.get("isWon", item.get("name") == "已成交")),
        }
        for item in settings.get("statuses", [])
        if str(item.get("name") or "").strip()
    ]
    settings["activityTypes"] = [
        str(item).strip() for item in settings.get("activityTypes", []) if str(item).strip()
    ] or list(DEFAULT_SETTINGS["activityTypes"])
    settings["logoDataUrl"] = str(settings.get("logoDataUrl") or "")
    settings["ownerTargets"] = {
        str(owner).strip(): float(target)
        for owner, target in settings.get("ownerTargets", {}).items()
        if str(owner).strip() and float(target) > 0
    }
    return settings


def save_settings(payload: dict) -> dict:
    company_name = str(payload.get("companyName") or "").strip()
    tagline = str(payload.get("tagline") or "").strip()
    month_target = float(payload.get("monthTarget") or 0)
    stages = [str(item).strip() for item in payload.get("stages", []) if str(item).strip()]
    stages = list(dict.fromkeys(stages))
    statuses = []
    seen_statuses = set()
    for item in payload.get("statuses", []):
        name = str(item.get("name") or "").strip()
        color = str(item.get("color") or "#176b87").strip()
        if not name or name in seen_statuses:
            continue
        if len(color) != 7 or not color.startswith("#"):
            raise ValueError("Each status color must use #RRGGBB format")
        try:
            int(color[1:], 16)
        except ValueError as exc:
            raise ValueError("Each status color must use #RRGGBB format") from exc
        statuses.append({"name": name, "color": color.lower(), "isWon": bool(item.get("isWon"))})
        seen_statuses.add(name)
    activity_types = list(
        dict.fromkeys(
            str(item).strip()
            for item in payload.get("activityTypes", [])
            if str(item).strip()
        )
    )
    logo_data_url = str(payload.get("logoDataUrl") or "").strip()
    if logo_data_url and not logo_data_url.startswith("data:image/"):
        raise ValueError("Logo must be an image")
    if len(logo_data_url) > 1_500_000:
        raise ValueError("Logo image is too large")
    owner_targets = {}
    for owner, target in payload.get("ownerTargets", {}).items():
        owner_name = str(owner).strip()
        target_value = float(target or 0)
        if owner_name and target_value > 0:
            owner_targets[owner_name] = target_value

    if not company_name or not tagline:
        raise ValueError("Company name and tagline are required")
    if month_target <= 0:
        raise ValueError("Month target must be greater than zero")
    if not 2 <= len(stages) <= 10:
        raise ValueError("Sales flow needs between 2 and 10 stages")
    if not 1 <= len(statuses) <= 20:
        raise ValueError("Customer statuses need between 1 and 20 items")
    if not 1 <= len(activity_types) <= 20:
        raise ValueError("Follow-up types need between 1 and 20 items")

    settings = {
        "companyName": company_name,
        "tagline": tagline,
        "monthTarget": month_target,
        "stages": stages,
        "statuses": statuses,
        "activityTypes": activity_types,
        "logoDataUrl": logo_data_url,
        "ownerTargets": owner_targets,
    }
    with db() as conn:
        for key, value in settings.items():
            conn.execute(
                """
                INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (key, json.dumps(value, ensure_ascii=False)),
            )
        customer_rows = conn.execute("SELECT id, stage, status FROM customers").fetchall()
        for customer in customer_rows:
            if customer["stage"] not in stages:
                conn.execute(
                    "UPDATE customers SET stage = ?, updated_at = ? WHERE id = ?",
                    (stages[0], now_iso(), customer["id"]),
                )
            if customer["status"] not in seen_statuses:
                conn.execute(
                    "UPDATE customers SET status = ?, updated_at = ? WHERE id = ?",
                    (statuses[0]["name"], now_iso(), customer["id"]),
                )
    return settings


def sync_cloud_admin(conn) -> None:
    admin_username = os.environ.get("CRM_ADMIN_USERNAME", "admin").strip().lower() or "admin"
    admin_password = os.environ.get("CRM_ADMIN_PASSWORD", "").strip()
    if not admin_password:
        raise RuntimeError("CRM_ADMIN_PASSWORD is required for cloud deployment")

    row = conn.execute("SELECT * FROM users WHERE username = ?", (admin_username,)).fetchone()
    if not row:
        create_user(
            conn,
            {
                "username": admin_username,
                "password": admin_password,
                "displayName": "Admin",
                "role": "admin",
                "ownerName": "",
            },
        )
        return

    if verify_password(admin_password, row["password_salt"], row["password_hash"]):
        return

    salt, password_hash = hash_password(admin_password)
    conn.execute(
        """
        UPDATE users
        SET password_salt = ?, password_hash = ?, role = 'admin'
        WHERE id = ?
        """,
        (salt, password_hash, row["id"]),
    )
    conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))


def create_user(conn: sqlite3.Connection, raw: dict) -> dict:
    username = str(raw.get("username") or "").strip().lower()
    display_name = str(raw.get("displayName") or raw.get("display_name") or username).strip()
    role = str(raw.get("role") or "sales").strip()
    owner_name = str(raw.get("ownerName") or raw.get("owner_name") or display_name).strip()
    password = str(raw.get("password") or "").strip()

    if not username or not display_name or role not in {"admin", "sales"} or not password:
        raise ValueError("Missing or invalid user fields")
    if role == "admin":
        owner_name = owner_name or display_name
    elif not owner_name:
        raise ValueError("Sales users need an owner name")

    salt, password_hash = hash_password(password)
    user_id = str(raw.get("id") or f"u{uuid.uuid4().hex[:12]}")
    conn.execute(
        """
        INSERT INTO users (id, username, display_name, role, owner_name, password_salt, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (user_id, username, display_name, role, owner_name, salt, password_hash, now_iso()),
    )
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return public_user(row)


def save_owner_targets(conn, owner_targets: dict) -> None:
    conn.execute(
        """
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        ("ownerTargets", json.dumps(owner_targets, ensure_ascii=False)),
    )


def create_user_with_target(conn, raw: dict) -> dict:
    user = create_user(conn, raw)
    if user["role"] == "sales":
        monthly_target = float(raw.get("monthlyTarget") or 0)
        settings = read_settings(conn)
        targets = dict(settings["ownerTargets"])
        targets[user["ownerName"]] = monthly_target if monthly_target > 0 else settings["monthTarget"]
        save_owner_targets(conn, targets)
        user["monthlyTarget"] = targets[user["ownerName"]]
    return user


def update_user_account(conn, user_id: str, raw: dict, current_user: dict) -> dict:
    existing = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not existing:
        raise ValueError("User not found")

    username = str(raw.get("username") or existing["username"]).strip().lower()
    display_name = str(raw.get("displayName") or existing["display_name"]).strip()
    role = str(raw.get("role") or existing["role"]).strip()
    owner_name = str(raw.get("ownerName") or existing["owner_name"]).strip()
    password = str(raw.get("password") or "")
    monthly_target = float(raw.get("monthlyTarget") or 0)

    if not username or not display_name or role not in {"admin", "sales"}:
        raise ValueError("Missing or invalid user fields")
    if role == "sales" and not owner_name:
        raise ValueError("Sales users need an owner name")
    if user_id == current_user["id"] and role != "admin":
        raise ValueError("You cannot remove your own admin role")

    duplicate = conn.execute(
        "SELECT id FROM users WHERE username = ? AND id <> ?",
        (username, user_id),
    ).fetchone()
    if duplicate:
        raise ValueError("Username already exists")

    old_owner = existing["owner_name"]
    if role == "admin":
        owner_name = owner_name or display_name

    conn.execute(
        """
        UPDATE users SET username = ?, display_name = ?, role = ?, owner_name = ?
        WHERE id = ?
        """,
        (username, display_name, role, owner_name, user_id),
    )

    if password:
        salt, password_hash = hash_password(password)
        conn.execute(
            "UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?",
            (salt, password_hash, user_id),
        )
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))

    settings = read_settings(conn)
    targets = dict(settings["ownerTargets"])
    if old_owner != owner_name:
        conn.execute("UPDATE customers SET owner = ?, updated_at = ? WHERE owner = ?", (owner_name, now_iso(), old_owner))
        conn.execute("UPDATE activities SET owner = ? WHERE owner = ?", (owner_name, old_owner))
        previous_target = targets.pop(old_owner, None)
    else:
        previous_target = targets.get(old_owner)

    if role == "sales":
        targets[owner_name] = monthly_target if monthly_target > 0 else previous_target or settings["monthTarget"]
    else:
        targets.pop(owner_name, None)
    save_owner_targets(conn, targets)

    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    result = public_user(row)
    result["monthlyTarget"] = targets.get(owner_name)
    return result


def normalize_customer(raw: dict) -> dict:
    return {
        "id": str(raw.get("id") or f"c{uuid.uuid4().hex[:12]}"),
        "name": str(raw.get("name") or "").strip(),
        "phone": str(raw.get("phone") or "").strip(),
        "email": str(raw.get("email") or "").strip(),
        "source": str(raw.get("source") or "").strip(),
        "status": str(raw.get("status") or "潜在客户").strip(),
        "owner": str(raw.get("owner") or "").strip(),
        "dealValue": float(raw.get("dealValue") or raw.get("deal_value") or 0),
        "collectedAmount": float(raw.get("collectedAmount") or raw.get("collected_amount") or raw.get("collected_value") or 0),
        "stage": str(raw.get("stage") or STAGES[0]).strip(),
        "expectedClose": str(raw.get("expectedClose") or raw.get("expected_close") or "").strip(),
        "boosterComment": str(raw.get("boosterComment") or raw.get("booster_comment") or "").strip(),
        "nextFollowUp": str(raw.get("nextFollowUp") or raw.get("next_follow_up") or "").strip(),
        "note": str(raw.get("note") or "").strip(),
    }


def normalize_attachments(raw_value) -> list[dict]:
    if raw_value is None:
        return []
    raw_attachments = raw_value
    if isinstance(raw_value, str):
        try:
            raw_attachments = json.loads(raw_value)
        except json.JSONDecodeError:
            return []
    if not isinstance(raw_attachments, list):
        return []

    attachments = []
    for item in raw_attachments[:MAX_ACTIVITY_ATTACHMENTS]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "photo.jpg").strip()[:120]
        mime_type = str(item.get("type") or "").strip()
        data_url = str(item.get("dataUrl") or item.get("data_url") or "").strip()
        if mime_type not in {"image/jpeg", "image/png", "image/webp"}:
            raise ValueError("Only JPG, PNG, or WebP photos are supported")
        prefix = f"data:{mime_type};base64,"
        if not data_url.startswith(prefix):
            raise ValueError("Invalid photo data")
        try:
            byte_size = len(base64.b64decode(data_url.split(",", 1)[1], validate=True))
        except ValueError as exc:
            raise ValueError("Invalid photo data") from exc
        if byte_size > MAX_ATTACHMENT_BYTES:
            raise ValueError("Each photo must be smaller than 900 KB")
        attachments.append({"name": name, "type": mime_type, "dataUrl": data_url})
    return attachments


def normalize_activity(raw: dict) -> dict:
    return {
        "id": str(raw.get("id") or f"a{uuid.uuid4().hex[:12]}"),
        "customerId": str(raw.get("customerId") or raw.get("customer_id") or "").strip(),
        "type": str(raw.get("type") or "备注").strip(),
        "date": str(raw.get("date") or "").strip(),
        "owner": str(raw.get("owner") or "").strip(),
        "note": str(raw.get("note") or "").strip(),
        "attachments": normalize_attachments(raw.get("attachments")),
    }


def validate_customer(customer: dict) -> None:
    required = ["name", "phone", "source", "status", "owner", "stage", "expectedClose", "nextFollowUp"]
    missing = [field for field in required if not customer.get(field)]
    if missing:
        raise ValueError(f"Missing customer fields: {', '.join(missing)}")


def validate_activity(activity: dict) -> None:
    required = ["customerId", "type", "date", "owner"]
    missing = [field for field in required if not activity.get(field)]
    if missing:
        raise ValueError(f"Missing activity fields: {', '.join(missing)}")
    if not activity.get("note") and not activity.get("attachments"):
        raise ValueError("Follow-up note or photo is required")


def can_access_owner(user: dict, owner: str) -> bool:
    return user["role"] == "admin" or owner == user["ownerName"]


def replace_all(conn: sqlite3.Connection, data: dict) -> None:
    customers = [normalize_customer(item) for item in data.get("customers", [])]
    activities = [normalize_activity(item) for item in data.get("activities", [])]
    for customer in customers:
        validate_customer(customer)

    customer_ids = {customer["id"] for customer in customers}
    valid_activities = []
    for activity in activities:
        validate_activity(activity)
        if activity["customerId"] in customer_ids:
            valid_activities.append(activity)

    timestamp = now_iso()
    conn.execute("DELETE FROM activities")
    conn.execute("DELETE FROM customers")
    for customer in customers:
        conn.execute(
            """
            INSERT INTO customers (
                id, name, phone, email, source, status, owner, deal_value, collected_value, stage,
                expected_close, booster_comment, next_follow_up, note, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                customer["id"], customer["name"], customer["phone"], customer["email"], customer["source"],
                customer["status"], customer["owner"], customer["dealValue"], customer["collectedAmount"], customer["stage"],
                customer["expectedClose"], customer["boosterComment"], customer["nextFollowUp"],
                customer["note"], timestamp, timestamp,
            ),
        )

    for activity in valid_activities:
        conn.execute(
            """
            INSERT INTO activities (id, customer_id, type, date, owner, note, attachments, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                activity["id"], activity["customerId"], activity["type"], activity["date"],
                activity["owner"], activity["note"], json.dumps(activity["attachments"], ensure_ascii=False), timestamp,
            ),
        )


def read_state(user: dict) -> dict:
    with db() as conn:
        if user["role"] == "admin":
            customer_rows = conn.execute("SELECT * FROM customers ORDER BY updated_at DESC, created_at DESC").fetchall()
            activity_rows = conn.execute("SELECT * FROM activities ORDER BY date DESC, created_at DESC").fetchall()
        else:
            customer_rows = conn.execute(
                "SELECT * FROM customers WHERE owner = ? ORDER BY updated_at DESC, created_at DESC",
                (user["ownerName"],),
            ).fetchall()
            activity_rows = conn.execute(
                """
                SELECT a.* FROM activities a
                JOIN customers c ON c.id = a.customer_id
                WHERE c.owner = ?
                ORDER BY a.date DESC, a.created_at DESC
                """,
                (user["ownerName"],),
            ).fetchall()
        settings = read_settings(conn)

    customers = [
        {
            "id": row["id"], "name": row["name"], "phone": row["phone"], "email": row["email"],
            "source": row["source"], "status": row["status"], "owner": row["owner"],
            "dealValue": row["deal_value"], "collectedAmount": row["collected_value"], "stage": row["stage"],
            "expectedClose": row["expected_close"], "boosterComment": row["booster_comment"] or "",
            "nextFollowUp": row["next_follow_up"], "note": row["note"],
        }
        for row in customer_rows
    ]
    activities = [
        {
            "id": row["id"], "customerId": row["customer_id"], "type": row["type"],
            "date": row["date"], "owner": row["owner"], "note": row["note"],
            "attachments": normalize_attachments(row["attachments"]),
        }
        for row in activity_rows
    ]
    return {"customers": customers, "activities": activities, "user": user, "settings": settings}


def read_json(handler: SimpleHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    if length <= 0:
        return {}
    return json.loads(handler.rfile.read(length).decode("utf-8"))


class CRMHandler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        try:
            if path == "/api/me":
                user = self.current_user(required=False)
                self.send_json({"user": user, "settings": read_settings()})
                return
            if path == "/api/state":
                self.send_json(read_state(self.current_user()))
                return
            if path == "/api/export":
                user = self.current_user()
                payload = read_state(user)
                payload["exportedAt"] = now_iso()
                payload["version"] = 2
                self.send_json(payload)
                return
            if path == "/api/users":
                self.require_admin()
                with db() as conn:
                    targets = read_settings(conn)["ownerTargets"]
                    users = []
                    for row in conn.execute("SELECT * FROM users ORDER BY role, username"):
                        user = public_user(row)
                        user["monthlyTarget"] = targets.get(user["ownerName"])
                        users.append(user)
                self.send_json({"users": users})
                return
            if path == "/api/settings":
                self.require_admin()
                self.send_json({"settings": read_settings()})
                return
            self.serve_static(path)
        except PermissionError as exc:
            self.send_error_json(403 if str(exc) == "Forbidden" else 401, str(exc))

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            if path == "/api/login":
                self.login(read_json(self))
                return
            if path == "/api/logout":
                self.logout()
                return
            if path == "/api/change-password":
                self.change_password(read_json(self))
                return
            if path == "/api/customers":
                user = self.current_user()
                customer = normalize_customer(read_json(self))
                current_settings = read_settings()
                status_definitions = {item["name"]: item for item in current_settings["statuses"]}
                if user["role"] != "admin":
                    customer["owner"] = user["ownerName"]
                validate_customer(customer)
                if customer["status"] not in status_definitions:
                    raise ValueError("Invalid customer status")
                is_won = status_definitions[customer["status"]]["isWon"] or "成交" in customer["status"]
                if not is_won:
                    customer["dealValue"] = 0
                    customer["collectedAmount"] = 0
                elif customer["dealValue"] <= 0:
                    raise ValueError("Sales Amount is required for a won customer")
                if not can_access_owner(user, customer["owner"]):
                    raise PermissionError("Forbidden")
                self.save_customer(customer, user)
                self.send_json({"ok": True, "customer": customer})
                return
            if path == "/api/activities":
                user = self.current_user()
                activity = normalize_activity(read_json(self))
                if activity["type"] not in read_settings()["activityTypes"]:
                    raise ValueError("Invalid follow-up type")
                if user["role"] != "admin":
                    activity["owner"] = user["ownerName"]
                validate_activity(activity)
                self.save_activity(activity, user)
                self.send_json({"ok": True, "activity": activity})
                return
            if path == "/api/import":
                self.require_admin()
                with db() as conn:
                    replace_all(conn, read_json(self))
                self.send_json({"ok": True})
                return
            if path == "/api/reset":
                self.require_admin()
                with db() as conn:
                    replace_all(conn, SEED_DATA)
                self.send_json({"ok": True})
                return
            if path == "/api/users":
                self.require_admin()
                with db() as conn:
                    user = create_user_with_target(conn, read_json(self))
                self.send_json({"ok": True, "user": user})
                return
            if path == "/api/settings":
                self.require_admin()
                settings = save_settings(read_json(self))
                self.send_json({"ok": True, "settings": settings})
                return
            self.send_error_json(404, "API route not found")
        except PermissionError as exc:
            self.send_error_json(403 if str(exc) == "Forbidden" else 401, str(exc))
        except (ValueError, json.JSONDecodeError) as exc:
            self.send_error_json(400, str(exc))
        except sqlite3.IntegrityError:
            self.send_error_json(400, "Username already exists")
        except sqlite3.Error as exc:
            self.send_error_json(500, f"Database error: {exc}")

    def do_PATCH(self) -> None:
        path = urlparse(self.path).path
        parts = path.strip("/").split("/")
        try:
            if len(parts) == 4 and parts[:2] == ["api", "customers"] and parts[3] == "stage":
                user = self.current_user()
                customer_id = unquote(parts[2])
                payload = read_json(self)
                stage = str(payload.get("stage") or "").strip()
                if stage not in read_settings()["stages"]:
                    raise ValueError("Invalid stage")
                self.require_customer_access(customer_id, user)
                with db() as conn:
                    conn.execute("UPDATE customers SET stage = ?, updated_at = ? WHERE id = ?", (stage, now_iso(), customer_id))
                self.send_json({"ok": True})
                return
            if len(parts) == 3 and parts[:2] == ["api", "users"]:
                current = self.require_admin()
                user_id = unquote(parts[2])
                with db() as conn:
                    user = update_user_account(conn, user_id, read_json(self), current)
                self.send_json({"ok": True, "user": user})
                return
            self.send_error_json(404, "API route not found")
        except PermissionError as exc:
            self.send_error_json(403 if str(exc) == "Forbidden" else 401, str(exc))
        except (ValueError, json.JSONDecodeError) as exc:
            self.send_error_json(400, str(exc))

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        parts = path.strip("/").split("/")
        try:
            if len(parts) == 3 and parts[:2] == ["api", "customers"]:
                user = self.current_user()
                customer_id = unquote(parts[2])
                self.require_customer_access(customer_id, user)
                with db() as conn:
                    conn.execute("DELETE FROM activities WHERE customer_id = ?", (customer_id,))
                    conn.execute("DELETE FROM customers WHERE id = ?", (customer_id,))
                self.send_json({"ok": True})
                return
            if len(parts) == 3 and parts[:2] == ["api", "users"]:
                current = self.require_admin()
                user_id = unquote(parts[2])
                if user_id == current["id"]:
                    raise ValueError("Cannot delete your own account")
                with db() as conn:
                    user = conn.execute("SELECT owner_name FROM users WHERE id = ?", (user_id,)).fetchone()
                    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
                    if user:
                        targets = dict(read_settings(conn)["ownerTargets"])
                        targets.pop(user["owner_name"], None)
                        save_owner_targets(conn, targets)
                self.send_json({"ok": True})
                return
            self.send_error_json(404, "API route not found")
        except PermissionError as exc:
            self.send_error_json(403 if str(exc) == "Forbidden" else 401, str(exc))
        except ValueError as exc:
            self.send_error_json(400, str(exc))

    def login(self, payload: dict) -> None:
        username = str(payload.get("username") or "").strip().lower()
        password = str(payload.get("password") or "")
        with db() as conn:
            row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
            if not row or not verify_password(password, row["password_salt"], row["password_hash"]):
                raise PermissionError("Invalid username or password")
            token = secrets.token_urlsafe(32)
            expires_at = datetime.fromtimestamp(datetime.now(timezone.utc).timestamp() + SESSION_DAYS * 86400, timezone.utc).isoformat(timespec="seconds")
            conn.execute("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", (token, row["id"], expires_at, now_iso()))
        self.send_json({"ok": True, "user": public_user(row)}, headers=[self.session_cookie(token)])

    def logout(self) -> None:
        token = self.session_token()
        if token:
            with db() as conn:
                conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        self.send_json({"ok": True}, headers=[self.expired_cookie()])

    def change_password(self, payload: dict) -> None:
        user = self.current_user()
        current_password = str(payload.get("currentPassword") or "")
        new_password = str(payload.get("newPassword") or "")
        if not current_password or len(new_password) < 6:
            raise ValueError("Password is missing or too short")

        token = self.session_token()
        with db() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
            if not row or not verify_password(current_password, row["password_salt"], row["password_hash"]):
                raise PermissionError("Invalid current password")
            salt, password_hash = hash_password(new_password)
            conn.execute(
                "UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?",
                (salt, password_hash, user["id"]),
            )
            conn.execute(
                "DELETE FROM sessions WHERE user_id = ? AND token <> ?",
                (user["id"], token or ""),
            )
        self.send_json({"ok": True})

    def current_user(self, required: bool = True) -> dict | None:
        token = self.session_token()
        if not token:
            if required:
                raise PermissionError("Not authenticated")
            return None
        with db() as conn:
            row = conn.execute(
                """
                SELECT u.* FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token = ? AND s.expires_at > ?
                """,
                (token, now_iso()),
            ).fetchone()
        if not row:
            if required:
                raise PermissionError("Not authenticated")
            return None
        return public_user(row)

    def require_admin(self) -> dict:
        user = self.current_user()
        if user["role"] != "admin":
            raise PermissionError("Forbidden")
        return user

    def require_customer_access(self, customer_id: str, user: dict):
        with db() as conn:
            row = conn.execute("SELECT * FROM customers WHERE id = ?", (customer_id,)).fetchone()
        if not row:
            raise ValueError("Customer not found")
        if not can_access_owner(user, row["owner"]):
            raise PermissionError("Forbidden")
        return row

    def save_customer(self, customer: dict, user: dict) -> None:
        timestamp = now_iso()
        with db() as conn:
            existing = conn.execute("SELECT id, owner, created_at FROM customers WHERE id = ?", (customer["id"],)).fetchone()
            if existing and not can_access_owner(user, existing["owner"]):
                raise PermissionError("Forbidden")
            created_at = existing["created_at"] if existing else timestamp
            conn.execute(
                """
                INSERT INTO customers (
                    id, name, phone, email, source, status, owner, deal_value, collected_value, stage,
                    expected_close, booster_comment, next_follow_up, note, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name, phone = excluded.phone, email = excluded.email,
                    source = excluded.source, status = excluded.status, owner = excluded.owner,
                    deal_value = excluded.deal_value, collected_value = excluded.collected_value, stage = excluded.stage,
                    expected_close = excluded.expected_close, booster_comment = excluded.booster_comment,
                    next_follow_up = excluded.next_follow_up, note = excluded.note,
                    updated_at = excluded.updated_at
                """,
                (
                    customer["id"], customer["name"], customer["phone"], customer["email"], customer["source"],
                    customer["status"], customer["owner"], customer["dealValue"], customer["collectedAmount"], customer["stage"],
                    customer["expectedClose"], customer["boosterComment"], customer["nextFollowUp"],
                    customer["note"], created_at, timestamp,
                ),
            )

    def save_activity(self, activity: dict, user: dict) -> None:
        customer = self.require_customer_access(activity["customerId"], user)
        if user["role"] != "admin":
            activity["owner"] = customer["owner"]
        with db() as conn:
            conn.execute(
                """
                INSERT INTO activities (id, customer_id, type, date, owner, note, attachments, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    activity["id"], activity["customerId"], activity["type"], activity["date"],
                    activity["owner"], activity["note"], json.dumps(activity["attachments"], ensure_ascii=False), now_iso(),
                ),
            )

    def session_token(self) -> str | None:
        cookie_header = self.headers.get("Cookie")
        if not cookie_header:
            return None
        cookie = SimpleCookie(cookie_header)
        morsel = cookie.get(SESSION_COOKIE)
        return morsel.value if morsel else None

    def session_cookie(self, token: str) -> str:
        parts = [f"{SESSION_COOKIE}={token}", "Path=/", "HttpOnly", "SameSite=Lax", f"Max-Age={SESSION_DAYS * 86400}"]
        if COOKIE_SECURE:
            parts.append("Secure")
        return "; ".join(parts)

    def expired_cookie(self) -> str:
        return f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"

    def serve_static(self, path: str) -> None:
        if path == "/":
            path = "/index.html"
        target = (ROOT / path.lstrip("/")).resolve()
        if not str(target).startswith(str(ROOT)) or not target.exists() or not target.is_file():
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if target.suffix in {".html", ".css", ".js"}:
            content_type += "; charset=utf-8"
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, payload: dict, status: int = 200, headers: list[str] | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for header in headers or []:
            self.send_header("Set-Cookie", header)
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status: int, message: str) -> None:
        self.send_json({"error": message}, status)

    def log_message(self, format: str, *args: object) -> None:
        sys.stdout.write("%s - %s\n" % (self.address_string(), format % args))


if __name__ == "__main__":
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), CRMHandler)
    print(f"Sales CRM running at http://{HOST}:{PORT}")
    if DATABASE_URL:
        print("Database: PostgreSQL")
    else:
        print(f"SQLite database: {DB_PATH}")
    server.serve_forever()
