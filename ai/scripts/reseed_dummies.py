"""현재 DB 스키마(character + character_note 분리)로 dummy-work-{1,2,3} fixture 재삽입.

사용:
    python scripts/reseed_dummies.py --writer-id <UUID>

기존 seed.sql이 구버전 character 스키마(appearance/mbti/personality/content 컬럼)를
사용해서 깨지는 문제를 우회한다.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import pathlib
import uuid

import asyncpg

FIXTURES_DIR = pathlib.Path(__file__).resolve().parent.parent / "tests" / "fixtures"

WORK_IDS = {
    "dummy-work-1": "bb5e7be7-e7b0-4c43-b325-f19ab3ce5e13",
    "dummy-work-2": "7ab0624e-63bd-408c-b16f-28d39d3e2fdc",
    "dummy-work-3": "919037e5-ca18-438f-8dd3-27bf5cc31b82",
}


def meta_to_description(meta: dict) -> str:
    parts = []
    for key in ("era", "genre", "tone", "style_memo"):
        v = meta.get(key)
        if v is None:
            continue
        if isinstance(v, list):
            v = ", ".join(v)
        parts.append(f"{key}: {v}")
    return "\n".join(parts)


async def reseed(writer_id: str, db_url: str) -> None:
    conn = await asyncpg.connect(db_url)
    try:
        for sort_order, (folder, work_id) in enumerate(WORK_IDS.items(), start=1):
            base = FIXTURES_DIR / folder
            meta = json.loads((base / "meta.json").read_text(encoding="utf-8"))
            characters = json.loads((base / "characters.json").read_text(encoding="utf-8"))
            worldnotes = json.loads((base / "worldnotes.json").read_text(encoding="utf-8"))
            foreshadows = json.loads((base / "foreshadows.json").read_text(encoding="utf-8"))
            episodes = json.loads((base / "episodes.json").read_text(encoding="utf-8"))

            print(f"[{folder}] inserting work '{meta['title']}'")

            # 0. cleanup existing fixture data for this work_id
            await conn.execute("DELETE FROM work WHERE id=$1", uuid.UUID(work_id))

            # 1. work
            await conn.execute(
                "INSERT INTO work (id, writer_id, title, author_name, description, status, sort_order) "
                "VALUES ($1, $2, $3, $4, $5, 'draft', $6)",
                uuid.UUID(work_id),
                uuid.UUID(writer_id),
                meta["title"],
                "Fixture Writer",
                meta_to_description(meta),
                sort_order,
            )

            # 2. characters + character_note
            for ch in characters:
                char_id = uuid.uuid4()
                await conn.execute(
                    "INSERT INTO character (id, work_id, writer_id, name, gender, age, sort_order) "
                    "VALUES ($1, $2, $3, $4, $5, $6, $7)",
                    char_id,
                    uuid.UUID(work_id),
                    uuid.UUID(writer_id),
                    ch["name"],
                    ch.get("gender") or "기타",
                    str(ch.get("age") or ""),
                    ch.get("sort_order", 0),
                )
                note_specs = [
                    ("appearance", "외형", ch.get("appearance")),
                    ("mbti", "MBTI", ch.get("mbti")),
                    ("personality", "성격", ch.get("personality")),
                    ("detail", "상세", ch.get("content")),
                ]
                note_order = 0
                for kind, title, content in note_specs:
                    if not content:
                        continue
                    await conn.execute(
                        "INSERT INTO character_note "
                        "(id, character_id, writer_id, kind, title, content, sort_order, created_at, updated_at) "
                        "VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())",
                        uuid.uuid4(),
                        char_id,
                        uuid.UUID(writer_id),
                        kind,
                        title,
                        str(content),
                        note_order,
                    )
                    note_order += 1

            # 3. world_notes (two-pass: 1st pass inserts, 2nd pass links parent_id)
            name_to_id: dict[str, uuid.UUID] = {}
            for wn in worldnotes:
                wn_id = uuid.uuid4()
                name_to_id[wn["name"]] = wn_id
                await conn.execute(
                    "INSERT INTO world_note "
                    "(id, work_id, writer_id, name, content, sort_order) "
                    "VALUES ($1, $2, $3, $4, $5, $6)",
                    wn_id,
                    uuid.UUID(work_id),
                    uuid.UUID(writer_id),
                    wn["name"],
                    wn.get("content") or "",
                    wn.get("sort_order", 0),
                )
            # parent linking
            for wn in worldnotes:
                parent_name = wn.get("parent_name")
                if not parent_name:
                    continue
                parent_id = name_to_id.get(parent_name)
                if parent_id is None:
                    continue
                await conn.execute(
                    "UPDATE world_note SET parent_id=$1 WHERE id=$2",
                    parent_id,
                    name_to_id[wn["name"]],
                )

            # 4. foreshadows
            for fs in foreshadows:
                await conn.execute(
                    "INSERT INTO foreshadow "
                    "(id, work_id, writer_id, title, status, importance, content, sort_order) "
                    "VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                    uuid.uuid4(),
                    uuid.UUID(work_id),
                    uuid.UUID(writer_id),
                    fs.get("title") or "제목 없음",
                    fs.get("status") or "unplanted",
                    fs.get("importance") or "medium",
                    fs.get("content") or "",
                    fs.get("sort_order", 0),
                )

            # 5. episodes
            for ep in episodes:
                content = ep.get("content") or ""
                await conn.execute(
                    "INSERT INTO episode "
                    "(id, work_id, writer_id, title, status, content, word_count, sort_order) "
                    "VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7)",
                    uuid.uuid4(),
                    uuid.UUID(work_id),
                    uuid.UUID(writer_id),
                    ep.get("title") or f"{ep.get('episode_number', 1)}화",
                    content,
                    len(content),
                    ep.get("episode_number", 1),
                )

            print(
                f"  chars={len(characters)} world_notes={len(worldnotes)} "
                f"foreshadows={len(foreshadows)} episodes={len(episodes)}"
            )
        print("DONE")
    finally:
        await conn.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--writer-id", required=True)
    ap.add_argument(
        "--db-url",
        default="postgresql://storyzip:storyzip_dev@localhost:5432/storyzip",
    )
    args = ap.parse_args()
    asyncio.run(reseed(args.writer_id, args.db_url))


if __name__ == "__main__":
    main()
