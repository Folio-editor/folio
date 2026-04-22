from __future__ import annotations

import unittest

from app.services.chunker import chunk_text, count_tokens


class CountTokensTests(unittest.TestCase):
    def test_empty_string(self) -> None:
        self.assertEqual(count_tokens(""), 0)

    def test_korean_text(self) -> None:
        self.assertGreater(count_tokens("안녕하세요"), 0)

    def test_english_text(self) -> None:
        self.assertGreater(count_tokens("Hello world"), 0)


class ChunkTextTests(unittest.TestCase):
    def test_empty_input(self) -> None:
        self.assertEqual(chunk_text(""), [])
        self.assertEqual(chunk_text("   "), [])

    def test_single_short_paragraph(self) -> None:
        chunks = chunk_text("짧은 문장입니다.", min_tokens=1, max_tokens=1000)
        self.assertEqual(len(chunks), 1)
        self.assertEqual(chunks[0], "짧은 문장입니다.")

    def test_multiple_paragraphs_within_limit(self) -> None:
        text = "첫 번째 단락.\n\n두 번째 단락."
        chunks = chunk_text(text, min_tokens=1, max_tokens=1000)
        self.assertEqual(len(chunks), 1)
        self.assertIn("첫 번째 단락.", chunks[0])
        self.assertIn("두 번째 단락.", chunks[0])

    def test_paragraphs_exceeding_max_tokens_are_split(self) -> None:
        para1 = "alpha " * 100
        para2 = "beta " * 100
        text = f"{para1}\n\n{para2}"
        chunks = chunk_text(text, min_tokens=10, max_tokens=120)
        self.assertGreaterEqual(len(chunks), 2)

    def test_small_trailing_chunk_merged(self) -> None:
        para1 = "word " * 80
        para2 = "tiny"
        text = f"{para1}\n\n{para2}"
        chunks = chunk_text(text, min_tokens=50, max_tokens=200)
        self.assertEqual(len(chunks), 1)
        self.assertIn("tiny", chunks[0])

    def test_long_paragraph_split_by_sentence(self) -> None:
        sentences = "이것은 긴 문장입니다. " * 200
        chunks = chunk_text(sentences, min_tokens=10, max_tokens=100)
        self.assertGreater(len(chunks), 1)
        for chunk in chunks:
            self.assertLessEqual(count_tokens(chunk), 150)


if __name__ == "__main__":
    unittest.main()
