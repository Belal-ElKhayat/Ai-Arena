import { useState, type ReactNode } from 'react'
import { APP_CONFIG } from '../config/app'
import type { MatchResult, PlayerConfig, SeatStats } from '../core/types'
import { C4Mini } from '../games/connect4/Board'
import type { Grid } from '../games/connect4/rules'
import { copyText } from '../lib/download'
import { fmtCost, fmtDuration, fmtTokens } from '../lib/format'
import { Modal } from './Modal'
import { IconCheck, IconCopy, IconRefresh, IconTrophy } from './Icons'

function reasonKind(reason: string) {
  if (/four in a row/i.test(reason)) return 'Four in a row'
  if (/five in a row/i.test(reason)) return 'Five in a row'
  if (/forfeit/i.test(reason)) return 'Forfeit'
  if (/resign/i.test(reason)) return 'Resignation'
  if (/draw/i.test(reason)) return 'Draw'
  return 'Game over'
}

export function C4ResultModal({
  open,
  onClose,
  result,
  players,
  stats,
  firstSeat,
  moves,
  grid,
  winCells,
  onNewGame,
  gameTitle = 'Connect Four',
  board,
  shareRows,
  moveWord = 'moves',
}: {
  open: boolean
  onClose: () => void
  result: MatchResult
  players: [PlayerConfig, PlayerConfig]
  stats: [SeatStats, SeatStats]
  firstSeat: 0 | 1
  moves: number
  grid: Grid
  winCells: number[] | null
  onNewGame: () => void
  /** Overrides for other grid games (Pentago). */
  gameTitle?: string
  board?: ReactNode
  shareRows?: string[]
  moveWord?: string
}) {
  const [copied, setCopied] = useState(false)
  const w = result.winnerSeat
  const label = (s: 0 | 1) => `${players[s].name} (${players[s].modelId || 'unknown model'})`
  const rows: string[] = shareRows ?? []
  if (!shareRows) for (let r = 0; r < 6; r++) {
    rows.push(
      grid
        .slice(r * 7, r * 7 + 7)
        .map((v) => (v === 0 ? '⚪' : (v === 1 ? firstSeat : 1 - firstSeat) === 0 ? '🟢' : '🟠'))
        .join(''),
    )
  }
  const share = [
    `${APP_CONFIG.APP_NAME} — ${gameTitle}`,
    w === null ? `Draw: ${label(0)} vs ${label(1)}` : `${label(w)} beat ${label(w === 0 ? 1 : 0)}`,
    `${result.reason} · ${moves} ${moveWord}`,
    ...rows,
    `Tokens: ${fmtTokens(stats[0].promptTokens + stats[0].completionTokens)} vs ${fmtTokens(stats[1].promptTokens + stats[1].completionTokens)}`,
  ].join('\n')

  return (
    <Modal open={open} onClose={onClose} className={`result ${w === null ? 'draw' : `win-p${w + 1}`}`}>
      <div className="result-hero">
        <div className="result-icon">
          <IconTrophy size={26} />
        </div>
        <div className="eyebrow">{w === null ? 'Draw' : `Winner · ${reasonKind(result.reason)}`}</div>
        <h2 className="result-title serif">{w === null ? 'Honours even' : players[w].name}</h2>
        <p className="muted">{result.reason}</p>
      </div>
      {board ?? <C4Mini grid={grid} firstSeat={firstSeat} winCells={winCells} />}
      <div className="result-grid">
        {([0, 1] as const).map((s) => (
          <div key={s} className={`result-card accent-p${s + 1} ${w === s ? 'is-winner' : ''}`}>
            <div className="seat-tag">
              <span className="seat-dot" /> {players[s].name} · {s === firstSeat ? 'First' : 'Second'}
            </div>
            <div className="mono small muted ellipsis" title={players[s].modelId}>
              {players[s].modelId || 'unknown'}
            </div>
            <dl>
              <dt>Tokens</dt>
              <dd className="mono">{fmtTokens(stats[s].promptTokens + stats[s].completionTokens)}</dd>
              <dt>Cost</dt>
              <dd className="mono">{fmtCost(stats[s].costUsd, stats[s].costKnown && stats[s].requests > 0)}</dd>
              <dt>Think time</dt>
              <dd className="mono">{fmtDuration(stats[s].timeMs)}</dd>
              <dt>Invalid replies</dt>
              <dd className="mono">{stats[s].illegalReplies}</dd>
            </dl>
          </div>
        ))}
      </div>
      <div className="result-meta muted">{moves} {moveWord}</div>
      <div className="result-actions">
        <button
          className="dock-btn"
          onClick={async () => {
            if (await copyText(share)) {
              setCopied(true)
              setTimeout(() => setCopied(false), 1400)
            }
          }}
        >
          {copied ? <IconCheck size={15} /> : <IconCopy size={15} />} {copied ? 'Copied' : 'Copy result'}
        </button>
        <button className="primary-btn" onClick={onNewGame}>
          <IconRefresh size={16} /> New Game
        </button>
      </div>
    </Modal>
  )
}
