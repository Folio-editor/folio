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
}

/**
 * Preload contextBridge로 renderer에 노출되는 API.
 */
export interface StoryZipAuthApi {
  loginWithGoogle: () => Promise<LoginResult>;
  logout: () => Promise<void>;
  tryRestore: () => Promise<LoginResult | null>;
  getAccessToken: () => Promise<string | null>;
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
