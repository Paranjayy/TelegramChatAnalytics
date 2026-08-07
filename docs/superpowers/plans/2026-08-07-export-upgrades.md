# Export Upgrades: JSON + Enhanced Markdown + HTML Report

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JSON export, supercharge the Markdown export with visual charts/personality profiles/heatmaps, and ship a self-contained HTML report — making the export tab the app's crown jewel.

**Architecture:** Three new lib modules (`json.ts`, `htmlReport.ts`, enhanced `markdown.ts`) + updated `ExportPanel.tsx` with format selector tabs. Each export format is independently generated from the existing `ChatStats` + `Message[]` data. No new dependencies.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, existing types (ChatStats, Message)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/json.ts` | **Create** | JSON export logic — structured stats + messages |
| `src/lib/htmlReport.ts` | **Create** | Self-contained HTML report generator |
| `src/lib/markdown.ts` | **Modify** | Add TL;DR, sparklines, heatmap, personality profiles, time distribution |
| `src/components/ExportPanel.tsx` | **Modify** | Add format tabs (Markdown / JSON / HTML), unify download/copy |
| `src/types/index.ts` | **Modify** | Add `ExportFormat` type |

---

## Global Constraints

- Zero new npm dependencies — everything is hand-rolled
- All exports generated client-side from existing `ChatStats` + `Message[]`
- Dark theme consistent with existing app (zinc-950 base)
- TypeScript strict mode — no `any` types
- Existing markdown export must remain backward-compatible (no regressions)

---

### Task 1: Add ExportFormat type + JSON export module

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/json.ts`

**Interfaces:**
- Produces: `ExportFormat` type union, `exportJson()` function

- [ ] **Step 1: Add ExportFormat type to types/index.ts**

Add at the bottom of the file, before the closing:

```typescript
export type ExportFormat = "markdown" | "json" | "html";
```

- [ ] **Step 2: Create src/lib/json.ts**

```typescript
import type { ChatStats, Message } from "../types";

export interface JsonExport {
  meta: {
    exportedAt: string;
    sourceFiles: string[];
    version: string;
  };
  stats: ChatStats;
  messages: Array<{
    id: string | null;
    timestamp: string | null;
    sender: string | null;
    text: string;
    replyTo: string | null;
    forwardedFrom: string | null;
    isForwarded: boolean;
    media: Array<{
      kind: string;
      title?: string;
      status?: string;
      description?: string;
    }>;
    isService: boolean;
  }>;
}

export function exportJson(messages: Message[], stats: ChatStats, title: string): string {
  const slimMessages = messages.map((m) => ({
    id: m.id,
    timestamp: m.timestamp,
    sender: m.sender,
    text: m.text,
    replyTo: m.replyTo,
    forwardedFrom: m.forwardedFrom,
    isForwarded: m.isForwarded,
    media: m.media.map((med) => ({
      kind: med.kind,
      ...(med.title && { title: med.title }),
      ...(med.status && { status: med.status }),
      ...(med.description && { description: med.description }),
    })),
    isService: !!m.service,
  }));

  const exportData: JsonExport = {
    meta: {
      exportedAt: new Date().toISOString(),
      sourceFiles: stats.sourceFiles,
      version: "0.1.0",
    },
    stats,
    messages: slimMessages,
  };

  return JSON.stringify(exportData, null, 2);
}

export function getJsonFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}-analytics.json`;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/lib/json.ts
git commit -m "feat: add JSON export module with structured stats + messages"
```

---

### Task 2: Enhance Markdown export with visual features

**Files:**
- Modify: `src/lib/markdown.ts`

**Interfaces:**
- Consumes: existing `ChatStats`, `Message[]`, `ExportOptions`
- Produces: enhanced markdown string with TL;DR, sparklines, heatmap, personality profiles

- [ ] **Step 1: Add unicode chart helpers at the top of markdown.ts (after imports)**

```typescript
/* ---------- unicode visual helpers ---------- */

const BAR_CHARS = "░▒▓█";
const SPARK_CHARS = " ▁▂▃▄▅▆▇█";

function sparkline(values: number[]): string {
  if (!values.length) return "";
  const max = Math.max(...values, 1);
  return values.map((v) => SPARK_CHARS[Math.round((v / max) * 7)]).join("");
}

function barChart(entries: [string, number][], maxWidth = 20): string {
  if (!entries.length) return "";
  const max = Math.max(...entries.map(([, v]) => v), 1);
  const lines: string[] = [];
  for (const [label, value] of entries) {
    const barLen = Math.round((value / max) * maxWidth);
    const bar = BAR_CHARS[3].repeat(barLen);
    lines.push(`${label.padEnd(16)} ${bar} ${value.toLocaleString()}`);
  }
  return lines.join("\n");
}

function heatmap(dailyCounts: Record<string, number>, weeks = 12): string {
  const dates = Object.keys(dailyCounts).sort();
  if (!dates.length) return "";

  const end = new Date(dates[dates.length - 1]);
  const start = new Date(end);
  start.setDate(start.getDate() - weeks * 7);

  const max = Math.max(...Object.values(dailyCounts), 1);
  const lines: string[] = [];
  lines.push("```");
  lines.push("     " + Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i * 7);
    return (d.getMonth() + 1).toString().padStart(2, " ");
  }).join("  "));

  const dayLabels = ["Mon", "Wed", "Fri"];
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const label = dayLabels.includes(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayIdx])
      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayIdx].padEnd(4)
      : "     ";
    const cells: string[] = [];
    for (let w = 0; w < weeks; w++) {
      const d = new Date(start);
      d.setDate(d.getDate() + w * 7 + dayIdx);
      const iso = d.toISOString().slice(0, 10);
      const count = dailyCounts[iso] ?? 0;
      if (count === 0) {
        cells.push("  · ");
      } else {
        const intensity = Math.ceil((count / max) * 3);
        cells.push(`  ${BAR_CHARS[intensity]} `);
      }
    }
    lines.push(`${label}${cells.join("")}`);
  }
  lines.push("```");
  return lines.join("\n");
}

function timeDistribution(messages: Message[]): string {
  const hours = new Array(24).fill(0) as number[];
  for (const m of messages) {
    if (m.service || !m.timestamp) continue;
    const match = m.timestamp.match(/(\d{2}):(\d{2})/);
    if (match) hours[parseInt(match[1], 10)] += 1;
  }
  const max = Math.max(...hours, 1);
  const lines: string[] = [];
  lines.push("```");
  for (let h = 0; h < 24; h++) {
    const barLen = Math.round((hours[h] / max) * 30);
    const bar = BAR_CHARS[3].repeat(barLen);
    lines.push(`${h.toString().padStart(2, "0")}:00  ${bar} ${hours[h]}`);
  }
  lines.push("```");
  return lines.join("\n");
}

function senderPersonality(msgs: Message[], stats: ChatStats): string {
  const lines: string[] = [];
  const senders = Object.entries(stats.senders);
  if (!senders.length) return "";

  for (const [name, s] of senders) {
    const senderMsgs = msgs.filter((m) => m.sender === name && !m.service);
    if (!senderMsgs.length) continue;

    // Emoji density
    let emojiCount = 0;
    for (const m of senderMsgs) {
      const emojis = m.text.match(/[\u{1F300}-\u{1FAFF}]/gu) ?? [];
      emojiCount += emojis.length;
    }
    const emojiPerMsg = senderMsgs.length ? (emojiCount / senderMsgs.length).toFixed(1) : "0";

    // Average word length
    const avgWordLen = s.words ? (s.chars / s.words).toFixed(1) : "0";

    // Link affinity
    const linkAffinity = s.linkMsgs ? ((s.linkMsgs / s.count) * 100).toFixed(0) : "0";

    // Reply tendency
    const replyTendency = s.replyRatePct;

    // Late night activity
    let lateNight = 0;
    for (const m of senderMsgs) {
      if (!m.timestamp) continue;
      const match = m.timestamp.match(/(\d{2}):(\d{2})/);
      if (match) {
        const hour = parseInt(match[1], 10);
        if (hour >= 0 && hour < 6) lateNight += 1;
      }
    }
    const lateNightPct = senderMsgs.length ? ((lateNight / senderMsgs.length) * 100).toFixed(0) : "0";

    lines.push(`**${name}**`);
    lines.push(`- 📊 ${s.count.toLocaleString()} messages · ${s.sharePct}% of chat`);
    lines.push(`- 📝 Avg ${s.avgWords} words/msg · ${avgWordLen} chars/word`);
    lines.push(`- 😊 ${emojiPerMsg} emojis/msg · ${linkAffinity}% messages contain links`);
    lines.push(`- 💬 Replies to ${replyTendency}% of messages · Received ${s.repliesRecv.toLocaleString()} replies`);
    lines.push(`- 🌙 ${lateNightPct}% of messages sent between midnight–6am`);
    lines.push("");
  }

  return lines.join("\n");
}
```

- [ ] **Step 2: Add TL;DR builder function after the visual helpers**

```typescript
function buildTldr(stats: ChatStats): string {
  const lines: string[] = [];
  const senders = Object.entries(stats.senders);
  const total = stats.totalMessages;

  lines.push("## TL;DR");
  lines.push("");

  // Engagement summary
  if (senders.length === 2) {
    const [a, b] = senders;
    const ratio = a[1].count > b[1].count
      ? `${a[0]} messages ${(a[1].count / b[1].count).toFixed(1)}× more than ${b[0]}`
      : b[1].count > a[1].count
        ? `${b[0]} messages ${(b[1].count / a[1].count).toFixed(1)}× more than ${a[0]}`
        : "Perfectly balanced — both sent the same amount";
    lines.push(`- **${ratio}**`);
  } else if (senders.length > 2) {
    const [top] = senders;
    lines.push(`- **${top[0]}** dominates with ${top[1].sharePct}% of all messages`);
  }

  // Peak activity
  if (stats.mostActiveDay) {
    lines.push(`- Most intense day: **${fmtDate(stats.mostActiveDay.date)}** with ${stats.mostActiveDay.count} messages`);
  }

  // Communication style
  if (stats.totalReplies) {
    const replyPct = ((stats.totalReplies / total) * 100).toFixed(0);
    lines.push(`- **${replyPct}%** of messages are replies — ${parseInt(replyPct) > 50 ? "heavy conversation" : "mostly independent messages"}`);
  }

  // Media culture
  if (stats.mediaPct > 30) {
    lines.push(`- 📸 Visual-heavy chat: ${stats.mediaPct}% of messages include media`);
  } else if (stats.mediaPct < 10) {
    lines.push(`- 💬 Text-focused chat: only ${stats.mediaPct}% of messages include media`);
  }

  // Word volume
  const wordHuman = stats.totalWords > 1000000
    ? `${(stats.totalWords / 1000000).toFixed(1)}M words`
    : stats.totalWords > 1000
      ? `${(stats.totalWords / 1000).toFixed(1)}K words`
      : `${stats.totalWords} words`;
  lines.push(`- Total output: **${wordHuman}** across ${stats.calendarDays} days`);

  // Top emoji
  if (stats.topEmojis.length) {
    const top3 = stats.topEmojis.slice(0, 3).map(([e, c]) => `${e}×${c}`).join(" ");
    lines.push(`- Signature emojis: ${top3}`);
  }

  lines.push("");
  return lines.join("\n");
}
```

- [ ] **Step 3: Modify buildHeader to include new sections**

In the `buildHeader` function, after the existing "Top Words / Top Emojis" section (around line 350), before `lines.push("---")`, add these new sections:

```typescript
  // TL;DR
  lines.push(buildTldr(stats));

  // Activity heatmap
  if (Object.keys(stats.dailyCounts).length > 14) {
    lines.push("## Activity Heatmap");
    lines.push("");
    lines.push(heatmap(stats.dailyCounts, Math.min(16, Math.ceil(Object.keys(stats.dailyCounts).length / 7))));
    lines.push("");
  }

  // Time distribution
  if (stats.totalMessages > 50) {
    lines.push("## Time of Day Distribution");
    lines.push("");
    lines.push(timeDistribution(/* need messages - see Step 4 */));
    lines.push("");
  }

  // Sender personality profiles
  if (Object.keys(stats.senders).length > 0) {
    lines.push("## Chat Personality Profiles");
    lines.push("");
    lines.push("### Sender Profiles");
    lines.push("");
    lines.push(senderPersonality(/* need messages - see Step 4 */));
    lines.push("");
  }
```

- [ ] **Step 4: Thread messages through buildHeader**

Modify `buildHeader` signature and `exportMarkdown` to pass messages:

Change `buildHeader` signature from:
```typescript
function buildHeader(stats: ChatStats, options: ExportOptions): string {
```
to:
```typescript
function buildHeader(stats: ChatStats, options: ExportOptions, messages?: Message[]): string {
```

Update the call in `exportMarkdown` from:
```typescript
const header = buildHeader(stats, options);
```
to:
```typescript
const header = buildHeader(stats, options, messages);
```

Then in buildHeader, update the time distribution and personality sections to use `messages ?? []`.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/markdown.ts
git commit -m "feat: enhance markdown export with sparklines, heatmap, TL;DR, personality profiles"
```

---

### Task 3: Create self-contained HTML report generator

**Files:**
- Create: `src/lib/htmlReport.ts`

**Interfaces:**
- Produces: `exportHtml()` function returning a complete HTML string

- [ ] **Step 1: Create src/lib/htmlReport.ts**

```typescript
import type { ChatStats, Message } from "../types";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function senderColor(name: string): string {
  const palette = [
    "#818cf8", "#f472b6", "#34d399", "#fbbf24",
    "#a78bfa", "#fb923c", "#22d3ee", "#f87171",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

function dailyChartSvg(dailyCounts: Record<string, number>): string {
  const dates = Object.keys(dailyCounts).sort();
  if (!dates.length) return "";
  const max = Math.max(...Object.values(dailyCounts), 1);
  const w = Math.max(dates.length * 3, 400);
  const h = 120;

  const bars = dates.map((d, i) => {
    const count = dailyCounts[d];
    const barH = (count / max) * (h - 20);
    const x = (i / dates.length) * w;
    const bw = Math.max(w / dates.length - 1, 2);
    return `<rect x="${x}" y="${h - barH}" width="${bw}" height="${barH}" fill="#818cf8" rx="1"/>`;
  }).join("\n    ");

  return `<svg width="100%" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    ${bars}
  </svg>`;
}

function senderBarSvg(senders: Record<string, { count: number; sharePct: number }>): string {
  const entries = Object.entries(senders);
  if (!entries.length) return "";
  const h = entries.length * 28 + 10;
  const max = Math.max(...entries.map(([, s]) => s.count), 1);

  const bars = entries.map(([name, s], i) => {
    const y = i * 28 + 5;
    const barW = (s.count / max) * 250;
    const color = senderColor(name);
    return `
    <text x="0" y="${y + 16}" fill="#d4d4d8" font-size="13" font-family="system-ui">${name}</text>
    <rect x="130" y="${y + 4}" width="${barW}" height="18" fill="${color}" rx="4" opacity="0.8"/>
    <text x="${135 + barW}" y="${y + 17}" fill="#a1a1aa" font-size="11" font-family="system-ui">${s.sharePct}%</text>`;
  }).join("\n");

  return `<svg width="100%" viewBox="0 0 500 ${h}" xmlns="http://www.w3.org/2000/svg">
    ${bars}
  </svg>`;
}

function timeHeatmapSvg(messages: Message[]): string {
  const hours = new Array(24).fill(0) as number[];
  for (const m of messages) {
    if (m.service || !m.timestamp) continue;
    const match = m.timestamp.match(/(\d{2}):(\d{2})/);
    if (match) hours[parseInt(match[1], 10)] += 1;
  }
  const max = Math.max(...hours, 1);
  const cellW = 30;
  const cellH = 30;
  const w = 24 * cellW + 20;
  const h = cellH + 40;

  const cells = hours.map((count, i) => {
    const intensity = count / max;
    const r = Math.round(129 + (1 - intensity) * (50 - 129));
    const g = Math.round(140 + (1 - intensity) * (50 - 140));
    const b = Math.round(248 + (1 - intensity) * (80 - 248));
    const opacity = 0.3 + intensity * 0.7;
    return `<rect x="${i * cellW + 10}" y="20" width="${cellW - 2}" height="${cellH}" fill="rgb(${r},${g},${b})" rx="3" opacity="${opacity}"/>
    <text x="${i * cellW + cellW / 2 + 10}" y="15" fill="#71717a" font-size="9" font-family="system-ui" text-anchor="middle">${i}</text>`;
  }).join("\n    ");

  return `<svg width="100%" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    ${cells}
  </svg>`;
}

export function exportHtml(
  messages: Message[],
  stats: ChatStats,
  title: string,
): string {
  const senderNames = Object.keys(stats.senders);
  const senderTableRows = Object.entries(stats.senders)
    .map(([name, s]) => `
      <tr>
        <td style="color:${senderColor(name)};font-weight:600">${name}</td>
        <td>${s.count.toLocaleString()}</td>
        <td>${s.sharePct}%</td>
        <td>${s.words.toLocaleString()}</td>
        <td>${s.chars.toLocaleString()}</td>
        <td>${s.avgWords}</td>
        <td>${s.repliesSent}</td>
        <td>${s.links}</td>
      </tr>`).join("");

  const emojiCloud = stats.topEmojis.slice(0, 10).map(([e, c]) =>
    `<span style="font-size:${Math.max(16, Math.min(48, 16 + c))}px;margin:4px;display:inline-block" title="${c}×">${e}</span>`
  ).join(" ");

  const topWordsTags = stats.topWords.slice(0, 15).map(([w, c]) =>
    `<span style="display:inline-block;padding:2px 8px;margin:2px;border-radius:999px;background:#27272a;color:#d4d4d8;font-size:${Math.max(11, Math.min(16, 10 + c / 5))}px">#${w} <span style="color:#71717a;font-size:10px">${c}</span></span>`
  ).join(" ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Analytics Report</title>
  <style>
    :root { --bg: #09090b; --surface: #18181b; --border: #27272a; --text: #d4d4d8; --muted: #71717a; --accent: #818cf8; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; padding: 2rem; max-width: 1000px; margin: 0 auto; }
    h1 { font-size: 2rem; color: #fff; margin-bottom: 0.25rem; }
    h1 span { color: var(--accent); }
    h2 { font-size: 1.25rem; color: #fff; margin: 2rem 0 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); }
    h3 { font-size: 1rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin: 1.5rem 0 0.75rem; }
    .subtitle { color: var(--muted); margin-bottom: 2rem; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
    .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; text-align: center; }
    .kpi .value { font-size: 1.5rem; font-weight: 700; color: #fff; }
    .kpi .label { font-size: 0.75rem; color: var(--muted); margin-top: 0.25rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th { text-align: left; padding: 0.5rem; color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); }
    td { padding: 0.5rem; border-bottom: 1px solid var(--border); font-size: 0.875rem; }
    tr:hover td { background: rgba(129, 140, 248, 0.05); }
    .chart-container { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; margin: 1rem 0; overflow-x: auto; }
    .highlight { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; margin: 1rem 0; }
    .highlight li { margin: 0.4rem 0; list-style: none; }
    .highlight li::before { content: "→ "; color: var(--accent); }
    .emoji-cloud { text-align: center; padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; }
    .word-tags { line-height: 2; }
    .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.75rem; text-align: center; }
    @media print { body { background: #fff; color: #000; } h1 span, .kpi .value { color: #000; } .kpi, .chart-container, .highlight { border-color: #ddd; background: #f9f9f9; } }
  </style>
</head>
<body>
  <h1><span>⌬</span> ${title}</h1>
  <div class="subtitle">Analytics report · Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} · ${stats.sourceFiles.join(", ")}</div>

  <div class="kpi-grid">
    <div class="kpi"><div class="value">${stats.totalMessages.toLocaleString()}</div><div class="label">Messages</div></div>
    <div class="kpi"><div class="value">${senderNames.length}</div><div class="label">Senders</div></div>
    <div class="kpi"><div class="value">${stats.calendarDays.toLocaleString()}</div><div class="label">Days</div></div>
    <div class="kpi"><div class="value">${stats.totalWords.toLocaleString()}</div><div class="label">Words</div></div>
    <div class="kpi"><div class="value">${stats.totalReplies.toLocaleString()}</div><div class="label">Replies</div></div>
    <div class="kpi"><div class="value">${stats.mediaMsgs.toLocaleString()}</div><div class="label">Media</div></div>
    <div class="kpi"><div class="value">${stats.totalLinks.toLocaleString()}</div><div class="label">Links</div></div>
    <div class="kpi"><div class="value">${stats.avgPerDay}</div><div class="label">Avg/Day</div></div>
  </div>

  <h2>Activity Over Time</h2>
  <div class="chart-container">
    ${dailyChartSvg(stats.dailyCounts)}
  </div>

  <h2>Sender Breakdown</h2>
  <div class="chart-container">
    ${senderBarSvg(stats.senders)}
  </div>
  <table>
    <thead><tr><th>Sender</th><th>Messages</th><th>Share</th><th>Words</th><th>Chars</th><th>Avg Words</th><th>Replies</th><th>Links</th></tr></thead>
    <tbody>${senderTableRows}</tbody>
  </table>

  <h2>Time of Day</h2>
  <div class="chart-container">
    ${timeHeatmapSvg(messages)}
  </div>

  <h2>Highlights</h2>
  <div class="highlight">
    <ul>
      ${stats.mostActiveDay ? `<li>Most active day: <strong>${fmtDate(stats.mostActiveDay.date)}</strong> (${stats.mostActiveDay.count} messages)</li>` : ""}
      ${stats.leastActiveDay ? `<li>Quietest day: <strong>${fmtDate(stats.leastActiveDay.date)}</strong> (${stats.leastActiveDay.count} messages)</li>` : ""}
      <li>Average per day: <strong>${stats.avgPerDay}</strong> messages</li>
      <li>Media coverage: <strong>${stats.mediaPct}%</strong> of messages</li>
      <li>Link coverage: <strong>${stats.linkPct}%</strong> of messages</li>
      ${stats.topDomains.length ? `<li>Top domain: <strong>${stats.topDomains[0][0]}</strong> (${stats.topDomains[0][1]} links)</li>` : ""}
    </ul>
  </div>

  ${stats.topEmojis.length ? `
  <h2>Top Emojis</h2>
  <div class="emoji-cloud">${emojiCloud}</div>` : ""}

  ${stats.topWords.length ? `
  <h2>Top Words</h2>
  <div class="word-tags">${topWordsTags}</div>` : ""}

  <div class="footer">
    All processing happened in the browser. No data left your device.<br>
    Generated by Telegram Chat Analytics
  </div>
</body>
</html>`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/htmlReport.ts
git commit -m "feat: add self-contained HTML report generator with SVG charts"
```

---

### Task 4: Upgrade ExportPanel with format tabs

**Files:**
- Modify: `src/components/ExportPanel.tsx`

**Interfaces:**
- Consumes: `messages`, `stats`, `title` props (existing)
- Produces: Format selector (Markdown / JSON / HTML), unified download/copy per format

- [ ] **Step 1: Rewrite ExportPanel.tsx**

```typescript
import { useMemo, useState } from "react";
import type { ChatStats, ExportFormat, Message } from "../types";
import { exportMarkdown, estimateTokens, type ExportOptions } from "../lib/markdown";
import { exportJson, getJsonFilename } from "../lib/json";
import { exportHtml } from "../lib/htmlReport";
import { fmtNumber } from "../lib/format";

interface Props {
  messages: Message[];
  stats: ChatStats;
  title: string;
}

const FORMAT_TABS: { key: ExportFormat; label: string; ext: string }[] = [
  { key: "markdown", label: "Markdown", ext: ".md" },
  { key: "json", label: "JSON", ext: ".json" },
  { key: "html", label: "HTML Report", ext: ".html" },
];

export function ExportPanel({ messages, stats, title }: Props) {
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [lean, setLean] = useState(false);
  const [fullStats, setFullStats] = useState(false);
  const [quoteReplies, setQuoteReplies] = useState(false);

  const mdOptions: ExportOptions = { lean, fullStats, quoteReplies, sourceFiles: stats.sourceFiles, title };
  const md = useMemo(() => exportMarkdown(messages, stats, mdOptions), [messages, stats, lean, fullStats, quoteReplies]);
  const jsonStr = useMemo(() => exportJson(messages, stats, title), [messages, stats, title]);
  const htmlStr = useMemo(() => exportHtml(messages, stats, title), [messages, stats, title]);

  const content = format === "markdown" ? md : format === "json" ? jsonStr : htmlStr;
  const token = estimateTokens(content);

  const slug = (title || "telegram-chat")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const outName = format === "json"
    ? getJsonFilename(title)
    : `${slug}-report.html`;

  function getFilename(): string {
    if (format === "json") return getJsonFilename(title);
    if (format === "html") return `${slug}-report.html`;
    const suffix = [
      lean ? "lean" : "full",
      fullStats ? "stats" : null,
      quoteReplies ? "quotes" : null,
    ].filter(Boolean).join("-");
    return `${slug}-${suffix || "default"}.md`;
  }

  function download() {
    const mime = format === "html" ? "text/html" : format === "json" ? "application/json" : "text/markdown";
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = getFilename();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      alert(`Clipboard copy failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const mimeType = format === "html" ? "text/html" : format === "json" ? "application/json" : "text/markdown";

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-5">
        {/* Format tabs */}
        <div className="flex items-center gap-1 mb-4 p-1 bg-zinc-950/60 rounded-lg w-fit">
          {FORMAT_TABS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFormat(f.key)}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                format === f.key
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Markdown-specific options */}
        {format === "markdown" && (
          <div className="flex flex-wrap gap-3 mb-4">
            <Toggle label="Lean mode" hint="drop IDs, blockquote prefixes, emojis" value={lean} onChange={setLean} />
            <Toggle label="Quote replies" hint="inline a snippet of the source message" value={quoteReplies} onChange={setQuoteReplies} />
            <Toggle label="Full stats" hint="include top-words / top-emojis tables" value={fullStats} onChange={setFullStats} />
          </div>
        )}

        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={download}
            className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-zinc-50 font-medium"
          >
            Download {getFilename()}
          </button>
          <button
            onClick={copy}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
          >
            Copy to clipboard
          </button>
          <div className="ml-auto text-zinc-400 tabular-nums text-sm">
            {fmtNumber(content.length)} chars · ~{fmtNumber(token.count)} tokens · {mimeType}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-5">
        <h3 className="text-sm font-semibold mb-2 text-zinc-400 uppercase tracking-wider">Preview</h3>
        <pre className="text-xs text-zinc-300 bg-zinc-950/50 rounded-lg p-4 max-h-[60vh] overflow-auto whitespace-pre-wrap font-mono">
          {format === "html" ? htmlStr.slice(0, 4000) : content.slice(0, 4000)}
          {content.length > 4000 && (
            <span className="text-zinc-500">…{fmtNumber(content.length - 4000)} more characters</span>
          )}
        </pre>
      </div>
    </div>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/40"
      />
      <span>
        <span className="text-sm text-zinc-100">{label}</span>
        <span className="text-xs text-zinc-500 block">{hint}</span>
      </span>
    </label>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ExportPanel.tsx
git commit -m "feat: upgrade export panel with Markdown/JSON/HTML format tabs"
```

---

### Task 5: Integration test — build + visual check

- [ ] **Step 1: Run the full build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run dev server and manually test**

Run: `npm run dev`
- Open browser
- Load a Telegram HTML export
- Click Export tab
- Verify: Markdown tab shows enhanced export with TL;DR, heatmap, personality profiles
- Verify: JSON tab downloads valid JSON with stats + messages
- Verify: HTML tab shows beautiful standalone report
- Verify: Download and Copy buttons work for each format
- Verify: Token estimate updates per format

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete export upgrades — JSON, enhanced markdown, HTML report"
```
