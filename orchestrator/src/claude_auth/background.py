import asyncio
import logging

from ..database import async_session_maker
from .manager import ClaudeAuthManager

logger = logging.getLogger(__name__)

REFRESH_INTERVAL_SECONDS = 30 * 60  # 30 минут


async def token_refresh_loop() -> None:
    """Бесконечный цикл: каждые 30 мин проверяет экспайр, рефрешит, раздаёт."""
    manager = ClaudeAuthManager()

    while True:
        await asyncio.sleep(REFRESH_INTERVAL_SECONDS)

        try:
            async with async_session_maker() as db:
                refreshed = await manager.refresh_if_needed(db)
                if refreshed and manager.distributor:
                    credential = await manager._get_credential(db)
                    if credential:
                        count = await manager.distributor.distribute_to_all_agents(db, credential)
                        logger.info("Background refresh: distributed to %d agents", count)
        except Exception:
            logger.exception("Error in token refresh loop")
