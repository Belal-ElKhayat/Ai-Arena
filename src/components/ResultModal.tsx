import { useState } from 'react'
import type { MatchResult, PlayerConfig, SeatStats } from '../core/types'
import { downloadText } from '../games/chess/pgn'
import { fmtCost, fmtDuration, fmtTokens } from '../lib/format'
import { APP_CONFIG } from '../config/app'
import { Modal } from './Modal'
import { IconCheck, IconCopy, IconDownload, IconRefresh, IconTrophy } from './Icons'

export function ResultModal({
  open,
  onClose,
  result,
  players,
  stats,
  whiteSeat,
  plies,
  pgn,
  onNewGame,
  styles,
  styleAffects,
}: {
  open: boolean
  onClose: () => void
  result: MatchResult
  players: [PlayerConfig, PlayerConfig]
  stats: [SeatStats, SeatStats]
  whiteSeat: 0 | 1
  plies: number
  pgn: string
  onNewGame: () => void
  styles?: [string, string]
  styleAffects?: 'moves' | 'comments'
}) {
  const [copied, setCopied] = useState(false)
  const w = result.winnerSeat
  const moves = Math.ceil(plies / 2)
  const label = (s: 0 | 1) => `${players[s].name} (${players[s].modelId || 'unknown model'}, ${s === whiteSeat ? 'White' : 'Black'})`
  const share = [
    `${APP_CONFIG.APP_NAME} — Chess`,
    w === null ? `Draw: ${label(0)} vs ${label(1)}` : `${label(w)} beat ${label(w === 0 ? 1 : 0)}`,
    ...(styles ? [`Styles: ${styles[0]} vs ${styles[1]}${styleAffects === 'comments' ? ' (comments only)' : ''}`] : []),
    `${result.reason} · ${moves} moves`,
    `Tokens: ${fmtTokens(stats[0].promptTokens + stats[0].completionTokens)} vs ${fmtTokens(stats[1].promptTokens + stats[1].completionTokens)}`,
  ].join('\n')

  return (
    <Modal open={open} onClose={onClose} className={`result ${w === null ? 'draw' : `win-p${w + 1}`}`}>
      <div className="result-hero">
        <div className="result-icon">
          <IconTrophy size={26} />
        </div>
        <div className="eyebrow">{w === null ? 'Draw' : 'Winner'}</div>
        <h2 className="result-title serif">{w === null ? 'Honours even' : players[w].name}</h2>
        <p className="muted">{result.reason}</p>
      </div>
      <div className="result-grid">
        {([0, 1] as const).map((s) => (
          <div key={s} className={`result-card accent-p${s + 1} ${w === s ? 'is-winner' : ''}`}>
            <div className="seat-tag">
              <span className="seat-dot" /> {players[s].name} · {s === whiteSeat ? 'White' : 'Black'}
            </div>
            <div className="mono small muted ellipsis" title={players[s].modelId}>
              {players[s].modelId || 'unknown'}
            </div>
            {styles && (
              <div className="rc-style small">
                Style <b>{styles[s]}</b>
              </div>
            )}
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
      <div className="result-meta muted">{moves} moves · {plies} plies</div>
      <div className="result-actions">
        <button className="dock-btn" onClick={() => downloadText(`ai-arena-${Date.now()}.pgn`, pgn)}>
          <IconDownload size={15} /> PGN
        </button>
        <button
          className="dock-btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(share)
              setCopied(true)
              setTimeout(() => setCopied(false), 1400)
            } catch {
              /* ignore */
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
