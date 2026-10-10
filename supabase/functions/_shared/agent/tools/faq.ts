// Answers the owner saved, newest first, capped so one chatty store can't bloat every call.
const FAQ_MAX_ENTRIES = 40;
const FAQ_MAX_CHARS = 6000;
export function formatFaq(entries: { question: string; answer: string }[]) {
  const out: { question: string; answer: string }[] = [];
  let chars = 0;
  for (const e of entries.slice(0, FAQ_MAX_ENTRIES)) {
    const item = { question: e.question.slice(0, 200), answer: e.answer.slice(0, 600) };
    chars += item.question.length + item.answer.length;
    if (chars > FAQ_MAX_CHARS) break;
    out.push(item);
  }
  return out;
}
