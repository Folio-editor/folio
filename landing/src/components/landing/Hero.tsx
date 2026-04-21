export function Hero() {
  return (
    <section className="hero" id="signup">
      <div className="hero-rule" />
      <p className="hero-hook">이제, 혼자 쓰지 마세요.</p>
      <h1 className="hero-brand">Folio</h1>
      <p className="hero-sub">a writing room for serial novelists</p>
      <p className="hero-tagline">
        1화부터 AI와 함께 쌓아가는 웹소설 작업실.
        <br />
        오래 쓸수록, 작가님의 작품을 더 잘 이해합니다.
      </p>
      <div className="cta-group">
        <a href="#" className="cta cta-primary">
          무료로 시작하기
        </a>
        <a href="#features" className="cta cta-ghost">
          기능 둘러보기
        </a>
      </div>
      <div className="hero-cue sans">scroll</div>
    </section>
  );
}
