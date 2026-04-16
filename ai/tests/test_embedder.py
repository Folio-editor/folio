from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

AI_ROOT = Path(__file__).resolve().parents[1]
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from embedder import EMBEDDING_DIMENSION, OPENAI_BATCH_LIMIT, embed_batch, embed_text


def _make_embedding(value: float) -> list[float]:
    return [value] * EMBEDDING_DIMENSION


class EmbedderTests(unittest.TestCase):
    def test_embed_text_rejects_blank_input(self) -> None:
        with self.assertRaises(ValueError):
            embed_text("")

    def test_embed_text_returns_single_vector(self) -> None:
        fake_response = SimpleNamespace(
            data=[SimpleNamespace(index=0, embedding=_make_embedding(0.5))]
        )
        fake_client = SimpleNamespace(
            embeddings=SimpleNamespace(create=lambda **_: fake_response)
        )

        with patch("embedder._get_client", return_value=fake_client):
            vector = embed_text("안녕하세요")

        self.assertEqual(len(vector), EMBEDDING_DIMENSION)
        self.assertTrue(all(isinstance(value, float) for value in vector))

    def test_embed_batch_returns_vectors_in_order(self) -> None:
        fake_response = SimpleNamespace(
            data=[
                SimpleNamespace(index=1, embedding=_make_embedding(1.0)),
                SimpleNamespace(index=0, embedding=_make_embedding(0.0)),
            ]
        )
        fake_client = SimpleNamespace(
            embeddings=SimpleNamespace(create=lambda **_: fake_response)
        )

        with patch("embedder._get_client", return_value=fake_client):
            vectors = embed_batch(["안녕", "반가워"])

        self.assertEqual(len(vectors), 2)
        self.assertEqual(vectors[0][0], 0.0)
        self.assertEqual(vectors[1][0], 1.0)
        self.assertEqual(len(vectors[0]), EMBEDDING_DIMENSION)

    def test_embed_batch_splits_large_requests(self) -> None:
        calls: list[int] = []

        def create(*, model: str, input: list[str]) -> SimpleNamespace:
            calls.append(len(input))
            return SimpleNamespace(
                data=[
                    SimpleNamespace(index=index, embedding=_make_embedding(float(index)))
                    for index, _ in enumerate(input)
                ]
            )

        fake_client = SimpleNamespace(embeddings=SimpleNamespace(create=create))
        texts = [f"text-{index}" for index in range(OPENAI_BATCH_LIMIT + 2)]

        with patch("embedder._get_client", return_value=fake_client):
            vectors = embed_batch(texts)

        self.assertEqual(calls, [OPENAI_BATCH_LIMIT, 2])
        self.assertEqual(len(vectors), OPENAI_BATCH_LIMIT + 2)
        self.assertEqual(len(vectors[0]), EMBEDDING_DIMENSION)


if __name__ == "__main__":
    unittest.main()
