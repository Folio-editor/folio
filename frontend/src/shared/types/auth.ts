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
export interface FolioAuthApi {
  loginWithGoogle: () => Promise<LoginResult>;
  logout: () => Promise<void>;
  tryRestore: () => Promise<LoginResult | null>;
  getAccessToken: () => Promise<string | null>;
  /** 게스트 UUID 반환. 없으면 생성 후 userData에 저장. */
  getGuestId: () => Promise<string>;
  /**
   * 마지막으로 로그인했던 사용자의 writerId.
   * 로그아웃 / 앱 재시작 이후에도 로컬 데이터를 계속 표시하기 위한 참조값.
   * 로그인 경험이 없으면 null.
   */
  getLastKnownWriterId: () => Promise<string | null>;
  /**
   * sync 의사결정이 확정된 사용자의 writerId를 영속 저장한다.
   * resolveSyncDecision 성공 후 renderer가 호출.
   */
  commitLastKnownWriterId: (writerId: string) => Promise<void>;
  /**
   * Main 프로세스의 proactive token refresh가 최종 실패(RT 거부/재시도 초과)했을 때
   * 알림을 받는다. 반환되는 함수를 호출해 구독을 해지한다.
   */
  onSessionExpired: (callback: () => void) => () => void;
}

/**
 * 윈도우/프레임 제어 API. Electron 전용 — 웹에서는 no-op.
 * frame: false 환경에서 커스텀 TitleBar가 OS 창 컨트롤(min/max/close)을 호출.
 */
export interface FolioWindowApi {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  /** maximize/unmaximize 상태 변화 구독. 반환 함수 호출로 해지. */
  onMaximizeChanged: (callback: (maximized: boolean) => void) => () => void;
  /** OS 플랫폼. 커스텀 TitleBar가 Windows/macOS 분기에 사용. */
  platform: 'win32' | 'darwin' | 'linux' | 'web';
}

export interface FolioOneTimePaymentParams {
  clientKey: string;
  amount: number;
  orderId: string;
  orderName: string;
  customerKey: string;
}

export interface FolioOneTimePaymentResult {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export interface FolioBillingAuthParams {
  clientKey: string;
  customerKey: string;
}

export interface FolioBillingAuthResult {
  authKey: string;
  customerKey: string;
}

export interface FolioPaymentApi {
  openOneTime: (
    params: FolioOneTimePaymentParams,
  ) => Promise<FolioOneTimePaymentResult>;
  openBillingAuth: (
    params: FolioBillingAuthParams,
  ) => Promise<FolioBillingAuthResult>;
}

/** OS spellchecker 사전 동기화 — 렌더러가 사용자 추가 단어 set을 main에 푸시 */
export interface FolioSpellcheckApi {
  syncWords: (words: string[]) => Promise<void>;
}

/**
 * 앱 자동 업데이트 (수동 트리거).
 * 사용자가 명시적으로 "확인/다운로드/설치" 버튼을 누를 때만 진행.
 */
export type UpdaterPhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  /** 패키징 안 된 dev 빌드 또는 web 플랫폼 */
  | 'unsupported';

export interface UpdaterDownloadProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface UpdaterState {
  phase: UpdaterPhase;
  /** 발견되거나 설치 대기 중인 새 버전 */
  version?: string;
  releaseNotes?: string;
  releaseDate?: string;
  progress?: UpdaterDownloadProgress;
  error?: string;
}

export interface FolioUpdaterApi {
  /** 현재 설치된 앱 버전 (package.json#version 기반) */
  getCurrentVersion: () => Promise<string>;
  /** 새 버전 메타데이터 조회. 자동 다운로드는 하지 않는다. */
  check: () => Promise<UpdaterState>;
  /** 새 버전 바이너리 다운로드. download-progress 이벤트가 onStateChange로 push 된다. */
  download: () => Promise<UpdaterState>;
  /** 다운로드 완료된 업데이트를 즉시 설치하고 앱을 재시작한다. */
  installAndRestart: () => Promise<void>;
  /**
   * 메인 프로세스가 push 하는 상태 변화 구독.
   * 반환되는 함수를 호출해 구독을 해지한다.
   */
  onStateChange: (callback: (state: UpdaterState) => void) => () => void;
}

export interface FolioApi {
  platform: 'electron' | 'web';
  auth: FolioAuthApi;
  window: FolioWindowApi;
  spellcheck: FolioSpellcheckApi;
  payment: FolioPaymentApi;
  updater: FolioUpdaterApi;
}

declare global {
  interface Window {
    folio: FolioApi;
  }
}
