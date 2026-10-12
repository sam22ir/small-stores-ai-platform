import { Skeleton } from "@heroui/react";
import { useI18n } from "../lib/i18n";

// Placeholder app shell (header bar and a few blocks) shown while the app or the session loads,
// so the first paint is not a blank screen. Announced to screen readers as a busy status.
export function AppShellSkeleton() {
  const { t } = useI18n();
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="min-h-screen bg-paper">
      <span className="sr-only">{t("common.loading")}</span>
      <div className="flex h-14 items-center gap-3 border-b-2 border-ink/10 px-4" aria-hidden="true">
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-28 rounded-full" />
        <Skeleton className="ms-auto h-8 w-20 rounded-full" />
      </div>
      <div className="flex flex-col gap-4 p-4" aria-hidden="true">
        <Skeleton className="h-6 w-2/5 rounded-full" />
        <Skeleton className="h-11 w-full rounded-wakil" />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-24 shrink-0 rounded-full" />
          <Skeleton className="h-11 w-24 shrink-0 rounded-full" />
          <Skeleton className="h-11 w-24 shrink-0 rounded-full" />
        </div>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-wakil" />
        ))}
      </div>
    </div>
  );
}
