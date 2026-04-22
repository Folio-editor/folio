import logging

from app.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.ping_task")
def ping_task(msg: str = "ping") -> str:
    logger.info("ping_task received: %s", msg)
    return f"pong:{msg}"
