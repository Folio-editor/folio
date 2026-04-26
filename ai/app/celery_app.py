from celery import Celery

from app.config import settings

celery_app = Celery(
    "folio_ai",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.tasks._ping",
        "app.tasks.chunk_and_embed",
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
    # 태스크 args/kwargs 로그 노출 차단 (에피소드 본문 유출 방지).
    # 기본 포맷에는 %(args)s/%(kwargs)s 치환자가 포함되어 소설 본문이 그대로 찍힘.
    worker_task_log_format=(
        "[%(asctime)s: %(levelname)s/%(processName)s] "
        "Task %(task_name)s[%(task_id)s] %(message)s"
    ),
    worker_log_format=(
        "[%(asctime)s: %(levelname)s/%(processName)s] %(message)s"
    ),
    worker_redirect_stdouts=False,
    worker_hijack_root_logger=False,
    task_routes={
        "app.tasks.ping_task": {"queue": "indexing"},
        "app.tasks.chunk_and_embed": {"queue": "indexing"},
        "app.tasks.generate_draft": {"queue": "draft"},
        "app.tasks.run_review": {"queue": "review"},
    },
)
