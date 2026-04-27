import { CREDIT_PACKS, PRICING } from '../../data/landing-content';
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
                {p.features.map((f) => {
                  const isSub = f.startsWith('└');
                  return (
                    <li key={f} className={isSub ? 'price-list-sub' : ''}>
                      {isSub ? f.replace(/^└\s*/, '') : f}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="credit-section">
          <p className="credit-section-label sans">
            구독 없이 한 번만 충전하고 싶다면
          </p>
          <div className="credit-grid">
            {CREDIT_PACKS.map((pack) => (
              <a
                key={pack.price}
                href="#"
                className="credit-card"
                aria-label={`${pack.price} 크레딧 구매하기`}
              >
                <div className="credit-price sans">{pack.price}</div>
                <div className="credit-amount sans">{pack.credit}</div>
                <div className="credit-bonus sans">{pack.bonus}</div>
                <span className="credit-card-cta sans">구매하기 →</span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
