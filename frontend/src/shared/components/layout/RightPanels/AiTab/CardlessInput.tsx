import type { ReactNode } from 'react';

/** AI 도구 카드 입력 영역 공통 디자인 — 외곽 카드 X, 라벨 + 입력 + 도움말 만 깔끔하게. */
export function CardlessInput({
  label,
  help,
  children,
}: {
  label: ReactNode;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="px-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
      {help && (
        <p className="px-0.5 text-[11px] leading-relaxed text-muted-foreground/70">
          {help}
        </p>
      )}
    </div>
  );
}

/** 입력 컨트롤 (textarea/input) 공통 클래스 — 외곽 borderless, focus 시 underline 강조. */
export const CARDLESS_INPUT_CLASS =
  'w-full resize-none rounded-md border border-border/40 bg-background/50 px-2.5 py-2 text-sm transition-colors focus:border-primary/60 focus:bg-background focus:outline-none focus:ring-0';
