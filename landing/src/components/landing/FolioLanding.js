import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { TOOLS } from '../../data/landing-content';
import '../../styles/landing.css';
gsap.registerPlugin(ScrollTrigger);
const MOCKUPS = {
    devicesync: DeviceSyncMockup,
    editor: EditorMockup,
    aistudio: AiStudioMockup,
};
export function FolioLanding() {
    const rootRef = useRef(null);
    const [loginOpen, setLoginOpen] = useState(false);
    // 에디터에서 비인증 redirect 시 ?login=1 → 모달 자동 노출 후 쿼리 정리
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('login') === '1') {
            setLoginOpen(true);
            params.delete('login');
            const next = params.toString();
            const newUrl = window.location.pathname +
                (next ? `?${next}` : '') +
                window.location.hash;
            window.history.replaceState({}, '', newUrl);
        }
    }, []);
    useGSAP(() => {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced)
            return;
        gsap.utils.toArray('.fill-line').forEach((line) => {
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
        gsap.utils.toArray('.reveal-on-scroll').forEach((el) => {
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
    }, { scope: rootRef });
    return (_jsxs("div", { ref: rootRef, className: "folio-landing", children: [_jsx(TopNav, {}), _jsx(Hero, { onRequestLogin: () => setLoginOpen(true) }), _jsx(PrologueLabel, {}), _jsx(ProseSection, {}), _jsx(ChapterHead, { label: "Chapter I \u00B7 \uB3C4\uAD6C", heading: "\uC791\uAC00\uC5D0\uAC8C \uAF2D \uD544\uC694\uD55C \uAC83\uB9CC.", id: "features" }), TOOLS.map((t) => {
                const Mockup = MOCKUPS[t.mockup];
                return (_jsx(ToolSection, { number: t.number, keyword: t.keyword, oneline: t.oneline, features: t.features, mockup: _jsx(Mockup, {}) }, t.keyword));
            }), _jsx(FeaturesAutoCarousel, {}), _jsx(FlowSection, {}), _jsx(PricingSection, {}), _jsx(FAQSection, {}), _jsx(FinFooter, {}), _jsx(LoginRequiredModal, { open: loginOpen, onClose: () => setLoginOpen(false) })] }));
}
