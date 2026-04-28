import { Link } from 'react-router-dom';

export function FinFooter() {
  return (
    <footer className="fin">
      <div className="fin-rule" />

      <div className="fin-business sans">
        <p className="fin-business-brand">
          <strong>폴리오 (Folio)</strong>
        </p>
        <p>
          대표자: 권혁준 <span className="fin-sep">|</span> 사업자등록번호:
          264-43-01314
        </p>
        <p>통신판매업 신고번호: 신고 후 기재</p>
        <p>사업장: 경기도 수원시 권선구 덕영대로 1323번길 25-30</p>
        <p>
          문의:{' '}
          <a
            href="https://open.kakao.com/o/s5cjeQri"
            target="_blank"
            rel="noopener noreferrer"
          >
            카카오톡 오픈채팅
          </a>{' '}
          <span className="fin-sep">·</span>{' '}
          <a href="mailto:2square.f203@gmail.com">2square.f203@gmail.com</a>
        </p>
        <p>
          대표전화: <a href="tel:070-8064-7879">070-8064-7879</a>
        </p>
        <p>운영시간: 평일 10:00 ~ 18:00 (주말·공휴일 휴무)</p>
        <p className="fin-business-notice">
          ※ 빠른 응대를 위해 카카오톡 오픈채팅 또는 이메일로 문의 부탁드립니다.
        </p>
      </div>

      <nav className="fin-policy sans" aria-label="정책 안내">
        <Link to="/terms">이용약관</Link>
        <span className="fin-sep">|</span>
        <Link to="/privacy">개인정보처리방침</Link>
        <span className="fin-sep">|</span>
        <Link to="/refund">결제·환불정책</Link>
      </nav>

      <p className="fin-copyright sans">© 2026 Folio. All rights reserved.</p>
    </footer>
  );
}
