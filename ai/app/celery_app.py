from celery import Celery

from app.config import settings

celery_app = Celery(
    "storyzip_ai",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.tasks._ping",
        "app.tasks.chunk_and_embed",
        "app.tasks.generate_summary",
        "app.tasks.extract_items",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.tasks.ping_task": {"queue": "indexing"},
        "app.tasks.chunk_and_embed": {"queue": "indexing"},
        "app.tasks.generate_summary": {"queue": "indexing"},
        "app.tasks.extract_items": {"queue": "indexing"},
        "app.tasks.generate_draft": {"queue": "draft"},
        "app.tasks.run_review": {"queue": "review"},
    },
)
