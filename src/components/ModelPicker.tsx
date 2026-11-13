import { useEffect, useMemo, useRef, useState } from 'react'
import type { ModelInfo } from '../providers/types'
import { fmtPricePerM } from '../lib/format'
import { IconChevron, IconSearch } from './Icons'

export function ModelPicker({
  value,
  models,
  loading,
  error,
  disabled,
  onChange,
  onReload,
  accent,
}: {
  value: string
  models: ModelInfo[]
  loading: boolean
  error: string | null
  disabled?: boolean
  onChange: (id: string) => void
  onReload: () => void
  accent: 'p1' | 'p2' | 'judge'
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const current = models.find((m) => m.id === value)

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = t
      ? models.filter((m) => m.id.toLowerCase().includes(t) || m.name.toLowerCase().includes(t))
      : models
    return list.slice(0, 200)
  }, [models, q])

  const custom = q.trim() && !models.some((m) => m.id === q.trim()) ? q.trim() : null
  const options: Array<{ id: string; model?: ModelInfo }> = [
    ...(custom ? [{ id: custom }] : []),
    ...filtered.map((m) => ({ id: m.id, model: m })),
  ]

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => setHi(0), [q])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [hi])

  const pick = (id: string) => {
    onChange(id)
    setOpen(false)
    setQ('')
  }

  return (
    <div className={`picker ${open ? 'open' : ''}`} ref={root}>
      <button
        type="button"
        className="field picker-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="picker-value">
          {value ? (
            <>
              <span className="picker-name">{current?.name ?? value}</span>
              {current && current.name !== value && <span className="picker-id mono">{value}</span>}
            </>
          ) : (
            <span className="muted">Choose a model…</span>
          )}
        </span>
        <IconChevron className="chev" />
      </button>
      {open && (
        <div className={`picker-pop glass accent-${accent}`}>
          <div className="picker-search">
            <IconSearch />
            <input
              autoFocus
              value={q}
              placeholder="Search models or type a custom ID"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setHi((h) => Math.min(options.length - 1, h + 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setHi((h) => Math.max(0, h - 1))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  const o = options[hi]
                  if (o) pick(o.id)
                } else if (e.key === 'Escape') {
                  e.stopPropagation()
                  setOpen(false)
                }
              }}
              aria-label="Search models"
            />
          </div>
          <ul className="picker-list" role="listbox" ref={listRef}>
            {loading && Array.from({ length: 5 }).map((_, i) => <li key={i} className="skeleton-row" />)}
            {!loading && error && (
              <li className="picker-msg">
                Couldn't load the model list. <button className="link" onClick={onReload}>Retry</button>
                <div className="muted small">{error}</div>
              </li>
            )}
            {!loading && !error && !models.length && !custom && (
              <li className="picker-msg muted">No model list available — type a model ID above.</li>
            )}
            {options.map((o, i) => (
              <li
                key={o.id + (o.model ? '' : '-custom')}
                data-i={i}
                role="option"
                aria-selected={o.id === value}
                className={`picker-opt ${i === hi ? 'hi' : ''} ${o.id === value ? 'sel' : ''}`}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(o.id)
                }}
              >
                {o.model ? (
                  <>
                    <div className="opt-main">
                      <span className="opt-name">{o.model.name}</span>
                      <span className="opt-id mono">{o.model.id}</span>
                    </div>
                    <div className="opt-meta mono">
                      <span title="Prompt price per 1M tokens">in {fmtPricePerM(o.model.pricing.prompt)}</span>
                      <span title="Completion price per 1M tokens">out {fmtPricePerM(o.model.pricing.completion)}</span>
                      {o.model.supportsReasoning && <span className="tag">reasoning</span>}
                    </div>
                  </>
                ) : (
                  <div className="opt-main">
                    <span className="opt-name">Use custom ID</span>
                    <span className="opt-id mono">{o.id}</span>
                  </div>
                )}
              </li>
            ))}
            {!loading && filtered.length === 200 && <li className="picker-msg muted small">Showing first 200 — refine your search.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
