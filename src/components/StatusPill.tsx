export function StatusPill({
  text,
  tone,
  live,
  sub,
}: {
  text: string
  tone: 'neutral' | 'p1' | 'p2' | 'alert' | 'done'
  live: boolean
  /** Secondary line, e.g. a style matchup. */
  sub?: string
}) {
  return (
    <div className={`status-pill glass tone-${tone}`} role="status" aria-live="polite">
      <span className={`status-dot ${live ? 'live' : ''}`} />
      <span>{text}</span>
      {sub && <span className="status-sub">{sub}</span>}
    </div>
  )
}
