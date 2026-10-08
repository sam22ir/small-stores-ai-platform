import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { FaqModal } from "./FaqModal";
import type { FaqEntry } from "./FaqModal";

// "Answers the assistant knows": everything the owner has taught it, editable.
export function FaqEditor({ storeId }: { storeId: string }) {
  const { t } = useI18n();
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
    if (error) setFailed(true); else await load();
  }

  return (
    <section className="card p-5 mt-6 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold m-0" style={{ color: "var(--heading)" }}>{t("faq.title")}</h2>
          <p className="muted text-sm mt-1 mb-0">{t("faq.help")}</p>
        </div>
        <button className="btn btn-primary btn-small shrink-0" onClick={() => setEditing({})}>+ {t("faq.add")}</button>
      </div>
      {failed && <p className="error m-0">{t("common.error")}</p>}
      {entries && entries.length === 0 && <p className="muted m-0">{t("faq.empty")}</p>}
      <ul className="list-none p-0 m-0 flex flex-col gap-2">
        {(entries ?? []).map((e) => (
          <li key={e.id} className="rounded-xl p-3" style={{ background: "var(--surface-2)" }}>
            <div className="font-semibold">{e.question}</div>
            <div className="muted text-sm mt-1 whitespace-pre-wrap">{e.answer}</div>
            <div className="flex gap-2 mt-2">
              <button className="btn btn-small" onClick={() => setEditing({ entry: e })}>{t("common.edit")}</button>
              <button className="btn btn-small btn-danger" onClick={() => void remove(e)}>{t("common.delete")}</button>
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <FaqModal storeId={storeId} entry={editing.entry} onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }} />
      )}
    </section>
  );
}
