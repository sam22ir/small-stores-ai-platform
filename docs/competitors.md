# Competitors (Algeria)

Notes from public pages and screenshots, collected 2026-10. Marketing claims, not verified.
Exchange rate assumed: ~133 DA per USD (derived from DZD/EUR ~0.0066 in July 2026; check the real rate).

## Chatbot DZ (chatbotdz.com)

Pay-as-you-go, **no subscription**, prepaid "tokens" that never expire.

| Token cost | Action |
|---|---|
| 1 | Text, button, Telegram notification |
| 2 | Image, video, voice |
| 3 | "Hybrid AI" reply |

Price per token falls with pack size (screenshots):

| Pack | Price | Per token |
|---|---|---|
| 1K tokens | 2,000 DA | 2.00 DA |
| 350K tokens | 100,000 DA | 0.29 DA (they advertise "save 86%") |

Other packs (5K, 20K, 50K, 80K, 200K) not captured yet.

Also advertised: 50 free tokens at sign-up with no card, 5 bots included (several stores),
unlimited products, payment via Chargily Pay / CIB / Edahabia, Derja, French and Arabic,
Messenger + Instagram + WhatsApp, delivery fees for all 69 wilayas, order taking.

Implied price of one AI reply (3 tokens): 6.00 DA (~$0.045) at the smallest pack, 0.87 DA (~$0.0065) at the largest.
Our model cost per reply on official GPT-6 Luna is ~$0.00045.

## Others seen in search

Magasin Pro, Aiceberg (WhatsApp-first), BADIS AI, Dzair GPT (API), Thikaa AI, Botia; North African: Babliy, DarijaBot.
Plus freelancers building ManyChat/n8n bots.

## Ideas this suggests for us

- Pay-as-you-go credits (or a plan with included replies + top-ups) instead of a flat subscription.
- Route simple messages (greetings, buttons, fixed answers) without the LLM; reserve the model for hard ones.
- Telegram alert to the owner on handoff.
- Handle voice notes and images (currently we only see "[attachment]").
- Free trial with no card; local payment (Chargily Pay, CIB, Edahabia).
- Darija / French / Arabic-in-Latin-letters test scenarios in the eval script.
