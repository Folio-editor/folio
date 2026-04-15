export type Role = 'USER' | 'PREMIUM' | 'ADMIN';

export interface Writer {
  id: string;
  email: string;
  nickname: string | null;
  profileImageUrl: string | null;
  role: Role;
}

export interface LoginResult {
  accessToken: string;
  writer: Writer;
  /**
   * 이번 로그인에서 writer가 새로 생성됐는지.
   * - 신규 로그인: 백엔드 LoginResponse.isNewUser
   * - 자동 복원(tryRestore): 이미 결정 끝난 기존 사용자이므로 항상 false
   */
  isNewUser: boolean;
}

/**
 * Preload contextBridge로 renderer에 노출되는 API.
 */
export interface StoryZipAuthApi {
  loginWithGoogle: () => Promise<LoginResult>;
  logout: () => Promise<void>;
  tryRestore: () => Promise<LoginResult | null>;
  getAccessToken: () => Promise<string | null>;
  /** 게스트 UUID 반환. 없으면 생성 후 userData에 저장. */
  getGuestId: () => Promise<string>;
}

export interface StoryZipApi {
  platform: 'electron' | 'web';
  auth: StoryZipAuthApi;
}

declare global {
  interface Window {
    storyzip: StoryZipApi;
  }
}
