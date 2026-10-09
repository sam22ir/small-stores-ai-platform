// Decorative zellige tile pattern (conic gradients). Purely visual, hidden from assistive tech.
export function ZelligeBackground({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 text-blue opacity-[0.07] ${className}`}
      style={{
        backgroundImage:
          "conic-gradient(from 45deg at 50% 50%, currentColor 25%, transparent 0 50%, currentColor 0 75%, transparent 0)",
        backgroundSize: "28px 28px",
      }}
    />
  );
}
