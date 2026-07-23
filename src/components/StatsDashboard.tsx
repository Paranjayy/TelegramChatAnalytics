import type { ChatStats } from "../types";
import { fmtNumber, fmtLongDate, fmtShortDate } from "../lib/format";
import { HBarChart, DayBarChart } from "./Charts";

interface Props {
  stats: ChatStats;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-2xl font-semibold text-zinc-100 mt-1 tabular-nums">{value}</div>
      {hint && <div className="text-xs text-zinc-500 mt-1">{hint}</div>}
    </div>
  );
}

export function StatsDashboard({ stats }: Props) {
  const senderNames = Object.keys(stats.senders);
  const sortedDays = Object.keys(stats.dailyCounts).sort();
  const dayChartData = sortedDays.map((d) => ({ date: d, count: stats.dailyCounts[d] }));

  return (
    <div className="space-y-8">
      {/* Top KPI grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Messages" value={fmtNumber(stats.totalMessages)} />
        <Stat label="Senders" value={senderNames.length} />
        <Stat label="Days" value={fmtNumber(stats.calendarDays)} hint={`${fmtShortDate(stats.firstDate)} → ${fmtShortDate(stats.lastDate)}`} />
        <Stat label="Words" value={fmtNumber(stats.totalWords)} hint={`${fmtNumber(stats.totalChars)} chars`} />
        <Stat label="Replies" value={fmtNumber(stats.totalReplies)} hint={`${((100 * stats.totalReplies) / Math.max(1, stats.totalMessages)).toFixed(1)}% of msgs`} />
        <Stat label="Media" value={fmtNumber(stats.mediaMsgs)} hint={`${stats.mediaPct}% of msgs`} />
        <Stat label="Links" value={fmtNumber(stats.totalLinks)} hint={`${fmtNumber(stats.uniqueLinks)} unique · ${stats.linkPct}% of msgs`} />
        <Stat label="Avg / day" value={stats.avgPerDay} hint={`${stats.avgMsgLen} words/msg`} />
      </section>

      {/* Per-day timeline */}
      <section className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-5">
        <h2 className="text-lg font-semibold mb-3">Daily activity</h2>
        <DayBarChart days={dayChartData} />
        {stats.mostActiveDay && (
          <div className="text-xs text-zinc-500 mt-3">
            Most active: <span className="text-zinc-300">{fmtLongDate(stats.mostActiveDay.date)}</span> ({stats.mostActiveDay.count} msgs).
            {" "}Most media: <span className="text-zinc-300">{stats.mostMediaDay ? fmtLongDate(stats.mostMediaDay.date) : "—"}</span>.
          </div>
        )}
      </section>

      {/* Sender breakdown */}
      <section className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-5">
        <h2 className="text-lg font-semibold mb-4">Sender breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-left">
                <th className="font-medium py-1 pr-3">Sender</th>
                <th className="font-medium py-1 px-2 text-right">Messages</th>
                <th className="font-medium py-1 px-2 text-right">Share</th>
                <th className="font-medium py-1 px-2 text-right">Words</th>
                <th className="font-medium py-1 px-2 text-right">Chars</th>
                <th className="font-medium py-1 px-2 text-right">Avg len</th>
                <th className="font-medium py-1 px-2 text-right">Media</th>
                <th className="font-medium py-1 px-2 text-right">Links</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stats.senders).map(([name, s]) => (
                <tr key={name} className="border-t border-zinc-800/50">
                  <td className="py-2 pr-3 font-medium text-zinc-100">{name}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtNumber(s.count)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{s.sharePct}%</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtNumber(s.words)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtNumber(s.chars)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{s.avgWords}w</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtNumber(s.media)}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{fmtNumber(s.links)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Reply + Link breakdowns side by side */}
      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-5">
          <h2 className="text-lg font-semibold mb-3">Reply behaviour</h2>
          <HBarChart
            rows={Object.entries(stats.senders).map(([n, s]) => ({
              label: n, value: s.repliesSent, displayValue: `${fmtNumber(s.repliesSent)} sent`,
            }))}
            formatValue={(v) => v.toLocaleString()}
            className="space-y-1"
          />
          <div className="text-xs text-zinc-500 mt-3">
            Reply rate: {Object.entries(stats.senders).map(([n, s]) => `${n} ${s.replyRatePct}%`).join(" · ")}
          </div>
        </div>

        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-5">
          <h2 className="text-lg font-semibold mb-3">Top link domains</h2>
          <HBarChart
            rows={stats.topDomains.slice(0, 10).map(([d, n]) => ({ label: d, value: n }))}
            formatValue={(v) => v.toLocaleString()}
            className="space-y-1"
          />
        </div>
      </section>

      {/* Top words + emojis */}
      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-5">
          <h2 className="text-lg font-semibold mb-3">Top words</h2>
          <div className="flex flex-wrap gap-2">
            {stats.topWords.map(([w, c]) => (
              <span key={w} className="px-2.5 py-1 text-xs rounded-full bg-zinc-800/70 text-zinc-300 tabular-nums">
                {w} <span className="text-zinc-500">{c}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-5">
          <h2 className="text-lg font-semibold mb-3">Top emojis</h2>
          <div className="flex flex-wrap gap-3 text-2xl">
            {stats.topEmojis.map(([e, c]) => (
              <span key={e} className="flex items-center gap-1">
                <span>{e}</span>
                <span className="text-xs text-zinc-500 tabular-nums">{c}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Per-day volume table */}
      <section className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-5">
        <h2 className="text-lg font-semibold mb-3">Per-day volume</h2>
        <PerDayTable stats={stats} />
      </section>

      {/* Conversation markers */}
      <section className="rounded-xl bg-zinc-900/60 border border-zinc-800/60 p-5">
        <h2 className="text-lg font-semibold mb-3">Conversation markers</h2>
        <ul className="text-sm text-zinc-300 space-y-1.5">
          {Object.entries(stats.senders).length > 0 && (() => {
            const sorted = Object.entries(stats.senders);
            const topReply = sorted.reduce((a, b) => (a[1].repliesSent >= b[1].repliesSent ? a : b));
            const topRecv = sorted.reduce((a, b) => (a[1].repliesRecv >= b[1].repliesRecv ? a : b));
            const topLink = sorted.reduce((a, b) => (a[1].links >= b[1].links ? a : b));
            return (
              <>
                <li>Most replies sent: <span className="text-zinc-100">{topReply[0]}</span> ({fmtNumber(topReply[1].repliesSent)})</li>
                <li>Most replies received: <span className="text-zinc-100">{topRecv[0]}</span> ({fmtNumber(topRecv[1].repliesRecv)})</li>
                <li>Most links shared: <span className="text-zinc-100">{topLink[0]}</span> ({fmtNumber(topLink[1].links)})</li>
              </>
            );
          })()}
          {stats.topDomains.length > 0 && (
            <li>Top link domain: <span className="text-zinc-100">{stats.topDomains[0][0]}</span> ({fmtNumber(stats.topDomains[0][1])})</li>
          )}
          {stats.longestMsg.chars > 0 && (
            <li>Longest message: <span className="text-zinc-100">{fmtNumber(stats.longestMsg.chars)}</span> chars by <span className="text-zinc-100">{stats.longestMsg.sender ?? "Unknown"}</span></li>
          )}
          <li>Reply density: {((100 * stats.totalReplies) / Math.max(1, stats.totalMessages)).toFixed(1)}% of messages are replies</li>
          <li>Media coverage: {stats.mediaPct}% · Link coverage: {stats.linkPct}%</li>
        </ul>
      </section>
    </div>
  );
}

function PerDayTable({ stats }: { stats: ChatStats }) {
  const senders = Object.keys(stats.senders);
  const days = Object.keys(stats.dailyCounts).sort();
  const hasMedia = days.some((d) =>
    Object.values(stats.dailySenderMedia[d] ?? {}).some((n) => n > 0),
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-zinc-500 text-left">
            <th className="font-medium py-1 pr-3">Date</th>
            <th className="font-medium py-1 px-2 text-right">Total</th>
            {senders.map((s) => (
              <th key={s} className="font-medium py-1 px-2 text-right">{s}</th>
            ))}
            {hasMedia && senders.map((s) => (
              <th key={s + "-media"} className="font-medium py-1 px-2 text-right text-zinc-600">{s} media</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const ds = stats.dailySenderCounts[d] ?? {};
            const dm = stats.dailySenderMedia[d] ?? {};
            return (
              <tr key={d} className="border-t border-zinc-800/50">
                <td className="py-1.5 pr-3 text-zinc-300">{fmtShortDate(d)}</td>
                <td className="py-1.5 px-2 text-right tabular-nums text-zinc-200 font-medium">
                  {fmtNumber(stats.dailyCounts[d])}
                </td>
                {senders.map((s) => (
                  <td key={s} className="py-1.5 px-2 text-right tabular-nums text-zinc-400">
                    {ds[s] ? fmtNumber(ds[s]) : "·"}
                  </td>
                ))}
                {hasMedia && senders.map((s) => (
                  <td key={s + "-media"} className="py-1.5 px-2 text-right tabular-nums text-zinc-500">
                    {dm[s] ? fmtNumber(dm[s]) : "·"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
