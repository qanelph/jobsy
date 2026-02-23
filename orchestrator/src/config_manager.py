import json
from dataclasses import fields

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .agents.models import GlobalConfig
from .config import MutableSettingsSnapshot, MutableSettingsSchema, settings
from .config_schemas import SettingsUpdate


class ConfigManager:
    """Сервисный слой для dynamic settings: загрузка из БД, partial update, reset."""

    @staticmethod
    async def load_from_db(db: AsyncSession) -> None:
        """Загрузить overrides из БД и применить к runtime settings (вызывать при старте)."""
        result = await db.execute(select(GlobalConfig).where(GlobalConfig.id == 1))
        config = result.scalar_one_or_none()
        if not config or not config.settings_json:
            return

        overrides: dict[str, object] = json.loads(config.settings_json)
        if not overrides:
            return

        env_defaults = settings.get_env_defaults()
        merged = {f.name: overrides.get(f.name, getattr(env_defaults, f.name)) for f in fields(MutableSettingsSnapshot)}
        # Валидация через Pydantic
        validated = MutableSettingsSchema(**merged)
        snapshot = MutableSettingsSnapshot(**validated.model_dump())
        settings.replace_mutable(snapshot)

    @staticmethod
    async def update(db: AsyncSession, updates: SettingsUpdate) -> MutableSettingsSnapshot:
        """Partial update: merge в БД → применить к runtime → вернуть новый snapshot."""
        # Получить текущие overrides из БД
        result = await db.execute(select(GlobalConfig).where(GlobalConfig.id == 1))
        config = result.scalar_one_or_none()

        stored: dict[str, object] = {}
        if config and config.settings_json:
            stored = json.loads(config.settings_json)

        # Merge только non-None полей
        patch = updates.model_dump(exclude_none=True)
        stored.update(patch)

        # Собрать полный набор: env defaults + stored overrides
        env_defaults = settings.get_env_defaults()
        merged = {f.name: stored.get(f.name, getattr(env_defaults, f.name)) for f in fields(MutableSettingsSnapshot)}

        # Валидация
        validated = MutableSettingsSchema(**merged)
        snapshot = MutableSettingsSnapshot(**validated.model_dump())

        # Сохранить в БД
        settings_json = json.dumps(stored, ensure_ascii=False)
        if not config:
            config = GlobalConfig(id=1, settings_json=settings_json)
            db.add(config)
        else:
            config.settings_json = settings_json
        await db.commit()

        # Применить к runtime
        settings.replace_mutable(snapshot)
        return snapshot

    @staticmethod
    async def reset(db: AsyncSession) -> MutableSettingsSnapshot:
        """Сброс к .env дефолтам: очистить БД overrides, вернуть runtime к .env."""
        result = await db.execute(select(GlobalConfig).where(GlobalConfig.id == 1))
        config = result.scalar_one_or_none()
        if config:
            config.settings_json = None
            await db.commit()

        env_defaults = settings.get_env_defaults()
        settings.replace_mutable(env_defaults)
        return env_defaults
