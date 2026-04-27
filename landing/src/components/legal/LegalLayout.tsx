import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TopNav } from '../landing/TopNav';
import { FinFooter } from '../landing/FinFooter';

import '../../styles/landing.css';
import '../../styles/legal.css';

interface LegalLayoutProps {
  title: string;
  effectiveDate?: string;
  children: ReactNode;
}

export function LegalLayout({
  title,
  effectiveDate,
  children,
}: LegalLayoutProps) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · Folio`;
    window.scrollTo(0, 0);
    return () => {
      document.title = prev;
    };
  }, [title]);

  return (
    <div className="folio-landing legal-page">
      <TopNav />

      <main className="legal-main">
        <div className="legal-container">
          <Link to="/" className="legal-back sans">
            ← Folio 홈으로
          </Link>

          <header className="legal-header">
            <h1 className="legal-title">{title}</h1>
            {effectiveDate && (
              <p className="legal-effective sans">시행일 · {effectiveDate}</p>
            )}
          </header>

          <article className="legal-content">{children}</article>
        </div>
      </main>

      <FinFooter />
    </div>
  );
}
