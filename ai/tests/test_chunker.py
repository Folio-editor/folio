from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[1]
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from chunker import chunk_episode, count_tokens


class ChunkerTests(unittest.TestCase):
    def test_count_tokens_examples(self) -> None:
        self.assertEqual(count_tokens(""), 0)
        self.assertGreater(count_tokens("안녕하세요"), 0)
        self.assertGreater(count_tokens("Hello world"), 0)

    def test_chunk_episode_returns_empty_for_empty_input(self) -> None:
        self.assertEqual(chunk_episode(""), [])
        self.assertEqual(chunk_episode("***\n***"), [])

    def test_scene_delimiters_create_scene_breaks(self) -> None:
        content = "첫 장면입니다.\n\n***\n\n둘째 장면입니다."
        chunks = chunk_episode(content, max_tokens=100, min_tokens=10, overlap_tokens=10)

        self.assertEqual(len(chunks), 2)
        self.assertEqual([chunk["chunk_index"] for chunk in chunks], [0, 1])
        self.assertTrue(chunks[0]["is_scene_break"])
        self.assertTrue(chunks[1]["is_scene_break"])

    def test_small_internal_chunk_is_merged_into_previous_chunk(self) -> None:
        paragraph1 = "alpha " * 180
        paragraph2 = "beta " * 180
        paragraph3 = "tiny " * 12
        content = f"{paragraph1}\n\n{paragraph2}\n\n{paragraph3}"

        chunks = chunk_episode(content, max_tokens=200, min_tokens=50, overlap_tokens=20)

        self.assertEqual(len(chunks), 2)
        self.assertTrue(chunks[0]["is_scene_break"])
        self.assertFalse(chunks[1]["is_scene_break"])
        self.assertIn("tiny", chunks[1]["content"])
        self.assertGreaterEqual(chunks[1]["token_count"], 50)

    def test_overlap_is_added_only_to_non_scene_break_chunks(self) -> None:
        paragraph1 = "alpha " * 150
        paragraph2 = "beta " * 150
        content = f"{paragraph1}\n\n{paragraph2}"

        chunks = chunk_episode(content, max_tokens=220, min_tokens=30, overlap_tokens=15)

        self.assertEqual(len(chunks), 2)
        self.assertTrue(chunks[0]["is_scene_break"])
        self.assertFalse(chunks[1]["is_scene_break"])
        self.assertIn("alpha", chunks[1]["content"])
        self.assertIn("beta", chunks[1]["content"])

    def test_fixture_episodes_chunk_with_expected_bounds(self) -> None:
        validated_fixture_count = 0

        for work_name in ("dummy-work-1", "dummy-work-2", "dummy-work-3"):
            episodes = self._load_episodes(work_name)
            if not episodes:
                continue

            non_empty_episodes = [episode for episode in episodes if episode.get("content", "").strip()]
            if not non_empty_episodes:
                continue

            for episode in non_empty_episodes[:2]:
                chunks = chunk_episode(episode["content"])
                self.assertGreater(len(chunks), 0)
                self.assertEqual(
                    [chunk["chunk_index"] for chunk in chunks],
                    list(range(len(chunks))),
                )

                for chunk in chunks:
                    self.assertGreater(chunk["token_count"], 0)
                    self.assertLessEqual(chunk["token_count"], 950)
                    if not chunk["is_scene_break"]:
                        self.assertGreaterEqual(chunk["token_count"], 100)
                validated_fixture_count += 1

        self.assertGreater(validated_fixture_count, 0)

    def _load_episodes(self, work_name: str) -> list[dict[str, object]]:
        fixture_path = AI_ROOT / "tests" / "fixtures" / work_name / "episodes.json"
        try:
            return json.loads(fixture_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []


if __name__ == "__main__":
    unittest.main()
