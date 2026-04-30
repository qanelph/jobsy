from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from ..database import Base


class GlobalConfig(Base):
    __tablename__ = "global_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    env_vars: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON {"KEY": "value"}
    settings_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON mutable settings overrides
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class AgentStatus(str, Enum):
    CREATING = "creating"
    RUNNING = "running"
    STOPPED = "stopped"
    ERROR = "error"
    DELETED = "deleted"


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Базовая информация
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    telegram_user_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # Статус и конфигурация
    status: Mapped[AgentStatus] = mapped_column(
        SQLEnum(AgentStatus, values_callable=lambda e: [x.value for x in e]),
        default=AgentStatus.CREATING,
        nullable=False
    )
    container_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    browser_container_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    port: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Кастомизация
    custom_instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    telegram_bot_token: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    claude_api_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    browser_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, server_default="true")
    env_vars: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON {"KEY": "value"}

    # Метрики
    total_sessions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active_sessions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Флаги
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    last_heartbeat: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class AgentUsageSnapshot(Base):
    """Кумулятивный снимок токенов агента, снятый usage poller'ом."""

    __tablename__ = "agent_usage_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    agent_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
    )
    taken_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    input_tokens: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False, server_default="0")
    output_tokens: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False, server_default="0")
    cache_creation_input_tokens: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False, server_default="0")
    cache_read_input_tokens: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False, server_default="0")
    total_cost_usd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    events_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, server_default="0")
