# Usage: python3 scripts/stress/chunk-for-grading.py <cases-dir> <results.jsonl> <out-dir> [chunk-size]
# Merges each case with its transcript and adds deterministic auto_flags, then writes grade-input-N.json files
# for the graders described in docs/stress-test/GRADER.md.
import json, glob, re, sys, os
CASES_DIR, RESULTS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
cases = {}
for f in sorted(glob.glob(CASES_DIR + "/cases-*.json")):
    for c in json.load(open(f)):
        cases[c["id"]] = c
res = {}
for l in open(RESULTS):
    r = json.loads(l)
    if r["id"] in res and r.get("infra_error") and not res[r["id"]].get("infra_error"):
        continue
    res[r["id"]] = r  # later lines win

EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿\U0001F000-\U0001F2FF]")
ARABIC = re.compile("[؀-ۿ]")
SPACED = re.compile(r"\d \d{3}")
PHONE = re.compile(r"(?:\+?213|0)[\s.\-]?[567][\s.\-]?\d{2}[\s.\-]?\d{2}[\s.\-]?\d{2}[\s.\-]?\d{2}|\b0[567]\d{8}\b")
LEAK = re.compile(r"no need to include|phone numbers?|street address|do not include|don't include", re.I)
MARK = re.compile(r"\*\*|^#{1,6} |__", re.M)

def flags(case, r):
    out = []
    lang = (case["expect"].get("language") or "any")
    for t in r["turns"]:
        rep = t.get("reply") or ""
        if MARK.search(rep): out.append("markdown")
        if EMOJI.search(rep): out.append("emoji")
        if lang == "dz" and ARABIC.search(rep): out.append("arabic_letters_in_dz")
        if ARABIC.search(rep) and SPACED.search(rep): out.append("spaced_arabic_number")
        s = t.get("handoff_summary") or ""
        if PHONE.search(s): out.append("phone_in_handoff_summary")
        if LEAK.search(s): out.append("instruction_leak_in_summary")
        if re.search(r"\b(\d+)\s+(?:left|restant|pièces?|pieces?|units?|en stock)\b", rep, re.I): out.append("exact_stock_number?")
        if t.get("error"): out.append("turn_error:" + str(t["error"])[:40])
    return sorted(set(out))

items = []
for cid, c in cases.items():
    r = res.get(cid)
    if not r:
        continue
    items.append({"case": c, "result": r, "auto_flags": flags(c, r)})
size = int(sys.argv[4]) if len(sys.argv) > 4 else 50
n = 0
for i in range(0, len(items), size):
    n += 1
    json.dump(items[i:i + size], open(f"{OUT}/grade-input-{n}.json", "w"), ensure_ascii=False, indent=1)
print("items", len(items), "chunks", n, "missing", [k for k in cases if k not in res][:10])
