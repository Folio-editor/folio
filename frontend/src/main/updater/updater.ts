import { app, BrowserWindow } from 'electron';
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater';
import type { UpdaterState } from '../../shared/types/auth';

// 수동 트리거 모드: 사용자가 명시적으로 download/install 버튼을 눌러야만 진행한다.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

let currentState: UpdaterState = { phase: 'idle' };

/** 동일 작업 중복 호출 방지 (예: 사용자가 "확인" 버튼을 빠르게 두 번 누르는 케이스). */
let inFlight: 'check' | 'download' | null = null;

function setState(next: UpdaterState) {
  currentState = next;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('updater:state', next);
    }
  }
}

function normalizeReleaseNotes(notes: UpdateInfo['releaseNotes']): string | undefined {
  if (!notes) return undefined;
  if (typeof notes === 'string') return notes;
  // electron-builder가 multi-channel일 때 array of {version, note}로 반환할 수 있다.
  return notes
    .map((n) => (typeof n === 'string' ? n : n.note ?? ''))
    .filter(Boolean)
    .join('\n\n');
}

function toAvailableState(info: UpdateInfo): UpdaterState {
  return {
    phase: 'available',
    version: info.version,
    releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    releaseDate: info.releaseDate,
  };
}

function toErrorState(err: unknown, fallback: string): UpdaterState {
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : fallback;
  return { phase: 'error', error: message };
}

let listenersBound = false;
function bindAutoUpdaterListeners() {
  if (listenersBound) return;
  listenersBound = true;

  autoUpdater.on('checking-for-update', () => {
    setState({ phase: 'checking' });
  });
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    setState(toAvailableState(info));
  });
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    setState({ phase: 'not-available', version: info.version });
  });
  autoUpdater.on('error', (err) => {
    setState(toErrorState(err, '알 수 없는 업데이트 오류'));
  });
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    setState({
      phase: 'downloading',
      version: currentState.version,
      progress: {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      },
    });
  });
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    setState({
      phase: 'downloaded',
      version: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
    });
  });
}

function unsupportedState(): UpdaterState {
  return {
    phase: 'unsupported',
    error: '개발 빌드에서는 자동 업데이트가 비활성화됩니다',
  };
}

export function getCurrentState(): UpdaterState {
  return currentState;
}

export function getCurrentVersion(): string {
  return app.getVersion();
}

export async function checkForUpdates(): Promise<UpdaterState> {
  if (!app.isPackaged) return unsupportedState();
  if (inFlight) return currentState;

  bindAutoUpdaterListeners();
  inFlight = 'check';
  try {
    // electron-updater는 latest.yml 조회 후 자동으로 'update-available' /
    // 'update-not-available' 이벤트를 emit한다. 이벤트 리스너가 setState를 호출하므로
    // 여기서는 그저 호출만 하고 결과는 currentState를 반환한다.
    await autoUpdater.checkForUpdates();
    return currentState;
  } catch (err) {
    const errState = toErrorState(err, '업데이트 확인에 실패했습니다');
    setState(errState);
    return errState;
  } finally {
    inFlight = null;
  }
}

export async function downloadUpdate(): Promise<UpdaterState> {
  if (!app.isPackaged) return unsupportedState();
  if (inFlight === 'download') return currentState;
  if (currentState.phase !== 'available' && currentState.phase !== 'error') {
    // available 이 아니면 다운로드 의미가 없다. UI에서 가드하지만 보호 차원.
    return currentState;
  }

  bindAutoUpdaterListeners();
  inFlight = 'download';
  try {
    await autoUpdater.downloadUpdate();
    return currentState;
  } catch (err) {
    const errState = toErrorState(err, '업데이트 다운로드에 실패했습니다');
    setState(errState);
    return errState;
  } finally {
    inFlight = null;
  }
}

/**
 * 다운로드 완료된 업데이트를 즉시 설치하고 앱을 재시작한다.
 * quitAndInstall(isSilent, isForceRunAfter):
 *  - isSilent=true:    NSIS 설치 마법사 UI 띄우지 않음 (한 번 클릭 모드).
 *  - isForceRunAfter=true: 설치 직후 새 버전을 자동 실행.
 */
export function installAndRestart(): void {
  if (!app.isPackaged) return;
  if (currentState.phase !== 'downloaded') return;
  // quitAndInstall은 호출 직후 app.quit()을 트리거한다.
  // before-quit 훅에서 tokenRefreshScheduler.stop()이 정상 호출되도록 한다.
  autoUpdater.quitAndInstall(true, true);
}
