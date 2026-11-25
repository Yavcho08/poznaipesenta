// Прости SVG графики — без библиотека, четими на телефон и в тъмна тема.

export interface BarDatum {
  label: string;
  value: number;
  /** Текст при посочване (title) */
  hint?: string;
}

/** Вертикални колони (напр. точки по седмици). */
export function BarChart({ data, height = 140, unit = "" }: { data: BarDatum[]; height?: number; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / data.length;
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="h-36 w-full" role="img" aria-label="Графика">
        <defs>
          <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2)" />
          </linearGradient>
        </defs>
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 4);
          return (
            <rect key={d.label} x={i * w + w * 0.15} y={height - h} width={w * 0.7} height={Math.max(h, d.value > 0 ? 1.5 : 0.6)} rx={1.2} fill={d.value > 0 ? "url(#bar)" : "var(--line)"}>
              <title>{d.hint ?? `${d.label}: ${d.value}${unit}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="flex justify-between text-[10px] text-muted">
        <span>{data[0]?.label}</span>
        <span>{data.at(-1)?.label}</span>
      </figcaption>
    </figure>
  );
}

/** Хоризонтална лента с процент (напр. точност по артист). */
export function PercentBar({ value, label, sub }: { value: number; label: string; sub?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-semibold">{label}</span>
        <span className="shrink-0 font-display font-bold tabular-nums">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-strong">
        <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}
