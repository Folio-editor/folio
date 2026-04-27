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

        <div className="faq-contact">
          <p className="faq-contact-label sans">문의사항이 있으신가요?</p>
          <p className="faq-contact-body">
            <a
              href="https://open.kakao.com/o/s5cjeQri"
              target="_blank"
              rel="noopener noreferrer"
              className="sans"
            >
              카카오톡 오픈채팅
            </a>
            으로 편하게 문의 주세요.
          </p>
        </div>
      </section>
    </>
  );
}
