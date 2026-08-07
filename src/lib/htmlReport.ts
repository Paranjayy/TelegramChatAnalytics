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
    .highlight li::before { content: "\\2192 "; color: var(--accent); }
    .emoji-cloud { text-align: center; padding: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; }
    .word-tags { line-height: 2; }
    .footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.75rem; text-align: center; }
    @media print { body { background: #fff; color: #000; } h1 span, .kpi .value { color: #000; } .kpi, .chart-container, .highlight { border-color: #ddd; background: #f9f9f9; } }
  </style>
</head>
<body>
  <h1><span>&#x232C;</span> ${title}</h1>
  <div class="subtitle">Analytics report &middot; Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} &middot; ${stats.sourceFiles.join(", ")}</div>

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
