import type { PlayerConfig } from '../core/types'
import { STANCE_LABEL, type DebaterConfig } from '../games/debate/module'
import { fmtCost, fmtTokens } from '../lib/format'
import { Modal } from './Modal'
import { IconAlert, IconGavel, IconPlay } from './Icons'
import type { SeatEstimate } from './PreflightModal'

export function DebatePreflight({
  open,
  onClose,
  onConfirm,
  topic,
  debaters,
  judge,
  estimates,
  judgeEstimate,
  turns,
  timeoutSec,
  firstLabel,
  voiceOn,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  topic: string
  debaters: [DebaterConfig, DebaterConfig]
  judge: PlayerConfig | null
  estimates: [SeatEstimate, SeatEstimate]
  judgeEstimate: SeatEstimate | null
  turns: number
  timeoutSec: number
  firstLabel: string
  voiceOn: boolean
}) {
  const all = [...estimates, ...(judgeEstimate ? [judgeEstimate] : [])]
  const total = all.every((e) => e.usd !== null) ? all.reduce((s, e) => s + (e.usd ?? 0), 0) : null
  return (
    <Modal open={open} onClose={onClose} title="Ready to debate?">
      <div className="form">
        <blockquote className="pf-topic serif">“{topic.trim()}”</blockquote>
        <div className="versus">
          {([0, 1] as const).map((s) => (
            <div key={s} className={`vs-card accent-p${s + 1}`}>
              <div className="seat-tag">
                <span className="seat-dot" /> {debaters[s].name}
              </div>
              <div className="mono small ellipsis" title={debaters[s].modelId}>
                {debaters[s].modelId}
              </div>
              <div className="small muted">
                {STANCE_LABEL[debaters[s].stance]} · effort {debaters[s].effort}
              </div>
              <div className="vs-est">
                <span className="muted small">Est. max</span>
                <span className="mono">{fmtCost(estimates[s].usd)}</span>
                <span className="muted small mono">~{fmtTokens(estimates[s].promptTokens + estimates[s].completionTokens)} tok</span>
              </div>
            </div>
          ))}
          <div className="vs-badge serif">vs</div>
        </div>
        {judge && judgeEstimate && (
          <div className="pf-judge small">
            <IconGavel size={14} />
            <span className="grow ellipsis">
              Judge: <span className="mono">{judge.modelId}</span>
            </span>
            <span className="mono">{fmtCost(judgeEstimate.usd)}</span>
          </div>
        )}
        <div className="privacy-note small warn">
          <IconAlert size={14} />
          <span>
            {total !== null ? (
              <>
                Estimated worst case for all {turns} turns{judge ? ' plus the verdict' : ''}: about <strong>{fmtCost(total)}</strong>. Reasoning output is estimated.
              </>
            ) : (
              <>Pricing for at least one model is unknown, so the cost can’t be estimated. The debate stops after {turns} turns.</>
            )}{' '}
            {firstLabel} speaks first. Each turn times out after {timeoutSec}s.{voiceOn ? ' Voice is on.' : ''} Settings lock once the debate begins.
          </span>
        </div>
        <div className="row gap end">
          <button className="dock-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn" onClick={onConfirm}>
            <IconPlay size={16} /> Start Debate
          </button>
        </div>
      </div>
    </Modal>
  )
}
