/**
 * Domain types for Telegram chat analytics.
 *
 * These mirror the dict shapes the Python exporter used. Comments note
 * where the source parser diverges from raw Telegram HTML.
 */

export type MessageId = string; // e.g. "message81895" or "81895"

export interface MediaItem {
  kind: "photo" | "video" | "video_file" | "file" | "audio_file"
       | "voice_message" | "contact" | "location" | "poll"
       | "sticker" | "animated" | string;
  title?: string;
  status?: string;     // e.g. "800×1440, 112.1 KB"
  description?: string;
  href?: string;
}

export interface Message {
  id: MessageId | null;
  /** ISO-ish "12.07.2026 01:11:22 UTC+05:30" or null if absent. */
  timestamp: string | null;
  sender: string | null;
  /** Plain-text or markdown already rendered. */
  text: string;
  replyTo: MessageId | null;
  forwardedFrom: string | null;
  isForwarded: boolean;
  media: MediaItem[];
  joined: boolean;
  /** Service dividers carry a free-form `service` string instead. */
  service?: string;
}

export interface SenderStats {
  count: number;
  words: number;
  chars: number;
  media: number;
  links: number;
  linkMsgs: number;
  repliesSent: number;
  repliesRecv: number;
  replyWords: number;
  replyChars: number;
  linkWords: number;
  linkChars: number;
  sharePct: number;
  avgWords: number;
  avgChars: number;
  replyRatePct: number;
  replySharePct: number;
}

export interface WeekBucket {
  isoYear: number;
  isoWeek: number;
  start: string;     // ISO date
  end: string;       // ISO date
  messages: number;
  words: number;
  chars: number;
  replies: number;
  media: number;
  links: number;
  senderWords: Record<string, number>;
}

export interface ChatStats {
  sourceFiles: string[];
  totalMessages: number;
  totalWords: number;
  totalChars: number;
  totalReplies: number;
  mediaMsgs: number;
  mediaKinds: Record<string, number>;
  textOnly: number;
  textAndMedia: number;
  mediaOnly: number;
  mediaPct: number;
  totalLinkMsgs: number;
  totalLinks: number;
  uniqueLinks: number;
  linkPct: number;
  forwards: number;
  calendarDays: number;
  firstDate: string | null;   // ISO date
  lastDate: string | null;
  avgPerDay: number;
  avgMsgLen: number;
  mostActiveDay: { date: string; count: number } | null;
  leastActiveDay: { date: string; count: number } | null;
  mostMediaDay: { date: string; count: number } | null;
  longestMsg: { chars: number; sender: string | null; date: string | null; id: string | null };
  topWords: [string, number][];
  topEmojis: [string, number][];
  topDomains: [string, number][];
  senders: Record<string, SenderStats>;
  weekly: WeekBucket[];
  dailyCounts: Record<string, number>;
  dailySenderCounts: Record<string, Record<string, number>>;
  dailySenderMedia: Record<string, Record<string, number>>;
}

export type ExportFormat = "markdown" | "json" | "html";

export interface ParseResult {
  messages: Message[];
  stats: ChatStats;
  idIndex: Map<string, Message>;
}
