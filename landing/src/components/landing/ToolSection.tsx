import type { ReactNode } from 'react';

type Props = {
  number: string;
  keyword: string;
  oneline: string;
  features: string[];
  mockup: ReactNode;
};

export function ToolSection({
  number,
  keyword,
  oneline,
  features,
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
          <ul className="tool-features">
            {features.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
