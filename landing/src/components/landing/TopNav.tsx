import { buildLoginUrl } from '../../lib/loginUrl';
import { useLandingAuth } from '../../lib/auth';
import { UserProfileMenu } from './UserProfileMenu';

export function TopNav() {
  const { isAuthenticated, writer } = useLandingAuth();
  // returnPath에 fromLanding=1 — 에디터가 auth_code 교환 후 랜딩으로 다시 bounce
  const loginUrl = buildLoginUrl('/?fromLanding=1');

  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link
          to="/"
          className="nav-brand"
          aria-label="Folio 홈으로"
          onClick={handleBrandClick}
        >
          <img src="/nav-logo.png" alt="Folio" className="nav-logo" />
        </Link>
        <div className="nav-links">
          <a href="/#features" className="nav-link">
            기능
          </a>
          <a href="/#pricing" className="nav-link">
            가격
          </a>
          <a href="/#faq" className="nav-link">
            문답
          </a>
          {isAuthenticated && writer ? (
            <UserProfileMenu writer={writer} />
          ) : (
            <a href={loginUrl} className="nav-cta sans">
              로그인
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
