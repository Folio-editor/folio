import type { EditorSettings } from '../../stores/editorSettingsStore';
import { useEditorSettings } from '../../stores/editorSettingsStore';

interface EditorSettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 mt-4 first:mt-0">
      {children}
    </h3>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between py-1 cursor-pointer">
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border accent-primary"
      />
    </label>
  );
}

export default function EditorSettingsPanel({
  open,
  onClose,
}: EditorSettingsPanelProps) {
  const settings = useEditorSettings();
  const set = settings.set;

  if (!open) return null;

  return (
    <>
      {/* Click-away overlay */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      <div className="absolute right-0 top-full mt-1 w-72 rounded-lg border border-border bg-popover shadow-lg p-4 z-50 max-h-[80vh] overflow-y-auto">
        {/* 입력 보조 */}
        <SectionLabel>입력 보조</SectionLabel>
        <Toggle
          label="따옴표 자동 쌍"
          checked={settings.autoPairQuotes}
          onChange={(v) => set('autoPairQuotes', v)}
        />
        <Toggle
          label="한국어 구두점 자동 변환"
          checked={settings.autoKoreanPunctuation}
          onChange={(v) => set('autoKoreanPunctuation', v)}
        />

        {/* 색상 강조 */}
        <SectionLabel>색상 강조</SectionLabel>
        <Toggle
          label="대사 색상"
          checked={settings.dialogueColor}
          onChange={(v) => set('dialogueColor', v)}
        />
        <Toggle
          label="내면 묘사 색상"
          checked={settings.innerThoughtColor}
          onChange={(v) => set('innerThoughtColor', v)}
        />

        {/* 문단 */}
        <SectionLabel>문단</SectionLabel>
        <Toggle
          label="자동 들여쓰기"
          checked={settings.autoIndent}
          onChange={(v) => set('autoIndent', v)}
        />
        <label className="flex items-center justify-between py-1">
          <span className="text-sm">들여쓰기 크기</span>
          <select
            value={settings.indentSize}
            onChange={(e) =>
              set('indentSize', e.target.value as EditorSettings['indentSize'])
            }
            className="h-7 rounded border border-border bg-transparent px-2 text-sm"
          >
            <option value="1em">1em</option>
            <option value="2em">2em</option>
          </select>
        </label>

        {/* 이름 태그 */}
        <SectionLabel>이름 태그</SectionLabel>
        <Toggle
          label="이름 태그 표시"
          checked={settings.nameTagEnabled}
          onChange={(v) => set('nameTagEnabled', v)}
        />

        {/* 집필 모드 */}
        <SectionLabel>집필 모드</SectionLabel>
        <Toggle
          label="타자기 모드"
          checked={settings.typewriterMode}
          onChange={(v) => set('typewriterMode', v)}
        />
        <label className="flex items-center justify-between py-1">
          <span className="text-sm">타자기 위치</span>
          <input
            type="range"
            min="0"
            max="100"
            value={settings.typewriterPosition}
            onChange={(e) => set('typewriterPosition', Number(e.target.value))}
            className="w-24"
          />
        </label>
        <Toggle
          label="집중 모드"
          checked={settings.focusMode}
          onChange={(v) => set('focusMode', v)}
        />

        {/* 표시 */}
        <SectionLabel>표시</SectionLabel>
        <Toggle
          label="행 번호"
          checked={settings.showLineNumbers}
          onChange={(v) => set('showLineNumbers', v)}
        />
        <Toggle
          label="문단 기호"
          checked={settings.showParagraphMarks}
          onChange={(v) => set('showParagraphMarks', v)}
        />

        {/* 목표 */}
        <SectionLabel>목표</SectionLabel>
        <Toggle
          label="일일 목표"
          checked={settings.dailyGoalEnabled}
          onChange={(v) => set('dailyGoalEnabled', v)}
        />
        <label className="flex items-center justify-between py-1">
          <span className="text-sm">목표 글자 수</span>
          <input
            type="number"
            min="0"
            step="100"
            value={settings.dailyGoalChars}
            onChange={(e) => set('dailyGoalChars', Number(e.target.value))}
            className="h-7 w-20 rounded border border-border bg-transparent px-2 text-sm text-right"
          />
        </label>

        {/* 서식 */}
        <SectionLabel>서식</SectionLabel>
        <label className="flex items-center justify-between py-1">
          <span className="text-sm">글꼴</span>
          <select
            value={settings.fontFamily}
            onChange={(e) =>
              set(
                'fontFamily',
                e.target.value as EditorSettings['fontFamily'],
              )
            }
            className="h-7 rounded border border-border bg-transparent px-2 text-sm"
          >
            <option value="system">시스템</option>
            <option value="serif">명조</option>
            <option value="sans">고딕</option>
          </select>
        </label>
        <label className="flex items-center justify-between py-1">
          <span className="text-sm">줄 간격</span>
          <input
            type="number"
            min="1"
            max="3"
            step="0.1"
            value={settings.lineHeight}
            onChange={(e) => set('lineHeight', Number(e.target.value))}
            className="h-7 w-20 rounded border border-border bg-transparent px-2 text-sm text-right"
          />
        </label>
        <label className="flex items-center justify-between py-1">
          <span className="text-sm">글자 크기</span>
          <input
            type="number"
            min="10"
            max="32"
            step="1"
            value={settings.fontSize}
            onChange={(e) => set('fontSize', Number(e.target.value))}
            className="h-7 w-20 rounded border border-border bg-transparent px-2 text-sm text-right"
          />
        </label>
      </div>
    </>
  );
}
