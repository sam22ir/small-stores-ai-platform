# Studio feature (AI product photos)

Status: design agreed, not built. This file records what was discussed and decided.

## Idea

A **Studio** tab in the Wakil dashboard. A merchant uploads a normal phone photo of a product (clothes,
shoes, accessories) and gets back a professional-looking product photo, with no prompt writing. The result
can be saved straight into the product catalog the Wakil agent already uses.

Why inside Wakil: same merchants, same catalog, same login and Arabic UI, same Chargily billing, and no
dependency on Meta approval, so it gives merchants value while Instagram approval is pending.

## Image model and provider

- Model: GPT Image 2.5 through the CE gateway (OpenAI-compatible API).
- Endpoints: `/v1/images/generations` and `/v1/images/edits` (edits takes the merchant's photo as input).
- Model names listed by the provider: `gpt-image-2`, `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst`.
  Which 2.5 variant to use is open: the fidelity test compares both on the same photos.
- Quality on 2.5: `auto`, `low`, `medium`, `high`, `xhigh`, `max`. Higher tiers are slower; billing is a flat
  fee per generated image, so the cost of a higher tier is time, not money. Test `high` against `xhigh`.
- `background: transparent` with `output_format: png` or `webp` gives an alpha channel. Useful for clean
  cut-outs; to be tested for the Clean Studio style.
- The API key and base URL are secrets (Supabase function secrets). Never in the repo or the dashboard.
- CE is a third-party gateway. Use the same primary plus fallback pattern as the agent: a timeout, one
  retry or fallback, and a clear failure state in the UI.

## Decisions

| Topic | Decision |
|---|---|
| Product-only or on a model | The merchant chooses. Both are offered. |
| Models in photos | Maghrebi-looking models, a modest-wear and hijab option, and a kids option. |
| Aspect ratio | An option on every generation (1:1, 4:5, 9:16 to start). |
| Text overlays (sale badges, free delivery) | Later. When added, the app draws the text, not the AI, so Arabic stays correct. |
| Failed generations | A technical failure (error, timeout, blank image) never counts against the merchant. |
| Free regenerations | About 5 per week per store, for results the merchant is not happy with. |
| AI label on images | None. The garment must still match what is delivered. |
| Batch mode | Yes, with groups (below). |

## Styles (templates)

Start with three, add more after merchants use it.

- **Streetwear:** urban, concrete or street background, modern lighting.
- **Old Money:** warm interior, classic furniture, soft golden light.
- **Clean Studio:** plain white or grey background, soft shadows.

Later: outdoor and casual, and seasonal sets for Algeria (Eid, back to school, winter, sales).
Each style is a fixed prompt template. The base instruction always says to keep the product's logo, color,
cut and details exactly as in the input photo, and to change only the environment.

## User flow

Single photo:

1. Upload a photo, or pick a product from the catalog.
2. Choose style, product-only or on-model, model type, aspect ratio.
3. See the result next to the original. Save to product (replace or add to the catalog photo) or download.
4. Past results are kept in a gallery.

Batch mode:

1. The merchant selects some photos and taps **Add group**, then sets that group's options.
2. They repeat with other photos and other options. Example: hoodies get Streetwear 4:5, watches get
   Clean Studio 1:1.
3. A summary screen shows each group and the total photo count. They press **Start**.
4. Photos are made in the background. The merchant is told on Telegram (already used for owner alerts) and
   in the app when they are ready.
5. They review the results, keep the good ones and redo the bad ones using the weekly free regenerations.

Batch rules (chosen defaults, easy to change):

- Up to 20 photos per batch, any number of groups.
- Two batches running at once per store.
- Each photo is its own background job, so one failure never stops the rest.
- A technically failed photo is retried once automatically, then marked failed and not counted.
- A merchant can cancel a batch. Photos that have not started are dropped.
- A per-store hourly cap protects against abuse, like the 60 per hour on `assistant-chat`.

## Technical outline

Follows the conventions in `CLAUDE.md`.

- Dashboard: nav entry in `Layout.tsx`, a Studio page in `src/pages/`, strings in the `ar`, `fr` and `en`
  locales, and a "Send to Studio" action in `ProductEditor.tsx`.
- Edge Function, for example `studio-generate`. It checks auth itself (JWT plus store membership) and must
  be added to `supabase/config.toml` and to the function loop in `.github/workflows/deploy.yml`.
- Tables for studio jobs, groups and weekly regeneration counters, with RLS on like every other table, plus
  pgTAP tests in `supabase/tests/`.
- Images in a Supabase Storage bucket so each merchant can only read their own.
- Generation takes seconds, so use background jobs with status polling or realtime updates, not one long
  request.
- Keep the model call behind one module so the model, variant and fallback can change without touching the UI.

## Build order

1. Fidelity test script: run real product photos through both 2.5 variants and compare quality tiers.
   Check that logos, printed text, colors and cut survive.
2. Backend: jobs tables, `studio-generate`, storage, limits, tests.
3. Studio tab: single photo first, then groups and batch.
4. Telegram notification and the weekly free-regeneration counter.

## Open items

- Choose the 2.5 variant and quality tier from the fidelity test.
- Access model: included for every Wakil store, or a separate add-on. This decides the credits tables.
- About 20 real product photos for the fidelity test, including items with logos and printed text.
- Write access and review flow for the repo: work on a separate branch and open a pull request.
