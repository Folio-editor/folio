export function TopNav() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <a href="#" className="nav-brand" aria-label="Folio">
          <img src="/nav-logo.png" alt="Folio" className="nav-logo" />
        </a>
        <div className="nav-links">
          <a href="#features" className="nav-link">
            기능
          </a>
          <a href="#pricing" className="nav-link">
            가격
          </a>
          <a href="#faq" className="nav-link">
            문답
          </a>
          <a href="#signup" className="nav-cta sans">
            무료로 시작
          </a>
        </div>
      </div>
    </nav>
  );
}
