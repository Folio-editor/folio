export function DeviceSyncMockup() {
  return (
    <>
      <div className="mock-titlebar">
        <span className="mock-dot" />
        <span className="mock-dot" />
        <span className="mock-dot" />
        <div className="mock-tabs sans">
          <span>내 기기</span>
          <span className="mock-tab-active">동기화 상태</span>
        </div>
      </div>
      <div className="mock-content mock-content-sm">
        <div className="mock-card">
          <div className="mock-card-label">내 기기 · 3대</div>
          <div className="mock-device-row">
            <span className="mock-device-name">데스크톱 (macOS)</span>
            <span className="mock-device-status">방금 저장됨</span>
          </div>
          <div className="mock-device-row">
            <span className="mock-device-name">iPad</span>
            <span className="mock-device-status">3분 전 동기화</span>
          </div>
          <div className="mock-device-row">
            <span className="mock-device-name">iPhone</span>
            <span className="mock-device-status offline">
              오프라인 · 2문단 작성 중
            </span>
          </div>
        </div>
        <div className="mock-card">
          <div className="mock-card-label">동기화</div>
          <div className="mock-kv-row">
            <span>마지막 동기화</span>
            <span>방금</span>
          </div>
          <div className="mock-kv-row">
            <span>대기 중 변경</span>
            <span>1건 · 온라인 복귀 시 자동</span>
          </div>
        </div>
      </div>
    </>
  );
}
