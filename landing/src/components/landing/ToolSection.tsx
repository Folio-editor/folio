import type { ReactNode } from 'react';

type Props = {
  number: string;
  keyword: string;
  oneline: string;
  metric: ReactNode;
  mockup: ReactNode;
};

export function ToolSection({
  number,
  keyword,
  oneline,
  metric,
  mockup,
}: Props) {
  return (
    <section className="tool-section reveal-on-scroll">
      <div className="tool-inner">
        <div className="tool-mockup">{mockup}</div>
        <div className="tool-text">
          <div className="tool-num sans">{number}</div>
          <h3 className="tool-keyword">{keyword}</h3>
          <p className="tool-oneline">{oneline}</p>
          <div className="tool-metric">{metric}</div>
        </div>
      </div>
    </section>
  );
}
