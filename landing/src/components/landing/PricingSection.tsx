import { PRICING } from '../../data/landing-content';
import { ChapterHead } from './ChapterHead';

export function PricingSection() {
  return (
    <>
      <ChapterHead
        label="Chapter III · 가격"
        heading="쓴 만큼만."
        id="pricing"
      />
      <section className="chapter">
        <div className="pricing-grid">
          {PRICING.map((p) => (
            <div
              key={p.name}
              className={`price-cell${p.featured ? ' featured' : ''}`}
            >
              <div className="price-name sans">{p.name}</div>
              <div className="price-num sans">{p.price}</div>
              <div className="price-period sans">
                {p.period ? `${p.period} · ` : ''}
                {p.sub}
              </div>
              <a href="#" className={`price-cta ${p.ctaVariant} sans`}>
                {p.cta}
              </a>
              <ul className="price-list">
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
