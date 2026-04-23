export function AiStudioMockup() {
  return (
    <>
      <div className="mock-titlebar">
        <span className="mock-dot" />
        <span className="mock-dot" />
        <span className="mock-dot" />
        <div className="mock-tabs sans">
          <span>33화 저장 후</span>
          <span className="mock-tab-active">AI 작업실</span>
        </div>
      </div>
      <div className="mock-content mock-content-sm">
        <div className="mock-card">
          <div className="mock-card-label">설정 충돌 · 2건</div>
          <p className="mock-ai-line">
            <span className="mock-warn">⚠</span> 12화 '하원국'과 이번 화 '하서국'
            표기 불일치
            <br />
            <span className="mock-warn">⚠</span> 서준(왼손잡이) — 이번 화에서
            오른손 사용
          </p>
        </div>
        <div className="mock-card">
          <div className="mock-card-label">다음 화 초안 · 2개 생성됨</div>
          <p className="mock-ai-note">
            · 초안 A — 감성 · 450자
            <br />· 초안 B — 긴장 · 420자
          </p>
        </div>
        <div className="mock-card">
          <div className="mock-card-label">임포트 완료 작품</div>
          <p className="mock-ai-note">
            《백 번째 화》 32화 · 인물 12명 · 떡밥 7건
          </p>
        </div>
      </div>
    </>
  );
}
