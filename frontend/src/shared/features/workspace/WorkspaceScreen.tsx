import { useState } from 'react';

interface WorkspaceScreenProps {
  onCreateWork: (title: string) => Promise<void>;
}

/**
 * 작품이 선택되지 않았을 때 표시되는 초기 화면.
 */
export function WorkspaceScreen({ onCreateWork }: WorkspaceScreenProps) {
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showInput, setShowInput] = useState(false);

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setIsCreating(true);
    try {
      await onCreateWork(trimmed);
      setTitle('');
      setShowInput(false);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void handleCreate();
    if (e.key === 'Escape') {
      setShowInput(false);
      setTitle('');
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">워크스페이스를 선택하거나 새로 만드세요</h2>
        <p className="mt-2 text-sm text-gray-500">
          좌측 사이드바에서 작품을 선택하거나, 아래 버튼으로 새 작품을 만들 수 있습니다.
        </p>
      </div>

      {showInput ? (
        <div className="flex w-full max-w-sm flex-col gap-2">
          <input
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="작품 제목을 입력하세요"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!title.trim() || isCreating}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isCreating ? '생성 중…' : '만들기'}
            </button>
            <button
              type="button"
              onClick={() => { setShowInput(false); setTitle(''); }}
              className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowInput(true)}
          className="rounded-lg border-2 border-dashed border-gray-300 px-8 py-4 text-sm font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600"
        >
          + 새 작품 만들기
        </button>
      )}
    </div>
  );
}
