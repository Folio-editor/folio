import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { TopNav } from './TopNav';
import { Hero } from './Hero';
import { PrologueLabel } from './PrologueLabel';
import { ProseSection } from './ProseSection';
import { ChapterHead } from './ChapterHead';
import { ToolSection } from './ToolSection';
import { AiInspectionMockup } from './mockups/AiInspectionMockup';
import { SpellcheckMockup } from './mockups/SpellcheckMockup';
import { ImportAutoOrganizeMockup } from './mockups/ImportAutoOrganizeMockup';
import { FeaturesAutoCarousel } from './FeaturesAutoCarousel';
import { FlowSection } from './FlowSection';
import { PricingSection } from './PricingSection';
import { FAQSection } from './FAQSection';
import { FinFooter } from './FinFooter';
import { TOOLS, type ToolMockupKey } from '../../data/landing-content';

import '../../styles/landing.css';

gsap.registerPlugin(ScrollTrigger);

const MOCKUPS: Record<ToolMockupKey, React.ComponentType> = {
  aiinspection: AiInspectionMockup,
  spellcheck: SpellcheckMockup,
  importorganize: ImportAutoOrganizeMockup,
};

export function FolioLanding() {
  const rootRef = useRef<HTMLDivElement>(null);

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
      <Hero />
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
            metric={t.metric}
            mockup={<Mockup />}
          />
        );
      })}

      <FeaturesAutoCarousel />

      <FlowSection />
      <PricingSection />
      <FAQSection />
      <FinFooter />
    </div>
  );
}
