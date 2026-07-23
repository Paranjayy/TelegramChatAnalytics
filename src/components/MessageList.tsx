import { useEffect, useMemo, useRef, useState } from "react";
import type { Message } from "../types";
import { classNames } from "../lib/format";

interface Props {
  messages: Message[];
  idIndex: Map<string, Message>;
}

const PAGE_SIZE = 100;

export function MessageList({ messages, idIndex }: Props) {
  const [query, setQuery] = useState("");
  const [senders, setSenders] = useState<Set<string>>(() => new Set());
  const [flags, setFlags] = useState({
    hasMedia: false,
    hasLink: false,
    isReply: false,
    isForward: false,
  });
  const [page, setPage] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Discover available senders for the filter UI.
  const allSenders = useMemo(() => {
    const s = new Set<string>();
    for (const m of messages) if (m.sender) s.add(m.sender);
    return [...s].sort();
  }, [messages]);

  // When senders list changes, default-select all of them.
  useEffect(() => {
    setSenders((prev) => prev.size ? prev : new Set(allSenders));
  }, [allSenders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return messages.filter((m) => {
      if (m.service) return q.length > 0; // hide dividers unless user is searching
      if (m.sender && !senders.has(m.sender)) return false;
      if (flags.hasMedia && m.media.length === 0) return false;
      if (flags.hasLink && !/https?:\/\//i.test(m.text)) return false;
      if (flags.isReply && !m.replyTo) return false;
      if (flags.isForward && !m.isForwarded) return false;
      if (q) {
        if (m.service) return m.service.toLowerCase().includes(q);
        const hay = (m.text + " " + (m.sender ?? "")).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [messages, query, senders, flags]);

  // Reset pagination when filters change.
  useEffect(() => { setPage(0); }, [query, senders, flags]);

  // Infinite scroll: bump the page when the sentinel comes into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setPage((p) => Math.min(p + 1, Math.ceil(filtered.length / PAGE_SIZE)));
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [filtered.length]);

  const visibleCount = Math.min(filtered.length, (page + 1) * PAGE_SIZE);
  const visible = filtered.slice(0, visibleCount);

  function toggleSender(name: string) {
    setSenders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-zinc-800 -mx-4 px-4 py-3 space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search text or sender…"
          className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        />
        <div className="flex flex-wrap items-center gap-2">
          {allSenders.map((s) => {
            const active = senders.has(s);
            return (
              <button
                key={s}
                onClick={() => toggleSender(s)}
                className={classNames(
                  "px-3 py-1 text-xs rounded-full border transition",
                  active
                    ? "bg-indigo-500/20 border-indigo-400/40 text-indigo-200"
                    : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
                )}
              >
                {s}
              </button>
            );
          })}
          <span className="text-zinc-700">·</span>
          {([
            ["hasMedia", "📷 media"],
            ["hasLink", "🔗 link"],
            ["isReply", "↩️ reply"],
            ["isForward", "↪️ fwd"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFlags((f) => ({ ...f, [key]: !f[key] }))}
              className={classNames(
                "px-3 py-1 text-xs rounded-full border transition",
                flags[key]
                  ? "bg-indigo-500/20 border-indigo-400/40 text-indigo-200"
                  : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
              )}
            >
              {label}
            </button>
          ))}
          <div className="ml-auto text-xs text-zinc-500 tabular-nums">
            {filtered.length.toLocaleString()} / {messages.length.toLocaleString()} messages
          </div>
        </div>
      </div>

      {/* Message feed */}
      <div className="space-y-2">
        {visible.map((m, i) => (
          <MessageRow
            key={m.id ?? `idx-${i}`}
            message={m}
            original={m.replyTo ? idIndex.get(m.replyTo) ?? null : null}
          />
        ))}
        {filtered.length === 0 && (
          <div className="text-center text-zinc-500 py-12">No messages match your filters.</div>
        )}
        {visibleCount < filtered.length && (
          <div ref={sentinelRef} className="text-center text-xs text-zinc-600 py-4">
            Loading more…
          </div>
        )}
        {visibleCount === filtered.length && filtered.length > 0 && (
          <div className="text-center text-xs text-zinc-600 py-4">
            End of {filtered.length.toLocaleString()} messages
          </div>
        )}
      </div>
    </div>
  );
}

function MessageRow({ message, original }: { message: Message; original: Message | null }) {
  if (message.service) {
    const isPin = /pinned/i.test(message.service);
    return (
      <div className="flex items-center gap-3 py-3 text-zinc-500 text-xs uppercase tracking-wider">
        <div className="h-px flex-1 bg-zinc-800" />
        <span className="text-zinc-400">{isPin ? "📌 " : ""}{message.service}</span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>
    );
  }

  const ts = shortTime(message.timestamp);
  void isoDate(message.timestamp);

  return (
    <article
      id={message.id ?? undefined}
      className="rounded-lg border border-zinc-800/50 bg-zinc-900/40 p-3 hover:border-zinc-700/60 transition"
    >
      <header className="flex items-baseline gap-2 text-sm">
        <span className="text-zinc-500 tabular-nums">{ts}</span>
        <span className="font-medium text-zinc-100">{message.sender ?? "Unknown"}</span>
        {message.forwardedFrom && (
          <span className="text-xs text-indigo-300">↪️ {message.forwardedFrom}</span>
        )}
        {message.id && (
          <a
            href={`#${message.id}`}
            className="ml-auto text-[10px] text-zinc-600 hover:text-zinc-400 tabular-nums"
            onClick={(e) => { e.preventDefault(); history.replaceState(null, "", `#${message.id}`); }}
          >
            #{message.id}
          </a>
        )}
      </header>
      {message.replyTo && original && (
        <div className="mt-1.5 mb-1.5 pl-3 border-l-2 border-indigo-500/30 text-xs text-zinc-400">
          <span className="text-zinc-500">↩️ {original.sender ?? "Unknown"}: </span>
          <span className="italic">{truncate(original.text, 180)}</span>
        </div>
      )}
      {message.replyTo && !original && (
        <div className="mt-1.5 mb-1.5 pl-3 border-l-2 border-indigo-500/30 text-xs text-zinc-500 italic">
          ↩️ in reply to #{message.replyTo} (not in view)
        </div>
      )}
      {message.text && (
        <p className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed mt-1">
          <Highlighted text={message.text} />
        </p>
      )}
      {message.media.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {message.media.map((med, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs rounded bg-zinc-800/70 text-zinc-300"
              title={med.description ?? med.status ?? med.kind}
            >
              <span className="text-base leading-none">
                {med.kind === "photo" ? "📷" :
                 med.kind === "video" || med.kind === "video_file" ? "🎬" :
                 med.kind === "file" ? "📎" :
                 med.kind === "audio_file" || med.kind === "voice_message" ? "🎵" :
                 med.kind === "sticker" || med.kind === "animated" ? "🌟" :
                 med.kind === "contact" ? "👤" :
                 med.kind === "location" ? "📍" :
                 med.kind === "poll" ? "📊" : "📦"}
              </span>
              {med.title && <span>{med.title}</span>}
              {med.status && <span className="text-zinc-500">{med.status}</span>}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function Highlighted({ text }: { text: string }) {
  // Render markdown links inline using the same rules as the export.
  const parts: Array<{ kind: "text" | "link"; raw: string; href?: string }> = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push({ kind: "text", raw: text.slice(lastIndex, m.index) });
    parts.push({ kind: "link", raw: m[1], href: m[2] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push({ kind: "text", raw: text.slice(lastIndex) });
  if (parts.length === 0) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "link" ? (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
          >
            {p.raw}
          </a>
        ) : (
          <span key={i}>{p.raw}</span>
        )
      )}
    </>
  );
}

function shortTime(ts: string | null): string {
  if (!ts) return "??:??";
  const m = ts.match(/(\d{2}:\d{2})/);
  return m ? m[1] : ts;
}

function isoDate(ts: string | null): string | null {
  if (!ts) return null;
  const m = ts.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function truncate(s: string, limit: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  return flat.slice(0, limit - 1).replace(/\s+\S*$/, "") + "…";
}
