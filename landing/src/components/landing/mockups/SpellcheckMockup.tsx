export function SpellcheckMockup() {
  return (
    <>
      <div className="mock-titlebar">
        <span className="mock-dot" />
        <span className="mock-dot" />
        <span className="mock-dot" />
        <div className="mock-tabs sans">
          <span>홈</span>
          <span className="mock-tab-active">1화(초고)</span>
          <span>등장 인물</span>
          <span>설정집</span>
        </div>
      </div>
      <div className="mock-content">
        <p>
          <span className="hl-name">서준</span>은 오랜 친구를{' '}
          <span className="typo">만낫다</span>.
          <br />
          그녀의 이름은 <span className="hl-name">이현</span>이었다.
          <br />"<span className="hl-name">하원국</span>에서 오셨군요."
          <br />
          남자는 고개를 <span className="typo">끄덕였다다</span>.
          <br />
          <br />
          <span className="mock-note">
            · 서준 · 이현 · 하원국 — 설정집 인물·지명으로 인식됨
            <br />· 만낫다 · 끄덕였다다 — 오타 2개 감지
          </span>
        </p>
      </div>
    </>
  );
}
