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

const FORMAT_TABS: { key: ExportFormat; label: string }[] = [
  { key: "markdown", label: "Markdown" },
  { key: "json", label: "JSON" },
  { key: "html", label: "HTML Report" },
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
          {content.slice(0, 4000)}
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
