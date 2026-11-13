import { useState } from 'react'
import type { Seat, SeatStats } from '../core/types'
import { debateMarkdown, debatePlainText, type DebateExport } from '../games/debate/export'
import { CRITERIA, type JudgeVerdict } from '../games/debate/judge'
import { STANCE_LABEL } from '../games/debate/module'
import { copyText, downloadText } from '../lib/download'
import { fmtCost, fmtDuration, fmtTokens } from '../lib/format'
import type { AudienceVote, DebateRecord } from '../lib/history'
import { Modal } from './Modal'
import { IconCheck, IconCopy, IconDownload, IconGavel, IconRefresh, IconSwap, IconTrophy, IconUsers } from './Icons'

export interface JudgeState {
  status: 'off' | 'running' | 'done' | 'error'
  verdict: JudgeVerdict | null
  stats: SeatStats | null
  error?: string
}

const total = (s: JudgeVerdict['scores'][0]) => CRITERIA.reduce((a, c) => a + s[c], 0)

function Verdict({ v, names }: { v: JudgeVerdict; names: [string, string] }) {
  return (
    <div className="verdict">
      <div className={`verdict-win ${v.winner === null ? 'tie' : `accent-p${v.winner + 1}`}`}>
        <IconTrophy size={16} />
        <span>{v.winner === null ? 'The judge calls it a tie' : `${names[v.winner]} wins`}</span>
      </div>
      <div className="scores">
        <div className="score-row head">
          <span className="t-p1 ellipsis">{names[0]}</span>
          <span />
          <span className="t-p2 ellipsis">{names[1]}</span>
        </div>
        {CRITERIA.map((c) => (
          <div key={c} className="score-row">
            <span className="score-bar l">
              <i style={{ width: `${v.scores[0][c] * 10}%` }} />
              <b className="mono">{v.scores[0][c]}</b>
            </span>
            <span className="score-label">{c}</span>
            <span className="score-bar r">
              <i style={{ width: `${v.scores[1][c] * 10}%` }} />
              <b className="mono">{v.scores[1][c]}</b>
            </span>
          </div>
        ))}
        <div className="score-row total">
          <span className="mono t-p1">{total(v.scores[0]).toFixed(1)}</span>
          <span className="score-label">total / 40</span>
          <span className="mono t-p2">{total(v.scores[1]).toFixed(1)}</span>
        </div>
      </div>
      {v.explanation && <p className="verdict-text">{v.explanation}</p>}
    </div>
  )
}

export function DebateResultModal({
  open,
  onClose,
  record,
  judge,
  voteOn,
  vote,
  onVote,
  onRetryJudge,
  onRematch,
  onRematchSwap,
  onNew,
}: {
  open: boolean
  onClose: () => void
  record: DebateRecord
  judge: JudgeState
  voteOn: boolean
  vote: AudienceVote
  onVote: (v: AudienceVote) => void
  onRetryJudge: () => void
  onRematch: () => void
  onRematchSwap: () => void
  onNew: () => void
}) {
  const [copied, setCopied] = useState(false)
  const names = record.setup.names
  const needsVote = voteOn && vote === null
  const exp: DebateExport = {
    setup: record.setup,
    models: [record.players[0].modelId, record.players[1].modelId],
    turns: record.turns,
    stats: record.stats,
    durationMs: record.durationMs,
    date: record.date,
    verdict: needsVote ? null : judge.verdict,
    judgeModel: record.judge?.player.modelId,
    vote,
  }
  const winner: Seat | null = !needsVote && judge.verdict ? judge.verdict.winner : vote === 0 || vote === 1 ? vote : null
  const words = (s: Seat) => record.turns.filter((t) => t.seat === s).reduce((a, t) => a + t.words, 0)
  const ended = record.result.reason !== 'Debate complete'

  return (
    <Modal open={open} onClose={onClose} wide className={`result dresult ${winner === null ? 'draw' : `win-p${winner + 1}`}`}>
      <div className="result-hero">
        <div className="result-icon">
          <IconTrophy size={26} />
        </div>
        <div className="eyebrow">{ended ? record.result.reason : 'Debate complete'}</div>
        <h2 className="dresult-topic serif">“{record.setup.topic}”</h2>
        <p className="muted small">
          {record.turns.length} turns · {fmtDuration(record.durationMs)} total · {record.setup.format === 'structured' ? 'Structured' : 'Free-flow'}
        </p>
      </div>

      {voteOn && (
        <section className="rsec">
          <h3 className="set-h">
            <IconUsers size={14} /> Audience vote
          </h3>
          {vote === null ? (
            <>
              <p className="muted small">Who argued better? Vote before the judge’s verdict is revealed.</p>
              <div className="vote-row">
                <button className="vote-btn accent-p1" onClick={() => onVote(0)}>
                  <span className="seat-dot" /> {names[0]}
                </button>
                <button className="vote-btn" onClick={() => onVote('tie')}>
                  Tie
                </button>
                <button className="vote-btn accent-p2" onClick={() => onVote(1)}>
                  <span className="seat-dot" /> {names[1]}
                </button>
              </div>
              <button className="link small" onClick={() => onVote('skipped')}>
                Skip voting
              </button>
            </>
          ) : (
            <p className="vote-result">
              {vote === 'skipped' ? (
                <span className="muted">You skipped the vote.</span>
              ) : vote === 'tie' ? (
                'You called it a tie.'
              ) : (
                <>
                  You voted for <b className={vote === 0 ? 't-p1' : 't-p2'}>{names[vote]}</b>
                  {judge.verdict && !needsVote && (
                    <span className="muted"> · {judge.verdict.winner === vote ? 'the judge agrees' : 'the judge disagrees'}</span>
                  )}
                </>
              )}
            </p>
          )}
        </section>
      )}

      {judge.status !== 'off' && (
        <section className="rsec">
          <h3 className="set-h">
            <IconGavel size={14} /> Judge verdict
            {record.judge?.player.modelId && <span className="mono muted small ellipsis">· {record.judge.player.modelId}</span>}
          </h3>
          {needsVote ? (
            <p className="muted small">{judge.status === 'running' ? 'The judge is deliberating…' : 'The verdict is sealed until you vote.'}</p>
          ) : judge.status === 'running' ? (
            <div className="judge-wait">
              <span className="thinking-dots">
                The judge is reading the transcript
                <i />
                <i />
                <i />
              </span>
            </div>
          ) : judge.status === 'error' ? (
            <div className="row gap">
              <span className="grow small bubble-err">{judge.error}</span>
              <button className="dock-btn" onClick={onRetryJudge}>
                <IconRefresh size={14} /> Retry judge
              </button>
            </div>
          ) : judge.verdict ? (
            <Verdict v={judge.verdict} names={names} />
          ) : null}
        </section>
      )}

      <div className="result-grid">
        {([0, 1] as const).map((s) => (
          <div key={s} className={`result-card accent-p${s + 1} ${winner === s ? 'is-winner' : ''}`}>
            <div className="seat-tag">
              <span className="seat-dot" /> {names[s]} · {STANCE_LABEL[record.setup.stances[s]]}
            </div>
            <div className="mono small muted ellipsis" title={record.players[s].modelId}>
              {record.players[s].modelId || 'unknown'}
            </div>
            <dl>
              <dt>Turns</dt>
              <dd className="mono">{record.turns.filter((t) => t.seat === s && !t.skipped).length}</dd>
              <dt>Words</dt>
              <dd className="mono">{words(s)}</dd>
              <dt>Tokens</dt>
              <dd className="mono">{fmtTokens(record.stats[s].promptTokens + record.stats[s].completionTokens)}</dd>
              <dt>Cost</dt>
              <dd className="mono">{fmtCost(record.stats[s].costUsd, record.stats[s].costKnown && record.stats[s].requests > 0)}</dd>
              <dt>Think time</dt>
              <dd className="mono">{fmtDuration(record.stats[s].timeMs)}</dd>
            </dl>
          </div>
        ))}
      </div>
      {judge.stats && (
        <div className="result-meta muted small">
          Judge: {fmtTokens(judge.stats.promptTokens + judge.stats.completionTokens)} tokens · {fmtCost(judge.stats.costUsd, judge.stats.costKnown)}
        </div>
      )}

      <div className="result-actions">
        <button
          className="dock-btn"
          onClick={async () => {
            if (await copyText(debatePlainText(exp))) {
              setCopied(true)
              setTimeout(() => setCopied(false), 1400)
            }
          }}
        >
          {copied ? <IconCheck size={15} /> : <IconCopy size={15} />} {copied ? 'Copied' : 'Copy text'}
        </button>
        <button className="dock-btn" onClick={() => downloadText(`debate-${record.date.slice(0, 10)}.md`, debateMarkdown(exp), 'text/markdown')}>
          <IconDownload size={15} /> Markdown
        </button>
        <button className="dock-btn" onClick={onRematch}>
          <IconRefresh size={15} /> Rematch
        </button>
        <button className="dock-btn" onClick={onRematchSwap}>
          <IconSwap size={15} /> Swap stances
        </button>
        <button className="primary-btn" onClick={onNew}>
          New debate
        </button>
      </div>
    </Modal>
  )
}
