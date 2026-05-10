import { CreditCard, Info, Palette, ShieldCheck, Type, User } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { isAdminEntryPointAccessible } from '../../../lib/adminApi';

export type SettingsItemId = 'account' | 'theme' | 'font' | 'payment' | 'about' | 'admin-refunds';

const BASE_ITEMS: { id: SettingsItemId; label: string; icon: typeof Palette }[] = [
  { id: 'account', label: '계정', icon: User },
  { id: 'theme', label: '색상 테마', icon: Palette },
  { id: 'font', label: '폰트 설정', icon: Type },
  { id: 'payment', label: '결제/구독', icon: CreditCard },
  { id: 'about', label: '앱 정보 / 업데이트', icon: Info },
];

/**
 * 운영자 메뉴 — 다음 중 하나일 때만 표시:
 * 1) URL 에 ?admin=1 쿼리 (운영자가 직접 진입 경로 알고 입력)
 * 2) localStorage 에 admin token 이미 저장됨 (이전에 진입한 적 있음)
 *
 * <p>일반 사용자는 둘 다 해당 안 되어 메뉴 자체가 안 보인다.
 * 토큰 검증은 페이지 진입 시 실제 API 호출에서 수행.
 */
const ADMIN_ITEMS: { id: SettingsItemId; label: string; icon: typeof Palette }[] = [
  { id: 'admin-refunds', label: '환불 검토 (운영자)', icon: ShieldCheck },
];

interface SettingsListProps {
  selectedItemId: SettingsItemId | null;
  onItemSelect: (id: SettingsItemId) => void;
}

export function SettingsList({ selectedItemId, onItemSelect }: SettingsListProps) {
  const items = isAdminEntryPointAccessible() ? [...BASE_ITEMS, ...ADMIN_ITEMS] : BASE_ITEMS;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = selectedItemId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onItemSelect(item.id)}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs transition-colors',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
            )}
          >
            <Icon size={15} strokeWidth={1.75} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
