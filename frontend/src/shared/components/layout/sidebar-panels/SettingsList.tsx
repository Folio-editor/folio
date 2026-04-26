import { CreditCard, Palette, Type } from 'lucide-react';
import { cn } from '../../../lib/cn';

export type SettingsItemId = 'theme' | 'font' | 'payment';

const SETTINGS_ITEMS: { id: SettingsItemId; label: string; icon: typeof Palette }[] = [
  { id: 'theme', label: '색상 테마', icon: Palette },
  { id: 'font', label: '폰트 설정', icon: Type },
  { id: 'payment', label: '결제/구독', icon: CreditCard },
];

interface SettingsListProps {
  selectedItemId: SettingsItemId | null;
  onItemSelect: (id: SettingsItemId) => void;
}

export function SettingsList({ selectedItemId, onItemSelect }: SettingsListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
      {SETTINGS_ITEMS.map((item) => {
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
