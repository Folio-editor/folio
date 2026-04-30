import { useRef, useState } from 'react';
import { editorUrl } from '../../lib/loginUrl';
import { useLandingAuth } from '../../lib/auth';
import { currentOs, trackLandingEvent } from '../../lib/analytics';
import { DownloadPopover } from './DownloadPopover';

interface HeroProps {
  /** 비인증 상태에서 "웹에서 이용하기" 클릭 시 부모(FolioLanding)에 로그인 모달 노출 요청 */
  onRequestLogin: () => void;
}

export function Hero({ onRequestLogin }: HeroProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const downloadBtnRef = useRef<HTMLButtonElement | null>(null);
  const { isAuthenticated } = useLandingAuth();

  const handleSecondaryClick = () => {
    trackLandingEvent('web_enter_clicked', {
      surface: 'hero',
      platform: 'web',
    });
    if (isAuthenticated) {
      window.location.href = editorUrl('/');
    } else {
      onRequestLogin();
    }
  };

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
        <div className="cta-download-anchor">
          <button
            ref={downloadBtnRef}
            type="button"
            onClick={() => {
              trackLandingEvent('desktop_download_clicked', {
                surface: 'hero',
                os: currentOs(),
                download_channel: 'landing_cta',
              });
              setPopoverOpen((v) => !v);
            }}
            className="cta-download"
            aria-haspopup="dialog"
            aria-expanded={popoverOpen}
          >
            <span className="cta-download-inner">앱 다운로드</span>
          </button>
          <DownloadPopover
            anchorRef={downloadBtnRef}
            open={popoverOpen}
            onClose={() => setPopoverOpen(false)}
          />
        </div>
        <button type="button" className="cta-secondary" onClick={handleSecondaryClick}>
          → 웹에서 이용하기
        </button>
      </div>
    </section>
  );
}
