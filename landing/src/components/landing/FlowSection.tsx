import { STEPS } from '../../data/landing-content';
import { ChapterHead } from './ChapterHead';

export function FlowSection() {
  return (
    <>
      <ChapterHead label="Chapter II · 흐름" heading="1화부터 함께 쌓습니다." />
      <section className="chapter">
        <div className="flow">
          {STEPS.map((s) => (
            <div className="flow-row" key={s.num}>
              <div className="flow-num sans">{s.num}</div>
              <div className="flow-key">{s.label}</div>
              <div className="flow-desc">{s.body}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
