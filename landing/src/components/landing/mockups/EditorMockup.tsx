export function EditorMockup() {
  return (
    <>
      <div className="mock-titlebar">
        <span className="mock-dot" />
        <span className="mock-dot" />
        <span className="mock-dot" />
        <div className="mock-tabs sans">
          <span>캐릭터</span>
          <span>플롯</span>
          <span className="mock-tab-active">원고</span>
          <span>설정집</span>
        </div>
      </div>
      <div className="mock-content">
        <p>
          주인공 <strong>서준</strong>은 오랜 친구를{' '}
          <span className="typo">만낫다</span>.
          <br />
          그녀의 이름은 <span className="hl-name">이현</span>이었다.
          <br />"<span className="hl-name">하원국</span>에서 오셨군요."
          <br />
          남자는 고개를 <em>천천히</em>{' '}
          <span className="typo">끄덕였다다</span>.
          <br />
          <br />
          <span className="mock-note">
            · 서준 · 이현 · 하원국 — 설정집으로 인식됨
            <br />· 만낫다 · 끄덕였다다 — 오타 2개 감지
          </span>
        </p>
      </div>
    </>
  );
}
