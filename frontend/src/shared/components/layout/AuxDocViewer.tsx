import { useMemo } from 'react';
import { useQuery } from '@powersync/react';
import { FileText } from 'lucide-react';
import type { AuxDocType, AuxPanelItem } from '../../types/workspace';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useWriterId } from '../../hooks/useWriterId';
import { WorldNoteInlineEditor } from '../../features/world-note/WorldNoteInlineEditor';

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

const DOC_QUERIES: Record<AuxDocType, string> = {
  episode: 'SELECT title, content FROM episode WHERE id = ?',
  world_note:
    'SELECT name AS title, content, parent_id FROM world_note WHERE id = ?',
  plan_note: 'SELECT title, content FROM plan_note WHERE id = ?',
  character_note: 'SELECT title, content FROM character_note WHERE id = ?',
  plot: 'SELECT title, content FROM plot WHERE id = ?',
  character: 'SELECT name AS title, gender, age, content FROM character WHERE id = ?',
  foreshadow: 'SELECT title, content FROM foreshadow WHERE id = ?',
};

// world_note 외 docType만 자식 링크 — world_note는 통합 뷰에서 직접 재귀 렌더
const CHILD_QUERIES: Partial<Record<AuxDocType, { sql: string; docType: AuxDocType }>> = {
  plot: {
    sql: 'SELECT id, title, NULL AS content FROM plot WHERE parent_id = ? ORDER BY sort_order ASC',
    docType: 'plot',
  },
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
  const { data: rows = [] } = useQuery<WorldNoteDescendantRow>(
    `WITH RECURSIVE descendants AS (
       SELECT id, name, content, parent_id, sort_order, created_at, 0 AS depth
       FROM world_note WHERE id = ?
       UNION ALL
       SELECT w.id, w.name, w.content, w.parent_id, w.sort_order, w.created_at, d.depth + 1
       FROM world_note w
       JOIN descendants d ON w.parent_id = d.id
     )
     SELECT id, name, content, parent_id, sort_order, depth FROM descendants
     ORDER BY depth ASC, sort_order ASC, created_at ASC`,
    [docId],
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

/* ── 캐릭터 보조 통합 뷰 — 메인 CharacterOverview의 컴팩트 버전 ── */

interface CharacterMetaRow {
  id: string;
  name: string;
  gender: string | null;
  age: string | null;
}

interface CharacterAuxNoteRow {
  id: string;
  kind: string;
  title: string;
  content: string | null;
}

function CharacterAuxView({ docId, editable }: { docId: string; editable: boolean }) {
  const { updateCharacterNoteContent } = useLocalWrite();

  const { data: metaRows = [] } = useQuery<CharacterMetaRow>(
    `SELECT id, name, gender, age FROM character WHERE id = ? LIMIT 1`,
    [docId],
  );
  const meta = metaRows[0];

  const { data: notes = [] } = useQuery<CharacterAuxNoteRow>(
    `SELECT id, kind, title, content FROM character_note
     WHERE character_id = ?
     ORDER BY sort_order ASC, created_at ASC`,
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

  return (
    <div className="flex flex-col px-3 py-2">
      {/* 메타 — 이름 / 성별 / 나이 */}
      <div className="mb-2 flex items-baseline gap-1.5">
        <span className="text-sm font-bold text-foreground">
          {meta.name?.trim() || '(이름 없음)'}
        </span>
        {meta.gender && (
          <span className="text-[10px] text-muted-foreground">{meta.gender}</span>
        )}
        {meta.age && (
          <span className="text-[10px] text-muted-foreground">/ {meta.age}</span>
        )}
      </div>

      {/* 본문 — intro character_note의 content */}
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

      {/* 하위 문서 카드 — breadcrumb: 캐릭터 > 노트제목 */}
      {visibleNotes.length > 0 && (
        <div className="border-t border-border/50 pt-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            하위 문서
          </p>
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
        </div>
      )}
    </div>
  );
}

/* ── world_note 외 docType — 단일 문서 뷰 + 자식 링크 ── */

function NonWorldNoteAuxView({
  docType,
  docId,
  editable,
  onAddPanel,
}: AuxDocViewerProps) {
  const { data: rows = [] } = useQuery<DocRow>(DOC_QUERIES[docType], [docId]);
  const doc = rows[0];

  const childConfig = CHILD_QUERIES[docType];
  const { data: children = [] } = useQuery<ChildRow>(
    childConfig ? childConfig.sql : 'SELECT NULL AS id, NULL AS title, NULL AS content WHERE 0',
    childConfig ? [docId] : [],
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

  const { data: rows = [] } = useQuery<PlotAuxRow>(
    `SELECT id, title, status, content, parent_id FROM plot WHERE id = ? LIMIT 1`,
    [docId],
  );
  const item = rows[0];
  const isAct = item?.parent_id === null;

  // 막이면 자식 회차 fetch
  const { data: episodes = [] } = useQuery<PlotAuxRow>(
    isAct
      ? `SELECT id, title, status, content, parent_id FROM plot
         WHERE parent_id = ? ORDER BY sort_order ASC, created_at ASC`
      : `SELECT NULL AS id, NULL AS title, NULL AS status, NULL AS content, NULL AS parent_id WHERE 0`,
    isAct ? [docId] : [],
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

  const { data: rows = [] } = useQuery<PlotAllRow>(
    `SELECT id, title, status, content, parent_id, sort_order FROM plot
     WHERE work_id = ? AND writer_id = ?
     ORDER BY sort_order ASC, created_at ASC`,
    [workId, writerId],
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
