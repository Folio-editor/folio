import { PROSE, WHISPER } from '../../data/landing-content';

export function ProseSection() {
  return (
    <section className="prose">
      {PROSE.map((paragraph, pIdx) => (
        <p key={pIdx}>
          {paragraph.map((line, lIdx) => (
            <span key={lIdx} className="fill-line">
              {line}
            </span>
          ))}
        </p>
      ))}
      <p className="whisper">
        {WHISPER.map((line, lIdx) => (
          <span key={lIdx} className="fill-line">
            {line}
          </span>
        ))}
      </p>
    </section>
  );
}
