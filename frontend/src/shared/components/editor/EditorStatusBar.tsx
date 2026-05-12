import { Check } from 'lucide-react';

interface EditorStatusBarProps {
  charCount: number;
  wordCount: number;
  saveStatus: 'idle' | 'saving' | 'saved';
  sessionStartChars: number;
  /** 200자 원고지 매수 표시 */
  showManuscriptCount?: boolean;
}

export default function EditorStatusBar({
  charCount,
  wordCount,
  saveStatus,
  sessionStartChars,
  showManuscriptCount = false,
}: EditorStatusBarProps) {
  const readingTime = Math.ceil(charCount / 500);
  const sessionDelta = charCount - sessionStartChars;
  // 한국 출판 관행: 200자 원고지 N매 (소수점 1자리)
  const manuscriptPages = (charCount / 200).toFixed(1);

  return (
    <div className="flex h-6 shrink-0 items-center gap-4 border-t border-border px-3 text-[11px] text-muted-foreground">
      <span>{charCount.toLocaleString()}자</span>
      {showManuscriptCount && (
        <span title="200자 원고지 환산 매수">{manuscriptPages}매</span>
      )}
      <span>{wordCount.toLocaleString()}단어</span>
      <span>~{readingTime}분</span>
      <span>
        세션 {sessionDelta >= 0 ? '+' : ''}
        {sessionDelta.toLocaleString()}자
      </span>
      {/* 일일 목표는 DailyGoalWidget (드래그 가능한 위젯) 으로 이동. */}
      {charCount > 50000 && (
        <span className="text-warning">· 대용량 문서</span>
      )}

      <div className="flex-1" />

      {saveStatus === 'saving' && <span>편집 중…</span>}
      {saveStatus === 'saved' && (
        <span className="flex items-center gap-0.5">
          저장됨 <Check size={12} />
        </span>
      )}
    </div>
  );
}
