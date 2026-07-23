/**
 * Compute every aggregate the dashboard needs from a parsed Message list.
 * Mirrors `compute_stats` in scripts/telegram_html_to_markdown.py.
 */

import type { ChatStats, Message, SenderStats, WeekBucket } from "../types";

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "to", "of",
  "in", "on", "at", "for", "by", "with", "and", "or", "but", "not", "no", "i",
  "you", "he", "she", "it", "we", "they", "me", "my", "mine", "your", "yours",
  "his", "her", "its", "our", "ours", "their", "theirs", "this", "that", "these",
  "those", "as", "if", "so", "do", "did", "does", "have", "has", "had", "from",
  "am", "will", "would", "should", "can", "could", "may", "might", "than", "then",
  "too", "very", "just", "about", "into", "out", "up", "down", "over", "under",
  "again", "once", "here", "there", "when", "where", "why", "how", "all", "any",
  "both", "each", "few", "more", "most", "other", "some", "such", "only", "own",
  "same", "also", "what", "which", "who", "whom", "because", "while", "through",
]);

/* ---------- text helpers ---------- */

function stripUrls(s: string): string {
  return s
    .replace(/\]\(https?:\/\/[^)\s]+\)/g, "")
    .replace(/https?:\/\/[^\s)\]]+/g, "");
}

function tokenizeWords(text: string): string[] {
  if (!text) return [];
  const cleaned = stripUrls(text);
  return (cleaned.toLowerCase().match(/[a-z][a-z0-9'_]{1,}/g) ?? []);
}

function tokenizeEmojis(text: string): string[] {
  if (!text) return [];
  const re = /[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  return text.match(re) ?? [];
}

function extractLinks(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const mdRe = /\]\((https?:\/\/[^)\s]+)\)/g;
  for (const m of text.matchAll(mdRe)) out.push(m[1]);
  const bareRe = /(?<![\(\[])https?:\/\/[^\s)\]]+/g;
  for (const m of text.matchAll(bareRe)) {
    if (!out.includes(m[0])) out.push(m[0]);
  }
  return out;
}

function domainOf(url: string): string {
  const m = url.match(/^https?:\/\/(?:www\.)?([^/]+)/i);
  return m ? m[1].toLowerCase() : url;
}

function parseDate(ts: string | null): Date | null {
  if (!ts) return null;
  const m = ts.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, dd, mo, yy, hh, mm, ss] = m;
  // Build a UTC Date so subsequent UTC accessors give stable results
  // regardless of the host timezone.
  const d = new Date(Date.UTC(+yy, +mo - 1, +dd, +hh, +mm, +ss));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoWeek(d: Date): { year: number; week: number } {
  // Copy to avoid mutating the input.
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Thursday of current week determines the year.
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}

function emptySenderStats(): SenderStats {
  return {
    count: 0, words: 0, chars: 0, media: 0, links: 0, linkMsgs: 0,
    repliesSent: 0, repliesRecv: 0, replyWords: 0, replyChars: 0,
    linkWords: 0, linkChars: 0,
    sharePct: 0, avgWords: 0, avgChars: 0,
    replyRatePct: 0, replySharePct: 0,
  };
}

/* ---------- main ---------- */

export function computeStats(messages: Message[], sourceFiles: string[] = []): ChatStats {
  const senders: Record<string, SenderStats> = {};
  const wordCounts = new Map<string, number>();
  const emojiCounts = new Map<string, number>();
  const mediaKinds: Record<string, number> = {};
  const repliesSent: Record<string, number> = {};
  const repliesRecv: Record<string, number> = {};
  const replyWordChars: Record<string, { words: number; chars: number }> = {};

  const domainCounts = new Map<string, number>();
  const dailyCounts: Record<string, number> = {};
  const dailyMedia: Record<string, number> = {};
  const dailySenderCounts: Record<string, Record<string, number>> = {};
  const dailySenderMedia: Record<string, Record<string, number>> = {};
  const weeklyMap = new Map<string, WeekBucket>();
  const dates = new Set<string>();
  const uniqueLinks = new Set<string>();

  let totalMessages = 0;
  let totalWords = 0;
  let totalChars = 0;
  let totalReplies = 0;
  let totalLinkMsgs = 0;
  let totalLinks = 0;
  let textOnly = 0;
  let textAndMedia = 0;
  let mediaOnly = 0;
  let forwards = 0;
  const longest = { chars: 0, sender: null as string | null, date: null as string | null, id: null as string | null };

  // Pre-pass: build id -> sender so we can count replies received.
  const idToSender = new Map<string, string>();
  for (const m of messages) {
    if (!m.id) continue;
    idToSender.set(m.id, m.sender ?? "");
    if (m.id.startsWith("message")) idToSender.set(m.id.slice("message".length), m.sender ?? "");
  }

  for (const m of messages) {
    if (m.service) continue;
    const sender = m.sender;
    const text = m.text || "";
    const words = tokenizeWords(text);
    const emojis = tokenizeEmojis(text);
    const links = extractLinks(text);

    const wn = words.length;
    const cn = text.length;
    totalWords += wn;
    totalChars += cn;
    totalMessages += 1;

    const hasText = !!text.trim();
    const hasMedia = m.media.length > 0;
    if (hasText && hasMedia) textAndMedia += 1;
    else if (hasMedia) mediaOnly += 1;
    else if (hasText) textOnly += 1;

    if (sender) {
      const s = senders[sender] ?? (senders[sender] = emptySenderStats());
      s.count += 1;
      s.words += wn;
      s.chars += cn;
      s.media += m.media.length;
      if (links.length) {
        s.links += links.length;
        s.linkMsgs += 1;
        s.linkWords += wn;
        s.linkChars += cn;
      }
    }

    for (const w of words) {
      if (STOPWORDS.has(w) || w.length < 3) continue;
      wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
    }
    for (const e of emojis) emojiCounts.set(e, (emojiCounts.get(e) ?? 0) + 1);

    for (const media of m.media) {
      mediaKinds[media.kind] = (mediaKinds[media.kind] ?? 0) + 1;
    }

    if (m.isForwarded) forwards += 1;

    if (m.replyTo) {
      repliesSent[sender ?? ""] = (repliesSent[sender ?? ""] ?? 0) + 1;
      if (sender) {
        const rwc = replyWordChars[sender] ?? (replyWordChars[sender] = { words: 0, chars: 0 });
        rwc.words += wn;
        rwc.chars += cn;
      }
      const target = idToSender.get(m.replyTo);
      if (target) repliesRecv[target] = (repliesRecv[target] ?? 0) + 1;
      totalReplies += 1;
    }

    if (links.length) {
      totalLinks += links.length;
      totalLinkMsgs += 1;
      for (const url of links) {
        uniqueLinks.add(url);
        const d = domainOf(url);
        domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
      }
    }

    const d = parseDate(m.timestamp);
    if (d) {
      const day = isoDate(d);
      dates.add(day);
      dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;
      if (hasMedia) dailyMedia[day] = (dailyMedia[day] ?? 0) + 1;
      if (sender) {
        const ds = dailySenderCounts[day] ?? (dailySenderCounts[day] = {});
        ds[sender] = (ds[sender] ?? 0) + 1;
        if (hasMedia) {
          const dm = dailySenderMedia[day] ?? (dailySenderMedia[day] = {});
          dm[sender] = (dm[sender] ?? 0) + m.media.length;
        }
      }
      const { year, week } = isoWeek(d);
      const key = `${year}-${week}`;
      const wkStart = new Date(d);
      wkStart.setDate(wkStart.getDate() - ((wkStart.getDay() + 6) % 7));
      const wkEnd = new Date(wkStart);
      wkEnd.setDate(wkEnd.getDate() + 6);
      const wb = weeklyMap.get(key) ?? {
        isoYear: year, isoWeek: week,
        start: isoDate(wkStart), end: isoDate(wkEnd),
        messages: 0, words: 0, chars: 0, replies: 0, media: 0, links: 0,
        senderWords: {},
      };
      wb.messages += 1;
      wb.words += wn;
      wb.chars += cn;
      if (m.replyTo) wb.replies += 1;
      if (hasMedia) wb.media += 1;
      if (links.length) wb.links += links.length;
      if (sender) wb.senderWords[sender] = (wb.senderWords[sender] ?? 0) + wn;
      weeklyMap.set(key, wb);
    }

    if (cn > longest.chars) {
      longest.chars = cn;
      longest.sender = sender;
      longest.date = m.timestamp;
      longest.id = m.id;
    }
  }

  // Finalize sender stats.
  for (const [name, s] of Object.entries(senders)) {
    s.sharePct = totalMessages ? Math.round((100 * s.count) / totalMessages * 10) / 10 : 0;
    s.avgWords = s.count ? Math.floor(s.words / s.count) : 0;
    s.avgChars = s.count ? Math.floor(s.chars / s.count) : 0;
    s.repliesSent = repliesSent[name] ?? 0;
    s.repliesRecv = repliesRecv[name] ?? 0;
    const rwc = replyWordChars[name];
    if (rwc) { s.replyWords = rwc.words; s.replyChars = rwc.chars; }
    s.replyRatePct = s.count ? Math.round((100 * s.repliesSent) / s.count * 10) / 10 : 0;
    s.replySharePct = totalReplies ? Math.round((100 * s.repliesSent) / totalReplies * 10) / 10 : 0;
  }

  const sortedSenders: Record<string, SenderStats> = {};
  for (const [name, s] of Object.entries(senders).sort((a, b) => b[1].count - a[1].count)) {
    sortedSenders[name] = s;
  }

  const sortedDates = [...dates].sort();
  const mostActive = sortedDates.length
    ? sortedDates.map((d) => [d, dailyCounts[d]] as const).sort((a, b) => b[1] - a[1])[0]
    : null;
  const leastActive = sortedDates.length
    ? sortedDates.map((d) => [d, dailyCounts[d]] as const).sort((a, b) => a[1] - b[1])[0]
    : null;
  const mostMedia = sortedDates.length
    ? sortedDates.map((d) => [d, dailyMedia[d] ?? 0] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0]
    : null;

  const topWords = [...wordCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  const topEmojis = [...emojiCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topDomains = [...domainCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const weekly = [...weeklyMap.values()].sort((a, b) => a.start.localeCompare(b.start));

  const calendarDays = sortedDates.length
    ? (new Date(sortedDates[sortedDates.length - 1]).getTime() - new Date(sortedDates[0]).getTime()) / 86400000 + 1
    : 0;
  const avgPerDay = calendarDays ? Math.round((totalMessages / calendarDays) * 10) / 10 : 0;
  const avgMsgLen = totalMessages ? Math.round((totalWords / totalMessages) * 10) / 10 : 0;
  const mediaMsgs = textAndMedia + mediaOnly;
  const mediaPct = totalMessages ? Math.round((100 * mediaMsgs / totalMessages) * 10) / 10 : 0;
  const linkPct = totalMessages ? Math.round((100 * totalLinkMsgs / totalMessages) * 10) / 10 : 0;

  return {
    sourceFiles,
    totalMessages,
    totalWords,
    totalChars,
    totalReplies,
    mediaMsgs,
    mediaKinds,
    textOnly,
    textAndMedia,
    mediaOnly,
    mediaPct,
    totalLinkMsgs,
    totalLinks,
    uniqueLinks: uniqueLinks.size,
    linkPct,
    forwards,
    calendarDays: Math.round(calendarDays),
    firstDate: sortedDates[0] ?? null,
    lastDate: sortedDates[sortedDates.length - 1] ?? null,
    avgPerDay,
    avgMsgLen,
    mostActiveDay: mostActive ? { date: mostActive[0], count: mostActive[1] } : null,
    leastActiveDay: leastActive ? { date: leastActive[0], count: leastActive[1] } : null,
    mostMediaDay: mostMedia ? { date: mostMedia[0], count: mostMedia[1] } : null,
    longestMsg: longest,
    topWords,
    topEmojis,
    topDomains,
    senders: sortedSenders,
    weekly,
    dailyCounts,
    dailySenderCounts,
    dailySenderMedia,
  };
}
