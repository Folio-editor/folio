import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ExportDialog } from './ExportDialog';

interface ExportButtonProps {
  workId: string;
  /** 단일 에피소드 컨텍스트(예: 에디터 헤더)에서 진입할 때 미리 선택할 episode id */
  initialEpisodeId?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function ExportButton({
  workId,
  initialEpisodeId,
  size = 'sm',
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size={size}
        onClick={() => setOpen(true)}
        disabled={!workId}
        title="내보내기"
      >
        <Download className="h-4 w-4" />
        내보내기
      </Button>
      {open && (
        <ExportDialog
          workId={workId}
          {...(initialEpisodeId ? { initialEpisodeId } : {})}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
