"""서버 모듈이 정상 import 되는지 검증.

Docker에서 서버 시작 시 import 실패로 크래시하는 문제를
CI 단계에서 사전에 잡기 위한 smoke test.

CI 환경에서 pip install -e ".[dev,llm,db]" 로 전체 의존성이
설치된 상태에서 실행된다.
"""
from __future__ import annotations

import unittest


class ImportTests(unittest.TestCase):
    def test_main_app_importable(self) -> None:
        """FastAPI 앱 객체가 정상 생성되는지 검증."""
        from app.main import app
        self.assertEqual(app.title, "Folio AI")

    def test_celery_app_importable(self) -> None:
        """Celery 앱 모듈이 정상 import 되는지 검증."""
        from app.celery_app import celery_app
        self.assertEqual(celery_app.main, "folio_ai")

    def test_chunker_importable(self) -> None:
        from app.services.chunker import chunk_text, count_tokens
        self.assertIsNotNone(chunk_text)
        self.assertIsNotNone(count_tokens)

    def test_tokenizer_compat_importable(self) -> None:
        from app.services.tokenizer_compat import get_cl100k_base_encoding
        enc = get_cl100k_base_encoding()
        self.assertIsNotNone(enc)

    def test_embedder_importable(self) -> None:
        from app.services.embedder import FakeEmbedder, OpenAIEmbedder
        self.assertIsNotNone(FakeEmbedder)
        self.assertIsNotNone(OpenAIEmbedder)

    def test_all_api_routers_importable(self) -> None:
        """모든 API 라우터 모듈이 import 가능한지 검증."""
        from app.api.v1 import health, pipelines, drafts, reviews
        self.assertIsNotNone(health.router)
        self.assertIsNotNone(pipelines.router)
        self.assertIsNotNone(drafts.router)
        self.assertIsNotNone(reviews.router)

    def test_all_task_modules_importable(self) -> None:
        """Celery 태스크 모듈이 import 가능한지 검증."""
        from app.tasks import _ping, chunk_and_embed
        self.assertIsNotNone(_ping)
        self.assertIsNotNone(chunk_and_embed)


if __name__ == "__main__":
    unittest.main()
