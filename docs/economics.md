# Economics

Assumptions are rough and meant to be replaced with real pilot numbers. Last updated 2026-10-04.

## Assumptions

| Item | Value | Source |
|---|---|---|
| Exchange rate | **256 DA per $** | Owner buys $10 for 2,560 DA (street rate) |
| Price per store | **1,000 DA / month** (~$3.86) | Owner's decision |
| Tokens per agent reply | ~3,000 input + 300 output | Measured in test runs, tool rounds included |
| Official GPT-6 Luna | $0.10 in / $0.50 out / $0.01 cached per 1M tokens | Third-party listings; confirm on OpenAI |
| Friend's endpoint | $0.003 in / $0.015 out / $0.0003 cached per 1M tokens | Owner, from the friend; verify against real usage |
| Hosting | Supabase Pro $25/month; Cloudflare free | Supabase and Cloudflare pricing summaries |
| Payment fees | 3% placeholder | Chargily Pay fees not found |

Cost per agent reply: official **$0.00045 (0.115 DA)**, friend **$0.0000135 (0.0035 DA)**.

## 100 stores at 1,000 DA each (revenue 100,000 DA, about $390)

| Store volume | Replies / month | Official OpenAI profit | Friend endpoint profit |
|---|---|---|---|
| Typical: 25 replies per store per day | 75,000 | 81,960 DA (~$320, 82%) | 90,341 DA (~$353, 90%) |
| Busy: 100 per store per day | 300,000 | 56,040 DA (~$219, 56%) | 89,563 DA (~$350, 90%) |
| Very busy: 400 per store per day | 1,200,000 | **-47,640 DA (loss)** | 86,453 DA (~$338, 86%) |

Break-even on official OpenAI at 1,000 DA: about **262 replies per store per day**.

## Credits on the friend's platform

A $10 top-up (2,560 DA) lasts about 10 months for 100 typical stores, 2.5 months for busy stores, 0.6 months for very busy stores. Keep top-ups small. To verify the advertised price: 1,000 messages should cost about $0.0135; compare tokens and cost per request in their dashboard.

## What real traffic looks like (public data, weak sources)

- Average professional Instagram account: ~4.6 DMs per day.
- E-commerce chat sessions: ~14-15 messages in some examples; ~90% resolved within 10 messages.
- Our 80 conversations per day per store is a very busy store. Measure the pilot stores.

## Competitor price point

Chatbot DZ (Algeria): prepaid tokens, a plain message costs 1 token, an AI reply 3 tokens; 2.00 DA per token at the 1K pack, 0.29 DA per token at the 350K pack. One AI reply therefore costs the store 6.00 DA down to 0.87 DA. A store sending 750 AI replies a month pays 652-4,500 DA there against our flat 1,000 DA. See [competitors.md](competitors.md).

## Levers

- Route simple messages (greetings, buttons, fixed answers) without the model.
- Usage caps, included replies plus top-up packs, or pay-as-you-go credits instead of a flat plan.
- Cache the system prompt (about 30% off input cost).
- Delete old messages after ~90 days to keep the database small.
- Exchange-rate risk: costs are in dollars, revenue in dinars.
