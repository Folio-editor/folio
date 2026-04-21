import { Check } from 'lucide-react';
import { useAppearanceStore } from '../../stores/appearanceStore';
import type { EditorSettings } from '../../stores/editorSettingsStore';
import { useEditorSettings } from '../../stores/editorSettingsStore';
import { useThemeStore } from '../../stores/themeStore';
import { COLOR_THEMES } from '../../config/themes';
import { cn } from '../../lib/cn';
import type { SettingsItemId } from '../../components/layout/sidebar-panels/SettingsList';

const EDITOR_FONT_OPTIONS: {
  id: EditorSettings['fontFamily'];
  label: string;
  description: string;
  fontFamily: string;
}[] = [
  {
    id: 'system',
    label: '시스템 기본',
    description: '기기 기본 폰트',
    fontFamily: 'inherit',
  },
  {
    id: 'serif',
    label: '명조',
    description: '원고지처럼 차분한 문장용 폰트',
    fontFamily: "'Batang', 'Noto Serif KR', serif",
  },
  {
    id: 'sans',
    label: '고딕',
    description: '화면에서 또렷하게 읽히는 폰트',
    fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif",
  },
];

const FONT_SIZE_OPTIONS = [14, 15, 16, 17, 18, 20, 22];

interface SettingsScreenProps {
  settingsItemId: SettingsItemId;
}

export function SettingsScreen({ settingsItemId }: SettingsScreenProps) {
  if (settingsItemId === 'theme') return <ThemeSettings />;
  if (settingsItemId === 'font') return <FontSettings />;
  return null;
}

function ThemeSettings() {
  const colorTheme = useAppearanceStore((s) => s.colorTheme);
  const setColorTheme = useAppearanceStore((s) => s.setColorTheme);
  const theme = useThemeStore((s) => s.theme);

  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h2 className="text-sm font-semibold text-foreground">색상 테마</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-lg">
          <p className="mb-5 text-xs text-muted-foreground">
            앱 전체의 색상 테마를 선택합니다. 라이트/다크 모드와 독립적으로 적용됩니다.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {COLOR_THEMES.map((t) => {
              const isActive = colorTheme === t.id;
              const preview = isDark ? t.previewDark : t.previewLight;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setColorTheme(t.id)}
                  className={cn(
                    'group relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all',
                    isActive
                      ? 'border-ring shadow-sm'
                      : 'border-transparent hover:border-border',
                  )}
                >
                  <div
                    className="flex h-16 w-full items-center justify-center rounded-lg border border-border/40 shadow-inner"
                    style={{ backgroundColor: preview }}
                  >
                    {isActive && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-ring">
                        <Check size={14} strokeWidth={2.5} className="text-background" />
                      </div>
                    )}
                  </div>
                  <span className={cn(
                    'text-xs',
                    isActive ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}>
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function FontSettings() {
  const fontFamily = useEditorSettings((s) => s.fontFamily);
  const fontSize = useEditorSettings((s) => s.fontSize);
  const set = useEditorSettings((s) => s.set);

  const currentFont = EDITOR_FONT_OPTIONS.find((f) => f.id === fontFamily);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <h2 className="text-sm font-semibold text-foreground">폰트 설정</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-lg">
          <p className="mb-5 text-xs text-muted-foreground">
            원고를 쓸 때 보이는 폰트 종류와 크기를 조정합니다.
          </p>

          <div>
            <h3 className="mb-2 text-xs font-semibold text-foreground">폰트 종류</h3>
            <div className="flex flex-col gap-1.5">
              {EDITOR_FONT_OPTIONS.map((f) => {
                const isActive = fontFamily === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => set('fontFamily', f.id)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all',
                      isActive
                        ? 'border-ring bg-accent/50'
                        : 'border-transparent hover:border-border hover:bg-muted/30',
                    )}
                  >
                    <div className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                      isActive ? 'border-ring bg-ring' : 'border-muted-foreground/40',
                    )}>
                      {isActive && <Check size={12} strokeWidth={3} className="text-background" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          'text-sm',
                          isActive ? 'font-medium text-foreground' : 'text-foreground',
                        )}
                        style={{ fontFamily: f.fontFamily }}
                      >
                        {f.label}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {f.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-foreground">폰트 크기</h3>
              <span className="text-xs text-muted-foreground">{fontSize}px</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {FONT_SIZE_OPTIONS.map((size) => {
                const isActive = fontSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => set('fontSize', size)}
                    className={cn(
                      'h-9 min-w-11 rounded-lg border px-3 text-xs font-medium transition-colors',
                      isActive
                        ? 'border-ring bg-ring text-background'
                        : 'border-border bg-background text-foreground hover:bg-muted',
                    )}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-border bg-muted/20 p-5">
            <p className="mb-2 text-xs font-medium text-muted-foreground">미리보기</p>
            <div
              className="leading-relaxed text-foreground"
              style={{
                fontFamily: currentFont?.fontFamily ?? 'inherit',
                fontSize,
              }}
            >
              비가 내린 뒤 플랫폼 바닥은 유리처럼 빛났다.
              <br />
              서윤은 발끝으로 고인 물을 밀어내며 열차 쪽을 바라봤다.
              <br />
              <span className="text-muted-foreground">Folio editor preview · {fontSize}px</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
