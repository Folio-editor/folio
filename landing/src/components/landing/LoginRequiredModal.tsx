import { useEffect } from 'react';
import { buildLoginUrl } from '../../lib/loginUrl';

interface LoginRequiredModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 비인증 상태에서 에디터 진입 시도 시 노출되는 모달.
 * Google OAuth start로 보내며, returnPath에 fromLanding=1을 박아
 * 로그인 성공 후 에디터가 랜딩으로 다시 bounce하도록 한다.
 */
export function LoginRequiredModal({ open, onClose }: LoginRequiredModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // body scroll lock
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleLogin = () => {
    window.location.href = buildLoginUrl('/?fromLanding=1');
  };

  return (
    <div
      className="login-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="로그인 필요"
      onClick={onClose}
    >
      <div className="login-modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="login-modal-title">로그인이 필요합니다</h2>
        <p className="login-modal-body">
          Folio 에디터를 사용하려면 Google 계정으로 로그인해주세요.
        </p>
        <button type="button" className="login-modal-google-btn" onClick={handleLogin}>
          Google 계정으로 로그인
        </button>
        <button type="button" className="login-modal-cancel" onClick={onClose}>
          취소
        </button>
      </div>
    </div>
  );
}
