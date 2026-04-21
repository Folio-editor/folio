import { FAQ } from '../../data/landing-content';
import { ChapterHead } from './ChapterHead';

export function FAQSection() {
  return (
    <>
      <ChapterHead
        label="Chapter IV · 문답"
        heading="궁금한 게 있나요?"
        id="faq"
      />
      <section className="chapter">
        <div className="faq-list">
          {FAQ.map((item, i) => (
            <details className="faq-item" key={item.q}>
              <summary>
                <span className="faq-num sans">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="faq-q">{item.q}</span>
                <span className="faq-short sans">{item.short}</span>
                <span className="faq-toggle sans" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="faq-a">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
