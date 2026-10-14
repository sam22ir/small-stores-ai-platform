# Assistant stress test (500 cases)

A repeatable way to find gaps in the Wakil assistant before customers do. It replays scripted customer
conversations through the REAL inbound pipeline (`handleInbound`, prompt, tools, tool loop) against an
in-memory copy of a store, sends the model calls to the configured provider, and records transcripts. Judges
(sub-agents or people) then grade each transcript against written expectations and file the failures in one
fixed taxonomy.

Read order for a new session: this file, then `GAPS.md` (latest results and the prioritised gap list), then
`SPEC.md` (what counts as intended behaviour) and `GRADER.md` (how grading is done).

## Files

| File | What it is |
|---|---|
| `docs/stress-test/GAPS.md` | The prioritised gap list from the latest run, with case ids as evidence. |
| `docs/stress-test/SPEC.md` | Store facts, the intended-behaviour rules (design choices that are NOT gaps), the case JSON format, the result record format and the gap taxonomy (class, tag, severity). |
| `docs/stress-test/GRADER.md` | Instructions given to every grader: how to judge, what output to write. |
| `docs/stress-test/RERUN_GRADER.md` | Instructions for re-judging re-runs of failing cases ("same defect again?"). |
| `docs/stress-test/results/` | Merged verdicts and the failing-case table with reproducibility counts from the 2026-10-13 run. |
| `scripts/stress-agent.mjs`, `scripts/stress/*.mjs` | The runner: fresh in-memory DB per case, fake order/delivery ports that enforce the production constraints, owner alerts captured instead of sent, retry/resume logic. |
| `scripts/stress/fixture.json` | The store the cases run against (products, stock, delivery fees, store info, FAQ). |
| `scripts/stress/cases/cases-*.json` | The 500 cases (product_stock 100, ordering 100, policies 60, handoff 60, language 60, adversarial 60, noise 60). |
| `scripts/stress/chunk-for-grading.py` | Merges cases with transcripts, adds deterministic `auto_flags`, splits into `grade-input-N.json` files for graders. |

## How to run it again

1. Update `scripts/stress/fixture.json` if the store data should differ (it mirrors the "algeria testing account" test store).
2. Probe the model first (one tiny call). Run with a clean environment so no other secret can leak into the process; pass the model settings only:

```bash
env -i PATH="$PATH" HOME=/tmp \
  LLM_PROVIDER=openai-compatible LLM_BASE_URL='<url>' LLM_API_KEY='<key>' LLM_MODEL='<model>' \
  LLM_TOKEN_PARAM=max_completion_tokens LLM_REASONING_EFFORT=none LLM_VISION=true \
  SUPABASE_URL=https://example.supabase.co \
  node scripts/stress-agent.mjs --probe
```

3. Pilot a few cases (`--ids PS-001,OR-001,...`), read the transcripts by hand, then run everything. Add `--resume` to continue an interrupted run; infra errors (429/5xx/timeouts) are retried and recorded as `infra_error`, never graded:

```bash
env -i ...same variables... node scripts/stress-agent.mjs \
  --cases 'scripts/stress/cases/cases-*.json' --fixture scripts/stress/fixture.json \
  --out /tmp/stress-results.jsonl --concurrency 4 --resume
```

4. Build grader inputs, then give each `grade-input-N.json` to one grader (a sub-agent works well) together with `GRADER.md` and `SPEC.md`; each writes `grade-output-N.json`:

```bash
python3 scripts/stress/chunk-for-grading.py scripts/stress/cases /tmp/stress-results.jsonl /tmp/stress-grading 50
```

5. Merge the verdicts, re-run each failing case twice more, and have graders re-judge the re-runs with `RERUN_GRADER.md` (it asks only "did this re-run show the same defect?"). Failures that repeat 3/3 are real; 1/3 may be a fluke or a different failure. Write the new `GAPS.md`.
6. **Save the raw results** (`results-full.jsonl`, the two re-run files, the grader outputs) into `docs/stress-test/results/<date>/` before closing the session. After the first run they were only in a temporary folder and were lost, so the appendix rows of `GAPS.md` can no longer be re-checked against transcripts.

Rules that matter:
- Never write the API key to a file or commit it. Never give it to a sub-agent. The runner never logs headers or env values; `grep -c 'sk-'` the output directory before graders see it.
- It makes real model calls and costs tokens. The measured cost is about 5,300 input tokens and 80 output tokens per customer turn, roughly 4.3 million input tokens for all 500 cases (about 815 turns). A full run took about 25 minutes at concurrency 4 on the relay.
- Use a fresh state per case (the runner does this). Stock is tiny in the fixture (Basket 42 has 1 left), so shared state would make later cases unfair.

## Known limits of this test (so results are read correctly)

- The runner does not reproduce: debounce bursts, Postgres `ILIKE` search (it uses substring matching, so accents and Arabic may differ), billing/credit/token limits, Meta delivery, vision input, owner hand-back, row locking, the 20-row history cap (cases are at most 6 turns).
- Scripted customer turns cannot react to the bot. Mismatches are classed `script_mismatch`, not bot failures.
- The cases average only 1.5 customer turns; only the ordering flows are long. Multi-turn behaviour (lost context, repeated questions) is under-tested. A good next addition is adaptive customer turns written by a model.
- The store info in the fixture is nearly empty (only opening hours), so policy answers are mostly "ask the owner". Re-run with a fully filled store to test answering from owner notes.
- Photos are queued by the tool but never sent through Meta here.
- The judges are language models: spot-check a sample of their verdicts before acting on a single case.
