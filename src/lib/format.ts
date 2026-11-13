export function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString()
}

export function fmtCost(usd: number | null | undefined, known = true) {
  if (usd === null || usd === undefined || !known) return 'unknown'
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

export function fmtDuration(ms: number) {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

/** Price per token → "$x / 1M". */
export function fmtPricePerM(perToken: number | null) {
  if (perToken === null) return 'unknown'
  const v = perToken * 1_000_000
  if (v === 0) return 'free'
  return `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
