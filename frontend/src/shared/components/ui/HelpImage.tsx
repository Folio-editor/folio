import { useState } from 'react';
import { useResolvedTheme } from '../../hooks/useResolvedTheme';
import { cn } from '../../lib/cn';

export interface HelpImageProps {
  /** 라이트 테마용 이미지 src (Vite import 결과 또는 정적 URL) */
  light: string;
  /** 다크 테마용 이미지 src */
  dark: string;
  /** 스크린리더용 설명 — 이미지가 가리키는 위치/동작을 한 줄로 */
  alt: string;
  /** 캡션 (이미지 아래에 작게 표기) */
  caption?: string;
  /** 클릭 시 라이트박스로 확대해 보기 (기본 true) */
  zoomable?: boolean;
}

/**
 * 도움말 모달 본문에 삽입하는 스크린샷.
 * useResolvedTheme 으로 현재 테마에 맞는 이미지 자동 선택.
 *
 * 사용 예 (tabHelpContent.tsx):
 *   import addPlotLight from '@assets/help/plot/add-act.light.png';
 *   import addPlotDark  from '@assets/help/plot/add-act.dark.png';
 *   <HelpImage light={addPlotLight} dark={addPlotDark} alt="좌측 사이드바의 + 새 챕터 버튼 위치" />
 */
export function HelpImage({ light, dark, alt, caption, zoomable = true }: HelpImageProps) {
  const theme = useResolvedTheme();
  const src = theme === 'dark' ? dark : light;
  const [zoomed, setZoomed] = useState(false);

  return (
    <>
      <figure className="my-2.5">
        <button
          type="button"
          onClick={() => zoomable && setZoomed(true)}
          disabled={!zoomable}
          className={cn(
            'block w-full overflow-hidden rounded-md border border-[#d4d4d4] bg-white p-0 dark:border-zinc-700 dark:bg-zinc-900',
            zoomable && 'cursor-zoom-in transition-shadow hover:shadow-md',
          )}
        >
          <img
            src={src}
            alt={alt}
            loading="lazy"
            className="block h-auto w-full"
            draggable={false}
          />
        </button>
        {caption && (
          <figcaption className="mt-1 text-center text-[10.5px] text-[#6b6b6b] dark:text-zinc-400">
            {caption}
          </figcaption>
        )}
      </figure>
      {zoomed && (
        <div
          role="dialog"
          aria-label={alt}
          onClick={() => setZoomed(false)}
          className="fixed inset-0 z-[120] flex cursor-zoom-out items-center justify-center bg-black/70 p-8 backdrop-blur-sm"
        >
          <img
            src={src}
            alt={alt}
            className="max-h-full max-w-full rounded-md shadow-2xl"
            draggable={false}
          />
        </div>
      )}
    </>
  );
}
