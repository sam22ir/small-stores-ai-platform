# Re-run grader instructions

Read SPEC.md and fixture.json (scripts/stress/fixture.json) first. Each item in your input file is a case that FAILED once and was run again. You get: the case (with expectations), the ORIGINAL verdict (class, tag, severity, reason, evidence) and the NEW transcript of this re-run (turns with replies, tools, handoff info).

For each item answer ONLY: did this re-run show the same defect as the original verdict? Judge the new transcript against the case expectations, the SPEC and the fixture facts.

Output a JSON array to the output file named in your task, one object per item:

```
{"id", "run" (the "run" field of the item), "reproduced": true|false,
 "new_class": "pass"|"rule_violation"|"spec_gap"|"script_mismatch"|"case_error",
 "reason": "one sentence citing the new reply"}
```

reproduced=true only when the original defect (same tag) is present again. If the re-run fails differently, reproduced=false and set new_class accordingly (record it: a re-run that fails differently is an unstable failure, not a fluke). JSON only; validate that it loads and has one entry per input item. Final reply: one line "N reproduced of M".

Building the input: for each failing case, add {"run": 1 or 2, "case": ..., "original_verdict": ..., "new_result": {turns: [{customer, reply, status, tools, handoff_reason, handoff_summary}], orders, infra_error}} (46 items per file works well).
