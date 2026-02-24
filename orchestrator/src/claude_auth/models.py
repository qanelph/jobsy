from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Integer, String, Text, BigInteger, Enum as SQLEnum, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from ..database import Base


class AuthMode(str, Enum):
    OAUTH = "oauth"
    API_KEY = "api_key"


class ClaudeCredential(Base):
    __tablename__ = "claude_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    auth_mode: Mapped[AuthMode] = mapped_column(
        SQLEnum(AuthMode, values_callable=lambda e: [x.value for x in e]),
        nullable=False,
    )

    # OAuth tokens
    access_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    refresh_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expires_at: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)  # epoch ms

    # API key
    api_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Metadata
    account_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    organization_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
