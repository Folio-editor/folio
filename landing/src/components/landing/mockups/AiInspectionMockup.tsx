export function AiInspectionMockup() {
  return (
    <>
      <div className="mock-titlebar">
        <span className="mock-dot" />
        <span className="mock-dot" />
        <span className="mock-dot" />
        <div className="mock-tabs sans">
          <span>33화 저장 후</span>
          <span className="mock-tab-active">AI 검수 결과</span>
        </div>
      </div>
      <div className="mock-content mock-content-sm">
        <div className="mock-card">
          <div className="mock-card-label">설정 충돌 · 2건</div>
          <p>
            <span className="mock-warn">⚠</span> 12화에서 '하원국' 출신이라
            했는데, 이번 화는 '하서국' 표기
          </p>
          <p style={{ marginTop: '0.4rem' }}>
            <span className="mock-warn">⚠</span> 서준은 왼손잡이로 설정됐는데,
            이번 화에서 오른손으로 검을 듦
          </p>
        </div>
        <div className="mock-card">
          <div className="mock-card-label">회수 대기 떡밥 · 3건</div>
          <p className="mock-note">
            · 32화 "옛 약속" — 25화째 미회수
            <br />· 18화 "붉은 편지" — 15화째 미회수
            <br />· 7화 "사라진 아이" — 26화째 미회수
          </p>
        </div>
      </div>
    </>
  );
}
