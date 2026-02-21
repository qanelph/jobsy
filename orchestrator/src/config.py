from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/jobsy"

    # JWT
    jwt_secret_key: str = "your-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Telegram
    telegram_bot_token: str = ""

    # Docker
    docker_base_url: str = "unix:///var/run/docker.sock"
    agent_image: str = "phl-jobs-agent:latest"

    # Kubernetes
    use_kubernetes: bool = False
    k8s_namespace: str = "phl-jobsy"

    # Ports
    agent_port_start: int = 8100
    agent_port_end: int = 8200


settings = Settings()
