import { useEffect, useRef, useState } from 'react';

/**
 * Controlled input의 stale value 문제를 회피하기 위한 훅.
 *
 * 매 키 입력마다 외부 store(SQLite/PowerSync)에 쓰면, 비동기 write 후
 * useQuery가 새 값을 emit하기 전까지 React가 Input value를 옛 값으로
 * 다시 그리면서 한글 IME 조합 깨짐 / 키 중복 입력이 발생한다.
 *
 * 패턴:
 *   - 입력은 로컬 state(draft)로만 받는다
 *   - itemId가 바뀌면 draft를 외부 sourceValue로 리셋
 *   - commit()은 onBlur/Enter 시점에만 호출
 *
 * 사용 예:
 *   const title = useDeferredText(id, item.title, (v) => updatePlot(id, { title: v }));
 *   <Input value={title.value} onChange={(e) => title.onChange(e.target.value)} onBlur={title.onBlur} />
 */
export function useDeferredText(
  itemId: string,
  sourceValue: string,
  onCommit: (value: string) => void,
) {
  const [draft, setDraft] = useState(sourceValue);
  const lastIdRef = useRef(itemId);
  const lastSourceRef = useRef(sourceValue);

  // itemId 변경 시 draft 리셋 (다른 항목으로 이동)
  useEffect(() => {
    if (lastIdRef.current !== itemId) {
      lastIdRef.current = itemId;
      lastSourceRef.current = sourceValue;
      setDraft(sourceValue);
    }
  }, [itemId, sourceValue]);

  // 동일 itemId에서 sourceValue가 외부 동기화로 바뀐 경우 — 사용자가 편집 중이 아니면 반영
  useEffect(() => {
    if (lastIdRef.current === itemId && lastSourceRef.current !== sourceValue) {
      lastSourceRef.current = sourceValue;
      // 사용자가 입력 중인 상태(draft != lastSource였던 값)는 덮어쓰지 않는다
      setDraft((prev) => (prev === lastSourceRef.current ? prev : sourceValue));
    }
  }, [itemId, sourceValue]);

  const commit = () => {
    const trimmed = draft;
    if (trimmed === sourceValue) return;
    lastSourceRef.current = trimmed;
    onCommit(trimmed);
  };

  return {
    value: draft,
    onChange: setDraft,
    onBlur: commit,
    /** Enter 등으로 즉시 커밋이 필요할 때 */
    commit,
  };
}
