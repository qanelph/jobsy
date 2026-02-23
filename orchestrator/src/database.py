from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from .config import settings

engine = create_async_engine(settings.database_url, echo=True)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session


async def init_db() -> None:
    import asyncio
    from alembic.config import Config
    from alembic import command
    from sqlalchemy import text, inspect

    # Проверяем, есть ли alembic_version; если нет — stamping для существующей БД
    async with engine.connect() as conn:
        has_alembic = await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).has_table("alembic_version")
        )
        if not has_alembic:
            has_users = await conn.run_sync(
                lambda sync_conn: inspect(sync_conn).has_table("users")
            )
            if has_users:
                # БД создана через create_all — stamp до миграции, покрывающей существующие таблицы
                def _stamp() -> None:
                    cfg = Config("alembic.ini")
                    command.stamp(cfg, "003")
                await asyncio.get_event_loop().run_in_executor(None, _stamp)

    def _run_upgrade() -> None:
        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")

    await asyncio.get_event_loop().run_in_executor(None, _run_upgrade)
