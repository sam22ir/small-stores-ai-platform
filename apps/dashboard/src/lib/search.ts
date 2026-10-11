// Builds a PostgREST or() filter that matches the text, case-insensitively, in any of the columns.
// LIKE wildcards in the text (% _ \) are literal, * is dropped (it is PostgREST's wildcard), and the
// value is double-quoted so commas and parentheses in the text cannot break the filter.
export function ilikeOr(columns: readonly string[], term: string): string {
  const like = term.replace(/\*/g, "").replace(/[\\%_]/g, "\\$&");
  const quoted = `"*${like.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}*"`;
  return columns.map((c) => `${c}.ilike.${quoted}`).join(",");
}
