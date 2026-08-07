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

export function exportJson(messages: Message[], stats: ChatStats, _title: string): string {
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
