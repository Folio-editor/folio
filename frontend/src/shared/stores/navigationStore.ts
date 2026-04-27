import { create } from 'zustand';
import type { SettingsItemId } from '../components/layout/sidebar-panels/SettingsList';

/**
 * 화면 전환 요청을 깊은 자식 컴포넌트가 AuthenticatedApp으로 전달하기 위한 이벤트 채널.
 * AuthenticatedApp이 useEffect로 pendingSettingsItem을 구독해 settings 모드로 진입하고
 * 처리 후 clearPendingSettings()를 호출한다.
 */
interface NavigationState {
  pendingSettingsItem: SettingsItemId | null;
  openSettings: (item: SettingsItemId) => void;
  clearPendingSettings: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  pendingSettingsItem: null,
  openSettings: (item) => set({ pendingSettingsItem: item }),
  clearPendingSettings: () => set({ pendingSettingsItem: null }),
}));
