import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Alert, Button, toast } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { FaqModal } from "./FaqModal";
import type { FaqEntry } from "./FaqModal";

// "Answers the assistant knows": everything the owner has taught it, editable.
export function FaqEditor({ storeId }: { storeId: string }) {
  const { t } = useI18n();
  const reduced = useMotionSafe();
  const [entries, setEntries] = useState<FaqEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<{ entry?: FaqEntry } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("faq_entries").select("id,question,answer").order("created_at", { ascending: false });
    if (error) { setFailed(true); return; }
    setEntries(data); setFailed(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function remove(e: FaqEntry) {
    if (!window.confirm(t("faq.confirmDelete"))) return;
    const { error } = await supabase.from("faq_entries").delete().eq("id", e.id);
    if (error) { setFailed(true); toast.danger(t("common.error")); }
    else { setEntries((all) => all && all.filter((x) => x.id !== e.id)); await load(); }
  }

  return (
    <section className="mt-6 flex flex-col gap-3 rounded-wakil-lg border-2 border-ink bg-slip p-5 shadow-ink-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold m-0" style={{ color: "var(--heading)" }}>{t("faq.title")}</h2>
          <p className="mb-0 mt-1 text-sm text-soft">{t("faq.help")}</p>
        </div>
        <Button size="sm" variant="primary" className="shrink-0" onPress={() => setEditing({})}>+ {t("faq.add")}</Button>
      </div>
      {failed && <Alert status="danger"><Alert.Content><Alert.Description>{t("common.error")}</Alert.Description></Alert.Content></Alert>}
      {entries && entries.length === 0 && <p className="m-0 text-soft">{t("faq.empty")}</p>}
      <ul className="list-none p-0 m-0 flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {(entries ?? []).map((e) => (
            <m.li
              key={e.id}
              layout={!reduced}
              initial={reduced ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: dur.short, ease: ease.out }}
              className="rounded-xl p-3"
              style={{ background: "var(--surface-2)" }}
            >
              <div className="font-semibold">{e.question}</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-soft">{e.answer}</div>
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="outline" onPress={() => setEditing({ entry: e })}>{t("common.edit")}</Button>
                <Button size="sm" variant="ghost" className="text-red" onPress={() => void remove(e)}>{t("common.delete")}</Button>
              </div>
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
      {editing && (
        <FaqModal storeId={storeId} entry={editing.entry} onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); toast.success(t("common.saved")); await load(); }} />
      )}
    </section>
  );
}
