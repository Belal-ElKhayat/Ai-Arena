import { useEffect, useRef, useState } from 'react'
import { downloadText } from '../games/chess/pgn'
import { IconClose, IconCopy, IconDownload, IconCheck } from './Icons'

export function MoveDrawer({
  open,
  onClose,
  sans,
  comments,
  activePly,
  onJump,
  pgn,
  whiteSeat,
}: {
  open: boolean
  onClose: () => void
  sans: string[]
  comments: string[]
  activePly: number
  onJump: (ply: number) => void
  pgn: string
  whiteSeat: 0 | 1
}) {
  const [tab, setTab] = useState<'moves' | 'pgn'>('moves')
  const [copied, setCopied] = useState(false)
  const listRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    listRef.current?.querySelector('.mv.active')?.scrollIntoView({ block: 'nearest' })
  }, [activePly, open])

  const rows = []
  for (let i = 0; i < sans.length; i += 2) rows.push(i)
  const seatOf = (ply: number) => ((ply % 2 === 0 ? whiteSeat : 1 - whiteSeat) as 0 | 1)

  return (
    <aside className={`drawer glass ${open ? 'open' : ''}`} aria-hidden={!open} aria-label="Moves and PGN">
      <div className="drawer-head">
        <div className="seg">
          <button className={tab === 'moves' ? 'on' : ''} onClick={() => setTab('moves')}>
            Moves <span className="muted">{sans.length}</span>
          </button>
          <button className={tab === 'pgn' ? 'on' : ''} onClick={() => setTab('pgn')}>
            PGN
          </button>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close moves drawer" tabIndex={open ? 0 : -1}>
          <IconClose />
        </button>
      </div>
      {tab === 'moves' ? (
        <ol className="move-list" ref={listRef}>
          {!sans.length && <li className="empty muted">Moves appear here as the match unfolds.</li>}
          {rows.map((i) => (
            <li key={i} className="move-row">
              <span className="mv-num mono">{i / 2 + 1}.</span>
              {[i, i + 1].map((p) =>
                sans[p] ? (
                  <button
                    key={p}
                    className={`mv mono accent-p${seatOf(p) + 1} ${activePly === p + 1 ? 'active' : ''}`}
                    onClick={() => onJump(p + 1)}
                    title={comments[p] || undefined}
                    tabIndex={open ? 0 : -1}
                  >
                    {sans[p]}
                  </button>
                ) : (
                  <span key={p} />
                ),
              )}
            </li>
          ))}
        </ol>
      ) : (
        <div className="pgn-pane">
          <textarea className="pgn-text mono" readOnly value={pgn} aria-label="PGN" />
          <div className="row gap">
            <button
              className="dock-btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(pgn)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1400)
                } catch {
                  /* ignore */
                }
              }}
            >
              {copied ? <IconCheck size={15} /> : <IconCopy size={15} />} {copied ? 'Copied' : 'Copy PGN'}
            </button>
            <button className="dock-btn" onClick={() => downloadText(`ai-arena-${Date.now()}.pgn`, pgn)}>
              <IconDownload size={15} /> Download
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
