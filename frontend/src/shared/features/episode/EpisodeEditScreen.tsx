import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { Link2, Link2Off, Lock, Plus, Search, Trash2 } from 'lucide-react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDeferredText } from '../../hooks/useDeferredText';
import { useDecryptedEpisode, type DecryptedEpisodeRow } from '../../hooks/useDecryptedEpisode';
import { Input } from '../../components/ui/Input';
import { DeleteConfirmDialog } from '../../components/ui/DeleteConfirmDialog';
import { StatusPillDropdown, type StatusPillOption } from '../../components/ui/StatusPillDropdown';
import { EditorToolbarToggle } from '../../components/editor/EditorToolbarToggle';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { BreadcrumbTitle } from '../../components/layout/BreadcrumbTitle';
import { ContentEditor } from '../../components/editor/ContentEditor';
import type { WorkspaceSection } from '../../types/workspace';

interface EpisodeEditScreenProps {
  id: string;
  onBack: () => void;
  /** 우측 패널로 보내기 — 메인 헤더 ↗ 버튼 */
  onSendToRight?: () => void;
  onNavigateTo: (section: WorkspaceSection, itemId: string | null) => void;
}

interface LinkRow {
  link_id: string;
  plot_id: string;
  plot_title: string;
}

interface UnlinkedPlotRow {
  id: string;
  title: string;
}

const STATUS_OPTIONS: StatusPillOption[] = [
  { value: '미작성', label: '미작성', tone: 'slate' },
  { value: '초고', label: '초고', tone: 'amber' },
  { value: '퇴고', label: '퇴고', tone: 'blue' },
  { value: '완성', label: '완성', tone: 'emerald' },
];

export function EpisodeEditScreen({ id, onBack, onSendToRight, onNavigateTo }: EpisodeEditScreenProps) {
  const { data: item, isLoading } = useDecryptedEpisode(id);

  if (!item) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        {isLoading ? '회차를 불러오는 중…' : '회차를 찾을 수 없습니다.'}
      </div>
    );
  }

  return <EpisodeEditor key={id} item={item} onBack={onBack} onSendToRight={onSendToRight} onNavigateTo={onNavigateTo} />;
}

function EpisodeEditor({
  item,
  onBack,
  onSendToRight,
  onNavigateTo,
}: {
  item: DecryptedEpisodeRow;
  onBack: () => void;
  onSendToRight?: () => void;
  onNavigateTo: (section: WorkspaceSection, itemId: string | null) => void;
}) {
  const { updateEpisode, trashEpisode } = useLocalWrite();
  const { id } = item;
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [trashBusy, setTrashBusy] = useState(false);

  const title = useDeferredText(id, item.title, (v) => void updateEpisode(id, { title: v }));

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        onClose={onBack}
        onSendToRight={onSendToRight}
        title={
          <BreadcrumbTitle
            items={['원고']}
            trailing={
              <Input
                value={title.value}
                onChange={(e) => title.onChange(e.target.value)}
                onBlur={title.onBlur}
                placeholder="회차 제목"
                className="border-none px-0 text-sm font-semibold shadow-none focus-visible:ring-0"
              />
            }
          />
        }
        trailing={
          <div className="flex items-center gap-3">
            <PlotLinkIndicator episodeId={id} episodeTitle={item.title} onNavigateTo={onNavigateTo} />
            <span className="mr-1 text-xs text-muted-foreground">
              {item.word_count.toLocaleString()}자
            </span>
            <StatusPillDropdown
              value={STATUS_OPTIONS.some((o) => o.value === item.status) ? item.status : '미작성'}
              options={STATUS_OPTIONS}
              ariaLabel="원고 상태"
              onChange={(status) => void updateEpisode(id, { status })}
            />
            <EditorToolbarToggle />
            <button
              type="button"
              onClick={() => setConfirmTrash(true)}
              title="휴지통으로 이동"
              className="rounded p-2 text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
            >
              <Trash2 size={16} strokeWidth={1.75} />
            </button>
          </div>
        }
      />
      {confirmTrash && (
        <DeleteConfirmDialog
          title="휴지통으로 이동"
          message={`"${item.title || '(제목 없음)'}" 원고가 휴지통으로 이동됩니다.`}
          warning="30일 후 자동으로 영구 삭제됩니다. 휴지통에서 복원할 수 있습니다."
          confirmLabel="휴지통으로 이동"
          busyLabel="이동 중…"
          busy={trashBusy}
          onConfirm={() => {
            setTrashBusy(true);
            void trashEpisode(id).then(() => {
              setTrashBusy(false);
              setConfirmTrash(false);
              onBack();
            });
          }}
          onCancel={() => setConfirmTrash(false)}
        />
      )}
      {item.decryptStatus === 'no-kek' && (
        <DecryptBanner
          message="이 원고는 암호화되어 있습니다. 다시 로그인해야 본문을 볼 수 있습니다."
        />
      )}
      {item.decryptStatus === 'no-work-key' && (
        <DecryptBanner
          message="이 작품의 암호화 키 정보를 찾지 못했습니다. 동기화가 끝날 때까지 기다려 주세요."
        />
      )}
      {item.decryptStatus === 'failed' && (
        <DecryptBanner
          message="본문 복호화에 실패했습니다. 데이터가 손상되었거나 다른 사용자의 키로 암호화된 항목일 수 있습니다."
        />
      )}
      {(item.decryptStatus === 'plain' || item.decryptStatus === 'decrypted') && (
        <ContentEditor
          itemId={id}
          initialContent={item.content}
          placeholder="본문을 작성하세요…"
          onUpdate={(content) => void updateEpisode(id, { content })}
          onCharCountChange={(count) => void updateEpisode(id, { word_count: count })}
        />
      )}
    </div>
  );
}

function DecryptBanner({ message }: { message: string }) {
  return (
    <div className="m-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      <Lock size={14} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

/* ── 플롯 연결 표시 ── */

function PlotLinkIndicator({
  episodeId,
  episodeTitle,
  onNavigateTo,
}: {
  episodeId: string;
  episodeTitle: string;
  onNavigateTo: (section: WorkspaceSection, itemId: string | null) => void;
}) {
  const { linkPlotEpisode, unlinkPlotEpisode, createPlot } = useLocalWrite();
  const [showModal, setShowModal] = useState(false);

  const { data: linkRows = [] } = useQuery<LinkRow>(
    `SELECT pel.id AS link_id, pel.plot_id, p.title AS plot_title
     FROM plot_episode_link pel
     JOIN plot p ON p.id = pel.plot_id
     WHERE pel.episode_id = ?`,
    [episodeId],
  );
  const link = linkRows[0] ?? null;

  const { data: episodeInfo = [] } = useQuery<{ work_id: string }>(
    `SELECT work_id FROM episode WHERE id = ?`,
    [episodeId],
  );
  const workId = episodeInfo[0]?.work_id;

  const doCreatePlotAndLink = async () => {
    if (!workId) return;
    const plotId = await createPlot(workId, episodeTitle, Date.now());
    await linkPlotEpisode(plotId, episodeId);
  };

  const handleUnlink = async () => {
    if (!link) return;
    await unlinkPlotEpisode(link.link_id);
  };

  const handleLinkSelected = async (plotId: string) => {
    await linkPlotEpisode(plotId, episodeId);
    setShowModal(false);
  };

  if (link) {
    return (
      <div className="flex items-center gap-1.5">
        <Link2 size={12} className="text-primary/70" />
        <button
          type="button"
          onClick={() => onNavigateTo('plot', null)}
          title={`플롯 보기: ${link.plot_title}`}
          className="max-w-32 truncate text-xs text-primary/70 transition-colors hover:text-primary hover:underline"
        >
          {link.plot_title}
        </button>
        <button
          type="button"
          onClick={() => void handleUnlink()}
          title="플롯 연결 해제"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Link2Off size={12} />
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => void doCreatePlotAndLink()}
          title="같은 제목으로 플롯 생성 후 연결"
          className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <span className="flex items-center gap-1">
            <Plus size={10} />
            플롯 생성
          </span>
        </button>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          title="기존 플롯과 연결"
          className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <span className="flex items-center gap-1">
            <Link2 size={10} />
            플롯 연결
          </span>
        </button>
      </div>

      {showModal && workId && (
        <PlotLinkModal
          workId={workId}
          onSelect={handleLinkSelected}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

/* ── 플롯 연결 모달 ── */

function PlotLinkModal({
  workId,
  onSelect,
  onClose,
}: {
  workId: string;
  onSelect: (plotId: string) => Promise<void>;
  onClose: () => void;
}) {
  const writerId = useWriterId();
  const [search, setSearch] = useState('');

  // 아직 연결되지 않은 플롯 회차 목록
  const { data: plots = [] } = useQuery<UnlinkedPlotRow>(
    `SELECT p.id, p.title FROM plot p
     WHERE p.work_id = ? AND p.writer_id = ? AND p.parent_id IS NOT NULL
       AND p.id NOT IN (SELECT plot_id FROM plot_episode_link)
     ORDER BY p.sort_order ASC, p.created_at ASC`,
    [workId, writerId],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return plots;
    return plots.filter((p) => p.title.toLowerCase().includes(term));
  }, [plots, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-80 rounded-lg border border-border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-sm font-semibold text-foreground">플롯 연결</h3>

        <div className="relative mb-3">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder="플롯 제목 검색"
            className="pl-7 text-xs"
          />
        </div>

        <div className="max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {plots.length === 0 ? '연결 가능한 플롯이 없습니다.' : '검색 결과가 없습니다.'}
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void onSelect(p.id)}
                  className="truncate rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-primary/10"
                >
                  {p.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
