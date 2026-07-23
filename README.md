# Telegram Chat Analytics

Drop in a Telegram Desktop export and get instant analytics — a stats dashboard, searchable message browser, and a token-efficient Markdown export. Everything runs in your browser; nothing is uploaded.

**[Live demo](https://telegram-analytics.vercel.app)** · [GitHub](https://github.com/Paranjayy/TelegramChatAnalytics)

## Features

- **Drop-in parsing** — accepts `messages*.html` files directly, or a `.zip` of the whole Telegram export (multi-file). Deflate-compressed ZIPs supported natively, no external library.
- **Stats dashboard** — per-sender volume, daily timeline, reply behaviour, link domains, top words/emojis, per-day volume with per-sender media columns, conversation markers. All the same numbers the Markdown header exposes, rendered as charts and tables.
- **Message browser** — full-text search, sender chips, filter by media / link / reply / forward. Replies show the source message inline; click an ID to anchor it. Infinite scroll, mobile-friendly.
- **Token-efficient Markdown export** — choose between `lean` (drop IDs, blockquote prefixes, emojis), `quote-replies` (inline the source snippet), and `full-stats` (top-words/emojis tables). Token estimate shown live in the UI.
- **100% client-side** — no backend, no DB, no telemetry. Drag a file, get results.

## Usage

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + Vite production build
```

## Architecture

| File | Role |
|---|---|
| `src/lib/parser.ts` | Telegram HTML → typed `Message[]` records |
| `src/lib/stats.ts` | All aggregates (per-sender, per-day, weekly, link domains, top words/emojis) |
| `src/lib/markdown.ts` | Message → Markdown renderer; mirrors the Python exporter |
| `src/lib/zip.ts` | Native-browser ZIP reader (deflate via `DecompressionStream`) |
| `src/lib/format.ts` | Display helpers (number, date formatters) |
| `src/components/EmptyState.tsx` | Drop / pick file landing |
| `src/components/StatsDashboard.tsx` | KPI grid + tables + day chart |
| `src/components/MessageList.tsx` | Filter bar + message feed + reply inline |
| `src/components/ExportPanel.tsx` | Markdown export controls + preview |

## Compared to `scripts/telegram_html_to_markdown.py`

The TypeScript parser, stats, and Markdown exporter are a 1:1 port of the Python `telegram_html_to_markdown.py` so the dashboard and the exported Markdown tell the same story. The web app adds:

- Interactive filtering / search
- Per-day bar chart
- Reply-to-source inline previews
- Live token estimate during export configuration

## Stack

Vite · React 19 · TypeScript · Tailwind v4. No state library, no router, no charting library. The whole app ships in ~75 KB gzipped JS.

## Deploy

The app is a static SPA — `npm run build` → `dist/`. Drop it on Vercel, Netlify, GitHub Pages, or any static host. `vercel.json` is included for one-click deploys.

## License

MIT
