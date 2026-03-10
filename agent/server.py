"""Minimal Jobs agent HTTP server."""

import hmac
import json
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from dataclasses import dataclass
from pathlib import Path

PORT = 8080
CREDENTIALS_PATH = Path("/home/jobs/.claude/.credentials.json")
SESSION_PATH = Path("/data/telethon.session")

MASKED_KEYS = {"anthropic_api_key", "tg_api_hash", "tg_bot_token", "openai_api_key"}


@dataclass
class ConfigField:
    value: str | int | list[int] | None
    mutable: bool
    type: str  # "str" | "int" | "secret" | "list[int]"

    def to_dict(self, unmask: bool = False) -> dict:
        v = self.value
        if not unmask and self.type == "secret" and isinstance(v, str) and v:
            v = v[:4] + "..." + v[-4:] if len(v) > 8 else "***"
        return {"value": v, "mutable": self.mutable, "type": self.type}


def _parse_int_list(raw: str) -> list[int]:
    if not raw:
        return []
    # Support both JSON array "[1,2]" and CSV "1,2" formats
    cleaned = raw.strip().strip("[]")
    if not cleaned:
        return []
    return [int(x.strip()) for x in cleaned.split(",") if x.strip()]


def _build_config() -> dict[str, ConfigField]:
    return {
        "anthropic_api_key": ConfigField(os.environ.get("ANTHROPIC_API_KEY", ""), True, "secret"),
        "openai_api_key": ConfigField(os.environ.get("OPENAI_API_KEY", ""), True, "secret"),
        "tg_bot_token": ConfigField(os.environ.get("TG_BOT_TOKEN", ""), True, "secret"),
        "tg_user_id": ConfigField(os.environ.get("TG_USER_ID", ""), True, "str"),
        "tg_owner_ids": ConfigField(
            _parse_int_list(os.environ.get("TG_OWNER_IDS", "")), True, "list[int]"
        ),
        "tg_api_id": ConfigField(os.environ.get("TG_API_ID", ""), True, "str"),
        "tg_api_hash": ConfigField(os.environ.get("TG_API_HASH", ""), True, "secret"),
        "claude_model": ConfigField(os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-5-20250929"), True, "str"),
        "http_proxy": ConfigField(os.environ.get("HTTP_PROXY", ""), True, "str"),
        "timezone": ConfigField(os.environ.get("TZ", "Europe/Moscow"), False, "str"),
        "custom_instructions": ConfigField(os.environ.get("CUSTOM_INSTRUCTIONS", ""), True, "str"),
        "browser_cdp_url": ConfigField(os.environ.get("BROWSER_CDP_URL", ""), False, "str"),
        "heartbeat_interval_minutes": ConfigField(
            int(os.environ.get("HEARTBEAT_INTERVAL_MINUTES", "30")), True, "int"
        ),
    }


CONFIG = _build_config()


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _check_auth(self) -> bool:
        """Проверка Bearer {JWT_SECRET_KEY} — constant-time."""
        secret = os.environ.get("JWT_SECRET_KEY", "")
        if not secret:
            self._send_json({"error": "JWT_SECRET_KEY not configured"}, 503)
            return False
        expected = f"Bearer {secret}"
        auth = self.headers.get("Authorization", "")
        if not hmac.compare_digest(auth.encode(), expected.encode()):
            self._send_json({"error": "unauthorized"}, 401)
            return False
        return True

    def do_GET(self) -> None:
        if self.path.startswith("/config"):
            unmask = "unmask=true" in (self.path.split("?", 1)[1] if "?" in self.path else "")
            data = {k: f.to_dict(unmask=unmask) for k, f in CONFIG.items()}
            self._send_json(data)
        elif self.path == "/health":
            self._send_json({"status": "ok"})
        elif self.path == "/session":
            self._send_json({"has_session": SESSION_PATH.exists()})
        else:
            self._send_json({"error": "not found"}, 404)

    def do_POST(self) -> None:
        if self.path == "/credentials":
            if not self._check_auth():
                return
            length = int(self.headers.get("Content-Length", 0))
            if not length:
                self._send_json({"error": "empty body"}, 400)
                return
            body = json.loads(self.rfile.read(length))
            credentials = body.get("credentials")
            if not credentials:
                self._send_json({"error": "missing 'credentials' field"}, 400)
                return
            CREDENTIALS_PATH.parent.mkdir(parents=True, exist_ok=True)
            CREDENTIALS_PATH.write_text(json.dumps(credentials, indent=2))
            self._send_json({"status": "ok"})
        elif self.path == "/session":
            if not self._check_auth():
                return
            length = int(self.headers.get("Content-Length", 0))
            if not length:
                self._send_json({"error": "empty body"}, 400)
                return
            body = json.loads(self.rfile.read(length))
            session_string = body.get("session_string")
            if not session_string:
                self._send_json({"error": "missing 'session_string' field"}, 400)
                return
            SESSION_PATH.parent.mkdir(parents=True, exist_ok=True)
            SESSION_PATH.write_bytes(session_string.encode("utf-8"))
            self._send_json({"status": "ok"})
        else:
            self._send_json({"error": "not found"}, 404)

    def do_DELETE(self) -> None:
        if self.path == "/session":
            if not self._check_auth():
                return
            if SESSION_PATH.exists():
                SESSION_PATH.unlink()
            self._send_json({"status": "ok"})
        else:
            self._send_json({"error": "not found"}, 404)

    def do_PATCH(self) -> None:
        if self.path.startswith("/config"):
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}
            for k, v in body.items():
                if k in CONFIG and CONFIG[k].mutable:
                    CONFIG[k].value = v
            data = {k: f.to_dict() for k, f in CONFIG.items()}
            self._send_json(data)
        else:
            self._send_json({"error": "not found"}, 404)

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[agent] {fmt % args}")


def _pull_credentials_on_start() -> None:
    """Pull credentials от оркестратора при старте (если ORCHESTRATOR_URL задан)."""
    import time
    import urllib.request
    import urllib.error

    orchestrator_url = os.environ.get("ORCHESTRATOR_URL", "")
    jwt_secret = os.environ.get("JWT_SECRET_KEY", "")
    if not orchestrator_url or not jwt_secret:
        return

    url = f"{orchestrator_url.rstrip('/')}/claude-auth/credentials"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {jwt_secret}"})

    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
            credentials = data.get("credentials")
            if not credentials:
                print("[agent] credentials pull: no credentials on orchestrator")
                return
            CREDENTIALS_PATH.parent.mkdir(parents=True, exist_ok=True)
            CREDENTIALS_PATH.write_text(json.dumps(credentials, indent=2))
            print("[agent] credentials pulled successfully")
            return
        except (urllib.error.URLError, OSError) as exc:
            print(f"[agent] credentials pull attempt {attempt}: {exc}")
            if attempt < 3:
                time.sleep(2)

    print("[agent] credentials pull failed after 3 attempts")


if __name__ == "__main__":
    _pull_credentials_on_start()
    print(f"[agent] starting on :{PORT}")
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
