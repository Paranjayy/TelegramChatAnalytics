import { useEffect, useMemo, useState } from "react";
import type { ChatStats, Message } from "../types";
import { exportMarkdown, type ExportOptions } from "../lib/markdown";
import { DEFAULT_PRESET_ID, MODEL_PRESETS, findPreset, type ModelPreset } from "../lib/modelPresets";
import { fmtNumber, classNames } from "../lib/format";
import { sliceMarkdown, type SliceSettings, type OutputChunk } from "../lib/slicer";

interface Props {
  messages: Message[];
  stats: ChatStats;
  title: string;
}

const TEMPLATES = [
  {
    id: "default",
    label: "Default (just wait)",
    settings: {
      firstMessage: "I'm providing a long chat export in {total} parts. Please wait until I have sent all of them, then I'll ask my question.",
      chunkHeader: "[START PART {part}/{total}]",
      chunkFooter: "[END PART {part}/{total}]",
    },
  },
  {
    id: "summarize",
    label: "Summarization",
    settings: {
      firstMessage: "You are an expert summarizer. I'm sending you a long chat export in {total} parts. After the final part, give me a structured summary covering the key topics, decisions, and any unresolved threads.",
      chunkHeader: "--- Part {part} of {total} ---",
      chunkFooter: "--- End of Part {part} ---",
    },
  },
  {
    id: "qa",
    label: "Q&A knowledge base",
    settings: {
      firstMessage: "I'm providing a document in chunks as a knowledge base. Process each part. After I send the final part, I'll start asking questions.",
      chunkHeader: "--- CONTEXT PART {part}/{total} ---",
      chunkFooter: "",
    },
  },
  {
    id: "none",
    label: "No template (raw chunks)",
    settings: {
      firstMessage: "",
      chunkHeader: "",
      chunkFooter: "",
    },
  },
] as const;

export function SlicerPanel({ messages, stats, title }: Props) {
  const [presetId, setPresetId] = useState<string>(DEFAULT_PRESET_ID);
  const [exportOpts, setExportOpts] = useState<ExportOptions>({
    lean: false,
    fullStats: true,
    quoteReplies: false,
    sourceFiles: stats.sourceFiles,
    title,
  });
  const [templateId, setTemplateId] = useState<typeof TEMPLATES[number]["id"]>("default");
  const [replyBudget, setReplyBudget] = useState<number>(4_000);
  const [guardBandPct, setGuardBandPct] = useState<number>(0.02);
  const [overlap, setOverlap] = useState<number>(200);

  const preset = findPreset(presetId);

  // Sync settings when preset changes.
  useEffect(() => {
    setReplyBudget(preset.defaultReplyBudget);
    setGuardBandPct(preset.defaultGuardBandPct);
  }, [presetId, preset.defaultReplyBudget, preset.defaultGuardBandPct]);

  const md = useMemo(() => exportMarkdown(messages, stats, exportOpts), [messages, stats, exportOpts]);

  const settings: SliceSettings = useMemo(() => {
    const tpl = TEMPLATES.find((t) => t.id === templateId)!;
    return {
      model: preset,
      replyBudget,
      guardBandPct,
      overlap,
      firstMessage: tpl.settings.firstMessage,
      chunkHeader: tpl.settings.chunkHeader,
      chunkFooter: tpl.settings.chunkFooter,
    };
  }, [preset, replyBudget, guardBandPct, overlap, templateId]);

  const result = useMemo(() => sliceMarkdown(md, settings), [md, settings]);

  // Re-compute export options when source files / title change.
  useEffect(() => {
    setExportOpts((o) => ({ ...o, sourceFiles: stats.sourceFiles, title }));
  }, [stats.sourceFiles, title]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-5">
        <h2 className="text-lg font-semibold mb-3">Slicer</h2>
        <p className="text-sm text-zinc-400 mb-4">
          Splits the Markdown export into chunks that fit the chosen model's context window. Uses real token counts via <code>gpt-tokenizer</code>.
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Model preset">
            <select
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              {MODEL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {(p.inputContext / 1000).toFixed(0)}K ctx ({p.encoding})
                </option>
              ))}
            </select>
            {preset.notes && (
              <div className="text-xs text-zinc-500 mt-1">{preset.notes}</div>
            )}
          </Field>

          <Field label="Template">
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value as typeof TEMPLATES[number]["id"])}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Reply budget (tokens)">
            <input
              type="number"
              min={0}
              step={500}
              value={replyBudget}
              onChange={(e) => setReplyBudget(Math.max(0, +e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 tabular-nums"
            />
          </Field>

          <Field label="Guard band (% of context)">
            <input
              type="number"
              min={0}
              max={50}
              step={1}
              value={Math.round(guardBandPct * 100)}
              onChange={(e) => setGuardBandPct(Math.max(0, Math.min(0.5, (+e.target.value) / 100)))}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 tabular-nums"
            />
          </Field>

          <Field label="Chunk overlap (tokens)">
            <input
              type="number"
              min={0}
              step={50}
              value={overlap}
              onChange={(e) => setOverlap(Math.max(0, +e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 tabular-nums"
            />
          </Field>

          <Field label="Export options">
            <div className="flex flex-wrap gap-3 pt-1">
              <Checkbox label="Lean" value={exportOpts.lean} onChange={(v) => setExportOpts((o) => ({ ...o, lean: v }))} />
              <Checkbox label="Full stats" value={exportOpts.fullStats} onChange={(v) => setExportOpts((o) => ({ ...o, fullStats: v }))} />
              <Checkbox label="Quote replies" value={exportOpts.quoteReplies} onChange={(v) => setExportOpts((o) => ({ ...o, quoteReplies: v }))} />
            </div>
          </Field>
        </div>
      </div>

      {/* Summary card */}
      <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-5">
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Summary label="Source tokens" value={fmtNumber(result.inputTokens)} />
          <Summary label="Chunks" value={fmtNumber(result.chunks.length)} />
          <Summary label="Largest chunk" value={`${fmtNumber(maxTokens(result.chunks))} tok`} />
          <Summary label="Context" value={`${fmtNumber(preset.inputContext)} (${preset.encoding})`} />
          {result.estimatedCost !== undefined && (
            <Summary label="Est. cost" value={`$${result.estimatedCost.toFixed(4)}`} />
          )}
          {result.overheadTokens > 0 && (
            <Summary label="Template overhead" value={`${fmtNumber(result.overheadTokens)} tok`} />
          )}
        </div>
        {result.warnings.length > 0 && (
          <ul className="mt-3 text-xs text-amber-300 space-y-1">
            {result.warnings.map((w: string) => <li key={w}>⚠️ {w}</li>)}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => downloadAll(result.chunks, title)}
            className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-zinc-50 font-medium"
          >
            Download all {result.chunks.length} chunks (.zip)
          </button>
          <button
            onClick={() => copyAll(result.chunks)}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
          >
            Copy all to clipboard
          </button>
        </div>
      </div>

      {/* Chunk list */}
      <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-5">
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Chunks</h3>
        <div className="space-y-2">
          {result.chunks.map((c: OutputChunk) => (
            <ChunkRow key={c.index} chunk={c} preset={preset} />
          ))}
          {result.chunks.length === 0 && (
            <div className="text-zinc-500 text-sm">No chunks produced.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Checkbox({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-zinc-200 cursor-pointer">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-indigo-500 focus:ring-indigo-500/40"
      />
      {label}
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-semibold text-zinc-100 tabular-nums">{value}</div>
    </div>
  );
}

function ChunkRow({ chunk, preset }: { chunk: OutputChunk; preset: ModelPreset }) {
  const usable = preset.inputContext;
  const pct = (chunk.tokens / usable) * 100;
  const overBudget = chunk.tokens > usable;
  return (
    <details className="group rounded-lg border border-zinc-800/60 bg-zinc-950/30">
      <summary className="cursor-pointer list-none p-3 flex items-center gap-3 hover:bg-zinc-900/40">
        <span className="text-zinc-500 tabular-nums w-8 text-right">#{chunk.index}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm text-zinc-200 font-medium truncate">{chunk.name}</div>
            {overBudget && <span className="text-xs text-rose-300">over budget</span>}
          </div>
          <div className="mt-1.5 h-1.5 rounded bg-zinc-800 overflow-hidden">
            <div
              className={classNames(
                "h-full",
                overBudget ? "bg-rose-400" : pct > 90 ? "bg-amber-400" : "bg-indigo-400"
              )}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>
        <div className="text-sm text-zinc-400 tabular-nums w-20 text-right">
          {fmtNumber(chunk.tokens)} / {fmtNumber(usable)}
        </div>
      </summary>
      <pre className="text-xs text-zinc-300 font-mono p-3 border-t border-zinc-800/60 max-h-64 overflow-auto whitespace-pre-wrap">
        {chunk.content}
      </pre>
    </details>
  );
}

function maxTokens(chunks: OutputChunk[]): number {
  return chunks.reduce((m, c) => Math.max(m, c.tokens), 0);
}

async function downloadAll(chunks: OutputChunk[], title: string) {
  if (chunks.length === 0) return;
  if (chunks.length === 1) {
    // Single file: just download as txt.
    const blob = new Blob([chunks[0].content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = chunks[0].name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  // Build a tiny zip in-memory using the same approach as zip.ts.
  const { readTelegramZip } = await import("../lib/zip");
  void readTelegramZip; // not used, just keep tree-shake happy
  // Use native CompressionStream + ad-hoc zip writer.
  const files: { name: string; data: Uint8Array }[] = chunks.map((c) => ({
    name: c.name,
    data: new TextEncoder().encode(c.content),
  }));
  const zip = buildZip(files);
  const blob = new Blob([zip], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(title || "chat").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-chunks.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyAll(chunks: OutputChunk[]) {
  const text = chunks.map((c) => c.content).join("\n\n");
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    alert(`Copy failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/* ---------- minimal in-memory ZIP builder (store + deflate) ---------- */

function buildZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  // We use STORE method (no compression) so the file is readable everywhere.
  // Each entry: local header + data + central directory + EOCD.
  const enc = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);   // local file header signature
    lv.setUint16(4, 20, true);           // version needed
    lv.setUint16(6, 0, true);            // flags
    lv.setUint16(8, 0, true);            // compression (0 = store)
    lv.setUint16(10, 0, true);           // mod time
    lv.setUint16(12, 0x21, true);        // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);        // compressed size
    lv.setUint32(22, size, true);        // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);           // extra
    local.set(nameBytes, 30);
    localParts.push(local, e.data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);   // central dir signature
    cv.setUint16(4, 20, true);           // version made by
    cv.setUint16(6, 20, true);           // version needed
    cv.setUint16(8, 0, true);            // flags
    cv.setUint16(10, 0, true);           // compression
    cv.setUint16(12, 0, true);           // mod time
    cv.setUint16(14, 0x21, true);        // mod date
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);           // disk number
    cv.setUint16(36, 0, true);           // internal attrs
    cv.setUint32(38, 0, true);           // external attrs
    cv.setUint32(42, offset, true);      // local header offset
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length + e.data.length;
  }
  const localBuf = concat(localParts);
  const centralBuf = concat(centralParts);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralBuf.length, true);
  ev.setUint32(16, localBuf.length, true);
  ev.setUint16(20, 0, true);
  return concat([localBuf, centralBuf, eocd]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
