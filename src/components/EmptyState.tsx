import { useState } from "react";
import { readTelegramZip } from "../lib/zip";

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
          const items = await readTelegramZip(buf);
          if (items.length === 0) {
            onError(`No messages*.html files found inside ${f.name}.`);
            continue;
          }
          out.push(...items);
        } else if (lower.endsWith(".html") || lower.endsWith(".htm")) {
          out.push({ name: f.name, html: await f.text() });
        } else {
          onError(`Skipped ${f.name}: only .html / .htm / .zip / folder supported.`);
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

  async function handleDirPicker(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files) await handleFiles(files);
  }

  /** Walk a dropped folder using the non-standard but ubiquitous webkitGetAsEntry. */
  async function walkEntry(entry: any, prefix = ""): Promise<File[]> {
    if (entry.isFile) {
      return new Promise((resolve) => entry.file((f: File) => resolve([f]), () => resolve([])));
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const all: File[] = [];
      // readEntries is async-batch; loop until empty.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch: any[] = await new Promise((res) => reader.readEntries(res, () => res([])));
        if (batch.length === 0) break;
        for (const e of batch) {
          const files = await walkEntry(e, prefix + entry.name + "/");
          all.push(...files);
        }
      }
      return all;
    }
    return [];
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const all: File[] = [];
      const entries: any[] = [];
      for (const it of Array.from(items)) {
        if (it.kind !== "file") continue;
        const entry = (it as any).webkitGetAsEntry?.();
        if (entry) {
          entries.push(entry);
          const files = await walkEntry(entry);
          all.push(...files);
        } else {
          const f = it.getAsFile();
          if (f) all.push(f);
        }
      }
      if (all.length > 0) await handleFiles(all);
      else onError("No files found in dropped items.");
    } else if (e.dataTransfer.files) {
      await handleFiles(e.dataTransfer.files);
    }
  }

  return (
    <div
      className={`flex flex-col items-center justify-center min-h-[70vh] border-2 border-dashed rounded-2xl p-12 transition-colors ${
        drag ? "border-indigo-400 bg-indigo-500/10" : "border-zinc-700 bg-zinc-900/40"
      }`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
    >
      <div className="text-6xl mb-6" aria-hidden>📊</div>
      <h1 className="text-3xl font-semibold mb-2">Telegram Chat Analytics</h1>
      <p className="text-zinc-400 max-w-xl text-center mb-8">
        Drop a Telegram export — <code className="text-zinc-200">messages.html</code> files,
        a folder containing them, or a <code className="text-zinc-200">.zip</code> of the whole export.
        Everything happens in your browser.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
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
        <label className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium transition">
          <input
            type="file"
            // @ts-expect-error — non-standard but widely supported
            webkitdirectory=""
            multiple
            className="hidden"
            onChange={handleDirPicker}
          />
          Choose folder
        </label>
      </div>
      <p className="text-xs text-zinc-500 mt-6">
        Nothing is uploaded. Your chat stays on this device.
      </p>
    </div>
  );
}
