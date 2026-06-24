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

STAGES = ["广告", "3天免费 Webinar", "Booster", "Closing", "Follow up"]

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
            """
        )
        if conn.execute("SELECT COUNT(*) AS count FROM customers").fetchone()["count"] == 0:
            replace_all(conn, SEED_DATA)
        if conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"] == 0:
            for user in initial_users():
                create_user(conn, user)


def initial_users() -> list[dict]:
    if not DATABASE_URL:
        return SEED_USERS

    admin_password = os.environ.get("CRM_ADMIN_PASSWORD", "").strip()
    if not admin_password:
        raise RuntimeError("CRM_ADMIN_PASSWORD is required for cloud deployment")

    return [
        {
            "username": os.environ.get("CRM_ADMIN_USERNAME", "admin").strip().lower() or "admin",
            "password": admin_password,
            "displayName": "Admin",
            "role": "admin",
            "ownerName": "",
        }
    ]


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
        "stage": str(raw.get("stage") or STAGES[0]).strip(),
        "expectedClose": str(raw.get("expectedClose") or raw.get("expected_close") or "").strip(),
        "nextFollowUp": str(raw.get("nextFollowUp") or raw.get("next_follow_up") or "").strip(),
        "note": str(raw.get("note") or "").strip(),
    }


def normalize_activity(raw: dict) -> dict:
    return {
        "id": str(raw.get("id") or f"a{uuid.uuid4().hex[:12]}"),
        "customerId": str(raw.get("customerId") or raw.get("customer_id") or "").strip(),
        "type": str(raw.get("type") or "备注").strip(),
        "date": str(raw.get("date") or "").strip(),
        "owner": str(raw.get("owner") or "").strip(),
        "note": str(raw.get("note") or "").strip(),
    }


def validate_customer(customer: dict) -> None:
    required = ["name", "phone", "source", "status", "owner", "stage", "expectedClose", "nextFollowUp"]
    missing = [field for field in required if not customer.get(field)]
    if missing:
        raise ValueError(f"Missing customer fields: {', '.join(missing)}")


def validate_activity(activity: dict) -> None:
    required = ["customerId", "type", "date", "owner", "note"]
    missing = [field for field in required if not activity.get(field)]
    if missing:
        raise ValueError(f"Missing activity fields: {', '.join(missing)}")


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
                id, name, phone, email, source, status, owner, deal_value, stage,
                expected_close, next_follow_up, note, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                customer["id"], customer["name"], customer["phone"], customer["email"], customer["source"],
                customer["status"], customer["owner"], customer["dealValue"], customer["stage"],
                customer["expectedClose"], customer["nextFollowUp"], customer["note"], timestamp, timestamp,
            ),
        )

    for activity in valid_activities:
        conn.execute(
            """
            INSERT INTO activities (id, customer_id, type, date, owner, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (activity["id"], activity["customerId"], activity["type"], activity["date"], activity["owner"], activity["note"], timestamp),
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

    customers = [
        {
            "id": row["id"], "name": row["name"], "phone": row["phone"], "email": row["email"],
            "source": row["source"], "status": row["status"], "owner": row["owner"],
            "dealValue": row["deal_value"], "stage": row["stage"],
            "expectedClose": row["expected_close"], "nextFollowUp": row["next_follow_up"], "note": row["note"],
        }
        for row in customer_rows
    ]
    activities = [
        {"id": row["id"], "customerId": row["customer_id"], "type": row["type"], "date": row["date"], "owner": row["owner"], "note": row["note"]}
        for row in activity_rows
    ]
    return {"customers": customers, "activities": activities, "user": user}


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
                self.send_json({"user": user})
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
                    users = [public_user(row) for row in conn.execute("SELECT * FROM users ORDER BY role, username")]
                self.send_json({"users": users})
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
            if path == "/api/customers":
                user = self.current_user()
                customer = normalize_customer(read_json(self))
                if user["role"] != "admin":
                    customer["owner"] = user["ownerName"]
                validate_customer(customer)
                if not can_access_owner(user, customer["owner"]):
                    raise PermissionError("Forbidden")
                self.save_customer(customer, user)
                self.send_json({"ok": True, "customer": customer})
                return
            if path == "/api/activities":
                user = self.current_user()
                activity = normalize_activity(read_json(self))
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
                    user = create_user(conn, read_json(self))
                self.send_json({"ok": True, "user": user})
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
                if stage not in STAGES:
                    raise ValueError("Invalid stage")
                self.require_customer_access(customer_id, user)
                with db() as conn:
                    conn.execute("UPDATE customers SET stage = ?, updated_at = ? WHERE id = ?", (stage, now_iso(), customer_id))
                self.send_json({"ok": True})
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
                    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
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
                    id, name, phone, email, source, status, owner, deal_value, stage,
                    expected_close, next_follow_up, note, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name, phone = excluded.phone, email = excluded.email,
                    source = excluded.source, status = excluded.status, owner = excluded.owner,
                    deal_value = excluded.deal_value, stage = excluded.stage,
                    expected_close = excluded.expected_close, next_follow_up = excluded.next_follow_up,
                    note = excluded.note, updated_at = excluded.updated_at
                """,
                (
                    customer["id"], customer["name"], customer["phone"], customer["email"], customer["source"],
                    customer["status"], customer["owner"], customer["dealValue"], customer["stage"],
                    customer["expectedClose"], customer["nextFollowUp"], customer["note"], created_at, timestamp,
                ),
            )

    def save_activity(self, activity: dict, user: dict) -> None:
        customer = self.require_customer_access(activity["customerId"], user)
        if user["role"] != "admin":
            activity["owner"] = customer["owner"]
        with db() as conn:
            conn.execute(
                "INSERT INTO activities (id, customer_id, type, date, owner, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (activity["id"], activity["customerId"], activity["type"], activity["date"], activity["owner"], activity["note"], now_iso()),
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
