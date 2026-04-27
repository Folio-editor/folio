import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, ExternalLink } from 'lucide-react';
import type { Writer } from '../../lib/auth';
import { clearLandingAuth } from '../../lib/auth';
import { editorUrl, apiBase } from '../../lib/loginUrl';

interface UserProfileMenuProps {
  writer: Writer;
}

/**
 * 우측 상단 로그인 버튼 자리에 인증 시 노출되는 프로필 메뉴.
 * - 트리거: avatar(이미지 또는 이니셜) + 닉네임
 * - dropdown: 에디터 열기 / 로그아웃
 */
export function UserProfileMenu({ writer }: UserProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleEditor = () => {
    window.location.href = editorUrl('/');
  };

  const handleLogout = async () => {
    setOpen(false);
    // 백엔드에 로그아웃 알림 (RT 무효화) — 실패해도 로컬 정리는 진행
    try {
      const rt = localStorage.getItem('folio:web:rt');
      if (rt) {
        await fetch(`${apiBase()}/auth/web/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
      }
    } catch {
      /* 네트워크 실패 무시 */
    }
    clearLandingAuth();
    window.location.reload();
  };

  const initial = (writer.nickname ?? writer.email ?? '?').trim().charAt(0).toUpperCase();
  const displayName = writer.nickname ?? writer.email;

  return (
    <div className="user-profile-menu">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="user-profile-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {writer.profileImageUrl ? (
          <img
            src={writer.profileImageUrl}
            alt=""
            className="user-profile-avatar"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="user-profile-avatar user-profile-avatar-initial">{initial}</span>
        )}
        <span className="user-profile-name">{displayName}</span>
        <ChevronDown size={14} strokeWidth={1.8} />
      </button>

      {open && (
        <div ref={menuRef} role="menu" className="user-profile-dropdown">
          <button type="button" role="menuitem" onClick={handleEditor} className="user-profile-item">
            <ExternalLink size={14} strokeWidth={1.8} />
            <span>에디터 열기</span>
          </button>
          <div className="user-profile-divider" />
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleLogout()}
            className="user-profile-item user-profile-item-danger"
          >
            <LogOut size={14} strokeWidth={1.8} />
            <span>로그아웃</span>
          </button>
        </div>
      )}
    </div>
  );
}
