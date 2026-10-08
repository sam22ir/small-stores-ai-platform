import { useEffect } from "react";
import type { ReactNode } from "react";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 border-b divider" style={{ background: "var(--surface)", minHeight: 60 }}>
          <h2 className="text-lg font-semibold m-0" style={{ color: "var(--heading)" }}>{title}</h2>
          <button className="btn btn-icon" style={{ background: "var(--surface-2)", border: 0 }} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
