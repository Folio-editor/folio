/**
 * plan 액티비티 전용 보조 사이드바 콘텐츠.
 * 기획은 작품당 1:1 이므로 리스트가 없고, 안내만 표시한다.
 */
export function PlanPanel() {
  return (
    <div className="flex flex-col gap-2 px-4 py-4">
      <p className="text-xs leading-relaxed text-gray-500">
        기획서는 작품당 1개만 존재합니다.
        <br />
        우측 편집 영역에서 바로 작성하세요.
      </p>
    </div>
  );
}
