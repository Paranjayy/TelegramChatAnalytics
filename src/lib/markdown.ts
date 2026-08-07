/**
 * Markdown export. Mirrors the Python `format_message` + `_build_header` so
 * the export from the web app matches what `telegram_html_to_markdown.py`
 * produces (modulo HTML-comment footer).
 */

import type { ChatStats, Message } from "../types";

export interface ExportOptions {
  lean: boolean;
  fullStats: boolean;
  quoteReplies: boolean;
  sourceFiles: string[];
  title: string | null;
}

/* ---------- unicode visual helpers ---------- */

const BAR_BLOCK = "█";

function heatmap(dailyCounts: Record<string, number>, weeks = 12): string {
  const dates = Object.keys(dailyCounts).sort();
  if (!dates.length) return "";

  const end = new Date(dates[dates.length - 1] + "T00:00:00Z");
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - weeks * 7);

  const max = Math.max(...Object.values(dailyCounts), 1);
  const lines: string[] = [];
  lines.push("```");
  lines.push("     " + Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i * 7);
    return (d.getUTCMonth() + 1).toString().padStart(2, " ");
  }).join("  "));

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const showDays = [1, 3, 5]; // Mon, Wed, Fri
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const label = showDays.includes(dayIdx)
      ? dayNames[dayIdx].padEnd(5)
      : "     ";
    const cells: string[] = [];
    for (let w = 0; w < weeks; w++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + w * 7 + dayIdx);
      const iso = d.toISOString().slice(0, 10);
      const count = dailyCounts[iso] ?? 0;
      if (count === 0) {
        cells.push("  . ");
      } else {
        const intensity = Math.min(3, Math.ceil((count / max) * 3));
        cells.push(`  ${BAR_BLOCK.repeat(intensity + 1)} `);
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
    const bar = BAR_BLOCK.repeat(barLen);
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

    let emojiCount = 0;
    for (const m of senderMsgs) {
      const emojis = m.text.match(/[\u{1F300}-\u{1FAFF}]/gu) ?? [];
      emojiCount += emojis.length;
    }
    const emojiPerMsg = senderMsgs.length ? (emojiCount / senderMsgs.length).toFixed(1) : "0";
    const avgWordLen = s.words ? (s.chars / s.words).toFixed(1) : "0";
    const linkAffinity = s.linkMsgs ? ((s.linkMsgs / s.count) * 100).toFixed(0) : "0";

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
    lines.push(`- ${s.count.toLocaleString()} messages · ${s.sharePct}% of chat`);
    lines.push(`- Avg ${s.avgWords} words/msg · ${avgWordLen} chars/word`);
    lines.push(`- ${emojiPerMsg} emojis/msg · ${linkAffinity}% messages contain links`);
    lines.push(`- Replies to ${s.replyRatePct}% of messages · Received ${s.repliesRecv.toLocaleString()} replies`);
    lines.push(`- ${lateNightPct}% of messages sent between midnight-6am`);
    lines.push("");
  }

  return lines.join("\n");
}

function buildTldr(stats: ChatStats): string {
  const lines: string[] = [];
  const senders = Object.entries(stats.senders);
  const total = stats.totalMessages;

  lines.push("## TL;DR");
  lines.push("");

  if (senders.length === 2) {
    const [a, b] = senders;
    const ratio = a[1].count > b[1].count
      ? `${a[0]} messages ${(a[1].count / b[1].count).toFixed(1)}x more than ${b[0]}`
      : b[1].count > a[1].count
        ? `${b[0]} messages ${(b[1].count / a[1].count).toFixed(1)}x more than ${a[0]}`
        : "Perfectly balanced — both sent the same amount";
    lines.push(`- **${ratio}**`);
  } else if (senders.length > 2) {
    const [top] = senders;
    lines.push(`- **${top[0]}** dominates with ${top[1].sharePct}% of all messages`);
  }

  if (stats.mostActiveDay) {
    lines.push(`- Most intense day: **${fmtDate(stats.mostActiveDay.date)}** with ${stats.mostActiveDay.count} messages`);
  }

  if (stats.totalReplies) {
    const replyPct = ((stats.totalReplies / total) * 100).toFixed(0);
    lines.push(`- **${replyPct}%** of messages are replies — ${parseInt(replyPct) > 50 ? "heavy conversation" : "mostly independent messages"}`);
  }

  if (stats.mediaPct > 30) {
    lines.push(`- Visual-heavy chat: ${stats.mediaPct}% of messages include media`);
  } else if (stats.mediaPct < 10) {
    lines.push(`- Text-focused chat: only ${stats.mediaPct}% of messages include media`);
  }

  const wordHuman = stats.totalWords > 1000000
    ? `${(stats.totalWords / 1000000).toFixed(1)}M words`
    : stats.totalWords > 1000
      ? `${(stats.totalWords / 1000).toFixed(1)}K words`
      : `${stats.totalWords} words`;
  lines.push(`- Total output: **${wordHuman}** across ${stats.calendarDays} days`);

  if (stats.topEmojis.length) {
    const top3 = stats.topEmojis.slice(0, 3).map(([e, c]) => `${e}x${c}`).join(" ");
    lines.push(`- Signature emojis: ${top3}`);
  }

  lines.push("");
  return lines.join("\n");
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function shortTime(ts: string | null): string {
  if (!ts) return "??:??";
  const m = ts.match(/(\d{2}:\d{2})/);
  return m ? m[1] : ts;
}

function compactTime(ts: string | null, prevDay: string | null): { label: string; day: string | null } {
  if (!ts) return { label: prevDay ?? "??:??", day: prevDay };
  const m = ts.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}:\d{2})/);
  if (!m) return { label: shortTime(ts), day: prevDay };
  const day = `${m[1]}.${m[2]}`;
  return { label: day !== prevDay ? `${day} ${m[4]}` : m[4], day };
}

function truncate(s: string, limit = 140): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  return flat.slice(0, limit - 1).replace(/\s+\S*$/, "") + "…";
}

function formatMedia(m: Message["media"][number], lean: boolean): string {
  const labelMap: Record<string, string> = {
    photo: "📷 Photo",
    video: "🎬 Video",
    video_file: "🎬 Video",
    file: "📎 File",
    audio_file: "🎵 Audio",
    voice_message: "🎙 Voice",
    contact: "👤 Contact",
    location: "📍 Location",
    poll: "📊 Poll",
    sticker: "🌟 Sticker",
    animated: "🌟 Sticker",
  };
  let label = labelMap[m.kind] ?? `📦 ${m.kind[0].toUpperCase()}${m.kind.slice(1)}`;
  if (lean) label = label.replace(/^[^\w]+/, "");

  const bits: string[] = [label];
  if (m.title) bits.push(`**${m.title}**`);
  if (m.status) bits.push(`_${m.status}_`);
  if (m.description) bits.push(m.description);
  if (m.href && !m.href.startsWith("javascript")) bits.push(`[file](${m.href})`);
  return bits.filter(Boolean).join(" · ");
}

function stripTimezone(s: string): string {
  return s.replace(/\s*UTC[+\-]\d+.*$/, "");
}

function formatMessage(
  msg: Message,
  lean: boolean,
  quoteLookup: Map<string, Message> | null,
  prevDay: string | null,
  dailySenderCounts: Record<string, Record<string, number>>,
): { block: string; day: string | null } {
  if (msg.service) {
    const text = msg.service;
    if (/pinned/i.test(text)) {
      return { block: `\n---\n### 📌 ${text}\n`, day: prevDay };
    }
    // Date dividers look like '12 July 2026' — annotate with per-sender volume.
    let annotation = "";
    try {
      const [dStr, mStr, yStr] = text.split(" ");
      const day = dStr ? parseInt(dStr, 10) : NaN;
      const monthIdx = MONTHS.findIndex((m) => m === mStr) + 1;
      const year = yStr ? parseInt(yStr, 10) : NaN;
      if (!isNaN(day) && !isNaN(monthIdx) && !isNaN(year)) {
        const iso = `${year}-${String(monthIdx).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const ds = dailySenderCounts[iso];
        if (ds) {
          const total = Object.values(ds).reduce((a, b) => a + b, 0);
          const parts = Object.entries(ds)
            .sort((a, b) => b[1] - a[1])
            .map(([name, n]) => `${name} ${n.toLocaleString()}`);
          annotation = ` — ${total.toLocaleString()} msgs (${parts.join(", ")})`;
        }
      }
    } catch { /* ignore */ }
    return { block: `\n---\n### 📅 ${text}${annotation}\n`, day: prevDay };
  }

  const sender = msg.sender ?? "Unknown";
  const { label: timeLabel, day: newDay } = compactTime(msg.timestamp, prevDay);
  let header: string;
  if (lean) {
    header = `**[${timeLabel}] ${sender}:**`;
  } else {
    header = `**${sender}** · \`${timeLabel}\``;
    if (msg.id) header += ` · [#${msg.id}](${msg.id})`;
  }
  const lines: string[] = [header];

  if (msg.forwardedFrom) lines.push(`> ↪️ Forwarded from **${msg.forwardedFrom}**`);
  if (msg.replyTo) {
    let snippet = "";
    if (quoteLookup) {
      const original = quoteLookup.get(msg.replyTo);
      if (original) snippet = truncate(original.text);
    }
    if (snippet) {
      lines.push(`> ↩️ In reply to [${msg.replyTo}](#${msg.replyTo}): *${snippet}*`);
    } else {
      lines.push(`> ↩️ In reply to [message ${msg.replyTo}](#${msg.replyTo})`);
    }
  }

  if (msg.text) {
    if (lean) {
      lines.push(msg.text);
    } else {
      lines.push(msg.text.split("\n").map((l) => `> ${l}`).join("\n"));
    }
  }
  for (const media of msg.media) {
    const s = formatMedia(media, lean);
    lines.push((lean ? "" : "> ") + s);
  }
  return { block: lines.join("\n").trimEnd(), day: newDay };
}

function buildHeader(stats: ChatStats, options: ExportOptions, messages?: Message[]): string {
  const { lean, fullStats, sourceFiles, title } = options;
  const lines: string[] = [];
  lines.push(`# ${title ?? "Telegram Chat Export"}`);
  lines.push("");
  lines.push("## Metadata");
  lines.push("");
  if (lean) {
    lines.push("_Stats below exclude URL text and Markdown link markup from counts._");
    lines.push("");
  }
  const rows: Array<[string, string]> = [
    ["Source files", sourceFiles.join(", ") || "—"],
    ["Total messages", stats.totalMessages.toLocaleString()],
    ["Date span", `${fmtDate(stats.firstDate)} to ${fmtDate(stats.lastDate)}`],
    ["Calendar days", stats.calendarDays.toLocaleString()],
    ["Unique senders", String(Object.keys(stats.senders).length)],
    ["Words", stats.totalWords.toLocaleString()],
    ["Characters", stats.totalChars.toLocaleString()],
    ["Reply messages", stats.totalReplies.toLocaleString()],
    ["Messages with visible media", stats.mediaMsgs.toLocaleString()],
    ["Messages with links", stats.totalLinkMsgs.toLocaleString()],
    ["Total links / URLs", stats.totalLinks.toLocaleString()],
    ["Unique links", stats.uniqueLinks.toLocaleString()],
    ["Photos", (stats.mediaKinds.photo ?? 0).toLocaleString()],
    [
      "Videos / animations",
      (stats.mediaKinds.video ?? 0) + (stats.mediaKinds.video_file ?? 0) + (stats.mediaKinds.animated ?? 0) + ""
    ],
    ["Files / documents", (stats.mediaKinds.file ?? 0).toLocaleString()],
  ];
  lines.push("| Metric | Value |");
  lines.push("|---|---:|");
  for (const [k, v] of rows) lines.push(`| ${k} | ${v} |`);
  lines.push("");

  lines.push("## Highlights");
  lines.push("");
  if (stats.mostActiveDay) {
    lines.push(`- Most active day: ${fmtDate(stats.mostActiveDay.date)} (${stats.mostActiveDay.count} messages)`);
  }
  if (stats.leastActiveDay && stats.leastActiveDay.date !== stats.mostActiveDay?.date) {
    lines.push(`- Quietest day: ${fmtDate(stats.leastActiveDay.date)} (${stats.leastActiveDay.count} messages)`);
  }
  if (stats.mostMediaDay) {
    lines.push(`- Most media-heavy day: ${fmtDate(stats.mostMediaDay.date)} (${stats.mostMediaDay.count} media items)`);
  }
  if (stats.longestMsg.chars) {
    const sender = stats.longestMsg.sender ?? "Unknown";
    const date = stats.longestMsg.date ? stripTimezone(stats.longestMsg.date) : "—";
    lines.push(`- Longest visible message: ${date} · ${sender} (${stats.longestMsg.chars.toLocaleString()} characters)`);
  }
  lines.push(`- Average per day: ${stats.avgPerDay} messages`);
  lines.push(`- Average message length: ${stats.avgMsgLen} words`);
  if (stats.totalMessages) {
    lines.push(`- Media coverage: ${stats.mediaPct}% of messages include visible media`);
    lines.push(`- Link coverage: ${stats.linkPct}% of messages include links`);
  }
  lines.push(`- Text-only messages: ${stats.textOnly.toLocaleString()}`);
  lines.push(`- Text + media messages: ${stats.textAndMedia.toLocaleString()}`);
  lines.push(`- Media-only messages: ${stats.mediaOnly.toLocaleString()}`);
  lines.push("");

  // Sender breakdown
  if (Object.keys(stats.senders).length) {
    lines.push("## Sender Breakdown");
    lines.push("");
    lines.push("| Sender | Messages | Share | Words | Characters |");
    lines.push("|---|---:|---:|---:|---:|");
    for (const [name, s] of Object.entries(stats.senders)) {
      lines.push(`| ${name} | ${s.count.toLocaleString()} | ${s.sharePct}% | ${s.words.toLocaleString()} | ${s.chars.toLocaleString()} |`);
    }
    lines.push("");
  }

  // Reply breakdown
  if (stats.totalReplies) {
    lines.push("## Reply Breakdown");
    lines.push("");
    lines.push("| Sender | Replies Sent | Reply Share | Reply Words | Reply Chars | Replies Received | Reply Rate |");
    lines.push("|---|---:|---:|---:|---:|---:|---:|");
    for (const [name, s] of Object.entries(stats.senders)) {
      if (!s.repliesSent && !s.repliesRecv) continue;
      lines.push(`| ${name} | ${s.repliesSent.toLocaleString()} | ${s.replySharePct}% | ${s.replyWords.toLocaleString()} | ${s.replyChars.toLocaleString()} | ${s.repliesRecv.toLocaleString()} | ${s.replyRatePct}% |`);
    }
    lines.push("");
  }

  // Link breakdown
  if (stats.totalLinks) {
    lines.push("## Link Breakdown");
    lines.push("");
    lines.push("| Sender | Links Shared | Link Messages | Link Words | Link Chars |");
    lines.push("|---|---:|---:|---:|---:|");
    for (const [name, s] of Object.entries(stats.senders)) {
      if (!s.links) continue;
      lines.push(`| ${name} | ${s.links.toLocaleString()} | ${s.linkMsgs.toLocaleString()} | ${s.linkWords.toLocaleString()} | ${s.linkChars.toLocaleString()} |`);
    }
    lines.push("");
  }

  // Conversation markers
  lines.push("## Conversation Markers");
  lines.push("");
  if (Object.keys(stats.senders).length) {
    const sorted = Object.entries(stats.senders);
    const topReply = sorted.reduce((a, b) => (a[1].repliesSent >= b[1].repliesSent ? a : b));
    const topRecv = sorted.reduce((a, b) => (a[1].repliesRecv >= b[1].repliesRecv ? a : b));
    const topLinkSender = sorted.reduce((a, b) => (a[1].links >= b[1].links ? a : b));
    lines.push(`- Most replies sent: ${topReply[0]} (${topReply[1].repliesSent} replies)`);
    lines.push(`- Most replies received: ${topRecv[0]} (${topRecv[1].repliesRecv} replies)`);
    if (topReply[1].replyChars) lines.push(`- Most reply chars sent: ${topReply[0]} (${topReply[1].replyChars.toLocaleString()} chars)`);
    if (topLinkSender[1].links) lines.push(`- Most links shared: ${topLinkSender[0]} (${topLinkSender[1].links} links)`);
  }
  if (stats.topDomains.length) {
    lines.push(`- Top link domain: ${stats.topDomains[0][0]} (${stats.topDomains[0][1]} links)`);
  }
  if (stats.totalMessages) {
    lines.push(`- Reply density: ${stats.totalReplies.toLocaleString()} reply messages out of ${stats.totalMessages.toLocaleString()} total`);
    lines.push(`- Non-reply messages: ${(stats.totalMessages - stats.totalReplies).toLocaleString()}`);
  }
  if (Object.keys(stats.senders).length) {
    const sorted = Object.entries(stats.senders);
    const top = sorted.reduce((a, b) => (a[1].count >= b[1].count ? a : b));
    lines.push(`- Message share leader: ${top[0]} (${top[1].sharePct}% of all messages)`);
  }
  if (stats.totalMessages) {
    lines.push(`- Link density: ${stats.totalLinkMsgs.toLocaleString()} link messages out of ${stats.totalMessages.toLocaleString()} total`);
  }
  lines.push("");

  // Weekly
  if (stats.weekly.length > 1) {
    lines.push("## Weekly Stats");
    lines.push("");
    lines.push("| Week | Messages | Words | Characters | Replies | Media | Links | Top Sender |");
    lines.push("|---|---:|---:|---:|---:|---:|---:|---|");
    for (const w of stats.weekly) {
      const sw = Object.entries(w.senderWords);
      const top = sw.length ? sw.reduce((a, b) => (a[1] >= b[1] ? a : b)) : ["—", 0];
      const label = `${fmtDate(w.start)} to ${fmtDate(w.end)}`;
      lines.push(`| ${label} | ${w.messages.toLocaleString()} | ${w.words.toLocaleString()} | ${w.chars.toLocaleString()} | ${w.replies.toLocaleString()} | ${w.media.toLocaleString()} | ${w.links.toLocaleString()} | ${top[0]} |`);
    }
    lines.push("");
  }

  // Top link domains
  if (stats.topDomains.length) {
    lines.push("## Top Link Domains");
    lines.push("");
    lines.push("| Domain | Links |");
    lines.push("|---|---:|");
    for (const [d, n] of stats.topDomains) lines.push(`| ${d} | ${n.toLocaleString()} |`);
    lines.push("");
  }

  // Per-day volume
  if (Object.keys(stats.dailySenderCounts).length) {
    lines.push("## Per-Day Volume");
    lines.push("");
    const senders = Object.keys(stats.senders);
    const hasMedia = Object.entries(stats.dailySenderMedia).some(([, m]) =>
      Object.values(m).some((n) => n > 0),
    );
    const cols = ["Total", ...senders];
    if (hasMedia) cols.push(...senders.map((s) => `${s} media`));
    lines.push("| Date | " + cols.join(" | ") + " |");
    lines.push("|---|" + cols.map(() => "---:").join("|") + "|");
    for (const day of Object.keys(stats.dailyCounts).sort()) {
      const ds = stats.dailySenderCounts[day] ?? {};
      const dm = stats.dailySenderMedia[day] ?? {};
      const total = stats.dailyCounts[day];
      const cells = [total.toLocaleString()];
      cells.push(...senders.map((s) => (ds[s] ?? 0).toLocaleString()));
      if (hasMedia) cells.push(...senders.map((s) => (dm[s] ?? 0).toLocaleString()));
      lines.push(`| ${fmtDate(day)} | ${cells.join(" | ")} |`);
    }
    lines.push("");
  }

  // Top words / emojis
  if (fullStats) {
    if (stats.topWords.length) {
      lines.push("## Top Words");
      lines.push("");
      lines.push("| Word | Count |");
      lines.push("|---|---:|");
      for (const [w, c] of stats.topWords) lines.push(`| ${w} | ${c} |`);
      lines.push("");
    }
    if (stats.topEmojis.length) {
      lines.push("## Top Emojis");
      lines.push("");
      lines.push("| Emoji | Count |");
      lines.push("|---|---:|");
      for (const [e, c] of stats.topEmojis) lines.push(`| ${e} | ${c} |`);
      lines.push("");
    }
  } else if (lean && (stats.topWords.length || stats.topEmojis.length)) {
    if (stats.topWords.length) lines.push(`- **Top words:** ${stats.topWords.slice(0, 10).map(([w, c]) => `${w} (${c})`).join(", ")}`);
    if (stats.topEmojis.length) lines.push(`- **Top emojis:** ${stats.topEmojis.slice(0, 10).map(([e, c]) => `${e}×${c}`).join(" ")}`);
    lines.push("");
  }

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
  if (messages && messages.length > 50) {
    lines.push("## Time of Day Distribution");
    lines.push("");
    lines.push(timeDistribution(messages));
    lines.push("");
  }

  // Sender personality profiles
  if (messages && Object.keys(stats.senders).length > 0) {
    lines.push("## Chat Personality Profiles");
    lines.push("");
    lines.push(senderPersonality(messages, stats));
  }

  lines.push("---");
  return lines.join("\n");
}

export function exportMarkdown(messages: Message[], stats: ChatStats, options: ExportOptions): string {
  const header = buildHeader(stats, options, messages);
  const quoteLookup = options.quoteReplies
    ? new Map(messages.filter((m) => m.id).map((m) => [m.id as string, m] as const))
    : null;

  const blocks: string[] = [];
  let prevDay: string | null = null;
  let firstBlockStripped = false;
  for (const m of messages) {
    const { block, day } = formatMessage(m, options.lean, quoteLookup, prevDay, stats.dailySenderCounts);
    prevDay = day;
    let b = block;
    if (!firstBlockStripped && b.startsWith("\n---\n")) {
      b = b.slice("\n---\n".length);
      firstBlockStripped = true;
    }
    blocks.push(b.replace(/\n+$/, ""));
  }
  const body = blocks.join("\n\n");
  return header + "\n" + body + "\n";
}

export function estimateTokens(text: string): { count: number; method: string } {
  // Use a simple char/4 heuristic. tiktoken doesn't ship in the browser and
  // a 30-line fallback keeps the bundle tiny.
  return { count: Math.ceil(text.length / 4), method: "char/4 estimate" };
}
