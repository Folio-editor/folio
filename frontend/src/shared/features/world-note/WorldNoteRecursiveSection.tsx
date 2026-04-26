import {
  memo,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { useLocalWrite } from '../../hooks/useLocalWrite';
import { cn } from '../../lib/cn';
import { useDragZoneStore } from '../../lib/dragZoneStore';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../../components/ui/context-menu';
import { WorldNoteInlineEditor } from './WorldNoteInlineEditor';

export interface TreeNode {
  id: string;
  work_id: string;
  name: string;
  content: string | null;
  parent_id: string | null;
  sort_order: number;
  depth: number;
  children: TreeNode[];
}

interface Props {
  node: TreeNode;
  depth: number;
  workId: string;
  onRequestDelete: (node: TreeNode) => void;
}

export const WorldNoteRecursiveSection = memo(
  function WorldNoteRecursiveSection({
    node,
    depth,
    workId,
    onRequestDelete,
  }: Props) {
    const isRoot = depth === 0;
    // 통합 뷰의 sortable id는 사이드바와 충돌 방지 위해 prefix
    // (handleDndEnd는 data.docId(raw id)로 placement 호출하므로 prefix 영향 X)
    const sortableId = `recursive:${node.id}`;
    const {
      attributes,
      listeners,
      setNodeRef,
      isDragging,
    } = useSortable({
      id: sortableId,
      disabled: isRoot,
      data: {
        type: 'tree-node',
        docType: 'world_note',
        docId: node.id,
        depth,
        parentId: node.parent_id,
        title: node.name,
        sortOrder: node.sort_order ?? 0,
        rowSnapshot: {
          id: node.id,
          name: node.name,
          content: node.content,
          work_id: node.work_id,
          parent_id: node.parent_id,
          sort_order: node.sort_order ?? 0,
        },
      },
    });
    const zoneInfo = useDragZoneStore((s) =>
      s.overId === node.id ? s.zone : null,
    );

    const style = {
      opacity: isDragging ? 0 : 1,
      paddingLeft: depth > 0 ? Math.min(depth, 6) * 16 : undefined,
    };

    const headingClass =
      depth === 0
        ? 'text-3xl'
        : depth === 1
          ? 'text-xl'
          : depth === 2
            ? 'text-lg'
            : 'text-base';
    const bodySize: 'base' | 'sm' | 'xs' =
      depth === 0 ? 'base' : depth >= 3 ? 'xs' : 'sm';

    return (
      <section
        ref={setNodeRef}
        style={style}
        className={cn('relative', depth > 0 && 'mt-3')}
      >
        {!isRoot && zoneInfo === 'before' && (
          <div className="pointer-events-none absolute inset-x-0 -top-px h-0.5 bg-primary z-10" />
        )}
        <NodeBody
          node={node}
          depth={depth}
          isRoot={isRoot}
          workId={workId}
          dragAttributes={attributes}
          dragListeners={listeners}
          isMergeOver={zoneInfo === 'merge'}
          headingClass={headingClass}
          bodySize={bodySize}
          onRequestDelete={onRequestDelete}
        />

        {/* 자식 재귀 */}
        {node.children.length > 0 && (
          <SortableContext
            items={node.children.map((c) => `recursive:${c.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {node.children.map((child) => (
              <WorldNoteRecursiveSection
                key={child.id}
                node={child}
                depth={depth + 1}
                workId={workId}
                onRequestDelete={onRequestDelete}
              />
            ))}
          </SortableContext>
        )}

        {!isRoot && zoneInfo === 'after' && (
          <div className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 bg-primary z-10" />
        )}
      </section>
    );
  },
  // 안전장치 B: shallow prop 비교 — node reference 동일하면 skip
  (prev, next) =>
    prev.node === next.node &&
    prev.depth === next.depth &&
    prev.workId === next.workId &&
    prev.onRequestDelete === next.onRequestDelete,
);

interface NodeBodyProps {
  node: TreeNode;
  depth: number;
  isRoot: boolean;
  workId: string;
  dragAttributes: DraggableAttributes;
  dragListeners: SyntheticListenerMap | undefined;
  isMergeOver: boolean;
  headingClass: string;
  bodySize: 'base' | 'sm' | 'xs';
  onRequestDelete: (node: TreeNode) => void;
}

/** 노드 본체 — 제목 + 본문 + ContextMenu + chevron + 자식 추가 input */
function NodeBody({
  node,
  isRoot,
  workId,
  dragAttributes,
  dragListeners,
  isMergeOver,
  headingClass,
  bodySize,
  onRequestDelete,
}: NodeBodyProps) {
  const { updateWorldNoteName, updateWorldNoteContent, createWorldNote } =
    useLocalWrite();

  const [draftName, setDraftName] = useState(node.name);
  const [bodyExpanded, setBodyExpanded] = useState(true);
  const [creatingChild, setCreatingChild] = useState(false);

  useEffect(() => {
    setDraftName(node.name);
  }, [node.name]);

  const commitName = () => {
    const next = draftName.trim();
    if (!next || next === node.name) {
      setDraftName(node.name);
      return;
    }
    void updateWorldNoteName(node.id, next.slice(0, 200));
  };

  const handleCreateChild = async (name: string) => {
    setCreatingChild(false);
    if (!name.trim()) return;
    await createWorldNote(workId, name.trim(), Date.now(), node.id);
  };

  // root는 항상 본문 표시. 자식은 chevron 토글
  const showBody = isRoot || bodyExpanded;
  // chevron은 자식 노드에서만 (root는 항상 펼침)
  const showChevron = !isRoot;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          {...(isRoot ? {} : dragAttributes)}
          {...(isRoot ? {} : dragListeners)}
          className={cn(
            'group rounded-md',
            isMergeOver && 'bg-primary/10 ring-1 ring-primary',
          )}
        >
          {/* 제목 행 */}
          <div className="flex items-center gap-1.5">
            {showChevron && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setBodyExpanded((v) => !v);
                }}
                title={bodyExpanded ? '본문 접기' : '본문 펴기'}
                aria-label={bodyExpanded ? '본문 접기' : '본문 펴기'}
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {bodyExpanded ? (
                  <ChevronDown size={14} strokeWidth={1.75} />
                ) : (
                  <ChevronRight size={14} strokeWidth={1.75} />
                )}
              </button>
            )}

            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value.replace(/\n/g, ''))}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="제목"
              maxLength={200}
              data-note-title-id={node.id}
              className={cn(
                'min-w-0 flex-1 border-none bg-transparent px-0 font-bold text-foreground outline-none placeholder:text-muted-foreground/40',
                headingClass,
              )}
            />

            {/* hover '+' — 하위 추가 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCreatingChild(true);
              }}
              title="하위 문서 추가"
              aria-label="하위 문서 추가"
              className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
            >
              <Plus size={14} strokeWidth={1.75} />
            </button>
          </div>

          {/* 본문 */}
          {showBody && (
            <div className="mt-2">
              <WorldNoteInlineEditor
                noteId={node.id}
                initialContent={node.content}
                placeholder="여기에 내용을 작성하세요…"
                onUpdate={(json) => void updateWorldNoteContent(node.id, json)}
                size={bodySize}
              />
            </div>
          )}

          {/* 인라인 자식 추가 input */}
          {creatingChild && (
            <div className="mt-2">
              <InlineCreateInput
                placeholder="하위 문서 이름"
                onConfirm={(name) => void handleCreateChild(name)}
                onCancel={() => setCreatingChild(false)}
              />
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => setCreatingChild(true)}>
          <Plus size={12} /> 하위 추가
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            // 제목 input focus 이동
            requestAnimationFrame(() => {
              const inputs = document.querySelectorAll<HTMLInputElement>(
                `input[data-note-title-id="${node.id}"]`,
              );
              inputs[0]?.focus();
              inputs[0]?.select();
            });
          }}
        >
          <Pencil size={12} /> 이름 변경
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem destructive onSelect={() => onRequestDelete(node)}>
          <Trash2 size={12} /> 삭제
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function InlineCreateInput({
  placeholder,
  onConfirm,
  onCancel,
}: {
  placeholder: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm(value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value.trim()) onConfirm(value);
        else onCancel();
      }}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      maxLength={200}
      className="w-full rounded-md border border-ring bg-background px-2 py-1 text-sm text-foreground outline-none ring-1 ring-ring placeholder:text-muted-foreground"
    />
  );
}
