import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@powersync/react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { useWriterId } from '../../hooks/useWriterId';
import { useExportPayload } from '../../hooks/useExportPayload';
import {
  useDecryptedEpisodeList,
  type RawEpisodeListRow,
} from '../../hooks/useDecryptedEpisode';
import { sanitizeFileName } from '../../export';
import { cn } from '../../lib/cn';
import type {
  ExportFormat,
  ExportOptions,
  ExportScope,
  SettingsSection,
} from '../../types/export';

type ScopeKind = ExportScope['kind'];

interface ExportDialogProps {
  workId: string;
  /** 단일 에피소드 모드로 진입하는 경우 미리 선택된 에피소드 id */
  initialEpisodeId?: string;
  onClose: () => void;
}

const SECTION_LABELS: Record<SettingsSection, string> = {
  plan: '기획',
  characters: '인물',
  worldNotes: '세계관',
  plots: '플롯',
  foreshadows: '복선',
  ideas: '아이디어',
};
const ALL_SECTIONS: SettingsSection[] = [
  'plan',
  'characters',
  'worldNotes',
  'plots',
  'foreshadows',
  'ideas',
];

interface WorkTitleRow {
  title: string;
  encrypted_dek: string | null;
}

export function ExportDialog({ workId, initialEpisodeId, onClose }: ExportDialogProps) {
  const writerId = useWriterId();
  const buildPayload = useExportPayload();

  const isWeb = typeof window !== 'undefined' && window.folio?.platform === 'web';

  const [scopeKind, setScopeKind] = useState<ScopeKind>(
    initialEpisodeId ? 'episode' : 'work',
  );
  const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<Set<string>>(new Set());
  const [singleEpisodeId, setSingleEpisodeId] = useState<string>(initialEpisodeId ?? '');
  // 설정 문서 — 다중 선택. 기본값은 전체 (기존 '설정집' 동작 유지).
  const [selectedSections, setSelectedSections] = useState<Set<SettingsSection>>(
    () => new Set(ALL_SECTIONS),
  );

  const [format, setFormat] = useState<ExportFormat>('txt');
  const [includeCoverPage, setIncludeCoverPage] = useState(true);
  const [includeToc, setIncludeToc] = useState(true);
  const [includeAuthorNote, setIncludeAuthorNote] = useState(false);
  const [pageSize, setPageSize] = useState<'A4' | 'Letter'>('A4');
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif'>('sans');

  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);

  // ── episode picker 데이터 (복호화 필요) ──
  const { data: rawEpisodeRows = [] } = useQuery<RawEpisodeListRow>(
    `SELECT e.id, e.work_id, e.writer_id, e.title, e.status, e.word_count,
            e.sort_order, e.parent_id, e.created_at, e.updated_at,
            w.encrypted_dek AS encrypted_dek
     FROM episode e
     LEFT JOIN work w ON w.id = e.work_id
     WHERE e.work_id = ? AND e.writer_id = ? AND e.status != 'trashed'
     ORDER BY e.sort_order ASC, e.created_at ASC`,
    [workId, writerId],
  );
  const { data: episodes } = useDecryptedEpisodeList(rawEpisodeRows);

  // ── work 제목 (파일명 기본값) ──
  const { data: workRows = [] } = useQuery<WorkTitleRow>(
    `SELECT title, encrypted_dek FROM work WHERE id = ? AND writer_id = ?`,
    [workId, writerId],
  );
  // useExportPayload 가 어차피 work 를 다시 fetch+decrypt 하지만, 파일명 기본값에는 빠른 평문 폴백으로 충분.
  // ciphertext 인 경우 sanitizeFileName 이 안전하게 처리하고, 사용자가 수정할 수 있다.
  const workTitle = useMemo(() => {
    const v = workRows[0]?.title?.trim() || '';
    return v.startsWith('v1:') ? '제목 없음' : v || '제목 없음';
  }, [workRows]);

  // 작품 제목 변경/형식 변경 시 기본 파일명 갱신 (사용자가 수정한 적 없을 때만)
  const userEditedFileName = useMemo(() => fileName.length > 0, [fileName]);
  useEffect(() => {
    if (!userEditedFileName) {
      setFileName(sanitizeFileName(workTitle));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workTitle]);

  const close = () => {
    if (busy) return;
    onClose();
  };

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  const formatDisabledOptions = format === 'txt';
  const tocAvailable = scopeKind !== 'episode';
  const showWebPdfHint = isWeb && format === 'pdf';

  const canSubmit = (() => {
    if (busy) return false;
    if (scopeKind === 'episodes' && selectedEpisodeIds.size === 0) return false;
    if (scopeKind === 'episode' && !singleEpisodeId) return false;
    if (scopeKind === 'planSet' && selectedSections.size === 0) return false;
    return true;
  })();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);

    const scope: ExportScope =
      scopeKind === 'work'
        ? { kind: 'work', workId }
        : scopeKind === 'episodes'
        ? { kind: 'episodes', workId, episodeIds: Array.from(selectedEpisodeIds) }
        : scopeKind === 'episode'
        ? { kind: 'episode', workId, episodeId: singleEpisodeId }
        : {
            kind: 'planSet',
            workId,
            sections: Array.from(selectedSections),
          };

    const options: ExportOptions = {
      includeCoverPage,
      includeToc: tocAvailable && includeToc,
      includeAuthorNote,
      pageSize,
      fontFamily,
      defaultFileName: fileName || sanitizeFileName(workTitle),
    };

    try {
      const payload = await buildPayload(scope);
      const result = await window.folio.export.run({ scope, format, options, payload });
      if (result.cancelled) return;
      if (!result.ok) {
        toast.error(result.error ?? '내보내기에 실패했습니다.');
        return;
      }
      if (result.path) {
        toast.success('내보내기 완료', {
          action: {
            label: '폴더 열기',
            onClick: () => {
              void window.folio.export.openInFolder(result.path!);
            },
          },
        });
      } else {
        toast.success('내보내기 완료');
      }
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : '알 수 없는 오류';
      toast.error(`내보내기에 실패했습니다: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  // 회차 picker 헬퍼
  const allEpisodeIds = episodes.map((e) => e.id);
  const allChecked =
    allEpisodeIds.length > 0 && allEpisodeIds.every((id) => selectedEpisodeIds.has(id));
  const toggleAllEpisodes = () => {
    if (allChecked) setSelectedEpisodeIds(new Set());
    else setSelectedEpisodeIds(new Set(allEpisodeIds));
  };

  const toggleSection = (s: SettingsSection) => {
    const next = new Set(selectedSections);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setSelectedSections(next);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={close}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="shrink-0 border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold text-foreground">내보내기</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            원고·설정 문서를 외부 파일로 내려받습니다.
          </p>
        </div>

        {/* 스크롤 영역 */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* 1. 범위 */}
          <Section label="무엇을 내보낼까요?">
            <div className="grid grid-cols-2 gap-2">
              <RadioCard
                checked={scopeKind === 'work'}
                onChange={() => setScopeKind('work')}
                label="작품 전체"
                hint="모든 회차"
              />
              <RadioCard
                checked={scopeKind === 'episodes'}
                onChange={() => setScopeKind('episodes')}
                label="선택 회차"
                hint="체크한 회차만"
              />
              <RadioCard
                checked={scopeKind === 'episode'}
                onChange={() => setScopeKind('episode')}
                label="단일 회차"
                hint="한 편만"
              />
              <RadioCard
                checked={scopeKind === 'planSet'}
                onChange={() => setScopeKind('planSet')}
                label="설정 문서"
                hint="기획·인물·세계관 등"
              />
            </div>

            {scopeKind === 'episodes' && (
              <div className="mt-3 rounded-md border border-border">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={allChecked}
                      onChange={toggleAllEpisodes}
                    />
                    전체 선택
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {selectedEpisodeIds.size} / {episodes.length}
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto p-1.5">
                  {episodes.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">회차가 없습니다.</p>
                  ) : (
                    episodes.map((ep) => (
                      <label
                        key={ep.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedEpisodeIds.has(ep.id)}
                          onChange={(e) => {
                            const next = new Set(selectedEpisodeIds);
                            if (e.target.checked) next.add(ep.id);
                            else next.delete(ep.id);
                            setSelectedEpisodeIds(next);
                          }}
                        />
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {(ep.sort_order ?? 0) + 1}화
                        </span>
                        <span className="truncate">{ep.title?.trim() || '(제목 없음)'}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            {scopeKind === 'episode' && (
              <Select
                className="mt-3"
                value={singleEpisodeId}
                onChange={(e) => setSingleEpisodeId(e.target.value)}
                options={[
                  { value: '', label: '회차 선택…' },
                  ...episodes.map((ep) => ({
                    value: ep.id,
                    label: `${(ep.sort_order ?? 0) + 1}화 — ${ep.title?.trim() || '(제목 없음)'}`,
                  })),
                ]}
              />
            )}

            {scopeKind === 'planSet' && (
              <div className="mt-3 rounded-md border border-border p-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  포함할 문서 종류를 선택하세요.
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {ALL_SECTIONS.map((s) => {
                    const checked = selectedSections.has(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSection(s)}
                        className={cn(
                          'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                          checked
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-input bg-background text-foreground hover:bg-accent',
                        )}
                      >
                        {SECTION_LABELS[s]}
                      </button>
                    );
                  })}
                </div>
                {selectedSections.size === 0 && (
                  <p className="mt-2 text-[11px] text-danger">
                    하나 이상의 문서 종류를 선택해주세요.
                  </p>
                )}
              </div>
            )}
          </Section>

          {/* 2. 포맷 */}
          <Section label="파일 형식">
            <div className="flex gap-2">
              {(['txt', 'docx', 'pdf'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors',
                    format === f
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input bg-background text-foreground hover:bg-accent',
                  )}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
            {showWebPdfHint && (
              <p className="mt-2 text-xs text-muted-foreground">
                PDF는 브라우저 인쇄 다이얼로그에서 &lsquo;PDF로 저장&rsquo;을 선택해주세요.
              </p>
            )}
          </Section>

          {/* 3. 옵션 */}
          <Section label="옵션">
            <div className="space-y-2 text-sm">
              <CheckboxRow
                checked={includeCoverPage}
                onChange={setIncludeCoverPage}
                label="표지 페이지"
              />
              <CheckboxRow
                checked={includeToc}
                onChange={setIncludeToc}
                disabled={!tocAvailable}
                label={tocAvailable ? '목차' : '목차 (단일 회차에선 사용 안 함)'}
              />
              <CheckboxRow
                checked={includeAuthorNote}
                onChange={setIncludeAuthorNote}
                label="작가의 말 포함"
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">페이지 크기</label>
                <Select
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value as 'A4' | 'Letter')}
                  disabled={formatDisabledOptions}
                  options={[
                    { value: 'A4', label: 'A4' },
                    { value: 'Letter', label: 'Letter' },
                  ]}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">폰트</label>
                <Select
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value as 'sans' | 'serif')}
                  disabled={formatDisabledOptions}
                  options={[
                    { value: 'sans', label: '고딕(Sans)' },
                    { value: 'serif', label: '명조(Serif)' },
                  ]}
                />
              </div>
            </div>
          </Section>

          {/* 4. 파일명 */}
          <Section label="파일명">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                onBlur={(e) => setFileName(sanitizeFileName(e.target.value))}
                className="flex-1 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">.{format}</span>
            </div>
          </Section>
        </div>

        {/* 푸터 */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <Button variant="outline" onClick={close} disabled={busy}>
            취소
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {busy ? '내보내는 중…' : '내보내기'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function RadioCard({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        'flex flex-col items-start rounded-md border px-3 py-2 text-left transition-colors',
        checked
          ? 'border-primary bg-primary/10'
          : 'border-input bg-background hover:bg-accent',
      )}
    >
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="mt-0.5 text-[11px] text-muted-foreground">{hint}</span>}
    </button>
  );
}

function CheckboxRow({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>{label}</span>
    </label>
  );
}
