export function DeviceSyncMockup() {
  return (
    <div className="mock-frame sync-preview-frame">
      <img
        src="/sync-preview.png"
        alt="언제 어디서나 동기화 미리보기"
        className="mock-image"
      />
      <div className="sync-status-chip sync-status-chip-pending" aria-hidden="true">
        <div className="sync-status-label">
          <span className="sync-status-dot blue" />
          <span>1건 동기화 중</span>
        </div>
        <div className="sync-status-track">
          <div className="sync-status-fill blue" />
        </div>
      </div>
      <div className="sync-status-chip sync-status-chip-online" aria-hidden="true">
        <div className="sync-status-label">
          <span className="sync-status-dot green" />
          <span>온라인 · 최신 상태</span>
        </div>
        <div className="sync-status-track">
          <div className="sync-status-fill green" />
        </div>
      </div>
    </div>
  );
}
