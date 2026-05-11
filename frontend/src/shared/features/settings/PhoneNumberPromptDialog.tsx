import { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { Button } from '../../components/ui/Button';

const STORAGE_KEY = 'folio:web:customer-phone';

/**
 * 결제 시점에 사용자 휴대폰 번호를 입력받는 1회성 모달.
 *
 * <p>Google OAuth 는 휴대폰 번호를 scope 로 제공하지 않고, Folio 의 Writer 엔티티에도
 * 휴대폰 컬럼이 없다. 그런데 KG이니시스 V2 일반결제는 customer.phoneNumber 를 필수로
 * 요구한다(미입력 시 "구매자 휴대폰 번호는 필수 입력입니다" 에러). 결제 직전에 사용자에게
 * 직접 받고, "다음 결제부터 자동 입력" 옵션으로 localStorage 에 캐시한다.
 *
 * <p>실연동 전환 후 Phase B 에서 Writer 프로필에 휴대폰 컬럼 추가하면 이 모달은 폐기 가능.
 */

/**
 * 저장된 휴대폰 번호 읽기 — null 이면 모달 표시 필요.
 */
export function readSavedPhoneNumber(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * 휴대폰 번호 저장 (다음 결제부터 자동 입력 체크 시).
 */
export function savePhoneNumber(phone: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, phone);
  } catch {
    /* localStorage 접근 실패 — 저장 포기, 다음 결제에도 다시 입력받음 */
  }
}

/**
 * 저장된 휴대폰 번호 삭제 — 설정에서 "결제 정보 초기화" 등.
 */
export function clearSavedPhoneNumber(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * 입력값을 표준 형식(010-XXXX-XXXX) 으로 정규화.
 * 숫자만 추출 후 11자리(010 으로 시작) 형식으로 변환.
 */
function normalizePhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('010')) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10 && digits.startsWith('01')) {
    // 011, 016 등 옛 번호 — 길이가 10 자리
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw.trim();
}

function isValidKoreanPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return (
    (digits.length === 11 && digits.startsWith('010')) ||
    (digits.length === 10 && /^01[16-9]/.test(digits))
  );
}

export function PhoneNumberPromptDialog({
  open,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  onSubmit: (phone: string, remember: boolean) => void;
  onCancel: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 모달 열릴 때 입력 초기화
  useEffect(() => {
    if (open) {
      setPhone('');
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = () => {
    if (!isValidKoreanPhone(phone)) {
      setError('010 또는 011/016/017/018/019 로 시작하는 휴대폰 번호를 입력해주세요.');
      return;
    }
    const normalized = normalizePhoneNumber(phone);
    onSubmit(normalized, remember);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <Phone size={14} strokeWidth={1.8} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">휴대폰 번호 입력</h3>
        </div>

        <div className="px-5 py-4">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            결제 영수증 발급을 위해 휴대폰 번호가 필요합니다.<br />
            결제 외 용도로는 사용하지 않습니다.
          </p>

          <input
            type="tel"
            inputMode="tel"
            autoFocus
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
            placeholder="010-1234-5678"
            className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />

          {error && (
            <div className="mt-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              {error}
            </div>
          )}

          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[11px] text-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="cursor-pointer"
            />
            <span>다음 결제부터 자동 입력</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button size="sm" variant="outline" onClick={onCancel}>
            취소
          </Button>
          <Button size="sm" onClick={handleSubmit}>
            확인
          </Button>
        </div>
      </div>
    </div>
  );
}
