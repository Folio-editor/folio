from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

AI_ROOT = Path(__file__).resolve().parent
load_dotenv(AI_ROOT / ".env")

from embedder import EMBEDDING_DIMENSION, embed_batch  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Embed Folio dummy fixture episodes with OpenAI embeddings."
    )
    parser.add_argument(
        "--work",
        action="append",
        dest="works",
        help="Target one or more works, for example: --work dummy-work-1",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit embedded episodes per work.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate fixture files and show what would be embedded without calling OpenAI.",
    )
    args = parser.parse_args()

    fixture_root = AI_ROOT / "tests" / "fixtures"
    work_dirs = _resolve_work_dirs(fixture_root, args.works)
    if not work_dirs:
        print("No matching fixture works found.", file=sys.stderr)
        return 1

    overall_episode_count = 0

    for work_dir in work_dirs:
        episodes = _load_episodes(work_dir / "episodes.json")
        if episodes is None:
            return 1

        valid_episodes = [
            episode
            for episode in episodes
            if isinstance(episode, dict) and str(episode.get("content", "")).strip()
        ]

        if args.limit is not None:
            valid_episodes = valid_episodes[: args.limit]

        print(f"[{work_dir.name}] episodes with content: {len(valid_episodes)}")
        if not valid_episodes:
            continue

        texts = [str(episode["content"]) for episode in valid_episodes]

        if args.dry_run:
            for episode in valid_episodes:
                title = str(episode.get("title", "")).strip()
                print(
                    f"  - episode {episode.get('episode_number')}: "
                    f"title='{title}', chars={len(str(episode['content']))}"
                )
            overall_episode_count += len(valid_episodes)
            continue

        vectors = embed_batch(texts)
        overall_episode_count += len(vectors)

        for episode, vector in zip(valid_episodes, vectors, strict=True):
            title = str(episode.get("title", "")).strip()
            print(
                f"  - episode {episode.get('episode_number')}: "
                f"title='{title}', embedding_dim={len(vector)}"
            )

            if len(vector) != EMBEDDING_DIMENSION:
                print(
                    f"    ! unexpected embedding dimension: {len(vector)}",
                    file=sys.stderr,
                )
                return 1

    if args.dry_run:
        print(f"Dry run complete. Episodes ready for embedding: {overall_episode_count}")
    else:
        print(f"Embedding complete. Embedded episodes: {overall_episode_count}")
    return 0


def _resolve_work_dirs(fixture_root: Path, selected_works: list[str] | None) -> list[Path]:
    all_work_dirs = sorted(
        path for path in fixture_root.iterdir() if path.is_dir() and path.name.startswith("dummy-work-")
    )
    if not selected_works:
        return all_work_dirs

    selected = set(selected_works)
    return [path for path in all_work_dirs if path.name in selected]


def _load_episodes(episodes_path: Path) -> list[dict[str, object]] | None:
    try:
        raw = json.loads(episodes_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"Invalid JSON in {episodes_path}: {exc}", file=sys.stderr)
        return None

    if not isinstance(raw, list):
        print(f"Expected a JSON list in {episodes_path}.", file=sys.stderr)
        return None

    return raw


if __name__ == "__main__":
    raise SystemExit(main())
