// Output sanitiser for the final reply. The model sometimes prefixes a line with a stray all-caps label
// such as "VOICE:" or "ASSISTANT:" (seen after "[voice message]" in the history). Only the first and the
// last line are checked, and only "WORD:" at the very start of the line. Field labels that a summary
// legitimately uses are kept ("TOTAL: 7700 DZD"). Mixed-case labels ("Total:") and "DZD" are never touched.
const STRAY_LABEL = /^([A-Z]{2,12}):[ \t]*/;
const KEPT_LABELS = new Set(["TOTAL", "NB", "PS", "COD", "TEL", "NOM", "PRIX"]);

export function stripStrayLabels(reply: string): string {
  const lines = reply.split("\n");
  const edges = new Set([0, lines.length - 1]);
  const cleaned: string[] = [];
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = edges.has(i) ? line.match(STRAY_LABEL) : null;
    if (m && !KEPT_LABELS.has(m[1])) {
      const rest = line.slice(m[0].length);
      changed = true;
      // A line that was only the label is dropped, not left as an empty line.
      if (rest.trim() === "") continue;
      cleaned.push(rest);
      continue;
    }
    cleaned.push(line);
  }
  if (!changed) return reply;
  const out = cleaned.join("\n").trim();
  // Never return an empty reply: keep the original text instead.
  return out === "" ? reply : out;
}
