import { Check } from 'lucide-react';
import { useEditorSettings } from '../../stores/editorSettingsStore';

interface EditorStatusBarProps {
  charCount: number;
  wordCount: number;
  saveStatus: 'idle' | 'saving' | 'saved';
  sessionStartChars: number;
}

export default function EditorStatusBar({
  charCount,
  wordCount,
  saveStatus,
  sessionStartChars,
}: EditorStatusBarProps) {
  const { dailyGoalEnabled, dailyGoalChars } = useEditorSettings();

  const readingTime = Math.ceil(charCount / 500);
  const sessionDelta = charCount - sessionStartChars;

  return (
    <div className="flex h-6 shrink-0 items-center gap-4 border-t border-border px-3 text-[11px] text-muted-foreground">
      <span>{charCount.toLocaleString()}자</span>
      <span>{wordCount.toLocaleString()}단어</span>
      <span>~{readingTime}분</span>
      <span>
        세션 {sessionDelta >= 0 ? '+' : ''}
        {sessionDelta.toLocaleString()}자
      </span>
      {dailyGoalEnabled && (
        <span>
          목표 {Math.max(0, sessionDelta)}/{dailyGoalChars.toLocaleString()}
        </span>
      )}
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
