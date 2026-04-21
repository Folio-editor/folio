type ResultItem = {
  count: string;
  name: string;
  sample: string;
};

const RESULTS: ResultItem[] = [
  { count: '12명', name: '인물', sample: '서준 · 이현 · 하원국 왕 …' },
  { count: '5개', name: '지명', sample: '하원국 · 세비타 해협 …' },
  { count: '7건', name: '떡밥', sample: '옛 약속 · 붉은 편지 …' },
  { count: '32개', name: '회차 요약', sample: '각 3~5문장 자동 생성' },
];

export function ImportAutoOrganizeMockup() {
  return (
    <>
      <div className="mock-titlebar">
        <span className="mock-dot" />
        <span className="mock-dot" />
        <span className="mock-dot" />
        <div className="mock-tabs sans">
          <span>원고 임포트</span>
          <span className="mock-tab-active">자동 정리 완료</span>
        </div>
      </div>
      <div className="mock-content mock-content-sm">
        <div className="mock-import-head">
          <span className="mock-import-title">
            《백 번째 화》 임포트 완료
          </span>
          <span className="mock-import-meta sans">32화 · 128,000자</span>
        </div>
        <div className="mock-card subtle">
          <p className="mock-import-banner">
            <span className="mock-check">✓</span>설정집 자동 정리 ·{' '}
            <strong>4개 카테고리</strong>
          </p>
        </div>
        <div className="mock-result-grid">
          {RESULTS.map((r) => (
            <div className="mock-result-item" key={r.name}>
              <div className="mock-result-count sans">{r.count}</div>
              <div className="mock-result-name sans">{r.name}</div>
              <div className="mock-result-sample">{r.sample}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
