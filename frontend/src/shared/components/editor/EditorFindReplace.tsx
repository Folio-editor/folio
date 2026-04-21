import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { ChevronUp, ChevronDown, X } from 'lucide-react';
import { Input } from '../ui/Input';
import { cn } from '../../lib/cn';

interface EditorFindReplaceProps {
  editor: Editor;
  open: boolean;
  onClose: () => void;
}

export default function EditorFindReplace({
  editor,
  open,
  onClose,
}: EditorFindReplaceProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [showReplace, setShowReplace] = useState(false);

  const storage = (editor.storage as any).findReplace as {
    searchTerm: string;
    replaceTerm: string;
    results: { from: number; to: number }[];
    currentIndex: number;
  };

  const searchTerm = storage.searchTerm;
  const replaceTerm = storage.replaceTerm;
  const results = storage.results;
  const currentIndex = storage.currentIndex;

  useEffect(() => {
    if (open) {
      // Small delay to allow render before focus
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  const handleClose = () => {
    editor.commands.clearSearch();
    setShowReplace(false);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-popover px-3 py-2 flex-wrap">
      {/* Search row */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <Input
          ref={searchRef}
          type="text"
          placeholder="찾기..."
          value={searchTerm}
          onChange={(e) => editor.commands.setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.shiftKey
                ? editor.commands.prevMatch()
                : editor.commands.nextMatch();
            }
            if (e.key === 'Escape') handleClose();
          }}
          className="h-7 w-48 text-sm"
        />

        <span className="text-xs text-muted-foreground whitespace-nowrap min-w-16 text-center">
          {results.length > 0
            ? `${currentIndex + 1}/${results.length}`
            : searchTerm
              ? '결과 없음'
              : ''}
        </span>

        <button
          type="button"
          onClick={() => editor.commands.prevMatch()}
          title="이전 결과"
          className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ChevronUp size={14} />
        </button>
        <button
          type="button"
          onClick={() => editor.commands.nextMatch()}
          title="다음 결과"
          className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ChevronDown size={14} />
        </button>

        <button
          type="button"
          onClick={() => setShowReplace((v) => !v)}
          title="바꾸기 표시"
          className={cn(
            'h-7 px-2 rounded text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
            showReplace && 'bg-accent text-accent-foreground',
          )}
        >
          바꾸기
        </button>

        <button
          type="button"
          onClick={handleClose}
          title="닫기"
          className="h-7 w-7 rounded flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Replace row */}
      {showReplace && (
        <div className="flex items-center gap-1.5 w-full">
          <Input
            type="text"
            placeholder="바꾸기..."
            value={replaceTerm}
            onChange={(e) => editor.commands.setReplaceTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') handleClose();
            }}
            className="h-7 w-48 text-sm"
          />
          <button
            type="button"
            onClick={() => editor.commands.replaceCurrentMatch()}
            title="바꾸기"
            className="h-7 px-2 rounded text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            바꾸기
          </button>
          <button
            type="button"
            onClick={() => editor.commands.replaceAllMatches()}
            title="모두 바꾸기"
            className="h-7 px-2 rounded text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            모두 바꾸기
          </button>
        </div>
      )}
    </div>
  );
}
