import type { PlayerConfig } from '../core/types'
import { fmtCost, fmtTokens } from '../lib/format'
import { Modal } from './Modal'
import { IconAlert, IconPlay } from './Icons'

export interface SeatEstimate {
  promptTokens: number
  completionTokens: number
  usd: number | null
}

export function PreflightModal({
  open,
  onClose,
  onConfirm,
  players,
  whiteSeat,
  randomize,
  estimates,
  maxFullMoves,
  timeoutSec,
  styles,
  styleAffects,
  onStyleAffects,
  sideText,
  limitText,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  players: [PlayerConfig, PlayerConfig]
  whiteSeat: 0 | 1
  randomize: boolean
  estimates: [SeatEstimate, SeatEstimate]
  maxFullMoves: number
  timeoutSec: number
  styles?: [string, string]
  styleAffects?: 'moves' | 'comments'
  onStyleAffects?: (v: 'moves' | 'comments') => void
  /** Overrides "Plays White / Black" (other games). */
  sideText?: (seat: 0 | 1) => string
  /** Overrides "the N-move limit" wording. */
  limitText?: string
}) {
  const total = estimates.every((e) => e.usd !== null) ? estimates.reduce((s, e) => s + (e.usd ?? 0), 0) : null
  return (
    <Modal open={open} onClose={onClose} title="Ready to start?">
      <div className="form">
        <div className="versus">
          {([0, 1] as const).map((s) => (
            <div key={s} className={`vs-card accent-p${s + 1}`}>
              <div className="seat-tag">
                <span className="seat-dot" /> {players[s].name}
              </div>
              <div className="mono small ellipsis" title={players[s].modelId}>{players[s].modelId}</div>
              <div className="small muted">
                {sideText ? sideText(s) : randomize ? 'Color: random' : s === whiteSeat ? 'Plays White' : 'Plays Black'} · effort {players[s].effort}
              </div>
              {styles && <div className="small vs-style">Style: {styles[s]}</div>}
              <div className="vs-est">
                <span className="muted small">Est. max</span>
                <span className="mono">{fmtCost(estimates[s].usd)}</span>
                <span className="muted small mono">~{fmtTokens(estimates[s].promptTokens + estimates[s].completionTokens)} tok</span>
              </div>
            </div>
          ))}
          <div className="vs-badge serif">vs</div>
        </div>
        {styles && onStyleAffects && (
          <div className="pf-affects">
            <div>
              <div className="setup-label">Style affects</div>
              <div className="muted small">
                {styleAffects === 'comments' ? 'Pure chess test: styles only flavour the comments.' : 'Personality test: styles shape move preference and comments.'}
              </div>
            </div>
            <div className="seg" role="radiogroup" aria-label="Style affects">
              <button role="radio" aria-checked={styleAffects !== 'comments'} className={styleAffects !== 'comments' ? 'on' : ''} onClick={() => onStyleAffects('moves')}>
                Move choice and comments
              </button>
              <button role="radio" aria-checked={styleAffects === 'comments'} className={styleAffects === 'comments' ? 'on' : ''} onClick={() => onStyleAffects('comments')}>
                Comments only
              </button>
            </div>
          </div>
        )}
        <div className="privacy-note small warn">
          <IconAlert size={14} />
          <span>
            {total !== null ? (
              <>
                Worst case if the game reaches {limitText ?? `the ${maxFullMoves}-move limit`}: about <strong>{fmtCost(total)}</strong> in total. Most games end much sooner. Reasoning output is estimated.
              </>
            ) : (
              <>Pricing for at least one model is unknown, so the cost can’t be estimated. The game stops at {limitText ?? `${maxFullMoves} moves`}.</>
            )}{' '}
            Each move times out after {timeoutSec}s. Settings lock once the match begins.
          </span>
        </div>
        <div className="row gap end">
          <button className="dock-btn" onClick={onClose}>Cancel</button>
          <button className="primary-btn" onClick={onConfirm}>
            <IconPlay size={16} /> Start Match
          </button>
        </div>
      </div>
    </Modal>
  )
}
