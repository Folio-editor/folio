type Props = {
  label: string;
  heading: string;
  id?: string;
};

export function ChapterHead({ label, heading, id }: Props) {
  return (
    <div className="chapter-head" id={id}>
      <div className="chapter-head-inner">
        <div className="chapter-label">{label}</div>
        <h2 className="chapter-heading">{heading}</h2>
      </div>
    </div>
  );
}
