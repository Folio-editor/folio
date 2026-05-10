import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { useReviewHighlightStore } from '../../../stores/reviewHighlightStore';

const CIRCLED_NUMBERS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

function circledNumber(n: number): string {
  if (n >= 1 && n <= 20) return CIRCLED_NUMBERS[n - 1];
  return `(${n})`;
}

export interface ReviewHighlightStorage {
  lastVersion: number;
  /** 본 에디터 인스턴스가 표시 중인 episode/note id — store.episodeId 와 매칭될 때만 데코 렌더. */
  itemId: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    reviewHighlight: {
      triggerReviewHighlightRebuild: () => ReturnType;
    };
  }
}

const reviewHighlightPluginKey = new PluginKey('reviewHighlight');

/**
 * 문서의 블록 노드별 1-based 인덱스 → ProseMirror 노드 위치 매핑 생성.
 * Decoration.node는 노드의 시작(열기 태그)~끝(닫기 태그 포함) 범위를 사용한다.
 */
function buildNodeMap(doc: import('@tiptap/pm/model').Node): Map<number, { from: number; to: number }> {
  const map = new Map<number, { from: number; to: number }>();
  let lineNum = 0;

  doc.forEach((node, offset) => {
    lineNum++;
    // Decoration.node(from, to): from = 노드 직전 위치, to = 노드 직후 위치
    // doc.forEach의 offset이 그대로 Decoration.node의 from에 해당
    map.set(lineNum, { from: offset, to: offset + node.nodeSize });
  });

  return map;
}

const ReviewHighlight = Extension.create<Record<string, never>, ReviewHighlightStorage>({
  name: 'reviewHighlight',

  addStorage() {
    return { lastVersion: -1, itemId: '' };
  },

  addCommands() {
    return {
      triggerReviewHighlightRebuild:
        () =>
        ({ tr, dispatch, editor }) => {
          if (dispatch) {
            tr.setMeta(reviewHighlightPluginKey, true);
            dispatch(tr);
          }

          // focusedIndex가 있으면 해당 단락으로 스크롤
          const store = useReviewHighlightStore.getState();
          if (store.focusedIndex !== null) {
            const issue = store.issues.find((i) => i.index === store.focusedIndex);
            if (issue && issue.lines.length > 0) {
              const nodeMap = buildNodeMap(editor.state.doc);
              const range = nodeMap.get(issue.lines[0]);
              if (range) {
                setTimeout(() => {
                  const dom = editor.view.nodeDOM(range.from);
                  if (dom instanceof HTMLElement) {
                    dom.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }, 50);
              }
            }
          }

          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const extensionStorage = this.storage;

    return [
      new Plugin({
        key: reviewHighlightPluginKey,

        state: {
          init() {
            return DecorationSet.empty;
          },

          apply(tr, oldDecoSet, _oldState, newState) {
            const store = useReviewHighlightStore.getState();
            const forceRebuild = tr.getMeta(reviewHighlightPluginKey);

            if (forceRebuild || tr.docChanged || store.version !== extensionStorage.lastVersion) {
              extensionStorage.lastVersion = store.version;
              return buildDecorations(newState.doc, store);
            }

            return oldDecoSet;
          },
        },

        props: {
          decorations(state) {
            return this.getState(state) ?? DecorationSet.empty;
          },
        },
      }),
    ];

    function buildDecorations(
      doc: import('@tiptap/pm/model').Node,
      store: ReturnType<typeof useReviewHighlightStore.getState>,
    ): DecorationSet {
      const { issues, focusedIndex, episodeId } = store;

      if (issues.length === 0) return DecorationSet.empty;
      // ★ episode 격리: 다른 회차/문서의 에디터에는 데코를 그리지 않는다 (잔여물 차단).
      // store.episodeId 가 null 이면 legacy/광범위 모드 — 모든 에디터에 표시.
      if (episodeId != null && extensionStorage.itemId !== episodeId) {
        return DecorationSet.empty;
      }

      const nodeMap = buildNodeMap(doc);
      const decorations: Decoration[] = [];

      for (const issue of issues) {
        const severityClass = `review-issue-${issue.severity}`;
        const isFocused = focusedIndex === issue.index;
        let badgePlaced = false;

        for (const lineNum of issue.lines) {
          const range = nodeMap.get(lineNum);
          if (!range) continue;

          const classes = [severityClass];
          if (isFocused) classes.push('review-issue-focused');

          const attrs: Record<string, string> = {
            class: classes.join(' '),
          };

          // 첫 줄에만 번호 배지 표시 (CSS ::before로 렌더링)
          if (!badgePlaced) {
            attrs['data-review-badge'] = circledNumber(issue.index + 1);
            attrs['data-review-severity'] = issue.severity;
            badgePlaced = true;
          }

          decorations.push(Decoration.node(range.from, range.to, attrs));
        }
      }

      if (decorations.length === 0) return DecorationSet.empty;

      return DecorationSet.create(doc, decorations);
    }
  },
});

export default ReviewHighlight;
