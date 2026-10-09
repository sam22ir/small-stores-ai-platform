// Wakil wordmark: the Arabic name with the Latin brand beside it.
export function Logo({ className = "", latin = true }: { className?: string; latin?: boolean }) {
  return (
    <span className={`inline-flex items-baseline gap-2 font-bold text-ink ${className}`}>
      <span lang="ar" className="text-xl leading-none">وكيل</span>
      {latin && <span className="text-sm font-semibold tracking-wide text-blue">Wakil</span>}
    </span>
  );
}
