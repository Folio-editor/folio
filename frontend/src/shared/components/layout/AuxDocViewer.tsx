import { useMemo } from 'react';
import { useQuery } from '@powersync/react';
import { FileText, Plus } from 'lucide-react';
import type { AuxDocType, AuxPanelItem } from '../../types/workspace';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDecryptedCharacterList } from '../../hooks/useDecryptedCharacter';
import { useDecryptedCharacterNoteList } from '../../hooks/useDecryptedCharacterNote';
import { useDecryptedEpisodeList } from '../../hooks/useDecryptedEpisode';
import { useDecryptedPlanNoteList } from '../../hooks/useDecryptedPlanNote';
import { useDecryptedWorldNoteList } from '../../hooks/useDecryptedWorldNote';
import { useDecryptedPlotList } from '../../hooks/useDecryptedPlot';
import { useDecryptedForeshadowList } from '../../hooks/useDecryptedForeshadow';
import { useWriterId } from '../../hooks/useWriterId';
import { WorldNoteInlineEditor } from '../../features/world-note/WorldNoteInlineEditor';
import { GenderIcon } from '../../features/character/CharacterOverview';

interface AuxDocViewerProps {
  docType: AuxDocType;
  docId: string;
  /** plot '__all__' 등 work-specific 가상 docId 처리에 필요 */
  workId?: string;
  /** false면 본문 편집 불가 (lockedReadOnly 등). 기본 true. */
  editable?: boolean;
  onAddPanel: (item: Omit<AuxPanelItem, 'id' | 'collapsed'>) => void;
}

interface DocRow {
  title: string;
  content: string | null;
  parent_id?: string | null;
  gender?: string;
  age?: string;
}

interface ChildRow {
  id: string;
  title: string;
  content: string | null;
}

interface WorldNoteDescendantRow {
  id: string;
  name: string;
  content: string | null;
  parent_id: string | null;
  sort_order: number;
  depth: number;
}

interface RawWorldNoteDescendantRow {
  id: string;
  work_id: string;
  writer_id: string;
  parent_id: string | null;
  name: string | null;
  content: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  encrypted_dek: string | null;
  depth: number;
}

// world_note 외 docType만 자식 링크 — world_note는 통합 뷰에서 직접 재귀 렌더.
// PR4: 자식 fetch도 docType별 별도 훅에서 직접 수행하므로 여기선 메타만 유지.
const CHILD_QUERIES: Partial<Record<AuxDocType, { docType: AuxDocType }>> = {
  plot: { docType: 'plot' },
};

export function AuxDocViewer({
  docType,
  docId,
  workId,
  editable = true,
  onAddPanel,
}: AuxDocViewerProps) {
  // world_note: 자기 자신을 root로 한 트리
  if (docType === 'world_note') {
    return <WorldNoteAuxView docId={docId} editable={editable} />;
  }
  // character: 메인 CharacterOverview의 통합 뷰와 동일한 구조 (메타 + 본문 + 하위 문서)
  if (docType === 'character') {
    return <CharacterAuxView docId={docId} editable={editable} />;
  }
  // plot: '__all__' = 작품 전체 list, 막이면 통합 뷰, 회차면 단일 편집
  if (docType === 'plot') {
    if (docId === '__all__' && workId) {
      return <PlotAllAuxView workId={workId} editable={editable} />;
    }
    return <PlotAuxView docId={docId} editable={editable} />;
  }
  return (
    <NonWorldNoteAuxView
      docType={docType}
      docId={docId}
      editable={editable}
      onAddPanel={onAddPanel}
    />
  );
}

/* ── 세계관 보조 통합 뷰 — 자기 자신을 root로 한 무한 깊이 트리 (메인 Hierarchy 축소판) ── */

interface WorldNoteAuxNode {
  id: string;
  name: string;
  content: string | null;
  parent_id: string | null;
  sort_order: number;
  children: WorldNoteAuxNode[];
}

function WorldNoteAuxView({ docId, editable }: { docId: string; editable: boolean }) {
  const { data: rawRows = [] } = useQuery<RawWorldNoteDescendantRow>(
    `WITH RECURSIVE descendants AS (
       SELECT id, work_id, writer_id, name, content, parent_id, sort_order, created_at, updated_at, 0 AS depth
       FROM world_note WHERE id = ?
       UNION ALL
       SELECT w.id, w.work_id, w.writer_id, w.name, w.content, w.parent_id, w.sort_order, w.created_at, w.updated_at, d.depth + 1
       FROM world_note w
       JOIN descendants d ON w.parent_id = d.id
     )
     SELECT d.id, d.work_id, d.writer_id, d.name, d.content, d.parent_id,
            d.sort_order, d.created_at, d.updated_at, d.depth,
            wk.encrypted_dek AS encrypted_dek
     FROM descendants d
     LEFT JOIN work wk ON wk.id = d.work_id
     ORDER BY d.depth ASC, d.sort_order ASC, d.created_at ASC`,
    [docId],
  );
  const { data: decryptedDescendants } = useDecryptedWorldNoteList(rawRows);
  const rows: WorldNoteDescendantRow[] = useMemo(
    () =>
      decryptedDescendants.map((d, i) => ({
        id: d.id,
        name: d.name,
        content: d.content,
        parent_id: d.parent_id,
        sort_order: d.sort_order ?? 0,
        depth: rawRows[i]?.depth ?? 0,
      })),
    [decryptedDescendants, rawRows],
  );

  const tree = useMemo<WorldNoteAuxNode | null>(() => {
    if (rows.length === 0) return null;
    const map = new Map<string, WorldNoteAuxNode>();
    for (const r of rows) {
      map.set(r.id, {
        id: r.id,
        name: r.name,
        content: r.content,
        parent_id: r.parent_id,
        sort_order: r.sort_order,
        children: [],
      });
    }
    let root: WorldNoteAuxNode | null = null;
    for (const node of map.values()) {
      if (node.id === docId) {
        root = node;
      } else if (node.parent_id && map.has(node.parent_id)) {
        map.get(node.parent_id)!.children.push(node);
      }
    }
    function sortRecursive(n: WorldNoteAuxNode) {
      n.children.sort((a, b) => a.sort_order - b.sort_order);
      n.children.forEach(sortRecursive);
    }
    if (root) sortRecursive(root);
    return root;
  }, [rows, docId]);

  if (!tree) {
    return (
      <div className="flex items-center justify-center px-3 py-6 text-xs text-muted-foreground">
        문서를 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col px-3 py-2">
      <WorldNoteAuxSection node={tree} depth={0} editable={editable} />
    </div>
  );
}

function WorldNoteAuxSection({
  node,
  depth,
  editable,
}: {
  node: WorldNoteAuxNode;
  depth: number;
  editable: boolean;
}) {
  const { updateWorldNoteContent } = useLocalWrite();
  const isRoot = depth === 0;
  const headingClass =
    depth === 1 ? 'text-xs font-bold' : 'text-[11px] font-semibold';
  return (
    <section
      style={{ paddingLeft: depth > 0 ? Math.min(depth, 4) * 8 : undefined }}
      className={depth > 0 ? 'mt-2' : undefined}
    >
      {/* root는 스테이지 카드 헤더에서 이미 제목을 제공하므로 본문 제목 미노출 */}
      {!isRoot ? (
        <div className="mb-1 border-l-2 border-l-border/60 pl-2">
          <h3 className={`${headingClass} text-foreground`}>
            {node.name?.trim() || '(이름 없음)'}
          </h3>
          <WorldNoteInlineEditor
            noteId={node.id}
            initialContent={node.content}
            placeholder={editable ? '내용을 입력하세요…' : '내용 없음'}
            onUpdate={(json) => void updateWorldNoteContent(node.id, json)}
            editable={editable}
            size="xs"
          />
        </div>
      ) : (
        <WorldNoteInlineEditor
          noteId={node.id}
          initialContent={node.content}
          placeholder={editable ? '내용을 입력하세요…' : '내용 없음'}
          onUpdate={(json) => void updateWorldNoteContent(node.id, json)}
          editable={editable}
          size="xs"
        />
      )}
      {node.children.length > 0 && (
        <div className="mt-1.5">
          {node.children.map((child) => (
            <WorldNoteAuxSection
              key={child.id}
              node={child}
              depth={depth + 1}
              editable={editable}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ── 캐릭터 보조 통합 뷰 — 메인 CharacterOverview의 컴팩트 버전 ──
 * 메인 통합뷰와 동일한 구성:
 *   1) Hero — 프로필 이미지 + 이름/성별/나이 (모두 readonly 표시)
 *   2) 태그 칩 (readonly)
 *   3) intro 본문 (편집 가능)
 *   4) 하위 문서 카드 리스트 (편집 가능 + 추가 버튼)
 *
 * "로직상 문제 가능한 부분(이미지/이름/성별/나이/태그)은 readonly로" 사용자 결정.
 */

interface CharacterMetaRow {
  id: string;
  name: string;
  gender: string | null;
  age: string | null;
  profile_image_url: string | null;
  work_id: string;
}

interface RawCharacterMetaJoinRow {
  id: string;
  work_id: string;
  writer_id: string;
  name: string | null;
  gender: string | null;
  age: string | null;
  profile_image_url: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  encrypted_dek: string | null;
}

interface CharacterAuxNoteRow {
  id: string;
  kind: string;
  title: string;
  content: string | null;
  sort_order: number | null;
}

interface RawCharacterAuxNoteRow {
  id: string;
  character_id: string;
  writer_id: string;
  kind: string;
  title: string | null;
  content: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
  work_id: string;
  encrypted_dek: string | null;
}

interface CharacterAuxTagRow {
  world_note_id: string;
  name: string;
}

function nextSortOrder(rows: { sort_order: number | null }[]) {
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((row) => row.sort_order ?? 0)) + 1000;
}

function CharacterAuxView({ docId, editable }: { docId: string; editable: boolean }) {
  const { createCharacterNote, updateCharacterNoteContent } = useLocalWrite();

  const { data: rawMetaRows = [] } = useQuery<RawCharacterMetaJoinRow>(
    `SELECT c.id, c.work_id, c.writer_id, c.name, c.gender, c.age,
            c.profile_image_url, c.sort_order, c.created_at, c.updated_at,
            w.encrypted_dek AS encrypted_dek
     FROM character c
     LEFT JOIN work w ON w.id = c.work_id
     WHERE c.id = ? LIMIT 1`,
    [docId],
  );
  const { data: decryptedMeta } = useDecryptedCharacterList(rawMetaRows);
  const meta: CharacterMetaRow | undefined = useMemo(() => {
    const m = decryptedMeta[0];
    if (!m) return undefined;
    return {
      id: m.id,
      name: m.name,
      gender: m.gender,
      age: m.age,
      profile_image_url: m.profile_image_url,
      work_id: m.work_id,
    };
  }, [decryptedMeta]);
  const workId = meta?.work_id ?? null;

  const { data: rawNotes = [] } = useQuery<RawCharacterAuxNoteRow>(
    `SELECT cn.id, cn.character_id, cn.writer_id, cn.kind, cn.title, cn.content,
            cn.sort_order, cn.created_at, cn.updated_at,
            c.work_id AS work_id, w.encrypted_dek AS encrypted_dek
     FROM character_note cn
     JOIN character c ON c.id = cn.character_id
     LEFT JOIN work w ON w.id = c.work_id
     WHERE cn.character_id = ?
     ORDER BY cn.sort_order ASC, cn.created_at ASC`,
    [docId],
  );
  const { data: decryptedNotes } = useDecryptedCharacterNoteList(rawNotes);
  const notes: CharacterAuxNoteRow[] = useMemo(
    () =>
      decryptedNotes.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        content: n.content,
        sort_order: n.sort_order,
      })),
    [decryptedNotes],
  );

  const { data: tags = [] } = useQuery<CharacterAuxTagRow>(
    `SELECT ct.world_note_id, wn.name
     FROM character_tag ct
     JOIN world_note wn ON ct.world_note_id = wn.id
     WHERE ct.character_id = ?
     ORDER BY wn.name ASC`,
    [docId],
  );

  const introNote = useMemo(
    () => notes.find((n) => n.kind === 'intro') ?? null,
    [notes],
  );
  const visibleNotes = useMemo(
    () => notes.filter((n) => n.kind !== 'intro'),
    [notes],
  );

  if (!meta) {
    return (
      <div className="flex items-center justify-center px-3 py-6 text-xs text-muted-foreground">
        캐릭터를 찾을 수 없습니다.
      </div>
    );
  }

  const gender = meta.gender ?? '미설정';

  return (
    <div className="flex flex-col px-3 py-2">
      {/* Hero — 프로필 이미지 + 이름/성별/나이 (readonly) */}
      <div className="mb-3 flex gap-3">
        <div
          className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted"
          aria-label="프로필 이미지"
        >
          {meta.profile_image_url ? (
            <img
              src={meta.profile_image_url}
              alt={meta.name || ''}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-2xl font-bold text-muted-foreground/30">
              {(meta.name || '?').charAt(0)}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span
              title={`성별: ${gender}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center"
            >
              <GenderIcon gender={gender} size={14} />
            </span>
            <span className="truncate text-sm font-bold text-foreground">
              {meta.name?.trim() || '(이름 없음)'}
            </span>
            {meta.age && (
              <>
                <span className="select-none text-[10px] text-muted-foreground/40">/</span>
                <span className="text-[11px] text-muted-foreground">{meta.age}</span>
              </>
            )}
          </div>

          {/* 태그 — readonly 칩 */}
          <div className="flex flex-wrap gap-1">
            {tags.length === 0 ? (
              <span className="text-[10px] text-muted-foreground/40">태그 없음</span>
            ) : (
              tags.map((tag) => (
                <span
                  key={tag.world_note_id}
                  className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                >
                  {tag.name}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 본문 — intro character_note */}
      {introNote && (
        <div className="mb-2">
          <WorldNoteInlineEditor
            noteId={introNote.id}
            initialContent={introNote.content}
            placeholder={editable ? '캐릭터 소개와 핵심 설정을 입력하세요…' : '내용 없음'}
            onUpdate={(json) => void updateCharacterNoteContent(introNote.id, json)}
            editable={editable}
            size="xs"
          />
        </div>
      )}

      {/* 하위 문서 카드 */}
      <div className="border-t border-border/50 pt-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            하위 문서
          </p>
          {editable && workId && (
            <button
              type="button"
              onClick={() =>
                void createCharacterNote(workId, docId, '새 문서', nextSortOrder(notes))
              }
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Plus size={10} strokeWidth={1.75} />
              추가
            </button>
          )}
        </div>
        {visibleNotes.length > 0 ? (
          <div className="flex flex-col divide-y divide-border">
            {visibleNotes.map((note) => (
              <div key={note.id} className="py-2">
                <h3 className="mb-1 text-xs font-bold text-foreground">
                  {note.title?.trim() || '(제목 없음)'}
                </h3>
                <WorldNoteInlineEditor
                  noteId={note.id}
                  initialContent={note.content}
                  placeholder={editable ? '내용을 입력하세요…' : '내용 없음'}
                  onUpdate={(json) =>
                    void updateCharacterNoteContent(note.id, json)
                  }
                  editable={editable}
                  size="xs"
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="py-3 text-center text-xs text-muted-foreground">
            문서가 없습니다.
          </p>
        )}
      </div>
    </div>
  );
}

/* ── world_note 외 docType — 단일 문서 뷰 + 자식 링크 ── */

interface RawDocJoinRow {
  id: string;
  work_id: string;
  writer_id: string | null;
  title: string | null;
  content: string | null;
  status: string | null;
  importance: string | null;
  parent_id: string | null;
  gender: string | null;
  age: string | null;
  encrypted_dek: string | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

function useDecryptedDoc(
  docType: AuxDocType,
  docId: string,
): { doc: DocRow | undefined } {
  // 각 테이블별로 work + JOIN으로 raw row를 fetch한 뒤 docType에 맞는 복호화 훅에 위임.
  const isPlanNote = docType === 'plan_note';
  const isPlot = docType === 'plot';
  const isForeshadow = docType === 'foreshadow';
  const isCharacter = docType === 'character';
  const isEpisode = docType === 'episode';
  const isCharacterNote = docType === 'character_note';

  const { data: planRows = [] } = useQuery<RawDocJoinRow>(
    isPlanNote
      ? `SELECT pn.id, pn.work_id, pn.writer_id, pn.title, pn.content,
                NULL AS status, NULL AS importance, NULL AS parent_id,
                NULL AS gender, NULL AS age,
                pn.sort_order, pn.created_at, pn.updated_at,
                w.encrypted_dek AS encrypted_dek
         FROM plan_note pn LEFT JOIN work w ON w.id = pn.work_id
         WHERE pn.id = ? LIMIT 1`
      : 'SELECT 1 WHERE 0',
    isPlanNote ? [docId] : [],
  );
  const { data: plotRows = [] } = useQuery<RawDocJoinRow>(
    isPlot
      ? `SELECT p.id, p.work_id, p.writer_id, p.title, p.content,
                p.status, NULL AS importance, p.parent_id,
                NULL AS gender, NULL AS age,
                p.sort_order, p.created_at, p.updated_at,
                w.encrypted_dek AS encrypted_dek
         FROM plot p LEFT JOIN work w ON w.id = p.work_id
         WHERE p.id = ? LIMIT 1`
      : 'SELECT 1 WHERE 0',
    isPlot ? [docId] : [],
  );
  const { data: foreRows = [] } = useQuery<RawDocJoinRow>(
    isForeshadow
      ? `SELECT f.id, f.work_id, f.writer_id, f.title, f.content,
                f.status, f.importance, NULL AS parent_id,
                NULL AS gender, NULL AS age,
                f.sort_order, f.created_at, f.updated_at,
                w.encrypted_dek AS encrypted_dek
         FROM foreshadow f LEFT JOIN work w ON w.id = f.work_id
         WHERE f.id = ? LIMIT 1`
      : 'SELECT 1 WHERE 0',
    isForeshadow ? [docId] : [],
  );
  // character는 work_id 직접, character_note/episode는 별도 처리(여기선 평문 fall-through하지 않음).
  const { data: charRows = [] } = useQuery<RawDocJoinRow>(
    isCharacter
      ? `SELECT c.id, c.work_id, c.writer_id, c.name AS title, NULL AS content,
                NULL AS status, NULL AS importance, NULL AS parent_id,
                c.gender, c.age,
                c.sort_order, c.created_at, c.updated_at,
                w.encrypted_dek AS encrypted_dek
         FROM character c LEFT JOIN work w ON w.id = c.work_id
         WHERE c.id = ? LIMIT 1`
      : 'SELECT 1 WHERE 0',
    isCharacter ? [docId] : [],
  );
  // Phase 3 — episode 도 work.encrypted_dek 조인으로 복호화 가능하도록 수정.
  // 이전엔 NULL AS encrypted_dek + raw content 노출로 보조 뷰어에 ciphertext 표시.
  const { data: epRows = [] } = useQuery<RawDocJoinRow>(
    isEpisode
      ? `SELECT e.id, e.work_id, e.writer_id, e.title, e.content,
                e.status, NULL AS importance, e.parent_id,
                NULL AS gender, NULL AS age,
                e.sort_order, e.created_at, e.updated_at,
                w.encrypted_dek AS encrypted_dek
         FROM episode e LEFT JOIN work w ON w.id = e.work_id
         WHERE e.id = ? LIMIT 1`
      : 'SELECT 1 WHERE 0',
    isEpisode ? [docId] : [],
  );
  const { data: cnoteRows = [] } = useQuery<RawDocJoinRow>(
    isCharacterNote
      ? `SELECT cn.id, c.work_id AS work_id, cn.writer_id, cn.title, cn.content,
                NULL AS status, NULL AS importance, NULL AS parent_id,
                NULL AS gender, NULL AS age,
                cn.sort_order, cn.created_at, cn.updated_at,
                w.encrypted_dek AS encrypted_dek
         FROM character_note cn
         JOIN character c ON c.id = cn.character_id
         LEFT JOIN work w ON w.id = c.work_id
         WHERE cn.id = ? LIMIT 1`
      : 'SELECT 1 WHERE 0',
    isCharacterNote ? [docId] : [],
  );

  // 각 raw row를 해당 batch decrypt 훅으로 변환. 한 컴포넌트 안에서 여러 훅을 호출하지만,
  // 비활성 docType은 빈 배열을 받으므로 실제 작업은 하나만 수행된다.
  const { data: decPlan } = useDecryptedPlanNoteList(
    planRows.map((r) => ({
      id: r.id, work_id: r.work_id, writer_id: r.writer_id ?? '',
      title: r.title, content: r.content,
      sort_order: r.sort_order, created_at: r.created_at, updated_at: r.updated_at,
      encrypted_dek: r.encrypted_dek,
    })),
  );
  const { data: decPlot } = useDecryptedPlotList(
    plotRows.map((r) => ({
      id: r.id, work_id: r.work_id, writer_id: r.writer_id ?? '',
      parent_id: r.parent_id, title: r.title, status: r.status, content: r.content,
      sort_order: r.sort_order, created_at: r.created_at, updated_at: r.updated_at,
      encrypted_dek: r.encrypted_dek,
    })),
  );
  const { data: decFore } = useDecryptedForeshadowList(
    foreRows.map((r) => ({
      id: r.id, work_id: r.work_id, writer_id: r.writer_id ?? '',
      title: r.title, status: r.status, importance: r.importance, content: r.content,
      sort_order: r.sort_order, created_at: r.created_at, updated_at: r.updated_at,
      encrypted_dek: r.encrypted_dek,
    })),
  );
  const { data: decChar } = useDecryptedCharacterList(
    charRows.map((r) => ({
      id: r.id, work_id: r.work_id, writer_id: r.writer_id ?? '',
      name: r.title, gender: r.gender, age: r.age,
      profile_image_url: null,
      sort_order: r.sort_order, created_at: r.created_at, updated_at: r.updated_at,
      encrypted_dek: r.encrypted_dek,
    })),
  );
  const { data: decCNote } = useDecryptedCharacterNoteList(
    cnoteRows.map((r) => ({
      id: r.id, character_id: '',
      writer_id: r.writer_id ?? '',
      kind: '', title: r.title, content: r.content,
      sort_order: r.sort_order, created_at: r.created_at, updated_at: r.updated_at,
      work_id: r.work_id, encrypted_dek: r.encrypted_dek,
    })),
  );
  const { data: decEpisode } = useDecryptedEpisodeList(
    epRows.map((r) => ({
      id: r.id, work_id: r.work_id, title: r.title,
      status: r.status ?? '',
      word_count: 0,
      content: r.content,
      sort_order: r.sort_order,
      parent_id: r.parent_id,
      created_at: r.created_at, updated_at: r.updated_at,
      encrypted_dek: r.encrypted_dek,
    })),
  );

  return useMemo<{ doc: DocRow | undefined }>(() => {
    if (isPlanNote) {
      const p = decPlan[0];
      if (!p) return { doc: undefined };
      return { doc: { title: p.title, content: p.content } };
    }
    if (isPlot) {
      const p = decPlot[0];
      if (!p) return { doc: undefined };
      return { doc: { title: p.title, content: p.content } };
    }
    if (isForeshadow) {
      const f = decFore[0];
      if (!f) return { doc: undefined };
      return { doc: { title: f.title, content: f.content } };
    }
    if (isCharacter) {
      const c = decChar[0];
      if (!c) return { doc: undefined };
      return {
        doc: {
          title: c.name,
          content: null,
          gender: c.gender ?? undefined,
          age: c.age ?? undefined,
        },
      };
    }
    if (isCharacterNote) {
      const n = decCNote[0];
      if (!n) return { doc: undefined };
      return { doc: { title: n.title, content: n.content } };
    }
    if (isEpisode) {
      const e = decEpisode[0];
      if (!e) return { doc: undefined };
      return { doc: { title: e.title ?? '', content: e.content } };
    }
    return { doc: undefined };
  }, [
    isPlanNote, isPlot, isForeshadow, isCharacter, isCharacterNote, isEpisode,
    decPlan, decPlot, decFore, decChar, decCNote, decEpisode,
  ]);
}

function NonWorldNoteAuxView({
  docType,
  docId,
  editable,
  onAddPanel,
}: AuxDocViewerProps) {
  const { doc } = useDecryptedDoc(docType, docId);

  const childConfig = CHILD_QUERIES[docType];
  // PR4: plot 자식 회차의 title도 ciphertext일 수 있어 별도 복호화 필요.
  const isPlotChildren = childConfig && docType === 'plot';
  const { data: rawChildRows = [] } = useQuery<RawDocJoinRow>(
    isPlotChildren
      ? `SELECT p.id, p.work_id, p.writer_id, p.title, NULL AS content,
                p.status, NULL AS importance, p.parent_id,
                NULL AS gender, NULL AS age,
                p.sort_order, p.created_at, p.updated_at,
                w.encrypted_dek AS encrypted_dek
         FROM plot p LEFT JOIN work w ON w.id = p.work_id
         WHERE p.parent_id = ?
         ORDER BY p.sort_order ASC`
      : 'SELECT 1 WHERE 0',
    isPlotChildren ? [docId] : [],
  );
  const { data: decPlotChildren } = useDecryptedPlotList(
    rawChildRows.map((r) => ({
      id: r.id, work_id: r.work_id, writer_id: r.writer_id ?? '',
      parent_id: r.parent_id, title: r.title, status: r.status, content: r.content,
      sort_order: r.sort_order, created_at: r.created_at, updated_at: r.updated_at,
      encrypted_dek: r.encrypted_dek,
    })),
  );
  const children: ChildRow[] = useMemo(
    () =>
      isPlotChildren
        ? decPlotChildren.map((c) => ({ id: c.id, title: c.title, content: c.content }))
        : [],
    [isPlotChildren, decPlotChildren],
  );

  const {
    updateEpisode, updatePlanNoteContent,
    updateCharacterNoteContent, updatePlot, updateForeshadow,
  } = useLocalWrite();

  const canEdit = editable && docType !== 'character';
  const handleUpdate = (json: string) => {
    switch (docType) {
      case 'episode':        return void updateEpisode(docId, { content: json });
      case 'plan_note':      return void updatePlanNoteContent(docId, json);
      case 'character_note': return void updateCharacterNoteContent(docId, json);
      case 'plot':           return void updatePlot(docId, { content: json });
      case 'foreshadow':     return void updateForeshadow(docId, { content: json });
    }
  };

  if (!doc) {
    return (
      <div className="flex items-center justify-center px-3 py-6 text-xs text-muted-foreground">
        문서를 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      {/* 제목은 스테이지 카드 헤더가 제공 — 중복 제거. character의 메타(성별/나이)만 노출. */}
      {docType === 'character' && (doc.gender || doc.age) && (
        <div className="mb-2 flex gap-3 text-xs text-muted-foreground">
          {doc.gender && <span>성별: {doc.gender}</span>}
          {doc.age && <span>나이: {doc.age}</span>}
        </div>
      )}
      <WorldNoteInlineEditor
        noteId={docId}
        initialContent={doc.content}
        placeholder={canEdit ? '내용을 입력하세요…' : '내용 없음'}
        onUpdate={handleUpdate}
        editable={canEdit}
        size="xs"
      />
      {children.length > 0 && childConfig && (
        <div className="mt-3 border-t border-border/50 pt-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            하위 문서
          </p>
          <div className="flex flex-col gap-0.5">
            {children.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() =>
                  onAddPanel({
                    docType: childConfig.docType,
                    docId: child.id,
                    title: child.title,
                  })
                }
                className="flex items-center gap-1.5 rounded px-2 py-1 text-left text-xs text-foreground hover:bg-sidebar-accent"
              >
                <FileText size={11} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{child.title || '(제목 없음)'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 플롯 보조 통합 뷰 — 막이면 본문 + 자식 회차 카드, 회차면 단일 편집 ── */

interface PlotAuxRow {
  id: string;
  title: string;
  status: string | null;
  content: string | null;
  parent_id: string | null;
}

function PlotAuxView({ docId, editable }: { docId: string; editable: boolean }) {
  const { updatePlot } = useLocalWrite();

  const { data: rawRows = [] } = useQuery<RawDocJoinRow>(
    `SELECT p.id, p.work_id, p.writer_id, p.title, p.content,
            p.status, NULL AS importance, p.parent_id,
            NULL AS gender, NULL AS age,
            p.sort_order, p.created_at, p.updated_at,
            w.encrypted_dek AS encrypted_dek
     FROM plot p LEFT JOIN work w ON w.id = p.work_id
     WHERE p.id = ? LIMIT 1`,
    [docId],
  );
  const { data: decRows } = useDecryptedPlotList(
    rawRows.map((r) => ({
      id: r.id, work_id: r.work_id, writer_id: r.writer_id ?? '',
      parent_id: r.parent_id, title: r.title, status: r.status, content: r.content,
      sort_order: r.sort_order, created_at: r.created_at, updated_at: r.updated_at,
      encrypted_dek: r.encrypted_dek,
    })),
  );
  const item: PlotAuxRow | undefined = useMemo(() => {
    const d = decRows[0];
    if (!d) return undefined;
    return {
      id: d.id,
      title: d.title,
      status: d.status,
      content: d.content,
      parent_id: d.parent_id,
    };
  }, [decRows]);
  const isAct = item?.parent_id === null;

  // 막이면 자식 회차 fetch
  const { data: rawEpisodes = [] } = useQuery<RawDocJoinRow>(
    isAct
      ? `SELECT p.id, p.work_id, p.writer_id, p.title, p.content,
                p.status, NULL AS importance, p.parent_id,
                NULL AS gender, NULL AS age,
                p.sort_order, p.created_at, p.updated_at,
                w.encrypted_dek AS encrypted_dek
         FROM plot p LEFT JOIN work w ON w.id = p.work_id
         WHERE p.parent_id = ?
         ORDER BY p.sort_order ASC, p.created_at ASC`
      : `SELECT 1 WHERE 0`,
    isAct ? [docId] : [],
  );
  const { data: decEpisodes } = useDecryptedPlotList(
    rawEpisodes.map((r) => ({
      id: r.id, work_id: r.work_id, writer_id: r.writer_id ?? '',
      parent_id: r.parent_id, title: r.title, status: r.status, content: r.content,
      sort_order: r.sort_order, created_at: r.created_at, updated_at: r.updated_at,
      encrypted_dek: r.encrypted_dek,
    })),
  );
  const episodes: PlotAuxRow[] = useMemo(
    () =>
      decEpisodes.map((e) => ({
        id: e.id,
        title: e.title,
        status: e.status,
        content: e.content,
        parent_id: e.parent_id,
      })),
    [decEpisodes],
  );

  if (!item) {
    return (
      <div className="flex items-center justify-center px-3 py-6 text-xs text-muted-foreground">
        플롯을 찾을 수 없습니다.
      </div>
    );
  }

  // 회차 — 단일 편집. 제목은 스테이지 헤더가 제공하므로 본문에 미노출. 상태만 인라인.
  if (!isAct) {
    return (
      <div className="flex flex-col px-3 py-2">
        {item.status && (
          <div className="mb-2 text-[10px] text-muted-foreground">{item.status}</div>
        )}
        <WorldNoteInlineEditor
          noteId={item.id}
          initialContent={item.content}
          placeholder={editable ? '회차의 줄거리와 핵심 사건을 정리하세요…' : '내용 없음'}
          onUpdate={(json) => void updatePlot(item.id, { content: json })}
          editable={editable}
          size="xs"
        />
      </div>
    );
  }

  // 막 — 본문 + 자식 회차. 막 자체 제목은 헤더가 제공하므로 미노출. 자식 회차는 계층 가이드라인.
  return (
    <div className="flex flex-col px-3 py-2">
      {item.status && (
        <div className="mb-2 text-[10px] text-muted-foreground">{item.status}</div>
      )}
      <WorldNoteInlineEditor
        noteId={item.id}
        initialContent={item.content}
        placeholder={editable ? '막 전체의 줄거리와 핵심 사건을 정리하세요…' : '내용 없음'}
        onUpdate={(json) => void updatePlot(item.id, { content: json })}
        editable={editable}
        size="xs"
      />
      {episodes.length > 0 && (
        <div className="mt-3 border-t border-border/50 pt-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            회차 ({episodes.length})
          </p>
          <div className="flex flex-col gap-2">
            {episodes.map((ep) => (
              <div
                key={ep.id}
                className="border-l-2 border-l-border/60 pl-2 transition-colors hover:border-l-primary/40"
              >
                <div className="mb-1 flex items-baseline gap-1.5">
                  <h3 className="text-xs font-bold text-foreground">
                    {ep.title?.trim() || '(제목 없음)'}
                  </h3>
                  {ep.status && (
                    <span className="text-[10px] text-muted-foreground">{ep.status}</span>
                  )}
                </div>
                <WorldNoteInlineEditor
                  noteId={ep.id}
                  initialContent={ep.content}
                  placeholder={editable ? '회차 내용을 입력하세요…' : '내용 없음'}
                  onUpdate={(json) => void updatePlot(ep.id, { content: json })}
                  editable={editable}
                  size="xs"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 전체 플롯 보조 통합 뷰 — 작품 내 모든 막+회차 list 형태 ── */

interface PlotAllRow {
  id: string;
  title: string;
  status: string | null;
  content: string | null;
  parent_id: string | null;
  sort_order: number;
}

function PlotAllAuxView({ workId, editable }: { workId: string; editable: boolean }) {
  const writerId = useWriterId();
  const { updatePlot } = useLocalWrite();

  const { data: rawRows = [] } = useQuery<RawDocJoinRow>(
    `SELECT p.id, p.work_id, p.writer_id, p.title, p.content,
            p.status, NULL AS importance, p.parent_id,
            NULL AS gender, NULL AS age,
            p.sort_order, p.created_at, p.updated_at,
            w.encrypted_dek AS encrypted_dek
     FROM plot p LEFT JOIN work w ON w.id = p.work_id
     WHERE p.work_id = ? AND p.writer_id = ?
     ORDER BY p.sort_order ASC, p.created_at ASC`,
    [workId, writerId],
  );
  const { data: decRows } = useDecryptedPlotList(
    rawRows.map((r) => ({
      id: r.id, work_id: r.work_id, writer_id: r.writer_id ?? '',
      parent_id: r.parent_id, title: r.title, status: r.status, content: r.content,
      sort_order: r.sort_order, created_at: r.created_at, updated_at: r.updated_at,
      encrypted_dek: r.encrypted_dek,
    })),
  );
  const rows: PlotAllRow[] = useMemo(
    () =>
      decRows.map((d) => ({
        id: d.id,
        title: d.title,
        status: d.status,
        content: d.content,
        parent_id: d.parent_id,
        sort_order: d.sort_order ?? 0,
      })),
    [decRows],
  );

  const acts = useMemo(() => rows.filter((r) => r.parent_id === null), [rows]);
  const episodesByAct = useMemo(() => {
    const map = new Map<string, PlotAllRow[]>();
    for (const r of rows) {
      if (!r.parent_id) continue;
      if (!map.has(r.parent_id)) map.set(r.parent_id, []);
      map.get(r.parent_id)!.push(r);
    }
    return map;
  }, [rows]);

  if (acts.length === 0) {
    return (
      <div className="flex items-center justify-center px-3 py-6 text-xs text-muted-foreground">
        플롯이 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-3 py-2">
      {acts.map((act) => {
        const actEps = episodesByAct.get(act.id) ?? [];
        return (
          <div
            key={act.id}
            className="rounded-lg border border-border bg-card p-3 shadow-sm"
          >
            <div className="mb-1.5 flex items-baseline gap-1.5">
              <h3 className="text-xs font-bold text-foreground">
                {act.title?.trim() || '(제목 없음)'}
              </h3>
              {act.status && (
                <span className="text-[10px] text-muted-foreground">{act.status}</span>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {actEps.length}개
              </span>
            </div>
            <WorldNoteInlineEditor
              noteId={act.id}
              initialContent={act.content}
              placeholder={editable ? '막 전체 줄거리…' : '내용 없음'}
              onUpdate={(json) => void updatePlot(act.id, { content: json })}
              editable={editable}
              size="xs"
            />
            {actEps.length > 0 && (
              <div className="mt-2 border-t border-border/50 pt-2">
                <div className="flex flex-col gap-2">
                  {actEps.map((ep) => (
                    <div
                      key={ep.id}
                      className="border-l-2 border-l-border/60 pl-2 transition-colors hover:border-l-primary/40"
                    >
                      <div className="mb-1 flex items-baseline gap-1.5">
                        <h4 className="text-[11px] font-semibold text-foreground">
                          {ep.title?.trim() || '(제목 없음)'}
                        </h4>
                        {ep.status && (
                          <span className="text-[10px] text-muted-foreground">{ep.status}</span>
                        )}
                      </div>
                      <WorldNoteInlineEditor
                        noteId={ep.id}
                        initialContent={ep.content}
                        placeholder={editable ? '회차 내용…' : '내용 없음'}
                        onUpdate={(json) => void updatePlot(ep.id, { content: json })}
                        editable={editable}
                        size="xs"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
