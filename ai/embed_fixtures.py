from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

AI_ROOT = Path(__file__).resolve().parent
load_dotenv(AI_ROOT / ".env")

from chunker import chunk_episode, count_tokens  # noqa: E402
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
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=800,
        help="Maximum token size per chunk before re-splitting.",
    )
    parser.add_argument(
        "--min-tokens",
        type=int,
        default=100,
        help="Minimum token size for non-scene-start chunks before merge.",
    )
    parser.add_argument(
        "--overlap-tokens",
        type=int,
        default=50,
        help="Overlap token count added between chunks inside the same scene.",
    )
    args = parser.parse_args()

    fixture_root = AI_ROOT / "tests" / "fixtures"
    work_dirs = _resolve_work_dirs(fixture_root, args.works)
    if not work_dirs:
        print("No matching fixture works found.", file=sys.stderr)
        return 1

    overall_episode_count = 0
    overall_chunk_count = 0

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

        episode_chunk_payloads: list[dict[str, Any]] = []
        for episode in valid_episodes:
            payload = _build_episode_chunk_payload(
                episode,
                max_tokens=args.max_tokens,
                min_tokens=args.min_tokens,
                overlap_tokens=args.overlap_tokens,
            )
            if payload is None:
                return 1
            episode_chunk_payloads.append(payload)

        if args.dry_run:
            for payload in episode_chunk_payloads:
                print(
                    "  - episode "
                    f"{payload['episode_number']}: "
                    f"title='{payload['title']}', "
                    f"chars={payload['char_count']}, "
                    f"episode_tokens={payload['episode_token_count']}, "
                    f"chunks={payload['chunk_count']}, "
                    f"max_chunk_tokens={payload['max_chunk_tokens']}"
                )
            overall_episode_count += len(valid_episodes)
            overall_chunk_count += sum(payload["chunk_count"] for payload in episode_chunk_payloads)
            continue

        for payload in episode_chunk_payloads:
            vectors = embed_batch(payload["chunk_texts"])
            overall_episode_count += 1
            overall_chunk_count += len(vectors)
            print(
                "  - episode "
                f"{payload['episode_number']}: "
                f"title='{payload['title']}', "
                f"episode_tokens={payload['episode_token_count']}, "
                f"chunks={payload['chunk_count']}, "
                f"embedded_chunks={len(vectors)}, "
                f"max_chunk_tokens={payload['max_chunk_tokens']}"
            )

            if any(len(vector) != EMBEDDING_DIMENSION for vector in vectors):
                print(
                    "    ! unexpected embedding dimension detected.",
                    file=sys.stderr,
                )
                return 1

    if args.dry_run:
        print(
            "Dry run complete. "
            f"Episodes ready for embedding: {overall_episode_count}, "
            f"chunks ready for embedding: {overall_chunk_count}"
        )
    else:
        print(
            "Embedding complete. "
            f"Embedded episodes: {overall_episode_count}, "
            f"embedded chunks: {overall_chunk_count}"
        )
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


def _build_episode_chunk_payload(
    episode: dict[str, object],
    *,
    max_tokens: int,
    min_tokens: int,
    overlap_tokens: int,
) -> dict[str, Any] | None:
    content = str(episode.get("content", ""))
    chunks = chunk_episode(
        content,
        max_tokens=max_tokens,
        min_tokens=min_tokens,
        overlap_tokens=overlap_tokens,
    )

    if not chunks:
        print(
            f"Failed to build chunks for episode {episode.get('episode_number')}.",
            file=sys.stderr,
        )
        return None

    chunk_texts = [str(chunk["content"]) for chunk in chunks]
    return {
        "episode_number": episode.get("episode_number"),
        "title": str(episode.get("title", "")).strip(),
        "char_count": len(content),
        "episode_token_count": count_tokens(content),
        "chunk_count": len(chunks),
        "max_chunk_tokens": max(int(chunk["token_count"]) for chunk in chunks),
        "chunk_texts": chunk_texts,
    }


if __name__ == "__main__":
    raise SystemExit(main())
