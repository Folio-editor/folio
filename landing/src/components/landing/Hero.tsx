import { buildLoginUrl } from '../../lib/loginUrl';

export function Hero() {
  // 웹 에디터 진입 = 백엔드 OAuth start로 이동
  const loginUrl = buildLoginUrl('/');
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
        <a href={loginUrl} className="cta-download">
          <span className="cta-download-inner">웹에서 시작</span>
        </a>
        <p className="cta-download-caption">데스크탑 앱은 곧 제공 예정</p>
      </div>
    </section>
  );
}
