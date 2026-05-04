import { useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useWriterId } from '../../hooks/useWriterId';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { useDecryptedWorkList } from '../../hooks/useDecryptedWork';
import {
  useDecryptedEpisodeList,
  type RawEpisodeListRow,
} from '../../hooks/useDecryptedEpisode';
import { MainPanelHeader } from '../../components/layout/MainPanelHeader';
import { Button } from '../../components/ui/Button';
import { parseServerDate } from '../../lib/dateTime';

interface TrashedWork {
  id: string;
  title: string;
  updated_at: string;
}

interface TrashedEpisode {
  id: string;
  title: string;
  updated_at: string;
  work_id: string;
}

function daysRemaining(updatedAt: string): number {
  const d = parseServerDate(updatedAt);
  if (!d) return 30;
  const elapsed = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, 30 - elapsed);
}

function formatDate(iso: string): string {
  const d = parseServerDate(iso);
  if (!d) return iso || '';
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function TrashScreen() {
  const writerId = useWriterId();
  const {
    restoreWork,
    permanentDeleteWork,
    restoreEpisode,
    permanentDeleteEpisode,
  } = useLocalWrite();

  // PR2 — work title은 v1: 암호문일 수 있어 batch 복호화 후 매핑.
  const { data: rawTrashedWorks = [] } = useQuery<{
    id: string;
    writer_id: string;
    title: string | null;
    author_name: string | null;
    description: string | null;
    status: string;
    sort_order: number | null;
    created_at: string;
    updated_at: string;
    encrypted_dek: string | null;
  }>(
    `SELECT id, writer_id, title, author_name, description, status,
            sort_order, created_at, updated_at, encrypted_dek
     FROM work WHERE writer_id = ? AND status = 'trashed'
     ORDER BY updated_at DESC`,
    [writerId],
  );
  const { data: decryptedTrashedWorks } = useDecryptedWorkList(rawTrashedWorks);
  const trashedWorks: TrashedWork[] = useMemo(
    () =>
      decryptedTrashedWorks.map((w) => ({
        id: w.id,
        title: w.title,
        updated_at: w.updated_at,
      })),
    [decryptedTrashedWorks],
  );

  const { data: rawTrashedEpisodes = [] } = useQuery<RawEpisodeListRow>(
    `SELECT e.id, e.work_id, e.title, e.status, e.word_count,
            e.sort_order, e.parent_id, e.created_at, e.updated_at,
            w.encrypted_dek
       FROM episode e
       LEFT JOIN work w ON w.id = e.work_id
      WHERE e.writer_id = ? AND e.status = 'trashed'
      ORDER BY e.updated_at DESC`,
    [writerId],
  );
  const { data: decryptedTrashedEpisodes } = useDecryptedEpisodeList(rawTrashedEpisodes);
  const trashedEpisodes: TrashedEpisode[] = useMemo(
    () =>
      decryptedTrashedEpisodes.map((e) => ({
        id: e.id,
        title: e.title,
        updated_at: e.updated_at,
        work_id: e.work_id,
      })),
    [decryptedTrashedEpisodes],
  );

  // work_id → title 매핑 — 휴지통에 없는 작품(연재중)도 포함해야 episode 표시 가능.
  const { data: rawAllWorks = [] } = useQuery<{
    id: string;
    writer_id: string;
    title: string | null;
    author_name: string | null;
    description: string | null;
    status: string;
    sort_order: number | null;
    created_at: string;
    updated_at: string;
    encrypted_dek: string | null;
  }>(
    `SELECT id, writer_id, title, author_name, description, status,
            sort_order, created_at, updated_at, encrypted_dek
     FROM work WHERE writer_id = ?`,
    [writerId],
  );
  const { data: decryptedAllWorks } = useDecryptedWorkList(rawAllWorks);
  const workTitleMap = useMemo(
    () => new Map(decryptedAllWorks.map((w) => [w.id, w.title])),
    [decryptedAllWorks],
  );

  const [confirmTarget, setConfirmTarget] = useState<{
    type: 'work' | 'episode' | 'all';
    id?: string;
    title?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const isEmpty = trashedWorks.length === 0 && trashedEpisodes.length === 0;

  const handlePermanentDelete = async () => {
    if (!confirmTarget) return;
    setBusy(true);
    try {
      if (confirmTarget.type === 'work' && confirmTarget.id) {
        await permanentDeleteWork(confirmTarget.id);
      } else if (confirmTarget.type === 'episode' && confirmTarget.id) {
        await permanentDeleteEpisode(confirmTarget.id);
      } else if (confirmTarget.type === 'all') {
        for (const ep of trashedEpisodes) {
          await permanentDeleteEpisode(ep.id);
        }
        for (const w of trashedWorks) {
          await permanentDeleteWork(w.id);
        }
      }
      setConfirmTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <MainPanelHeader
        title={<span className="text-sm font-semibold">휴지통</span>}
        subtitle="삭제된 항목은 30일 후 자동으로 영구 삭제됩니다"
        trailing={
          !isEmpty && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmTarget({ type: 'all' })}
            >
              비우기
            </Button>
          )
        }
      />

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            휴지통이 비어 있습니다.
          </div>
        ) : (
          <div className="space-y-6">
            {/* 삭제된 작품 */}
            {trashedWorks.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  작품 ({trashedWorks.length})
                </h3>
                <div className="space-y-1">
                  {trashedWorks.map((w) => (
                    <TrashItem
                      key={w.id}
                      title={w.title}
                      meta={`삭제일: ${formatDate(w.updated_at)} · ${daysRemaining(w.updated_at)}일 후 영구 삭제`}
                      onRestore={() => void restoreWork(w.id)}
                      onDelete={() =>
                        setConfirmTarget({ type: 'work', id: w.id, title: w.title })
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            {/* 삭제된 원고 */}
            {trashedEpisodes.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  원고 ({trashedEpisodes.length})
                </h3>
                <div className="space-y-1">
                  {trashedEpisodes.map((ep) => (
                    <TrashItem
                      key={ep.id}
                      title={ep.title}
                      meta={`${workTitleMap.get(ep.work_id) ?? '(알 수 없는 작품)'} · 삭제일: ${formatDate(ep.updated_at)} · ${daysRemaining(ep.updated_at)}일 후 영구 삭제`}
                      onRestore={() => void restoreEpisode(ep.id)}
                      onDelete={() =>
                        setConfirmTarget({ type: 'episode', id: ep.id, title: ep.title })
                      }
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* 영구 삭제 확인 다이얼로그 */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-lg bg-background p-5 shadow-lg">
            <h3 className="text-base font-semibold text-foreground">영구 삭제</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {confirmTarget.type === 'all'
                ? '휴지통의 모든 항목이 영구 삭제됩니다.'
                : <>
                    <span className="font-medium text-foreground">
                      &ldquo;{confirmTarget.title}&rdquo;
                    </span>
                    이(가) 영구 삭제됩니다.
                  </>}
            </p>
            <p className="mt-1 text-xs text-destructive">이 작업은 되돌릴 수 없습니다.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmTarget(null)}
                disabled={busy}
              >
                취소
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handlePermanentDelete()}
                disabled={busy}
              >
                {busy ? '삭제 중…' : '영구 삭제'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TrashItem({
  title,
  meta,
  onRestore,
  onDelete,
}: {
  title: string;
  meta: string;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-md border border-border px-4 py-3 transition-colors hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {title || '(제목 없음)'}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onRestore}
          title="복원"
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <RotateCcw size={14} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="영구 삭제"
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={14} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
