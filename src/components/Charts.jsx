// Lightweight, dependency-free charts.
import { money } from '../lib/format.js'

// Simple vertical bar chart — used to compare a few values (e.g. last month vs
// this month). bars: [{ label, value, color? }].
export function MiniBars({ bars, fmt = money, height = 150 }) {
  const max = Math.max(...bars.map((b) => Number(b.value) || 0), 1)
  return (
    <div className="minibars" style={{ display: 'flex', alignItems: 'flex-end', gap: 22, height, padding: '4px 6px' }}>
      {bars.map((b, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
          <div className="mono" style={{ fontSize: '0.82rem', fontWeight: 600 }}>{fmt(b.value)}</div>
          <div style={{ width: '64%', maxWidth: 84, height: `${Math.max(3, (Number(b.value) || 0) / max * 100)}%`, minHeight: 3,
            background: b.color || 'var(--gold)', borderRadius: '8px 8px 0 0', transition: 'height .3s' }} />
          <div className="muted" style={{ fontSize: '0.78rem', textAlign: 'center' }}>{b.label}</div>
        </div>
      ))}
    </div>
  )
}

// Donut (circle) chart.
//   segments: [{ label, value, color }]
export function DonutChart({ segments, size = 168, thickness = 24, centerValue, centerLabel, fmt = (v) => money(v), emptyText = 'No data yet' }) {
  const data = segments.map((s) => ({ ...s, value: Math.max(0, Number(s.value) || 0) }))
  const total = data.reduce((s, x) => s + x.value, 0)
  const r = (size - thickness) / 2
  const C = 2 * Math.PI * r
  const cx = size / 2

  let acc = 0
  return (
    <div className="donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        <g transform={`rotate(-90 ${cx} ${cx})`}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--line-soft)" strokeWidth={thickness} />
          {total > 0 && data.map((s, i) => {
            const len = (s.value / total) * C
            const el = (
              <circle key={i} cx={cx} cy={cx} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} strokeLinecap="butt">
                <title>{`${s.label}: ${fmt(s.value)}`}</title>
              </circle>
            )
            acc += len
            return el
          })}
        </g>
        <text x={cx} y={cx - 2} textAnchor="middle" style={{ fontFamily: 'var(--serif)', fontSize: '1.5rem', fontWeight: 600, fill: 'var(--text)' }}>
          {centerValue}
        </text>
        {centerLabel && (
          <text x={cx} y={cx + 18} textAnchor="middle" style={{ fontSize: '0.7rem', fill: 'var(--text-faint)' }}>
            {centerLabel}
          </text>
        )}
      </svg>

      <div className="donut-legend">
        {data.map((s, i) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0
          return (
            <div className="dl-row" key={i}>
              <span className="dl-sw" style={{ background: s.color }} />
              <span className="dl-name">{s.label}</span>
              <span className="dl-val mono">{fmt(s.value)}</span>
              <span className="dl-pct muted">{pct}%</span>
            </div>
          )
        })}
        {total === 0 && <div className="muted" style={{ fontSize: '0.82rem' }}>{emptyText}</div>}
      </div>
    </div>
  )
}
