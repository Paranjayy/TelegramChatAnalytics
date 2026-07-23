import { useState } from "react";

interface Props {
  onLoad: (files: { name: string; html: string }[]) => void;
  onError: (msg: string) => void;
}

export function EmptyState({ onLoad, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  async function handleFiles(list: FileList | File[]) {
    setBusy(true);
    try {
      const arr = Array.from(list);
      const out: { name: string; html: string }[] = [];

      for (const f of arr) {
        const lower = f.name.toLowerCase();
        if (lower.endsWith(".zip")) {
          const buf = await f.arrayBuffer();
          const { readTelegramZip } = await import("../lib/zip");
          const items = await readTelegramZip(buf);
          if (items.length === 0) {
            onError(`No messages*.html files found inside ${f.name}.`);
            continue;
          }
          out.push(...items);
        } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
          out.push({ name: f.name, html: await f.text() });
        } else {
          onError(`Skipped ${f.name}: only .html or .zip supported.`);
        }
      }

      if (out.length === 0) {
        onError("No Telegram HTML files found in selection.");
      } else {
        onLoad(out);
      }
    } catch (err) {
      onError(`Failed to read files: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`flex flex-col items-center justify-center min-h-[70vh] border-2 border-dashed rounded-2xl p-12 transition-colors ${
        drag ? "border-indigo-400 bg-indigo-500/10" : "border-zinc-700 bg-zinc-900/40"
      }`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="text-6xl mb-6" aria-hidden>📊</div>
      <h1 className="text-3xl font-semibold mb-2">Telegram Chat Analytics</h1>
      <p className="text-zinc-400 max-w-xl text-center mb-8">
        Drop a Telegram export — either a <code className="text-zinc-200">messages.html</code> file, a
        folder's worth of <code className="text-zinc-200">messages*.html</code> files, or a
        <code className="text-zinc-200">.zip</code> of the whole export. Everything happens in your browser.
      </p>
      <label className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 rounded-full bg-indigo-500 hover:bg-indigo-400 text-zinc-50 font-medium transition">
        <input
          type="file"
          multiple
          accept=".html,.htm,.zip"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        {busy ? "Reading…" : "Choose files"}
      </label>
      <p className="text-xs text-zinc-500 mt-6">
        Nothing is uploaded. Your chat stays on this device.
      </p>
    </div>
  );
}
