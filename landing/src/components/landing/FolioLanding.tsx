import { useEffect, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { TopNav } from './TopNav';
import { Hero } from './Hero';
import { LoginRequiredModal } from './LoginRequiredModal';
import { PrologueLabel } from './PrologueLabel';
import { ProseSection } from './ProseSection';
import { ChapterHead } from './ChapterHead';
import { ToolSection } from './ToolSection';
import { DeviceSyncMockup } from './mockups/DeviceSyncMockup';
import { EditorMockup } from './mockups/EditorMockup';
import { AiStudioMockup } from './mockups/AiStudioMockup';
import { FeaturesAutoCarousel } from './FeaturesAutoCarousel';
import { FlowSection } from './FlowSection';
import { PricingSection } from './PricingSection';
import { FAQSection } from './FAQSection';
import { FinFooter } from './FinFooter';
import { ScrollToTopButton } from './ScrollToTopButton';
import { TOOLS, type ToolMockupKey } from '../../data/landing-content';
import { trackLandingEvent } from '../../lib/analytics';

import '../../styles/landing.css';

gsap.registerPlugin(ScrollTrigger);

const MOCKUPS: Record<ToolMockupKey, React.ComponentType> = {
  devicesync: DeviceSyncMockup,
  editor: EditorMockup,
  aistudio: AiStudioMockup,
};

export function FolioLanding() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    trackLandingEvent('landing_viewed', {
      platform: 'web',
      utm_source: params.get('utm_source') ?? undefined,
      utm_campaign: params.get('utm_campaign') ?? undefined,
    });
  }, []);

  // 에디터에서 비인증 redirect 시 ?login=1 → 모달 자동 노출 후 쿼리 정리
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === '1') {
      setLoginOpen(true);
      params.delete('login');
      const next = params.toString();
      const newUrl =
        window.location.pathname +
        (next ? `?${next}` : '') +
        window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  useGSAP(
    () => {
      const reduced = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      if (reduced) return;

      gsap.utils.toArray<HTMLElement>('.fill-line').forEach((line) => {
        gsap.to(line, {
          backgroundSize: '200% 100%',
          ease: 'none',
          scrollTrigger: {
            trigger: line,
            start: 'top 82%',
            end: 'top 40%',
            scrub: 0.6,
          },
        });
      });

      gsap.utils.toArray<HTMLElement>('.reveal-on-scroll').forEach((el) => {
        gsap.to(el, {
          opacity: 1,
          y: 0,
          duration: 0.9,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 70%',
            toggleActions: 'play none none reverse',
          },
        });
      });
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="folio-landing">
      <TopNav />
      <Hero onRequestLogin={() => setLoginOpen(true)} />
      <PrologueLabel />
      <ProseSection />

      <ChapterHead
        label="Chapter I · 도구"
        heading="작가에게 꼭 필요한 것만."
        id="features"
      />
      {TOOLS.map((t) => {
        const Mockup = MOCKUPS[t.mockup];
        return (
          <ToolSection
            key={t.keyword}
            number={t.number}
            keyword={t.keyword}
            oneline={t.oneline}
            features={t.features}
            mockup={<Mockup />}
          />
        );
      })}

      <FeaturesAutoCarousel />

      <FlowSection />
      <PricingSection />
      <FAQSection />
      <FinFooter />
      <ScrollToTopButton />

      <LoginRequiredModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
