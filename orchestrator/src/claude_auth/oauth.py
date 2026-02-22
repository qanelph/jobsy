import hashlib
import base64
import secrets
import time
from dataclasses import dataclass, field

import httpx

from ..config import settings


@dataclass(frozen=True)
class OAuthConfig:
    client_id: str = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
    token_url: str = "https://platform.claude.com/v1/oauth/token"
    authorize_url: str = "https://claude.ai/oauth/authorize"
    redirect_url: str = "https://platform.claude.com/oauth/code/callback"
    scopes: str = "user:profile user:inference user:sessions:claude_code user:mcp_servers"


def _generate_code_verifier() -> str:
    return secrets.token_urlsafe(64)[:128]


def _generate_code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _get_proxy() -> str | None:
    return settings.http_proxy or None


@dataclass
class ClaudeOAuthClient:
    config: OAuthConfig = field(default_factory=OAuthConfig)
    _pending_flows: dict[str, str] = field(default_factory=dict)  # state -> code_verifier

    def start_flow(self) -> tuple[str, str]:
        """Генерирует authorize URL и state. Возвращает (authorize_url, state)."""
        code_verifier = _generate_code_verifier()
        code_challenge = _generate_code_challenge(code_verifier)
        state = secrets.token_urlsafe(32)

        self._pending_flows[state] = code_verifier

        params = {
            "code": "true",
            "client_id": self.config.client_id,
            "response_type": "code",
            "redirect_uri": self.config.redirect_url,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "state": state,
            "scope": self.config.scopes,
        }
        query = "&".join(f"{k}={v}" for k, v in params.items())
        authorize_url = f"{self.config.authorize_url}?{query}"

        return authorize_url, state

    async def exchange_code(self, code: str, state: str) -> dict:
        """Обменивает authorization code на токены. JSON body как в Claude Code CLI."""
        code_verifier = self._pending_flows.pop(state, None)
        if not code_verifier:
            raise ValueError("Неизвестный state — OAuth flow не найден или истёк")

        payload = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": self.config.redirect_url,
            "client_id": self.config.client_id,
            "code_verifier": code_verifier,
            "state": state,
        }

        async with httpx.AsyncClient(proxy=_get_proxy()) as client:
            resp = await client.post(
                self.config.token_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code != 200:
                raise ValueError(f"Token exchange failed: {resp.status_code} {resp.text}")

        tokens = resp.json()
        return {
            "access_token": tokens["access_token"],
            "refresh_token": tokens["refresh_token"],
            "expires_at": int(time.time() * 1000) + tokens["expires_in"] * 1000,
            "account": tokens.get("account"),
            "organization": tokens.get("organization"),
        }

    async def refresh_tokens(self, refresh_token: str) -> dict:
        """Рефрешит access_token. JSON body как в Claude Code CLI."""
        payload = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": self.config.client_id,
            "scope": self.config.scopes,
        }

        async with httpx.AsyncClient(proxy=_get_proxy()) as client:
            resp = await client.post(
                self.config.token_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code != 200:
                raise ValueError(f"Token refresh failed: {resp.status_code} {resp.text}")

        tokens = resp.json()
        return {
            "access_token": tokens["access_token"],
            "refresh_token": tokens["refresh_token"],
            "expires_at": int(time.time() * 1000) + tokens["expires_in"] * 1000,
        }
