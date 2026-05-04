// ============================================================
// 설정집(기획 자료) 본문 빌더
// ============================================================
// 섹션 순서:
//   1. 기획 (Plan + PlanNote)
//   2. 인물 (Character + CharacterCustomField + CharacterNote)
//   3. 플롯 (Plot 트리)
//   4. 복선 (Foreshadow + ForeshadowLink — 연결된 회차/플롯 제목)
//   5. 세계관 (WorldNote 트리)
//   6. 아이디어 (IdeaArchive — tag 그룹화)
// ============================================================

import { parseTipTapContent } from '../tiptap/walker';
import type {
  Block,
  HeadingBlock,
  ParagraphBlock,
  PageBreakBlock,
  KeyValueTableBlock,
} from '../tiptap/blocks';
import type {
  CharacterCustomFieldSnapshot,
  CharacterNoteSnapshot,
  CharacterSnapshot,
  EpisodeSnapshot,
  ForeshadowLinkSnapshot,
  ForeshadowSnapshot,
  IdeaArchiveSnapshot,
  PlanNoteSnapshot,
  PlotEpisodeLinkSnapshot,
  PlotSnapshot,
  WorkSnapshot,
  WorldNoteSnapshot,
} from '../../types/export';

export interface SettingsBundleInput {
  /** 작품 메타. 장르/분위기는 work 직속 컬럼이라 plan 섹션에서도 work 를 참조한다. */
  work?: WorkSnapshot;
  // (구) plan?: PlanSnapshot 필드는 ERD 정리 2단계로 폐기됨. plan 섹션은 work + planNotes 만 사용.
  planNotes?: PlanNoteSnapshot[];
  characters?: CharacterSnapshot[];
  characterNotes?: CharacterNoteSnapshot[];
  characterCustomFields?: CharacterCustomFieldSnapshot[];
  plots?: PlotSnapshot[];
  plotEpisodeLinks?: PlotEpisodeLinkSnapshot[];
  worldNotes?: WorldNoteSnapshot[];
  foreshadows?: ForeshadowSnapshot[];
  foreshadowLinks?: ForeshadowLinkSnapshot[];
  ideaArchives?: IdeaArchiveSnapshot[];
  /** 복선/플롯 링크 라벨 표기에 사용 — title 조회용 */
  episodes?: EpisodeSnapshot[];
}

export interface SettingsBundleOptions {
  includeAuthorNote: boolean;
}

const PAGE_BREAK: PageBreakBlock = { kind: 'pageBreak' };
const SECTION_HEADER = (text: string): HeadingBlock => ({
  kind: 'heading',
  level: 1,
  inlines: [{ kind: 'run', text, marks: {} }],
});

export function buildSettingsBundle(
  input: SettingsBundleInput,
  options: SettingsBundleOptions,
): Block[] {
  const out: Block[] = [];
  let firstSection = true;
  const pushSection = (header: string, body: Block[]) => {
    if (body.length === 0) return;
    if (!firstSection) out.push(PAGE_BREAK);
    firstSection = false;
    out.push(SECTION_HEADER(header));
    out.push(...body);
  };

  pushSection('기획', buildPlanSection(input.work, input.planNotes, options));
  pushSection(
    '인물',
    buildCharacterSection(
      input.characters,
      input.characterNotes,
      input.characterCustomFields,
      options,
    ),
  );
  pushSection(
    '플롯',
    buildPlotSection(input.plots, input.plotEpisodeLinks, input.episodes, options),
  );
  pushSection(
    '복선',
    buildForeshadowSection(
      input.foreshadows,
      input.foreshadowLinks,
      input.episodes,
      input.plots,
      options,
    ),
  );
  pushSection('세계관', buildWorldNoteSection(input.worldNotes, options));
  pushSection('아이디어', buildIdeaSection(input.ideaArchives, options));

  return out;
}

function buildPlanSection(
  work: WorkSnapshot | undefined,
  notes: PlanNoteSnapshot[] | undefined,
  options: SettingsBundleOptions,
): Block[] {
  const out: Block[] = [];
  if (work) {
    // ERD 정리로 장르·분위기는 work 직속 컬럼이 됨. 슬로건/타겟 독자는 폐기.
    const rows: Array<{ key: string; value: string }> = [];
    if (work.genres && work.genres.length) {
      rows.push({ key: '장르', value: work.genres.join(', ') });
    }
    if (work.moods && work.moods.length) {
      rows.push({ key: '분위기', value: work.moods.join(', ') });
    }
    if (rows.length > 0) {
      out.push({ kind: 'keyValueTable', rows } satisfies KeyValueTableBlock);
    }
  }

  const sortedNotes = (notes ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  for (const note of sortedNotes) {
    out.push({
      kind: 'heading',
      level: 2,
      inlines: [{ kind: 'run', text: note.title?.trim() || '(제목 없음)', marks: {} }],
    } satisfies HeadingBlock);
    out.push(...parseTipTapContent(note.content, options));
  }
  return out;
}

function buildCharacterSection(
  characters: CharacterSnapshot[] | undefined,
  notes: CharacterNoteSnapshot[] | undefined,
  customFields: CharacterCustomFieldSnapshot[] | undefined,
  options: SettingsBundleOptions,
): Block[] {
  const list = (characters ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  if (list.length === 0) return [];

  const notesByChar = new Map<string, CharacterNoteSnapshot[]>();
  for (const n of notes ?? []) {
    const arr = notesByChar.get(n.character_id) ?? [];
    arr.push(n);
    notesByChar.set(n.character_id, arr);
  }
  const fieldsByChar = new Map<string, CharacterCustomFieldSnapshot[]>();
  for (const f of customFields ?? []) {
    const arr = fieldsByChar.get(f.character_id) ?? [];
    arr.push(f);
    fieldsByChar.set(f.character_id, arr);
  }

  const out: Block[] = [];
  for (const char of list) {
    out.push({
      kind: 'heading',
      level: 2,
      inlines: [{ kind: 'run', text: char.name, marks: {} }],
    } satisfies HeadingBlock);

    const rows: Array<{ key: string; value: string }> = [];
    if (char.gender) rows.push({ key: '성별', value: char.gender });
    if (char.age) rows.push({ key: '나이', value: char.age });
    const fields = (fieldsByChar.get(char.id) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    for (const f of fields) {
      if (f.field_value) rows.push({ key: f.field_name, value: f.field_value });
    }
    if (rows.length > 0) {
      out.push({ kind: 'keyValueTable', rows } satisfies KeyValueTableBlock);
    }

    const charNotes = (notesByChar.get(char.id) ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    for (const note of charNotes) {
      out.push({
        kind: 'heading',
        level: 3,
        inlines: [{ kind: 'run', text: note.title?.trim() || note.kind || '(제목 없음)', marks: {} }],
      } satisfies HeadingBlock);
      out.push(...parseTipTapContent(note.content, options));
    }
  }
  return out;
}

function buildPlotSection(
  plots: PlotSnapshot[] | undefined,
  plotEpisodeLinks: PlotEpisodeLinkSnapshot[] | undefined,
  episodes: EpisodeSnapshot[] | undefined,
  options: SettingsBundleOptions,
): Block[] {
  const list = plots ?? [];
  if (list.length === 0) return [];

  const episodeTitle = new Map<string, string>();
  for (const ep of episodes ?? []) {
    episodeTitle.set(ep.id, ep.title?.trim() || '(제목 없음)');
  }
  const linkedEpisodeByPlot = new Map<string, string>();
  for (const link of plotEpisodeLinks ?? []) {
    const t = episodeTitle.get(link.episode_id);
    if (t) linkedEpisodeByPlot.set(link.plot_id, t);
  }

  const byParent = new Map<string | null, PlotSnapshot[]>();
  for (const p of list) {
    const key = p.parent_id ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(p);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.sort_order - b.sort_order);
  }

  const out: Block[] = [];
  function visit(parentId: string | null, depth: number) {
    const children = byParent.get(parentId) ?? [];
    for (const p of children) {
      const level = Math.min(2 + depth, 6) as 1 | 2 | 3 | 4 | 5 | 6;
      out.push({
        kind: 'heading',
        level,
        inlines: [{ kind: 'run', text: p.title?.trim() || '(제목 없음)', marks: {} }],
      } satisfies HeadingBlock);

      const meta: string[] = [];
      if (p.status) meta.push(`상태: ${p.status}`);
      const linked = linkedEpisodeByPlot.get(p.id);
      if (linked) meta.push(`연결 회차: ${linked}`);
      if (meta.length > 0) {
        out.push({
          kind: 'paragraph',
          inlines: [{ kind: 'run', text: meta.join(' · '), marks: { italic: true } }],
        } satisfies ParagraphBlock);
      }

      out.push(...parseTipTapContent(p.content, options));
      visit(p.id, depth + 1);
    }
  }
  visit(null, 0);
  return out;
}

function buildForeshadowSection(
  foreshadows: ForeshadowSnapshot[] | undefined,
  links: ForeshadowLinkSnapshot[] | undefined,
  episodes: EpisodeSnapshot[] | undefined,
  plots: PlotSnapshot[] | undefined,
  options: SettingsBundleOptions,
): Block[] {
  const list = (foreshadows ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  if (list.length === 0) return [];

  const episodeTitle = new Map<string, string>();
  for (const ep of episodes ?? []) episodeTitle.set(ep.id, ep.title?.trim() || '(제목 없음)');
  const plotTitle = new Map<string, string>();
  for (const pl of plots ?? []) plotTitle.set(pl.id, pl.title?.trim() || '(제목 없음)');

  const linksByForeshadow = new Map<string, ForeshadowLinkSnapshot[]>();
  for (const lk of links ?? []) {
    const arr = linksByForeshadow.get(lk.foreshadow_id) ?? [];
    arr.push(lk);
    linksByForeshadow.set(lk.foreshadow_id, arr);
  }

  const out: Block[] = [];
  for (const f of list) {
    out.push({
      kind: 'heading',
      level: 2,
      inlines: [{ kind: 'run', text: f.title, marks: {} }],
    } satisfies HeadingBlock);

    const rows: Array<{ key: string; value: string }> = [];
    if (f.status) rows.push({ key: '상태', value: f.status });
    if (f.importance) rows.push({ key: '중요도', value: f.importance });
    const linkRows: string[] = [];
    for (const lk of linksByForeshadow.get(f.id) ?? []) {
      const target = lk.episode_id
        ? episodeTitle.get(lk.episode_id)
        : lk.plot_id
        ? plotTitle.get(lk.plot_id)
        : null;
      if (target) {
        const memo = lk.context_memo ? ` — ${lk.context_memo}` : '';
        linkRows.push(`${linkLabel(lk.link_type)}: ${target}${memo}`);
      }
    }
    if (linkRows.length > 0) rows.push({ key: '연결', value: linkRows.join('\n') });
    if (rows.length > 0) {
      out.push({ kind: 'keyValueTable', rows } satisfies KeyValueTableBlock);
    }

    out.push(...parseTipTapContent(f.content, options));
  }
  return out;
}

function linkLabel(type: string): string {
  switch (type) {
    case 'plant': return '심기';
    case 'resolve': return '강화';
    case 'final_resolve': return '회수';
    default: return type;
  }
}

function buildWorldNoteSection(
  worldNotes: WorldNoteSnapshot[] | undefined,
  options: SettingsBundleOptions,
): Block[] {
  const list = worldNotes ?? [];
  if (list.length === 0) return [];

  const byParent = new Map<string | null, WorldNoteSnapshot[]>();
  for (const w of list) {
    const key = w.parent_id ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(w);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.sort_order - b.sort_order);
  }

  const out: Block[] = [];
  function visit(parentId: string | null, depth: number) {
    const children = byParent.get(parentId) ?? [];
    for (const w of children) {
      const level = Math.min(2 + depth, 6) as 1 | 2 | 3 | 4 | 5 | 6;
      out.push({
        kind: 'heading',
        level,
        inlines: [{ kind: 'run', text: w.name?.trim() || '(제목 없음)', marks: {} }],
      } satisfies HeadingBlock);
      out.push(...parseTipTapContent(w.content, options));
      visit(w.id, depth + 1);
    }
  }
  visit(null, 0);
  return out;
}

function buildIdeaSection(
  ideas: IdeaArchiveSnapshot[] | undefined,
  options: SettingsBundleOptions,
): Block[] {
  const list = (ideas ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  if (list.length === 0) return [];

  const byTag = new Map<string, IdeaArchiveSnapshot[]>();
  for (const idea of list) {
    const key = idea.tag ?? '기타';
    const arr = byTag.get(key) ?? [];
    arr.push(idea);
    byTag.set(key, arr);
  }

  const out: Block[] = [];
  for (const [tag, arr] of byTag) {
    out.push({
      kind: 'heading',
      level: 2,
      inlines: [{ kind: 'run', text: tag, marks: {} }],
    } satisfies HeadingBlock);
    for (const idea of arr) {
      out.push(...parseTipTapContent(idea.content, options));
    }
  }
  return out;
}
