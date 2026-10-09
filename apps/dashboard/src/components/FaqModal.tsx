import { useState } from "react";
import type { FormEvent } from "react";
import { Alert, Button, Label, TextArea, TextField } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { Modal } from "./Modal";

export type FaqEntry = { id: string; question: string; answer: string };

// Add or edit one answer the assistant can use. Also opened from a chat ("save this answer"),
// prefilled with the customer's question and the owner's reply.
export function FaqModal({ storeId, entry, initialQuestion = "", initialAnswer = "", conversationId, onClose, onSaved }: {
  storeId: string;
  entry?: FaqEntry;
  initialQuestion?: string;
  initialAnswer?: string;
  conversationId?: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [question, setQuestion] = useState(entry?.question ?? initialQuestion);
  const [answer, setAnswer] = useState(entry?.answer ?? initialAnswer);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const q = question.trim(), a = answer.trim();
    if (!q) return setError(t("faq.errQuestion"));
    if (!a) return setError(t("faq.errAnswer"));
    setBusy(true); setError(null);
    const { error: err } = entry
      ? await supabase.from("faq_entries").update({ question: q, answer: a }).eq("id", entry.id)
      : await supabase.from("faq_entries").insert({ store_id: storeId, question: q, answer: a, conversation_id: conversationId ?? null });
    if (err) { setError(t("common.error")); setBusy(false); return; }
    await onSaved();
  }

  return (
    <Modal title={entry ? t("faq.edit") : t("faq.add")} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <TextField value={question} onChange={setQuestion} maxLength={300} autoFocus className="w-full">
          <Label>{t("faq.question")}</Label>
          <TextArea id="faq-q" rows={2} />
        </TextField>
        <TextField value={answer} onChange={setAnswer} maxLength={1500} className="w-full">
          <Label>{t("faq.answer")}</Label>
          <TextArea id="faq-a" rows={4} />
        </TextField>
        {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onPress={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="primary" isDisabled={busy}>{t("common.save")}</Button>
        </div>
      </form>
    </Modal>
  );
}
