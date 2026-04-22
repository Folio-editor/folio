import { LayoutGrid, List } from 'lucide-react';
import { cn } from '../../lib/cn';

interface ViewToggleProps {
  mode: 'grid' | 'list';
  onChange: (mode: 'grid' | 'list') => void;
}

export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center rounded-md border border-border">
      <button
        type="button"
        onClick={() => onChange('list')}
        title="리스트 보기"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-l-md transition-colors',
          mode === 'list'
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <List size={14} />
      </button>
      <button
        type="button"
        onClick={() => onChange('grid')}
        title="그리드 보기"
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-r-md transition-colors',
          mode === 'grid'
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <LayoutGrid size={14} />
      </button>
    </div>
  );
}
