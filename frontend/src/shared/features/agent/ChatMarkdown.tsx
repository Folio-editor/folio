/**
 * Agent 채팅 버블 안에서 Markdown 을 렌더하는 경량 뷰어.
 *
 * - 대화창은 위지윅 에디터(TipTap) 가 아니므로 react-markdown 으로 직접 렌더.
 * - GFM (~~취소선~~, 표, 체크박스, autolink) 활성.
 * - rawHTML 비허용 (react-markdown 기본 동작) — XSS 차단.
 * - 버블 색 (bg-primary / bg-sidebar-accent) 위에서 가독성 위해 강조 마크 색상 inherit.
 *
 * propose_* content 필드에 들어가는 Markdown (백엔드가 TipTap 으로 변환 후 저장) 과 형식 동일
 * 하므로, 도구가 출력한 답변 텍스트도 같은 문법으로 자연스럽게 강조된다.
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  text: string;
  /** 사용자 버블 (bg-primary) 인 경우 link/code 색상을 다르게 처리할지 — 현재 사용 X. */
  variant?: 'assistant' | 'user';
}

export function ChatMarkdown({ text, variant = 'assistant' }: Props) {
  return (
    <div className={cn(MARKDOWN_PROSE, variant === 'user' && 'text-primary-foreground')}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // 보안: rawHTML 비허용. react-markdown 기본은 이미 sanitize.
        components={{
          // 헤딩 — 버블 안에서 너무 크지 않게 다운사이징
          h1: ({ children }) => <h3 className="mt-1 mb-1 text-sm font-bold">{children}</h3>,
          h2: ({ children }) => <h4 className="mt-1 mb-1 text-sm font-semibold">{children}</h4>,
          h3: ({ children }) => <h5 className="mt-1 mb-0.5 text-xs font-semibold">{children}</h5>,
          h4: ({ children }) => <h6 className="mt-0.5 text-xs font-semibold">{children}</h6>,
          h5: ({ children }) => <span className="font-semibold">{children}</span>,
          h6: ({ children }) => <span className="font-semibold">{children}</span>,
          // 단락 — margin 줄여 버블 안 텍스트 밀집
          p: ({ children }) => <p className="my-1 first:mt-0 last:mb-0 leading-relaxed">{children}</p>,
          ul: ({ children }) => (
            <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-1 border-l-2 border-current/30 pl-2 italic opacity-90">
              {children}
            </blockquote>
          ),
          // react-markdown v10: inline code 와 fenced code 모두 본 컴포넌트로 옴.
          // pre 안의 code 는 부모 pre 컴포넌트가 박스 스타일 처리 → 여기선 폰트만.
          code: ({ children, ...rest }) => (
            <code className="rounded bg-current/10 px-1 py-0.5 font-mono text-[0.85em]" {...rest}>
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="my-1 overflow-x-auto rounded bg-current/10 p-2 text-[0.85em]">
              {children}
            </pre>
          ),
          hr: () => <hr className="my-2 border-current/20" />,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

// Tailwind prose 모듈 미설치 환경에서도 동작하도록 자체 prose 클래스.
const MARKDOWN_PROSE = 'whitespace-normal break-words text-sm';

// classnames 헬퍼 (cn 모듈 import 줄이기 위해 inline)
function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
