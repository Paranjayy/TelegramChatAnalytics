/**
 * Tiny hand-rolled SVG charts. No charting library — bars and heatmaps are
 * simple enough to write inline, and keeping the bundle lean matters.
 */

interface BarRow {
  label: string;
  value: number;
  displayValue?: string;
}

export function HBarChart({
  rows,
  highlight,
  formatValue,
  className,
}: {
  rows: BarRow[];
  highlight?: string;
  formatValue?: (v: number) => string;
  className?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className={className}>
      {rows.map((r) => {
        const pct = (r.value / max) * 100;
        const isHi = highlight === r.label;
        return (
          <div key={r.label} className="flex items-center gap-3 text-sm py-1">
            <div className={`w-32 shrink-0 truncate ${isHi ? "text-indigo-300 font-medium" : "text-zinc-300"}`}>
              {r.label}
            </div>
            <div className="flex-1 bg-zinc-800/60 rounded h-2 overflow-hidden">
              <div
                className={isHi ? "h-full bg-indigo-400" : "h-full bg-zinc-500"}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="w-16 text-right tabular-nums text-zinc-400">
              {formatValue ? formatValue(r.value) : r.displayValue ?? r.value.toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Per-day bar chart. Days are sorted chronologically; bars use a single
 * indigo shade with the value on top.
 */
export function DayBarChart({
  days,
  height = 80,
  className,
}: {
  days: { date: string; count: number }[];
  height?: number;
  className?: string;
}) {
  if (days.length === 0) return null;
  const max = Math.max(1, ...days.map((d) => d.count));
  const barWidth = 100 / days.length;
  return (
    <div className={className}>
      <svg
        viewBox={`0 0 100 ${height + 24}`}
        preserveAspectRatio="none"
        className="w-full"
      >
        {days.map((d, i) => {
          const h = (d.count / max) * height;
          const x = i * barWidth + barWidth * 0.1;
          const w = barWidth * 0.8;
          const y = height - h;
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill="rgb(129 140 248)"
                rx="0.5"
                vectorEffect="non-scaling-stroke"
              />
              {d.count > 0 && (
                <text
                  x={x + w / 2}
                  y={y - 1.5}
                  textAnchor="middle"
                  fontSize="3"
                  fill="rgb(212 212 216)"
                >
                  {d.count}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
        <span>{days[0].date.slice(5)}</span>
        <span>{days[days.length - 1].date.slice(5)}</span>
      </div>
    </div>
  );
}
