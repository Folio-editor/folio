export function Hero() {
  return (
    <section className="hero" id="signup">
      <div className="hero-rule" />
      <p className="hero-hook">이제, 혼자 쓰지 마세요.</p>
      <img
        src="/hero-title.png"
        alt="Folio — Where your stories come to life."
        className="hero-image"
      />
      <div className="cta-download-group">
        <a href="#" className="cta-download">
          <span className="cta-download-inner">Download</span>
        </a>
        <p className="cta-download-caption">Windows · iOS</p>
      </div>
    </section>
  );
}
