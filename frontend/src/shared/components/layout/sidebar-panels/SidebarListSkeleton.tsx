export function SidebarListSkeleton() {
  return (
    <div className="space-y-1 px-1 py-2" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-8 rounded-md bg-muted/45"
          style={{ width: `${82 - index * 9}%` }}
        />
      ))}
    </div>
  );
}
