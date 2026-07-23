import { lazy, Suspense, useState } from "react";
import { EmptyState } from "./components/EmptyState";
import { StatsDashboard } from "./components/StatsDashboard";
import { MessageList } from "./components/MessageList";
import { ExportPanel } from "./components/ExportPanel";
const SlicerPanel = lazy(() => import("./components/SlicerPanel").then((m) => ({ default: m.SlicerPanel })));
import { parseFiles, buildIdIndex } from "./lib/parser";
import { computeStats } from "./lib/stats";
import type { ChatStats, Message } from "./types";
import { fmtNumber, classNames } from "./lib/format";

type Tab = "stats" | "messages" | "export" | "slicer";

interface LoadedState {
  title: string;
  messages: Message[];
  stats: ChatStats;
  idIndex: Map<string, Message>;
}

export function App() {
  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  const [tab, setTab] = useState<Tab>("stats");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleLoad(files: { name: string; html: string }[]) {
    setError(null);
    setLoading(true);
    // Defer to the next microtask so the spinner has a chance to render
    // before we hit the (synchronous) parser.
    queueMicrotask(() => {
      try {
        const messages = parseFiles(files);
        const stats = computeStats(messages, files.map((f) => f.name));
        const idIndex = buildIdIndex(messages);

        // Pull the chat title from the first HTML's `.text.bold` header block.
        let title = "Telegram Chat";
        try {
          const doc = new DOMParser().parseFromString(files[0].html, "text/html");
          const bold = doc.querySelector(".text.bold");
          if (bold?.textContent?.trim()) title = bold.textContent.trim();
        } catch { /* fall back to default */ }

        setLoaded({ title, messages, stats, idIndex });
        setTab("stats");
      } catch (err) {
        setError(`Parse failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    });
  }

  function reset() {
    setLoaded(null);
    setError(null);
    setTab("stats");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="text-lg font-semibold tracking-tight">
            <span className="text-indigo-400">⌬</span> Telegram Chat Analytics
          </div>
          {loaded && (
            <nav className="flex gap-1 ml-4">
              {(["stats", "messages", "slicer", "export"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={classNames(
                    "px-3 py-1.5 text-sm rounded-md transition capitalize",
                    tab === t
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                  )}
                >
                  {t}
                </button>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3">
            {loaded && (
              <>
                <div className="hidden md:block text-sm text-zinc-500">
                  <span className="text-zinc-200 font-medium">{loaded.title}</span> ·{" "}
                  {fmtNumber(loaded.stats.totalMessages)} msgs · {Object.keys(loaded.stats.senders).length} senders
                </div>
                <button
                  onClick={reset}
                  className="text-xs px-3 py-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition"
                >
                  Load another
                </button>
              </>
            )}
            <a
              href="https://github.com/Paranjayy/TelegramChatAnalytics"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              GitHub
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-200 px-4 py-3 text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-3 text-rose-300/70 hover:text-rose-100 text-xs">
              dismiss
            </button>
          </div>
        )}

        {loading && (
          <div className="text-center text-zinc-400 py-20">
            <div className="inline-block w-2 h-2 mr-2 rounded-full bg-indigo-400 animate-pulse" />
            Parsing…
          </div>
        )}

        {!loading && !loaded && <EmptyState onLoad={handleLoad} onError={setError} />}

        {loaded && tab === "stats" && <StatsDashboard stats={loaded.stats} />}
        {loaded && tab === "messages" && (
          <MessageList messages={loaded.messages} idIndex={loaded.idIndex} />
        )}
        {loaded && tab === "slicer" && (
          <Suspense fallback={<div className="text-zinc-400 py-12 text-center">Loading slicer…</div>}>
            <SlicerPanel
              messages={loaded.messages}
              stats={loaded.stats}
              title={loaded.title}
            />
          </Suspense>
        )}
        {loaded && tab === "export" && (
          <ExportPanel
            messages={loaded.messages}
            stats={loaded.stats}
            title={loaded.title}
          />
        )}
      </main>

      <footer className="border-t border-zinc-800/80 py-4 mt-8">
        <div className="max-w-6xl mx-auto px-4 text-xs text-zinc-600 flex items-center gap-3">
          <span>All processing happens in your browser. No data leaves this device.</span>
          <span className="ml-auto">v0.1.0</span>
        </div>
      </footer>
    </div>
  );
}
