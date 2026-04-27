// ============================================================
// 데스크탑 앱 다운로드 manifest
// ============================================================
// EC2 nginx 정적 서빙 + electron-updater 피드 호환:
//   GET https://folio-editor.co.kr/releases/win/latest.yml
//
// latest.yml은 electron-builder가 자동 생성하는 표준 manifest.
// js-yaml 의존성 없이 정규식으로 4개 핵심 필드(version/path/size/releaseDate)만 추출.
// macOS/Linux는 빌드 파이프라인 미정 — placeholder의 다른 OS row는 url=null 유지.
//
// 네트워크 실패/파일 부재/파싱 실패 → PLACEHOLDER 반환 (popover에서 "준비 중" 표시).
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

const RELEASE_BASE =
  (import.meta.env.VITE_DOWNLOAD_BASE_URL as string | undefined) ??
  'https://folio-editor.co.kr/releases/win';

const PLACEHOLDER_FILES: DownloadFile[] = [
  { os: 'windows', arch: 'x64', format: 'exe', url: null, label: 'Windows (64-bit)' },
  { os: 'macos', arch: 'arm64', format: 'dmg', url: null, label: 'macOS (Apple Silicon)' },
  { os: 'macos', arch: 'x64', format: 'dmg', url: null, label: 'macOS (Intel)' },
  { os: 'linux', arch: 'x64', format: 'AppImage', url: null, label: 'Linux (AppImage)' },
];

const PLACEHOLDER: DownloadManifest = {
  version: '준비 중',
  releasedAt: new Date().toISOString(),
  files: PLACEHOLDER_FILES,
};

interface LatestYmlMeta {
  version: string;
  path: string;
  size?: number;
  releaseDate?: string;
}

/** electron-updater latest.yml의 핵심 필드만 평탄 정규식으로 추출. */
function parseLatestYml(text: string): LatestYmlMeta | null {
  const get = (key: string): string | null => {
    // 평탄 키만 매칭 (들여쓰기 0). files: 같은 list/object 항목은 건드리지 않음.
    const m = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(text);
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : null;
  };
  const version = get('version');
  const path = get('path');
  if (!version || !path) return null;
  const sizeStr = get('size');
  const releaseDate = get('releaseDate') ?? undefined;
  const size = sizeStr ? Number(sizeStr) : undefined;
  return {
    version,
    path,
    size: Number.isFinite(size) ? size : undefined,
    releaseDate,
  };
}

/**
 * latest.yml fetch + 파싱 → DownloadManifest로 변환.
 * 실패 시 PLACEHOLDER (popover에 "준비 중" 표시).
 */
export async function fetchDownloadManifest(): Promise<DownloadManifest> {
  try {
    const res = await fetch(`${RELEASE_BASE}/latest.yml`, { cache: 'no-cache' });
    if (!res.ok) return PLACEHOLDER;
    const meta = parseLatestYml(await res.text());
    if (!meta) return PLACEHOLDER;
    return {
      version: meta.version,
      releasedAt: meta.releaseDate ?? new Date().toISOString(),
      files: [
        {
          os: 'windows',
          arch: 'x64',
          format: 'exe',
          url: `${RELEASE_BASE}/${meta.path}`,
          size: meta.size,
          label: 'Windows 10/11 (64-bit)',
        },
        // macOS/Linux 빌드 파이프라인 미정 — placeholder url=null 유지
        ...PLACEHOLDER_FILES.filter((f) => f.os !== 'windows'),
      ],
    };
  } catch {
    return PLACEHOLDER;
  }
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
