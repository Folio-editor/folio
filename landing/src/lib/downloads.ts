// ============================================================
// 데스크탑 앱 다운로드 manifest
// ============================================================
// 현 단계: placeholder. popover UI/UX 검증용으로 OS 목록만 노출.
// 인프라 후속 plan 완료 후 fetchDownloadManifest()를 백엔드 프록시
// (GET ${VITE_API_URL}/downloads/manifest) fetch로 교체 예정.
// ============================================================

export type DownloadOs = 'windows' | 'macos' | 'linux';
export type DownloadArch = 'x64' | 'arm64' | 'universal';
export type DownloadFormat = 'exe' | 'dmg' | 'AppImage';

export interface DownloadFile {
  os: DownloadOs;
  arch: DownloadArch;
  format: DownloadFormat;
  /** null이면 popover에서 disabled + "준비 중" 표시 */
  url: string | null;
  size?: number;
  label?: string;
}

export interface DownloadManifest {
  version: string;
  releasedAt: string;
  files: DownloadFile[];
}

const PLACEHOLDER: DownloadManifest = {
  version: '준비 중',
  releasedAt: new Date().toISOString(),
  files: [
    { os: 'windows', arch: 'x64', format: 'exe', url: null, label: 'Windows (64-bit)' },
    { os: 'macos', arch: 'arm64', format: 'dmg', url: null, label: 'macOS (Apple Silicon)' },
    { os: 'macos', arch: 'x64', format: 'dmg', url: null, label: 'macOS (Intel)' },
    { os: 'linux', arch: 'x64', format: 'AppImage', url: null, label: 'Linux (AppImage)' },
  ],
};

/**
 * 현재는 정적 placeholder 반환.
 * 인프라 plan 완료 후 백엔드 프록시 fetch로 교체.
 */
export async function fetchDownloadManifest(): Promise<DownloadManifest> {
  return PLACEHOLDER;
}

export function osLabel(os: DownloadOs): string {
  switch (os) {
    case 'windows':
      return 'Windows';
    case 'macos':
      return 'macOS';
    case 'linux':
      return 'Linux';
  }
}

export function osIcon(os: DownloadOs): string {
  switch (os) {
    case 'windows':
      return '🪟';
    case 'macos':
      return '🍎';
    case 'linux':
      return '🐧';
  }
}

export function formatBytes(bytes?: number): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}
