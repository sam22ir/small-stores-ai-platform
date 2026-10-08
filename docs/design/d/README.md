# Dashboard design: direction D ("Hybrid")

Chosen 2026-10-08. C's structure (messaging-app inbox, filter tabs, compact chat) with A's calm look
(Needs-you box, soft shapes, one emerald accent). Reference mockups in this folder (open the `.dc.html`
files as plain HTML; ignore the `support.js` / `x-dc` wrapper): phone Chats + Thread in Arabic and French,
and a 1440px browser inbox (`D-Desktop.dc.html`).

## Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F7F8F7` | `#0F1211` | page ground |
| `--surface` | `#FFFFFF` | `#171B1A` | cards, bars, list |
| `--surface-2` | `#F1F3F2` | `#1F2423` | neutral chips, inputs, hover |
| `--text` | `#16181A` | `#ECEFEE` | body |
| `--muted` | `#565C63` | `#A2AAA7` | secondary (keep 4.5:1) |
| `--heading` | `#2B3A4A` | `#DCE3EA` | page/section headings |
| `--border` | `#E3E6E4` | `#2A302E` | hairlines (no shadows) |
| `--divider` | `#EEF0EF` | `#222826` | row separators |
| `--brand` | `#0B6E4F` | `#2FA57D` | the ONE accent: primary buttons, active nav/tab, switch, badges |
| `--brand-contrast` | `#FFFFFF` | `#06140F` | text on brand |
| `--brand-soft` | `#EAF4EF` | `#12302A` | assistant bubbles, selected row, assistant chip |
| `--brand-border` | `#CFE5DB` | `#1D4A3D` | assistant bubble border |
| `--warn` | `#B45309` | `#F0A35A` | ONLY the "needs you" state |
| `--warn-soft` | `#FDF7EE` | `#2A1E10` | needs-you strip / chip background |
| `--warn-border` | `#F2E3CC` | `#4A3418` | needs-you strip border |
| `--danger` | `#B42318` | `#F97066` | destructive actions, errors |

Status chips: assistant = brand-soft/brand; needs you ("À vous" / "أنت") = warn-soft/warn; order = surface-2/heading.

## Type

- Latin: **IBM Plex Sans** 400/500/600/700. Arabic: **IBM Plex Sans Arabic** 400/500/600/700.
  Stack: `"IBM Plex Sans", "IBM Plex Sans Arabic", system-ui, sans-serif` (Arabic glyphs fall through to the Arabic face).
- Sizes: page title 20/600 (heading color), section 14-15/600, body 15, secondary 13, meta 12, tab label 12.
- Western digits everywhere; amounts like `3 200 DA` / `3 200 دج`.

## Shape and layout

- Radius: **12px** for cards, inputs, message bubbles (the corner nearest the sender is 4px); **full pill** for
  buttons, chips, filter tabs, the switch, badges, nav items' active background uses 12px.
- Hairline borders (`--border`), no drop shadows, no gradients, no left/right accent bars.
- Touch targets >= 44px. Icons: 24px stroke icons, 1.75 stroke, from `src/components/icons.tsx`.
- Phone (< 1024px): top header (store avatar + name, assistant on/off switch), content, bottom tab bar with 5 tabs
  (Chats with needs-you badge, Orders, Catalog, Assistant, Settings).
- Desktop (>= 1024px): 240px sidebar (store, 5 nav items with badge, switch + usage bar at the bottom), content area.
  The Chats page becomes list (380px) + open chat side by side; the order/customer panel sits beside the chat
  (300px) on wide screens.
- RTL: use logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`, `inset-inline-*`) so Arabic mirrors.

## Patterns

- **Needs-you box**: card with a warn-soft header strip ("À traiter" + "2 clients attendent"), then the waiting chats.
  Shown on top of the Chats list only when there are any.
- **Filter tabs**: pill segmented row: All | Needs you (n) | Orders.
- **Usage line**: "312 replies · 58 conversations this month" + "312 / 1 000" with a 6px pill progress bar.
- **Assistant bubble**: brand-soft background, brand-border, small sparkle icon + "Assistant" label above the text.
- **Order card**: title + status pill, line items, hairline, "Total to pay on delivery" bold, primary Confirm pill +
  outline Call / WhatsApp pills.
- Copy tone: plain, short, no em dashes.
