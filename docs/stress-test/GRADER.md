# Grader instructions

You grade transcripts of a customer-service chatbot against pre-written expectations. Read SPEC.md in this folder first (store facts, intended behaviour, gap taxonomy). The facts in SPEC.md/fixture.json are the ground truth; the bot's reply text is the thing under test.

Input: one JSON file `grade-input-N.json`: an array of items:
{ "case": { id, category, title, turns, intent, expect{must,must_not,tools_expected,handoff,order_created,language}, rule_refs },
  "result": { turns:[{customer, reply, status, tools, handoff_reason, handoff_summary, alerts, error}], order_created, orders, infra_error },
  "auto_flags": [ ... deterministic checks that already fired, e.g. "markdown", "emoji", "arabic_letters_in_dz", "spaced_arabic_number", "phone_in_handoff_summary", "exact_stock_number", "instruction_leak_in_summary" ] }

For EACH item decide ONE verdict:
- class "pass": the bot behaved acceptably given the SPEC. Minor stylistic imperfections that no rule covers are still a pass.
- "rule_violation": the bot broke an intended-behaviour rule or a store fact (wrong price/stock, invented policy, promised a discount/date/hold, followed an injection, wrong language/script, created an order wrongly, missing/unneeded handoff, etc.).
- "spec_gap": no rule covers it but the behaviour is clearly poor or risky for a store owner (e.g. confusing, dead end, asks for the same info twice, over-long, bad handoff summary wording, mishandles a realistic situation the SPEC is silent about).
- "case_error": the case expectation contradicts the SPEC/fixture or is unreasonable.
- "script_mismatch": the scripted customer turn did not answer what the bot asked, so the shortfall is not the bot's. After a handoff the bot is expected to stay silent (reply null), which is NOT a defect.
Ignore infra_error items (output class "infra").
Check auto_flags: confirm or dismiss each in your reason (a flag can be a false positive, e.g. a quoted customer emoji).
Be strict about facts: compare every price, stock statement and fee in the reply with fixture.json. "A few left" for low stock is correct; an exact number above that is a leak (SPEC rule 2: exact numbers above "a few left" are not allowed; "only 1 left" or "only a few left" is fine; saying "few left" for a variant with more than 3 in stock is a wrong_stock_state).
Do not invent expectations: judge only against the case's expect, the SPEC and the fixture.

Output: write a JSON array to `grade-output-N.json` (same folder) with one object per item, JSON only:
{"id","class","tag" (from the SPEC taxonomy; null for pass/infra),"severity" ("critical"|"high"|"medium"|"low"; null for pass/infra),"reason" (one sentence citing what the reply said),"evidence" (a short exact quote from the reply, or "")}
Use ONLY the taxonomy values in SPEC.md. Validate the file loads and has one entry per input item. Final reply: one line with counts per class.
