# Mechanical safety checks on stress-test results (no judge needed).
# Usage: python3 scripts/stress/check-critical.py <results.jsonl> [cases-dir]
# Flags:
#   same_turn_order   the order was placed in the same turn as the conversation's FIRST quote_delivery
#   total_not_shown   an order was created but the previous bot reply did not show its total
#   order_no_quote    an order exists but quote_delivery was never called in the conversation
# Also prints handoff counts per category and the average input tokens per turn.
import json, re, sys, glob, collections

results_path = sys.argv[1]
cases_dir = sys.argv[2] if len(sys.argv) > 2 else "scripts/stress/cases"
cases = {}
for f in glob.glob(cases_dir + "/cases-*.json"):
    for c in json.load(open(f)):
        cases[c["id"]] = c

ARABIC_INDIC = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")


def numbers_in(text):
    """All amounts written in a text, as integers (whole DZD): handles '7 700', '7.700', '7,700.00', '4 700,00'."""
    t = (text or "").translate(ARABIC_INDIC).replace("٬", ",").replace("٫", ".")
    out = set()
    for m in re.finditer(r"\d[\d\s.,  ]*\d|\d", t):
        s = m.group(0).replace(" ", " ").replace(" ", " ")
        s = re.sub(r"[.,]\d{2}$", "", s)  # decimals like ,00 / .00
        digits = re.sub(r"[\s.,]", "", s)
        if digits:
            out.add(int(digits))
    return out


flags = collections.defaultdict(list)
handoffs = collections.Counter()
total = collections.Counter()
tin = turns = 0
for line in open(results_path):
    r = json.loads(line)
    cid = r["id"]
    cat = cases.get(cid, {}).get("category", "?")
    total[cat] += 1
    if any(t["status"] == "human" for t in r["turns"]):
        handoffs[cat] += 1
    seen_quote = False
    first_quote_turn = None
    for i, t in enumerate(r["turns"]):
        turns += 1
        tin += (t.get("usage") or {}).get("input_tokens") or 0
        tools = t.get("tools") or []
        # A create_order call can be refused by the order guard; only the LAST turn with create_order can be the
        # one that placed the order, so same_turn_order is judged on that turn (checked after the loop).
        if "quote_delivery" in tools and first_quote_turn is None:
            first_quote_turn = i
        if "quote_delivery" in tools:
            seen_quote = True
    for o in r.get("orders") or []:
        if not seen_quote:
            flags["order_no_quote"].append(cid)
        want = o.get("total_cents")
        # The turn that created the order = the LAST turn with a create_order call (earlier calls may have been refused by
        # the order guard). Caveat: pre-guard data where an order was created twice can be misjudged.
        idx = max((i for i, t in enumerate(r["turns"]) if "create_order" in (t.get("tools") or [])), default=None)
        if idx is not None and first_quote_turn == idx:
            flags["same_turn_order"].append(cid)
        if want is not None and idx is not None and idx > 0:
            prev = r["turns"][idx - 1].get("reply") or ""
            if want // 100 not in numbers_in(prev):
                flags["total_not_shown"].append(cid)
        elif idx == 0:
            flags["total_not_shown"].append(cid)

print(f"results: {sum(total.values())} cases, {turns} turns, avg input tokens/turn {tin // max(turns, 1)}")
for k in ("same_turn_order", "total_not_shown", "order_no_quote"):
    ids = sorted(set(flags[k]))
    print(f"{k}: {len(ids)} {ids}")
print("handoff cases per category:", {k: f"{handoffs[k]}/{total[k]}" for k in sorted(total)})
sys.exit(1 if flags["same_turn_order"] or flags["total_not_shown"] or flags["order_no_quote"] else 0)
