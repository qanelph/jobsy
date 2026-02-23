from dataclasses import dataclass, fields

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class ImmutableSettings(BaseSettings):
    """Настройки, которые нельзя менять в runtime (требуют рестарт)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore", frozen=True)

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/jobsy"
    jwt_secret_key: str = "your-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    docker_base_url: str = "unix:///var/run/docker.sock"


@dataclass(frozen=True)
class MutableSettingsSnapshot:
    """Immutable snapshot mutable-настроек. Подменяется атомарно целиком."""

    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    telegram_bot_token: str = ""
    agent_image: str = "jobs-agent:latest"
    browser_image: str = "jobs-browser:latest"
    openai_api_key: str = ""
    http_proxy: str = ""
    timezone: str = "Europe/Moscow"
    tg_api_id: int = 0
    tg_api_hash: str = ""
    use_kubernetes: bool = False
    k8s_namespace: str = "phl-jobsy"
    agent_port_start: int = 8100
    agent_port_end: int = 8200


class MutableSettingsSchema(BaseModel):
    """Pydantic-схема для валидации mutable-настроек (partial update)."""

    access_token_expire_minutes: int = Field(default=30, ge=1, le=10080)
    refresh_token_expire_days: int = Field(default=7, ge=1, le=365)
    telegram_bot_token: str = ""
    agent_image: str = Field(default="jobs-agent:latest", min_length=1)
    browser_image: str = Field(default="jobs-browser:latest", min_length=1)
    openai_api_key: str = ""
    http_proxy: str = ""
    timezone: str = Field(default="Europe/Moscow", min_length=1)
    tg_api_id: int = Field(default=0, ge=0)
    tg_api_hash: str = ""
    use_kubernetes: bool = False
    k8s_namespace: str = Field(default="phl-jobsy", min_length=1)
    agent_port_start: int = Field(default=8100, ge=1024, le=65535)
    agent_port_end: int = Field(default=8200, ge=1024, le=65535)


# Имена mutable-полей (для быстрого lookup)
MUTABLE_FIELDS: frozenset[str] = frozenset(f.name for f in fields(MutableSettingsSnapshot))


class _MutableFromEnv(BaseSettings):
    """Чтение начальных значений mutable-настроек из .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    telegram_bot_token: str = ""
    agent_image: str = "jobs-agent:latest"
    browser_image: str = "jobs-browser:latest"
    openai_api_key: str = ""
    http_proxy: str = ""
    timezone: str = "Europe/Moscow"
    tg_api_id: int = 0
    tg_api_hash: str = ""
    use_kubernetes: bool = False
    k8s_namespace: str = "phl-jobsy"
    agent_port_start: int = 8100
    agent_port_end: int = 8200


def _env_defaults() -> MutableSettingsSnapshot:
    """Построить snapshot из .env значений."""
    env = _MutableFromEnv()
    return MutableSettingsSnapshot(**{f.name: getattr(env, f.name) for f in fields(MutableSettingsSnapshot)})


class Settings:
    """Двухслойный конфиг: immutable (.env only) + mutable (.env → DB overrides).

    Обратная совместимость: settings.agent_image, settings.database_url работают как раньше.
    """

    def __init__(self) -> None:
        self._immutable = ImmutableSettings()
        self._mutable: MutableSettingsSnapshot = _env_defaults()

    def __getattr__(self, name: str) -> object:
        if name.startswith("_"):
            raise AttributeError(name)
        if name in MUTABLE_FIELDS:
            return getattr(self._mutable, name)
        return getattr(self._immutable, name)

    def replace_mutable(self, snapshot: MutableSettingsSnapshot) -> None:
        """Атомарная замена всего mutable-snapshot."""
        self._mutable = snapshot

    def get_mutable_snapshot(self) -> MutableSettingsSnapshot:
        """Текущий snapshot mutable-настроек."""
        return self._mutable

    def get_env_defaults(self) -> MutableSettingsSnapshot:
        """Snapshot из .env (без DB overrides) для reset."""
        return _env_defaults()


settings = Settings()
