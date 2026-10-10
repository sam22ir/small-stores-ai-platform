// Wakil logo: shop-bag mark (optional) plus the Arabic name with the Latin brand beside it.
export function Logo({ className = "", latin = true, mark = true }: { className?: string; latin?: boolean; mark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold text-ink ${className}`}>
      {mark && (
        <svg aria-hidden="true" viewBox="13 18 96 96" className="h-[1.6em] w-[1.6em] shrink-0">
          <path d="M44 44 V36 Q44 22 60 22 Q76 22 76 36 V44" fill="none" stroke="#1D2A44" strokeWidth="4" strokeLinecap="round" />
          <path d="M26 44 H94 L90 100 Q89 106 83 106 H37 Q31 106 30 100 Z" fill="#1D2A44" transform="translate(5 5)" />
          <path d="M26 44 H94 L90 100 Q89 106 83 106 H37 Q31 106 30 100 Z" fill="#FFFDF6" stroke="#1D2A44" strokeWidth="4" strokeLinejoin="round" />
          <rect x="38" y="56" width="44" height="30" rx="10" fill="#1F4FA3" />
          <path d="M48 84 L44 96 L58 85 Z" fill="#1F4FA3" />
          <circle cx="49" cy="71" r="3.2" fill="#FFFDF6" />
          <circle cx="60" cy="71" r="3.2" fill="#FFFDF6" />
          <circle cx="71" cy="71" r="3.2" fill="#FFFDF6" />
        </svg>
      )}
      <span className="inline-flex items-baseline gap-2">
        <span lang="ar" className="text-xl leading-none">وكيل</span>
        {latin && <span className="text-sm font-semibold tracking-wide text-blue">Wakil</span>}
      </span>
    </span>
  );
}
