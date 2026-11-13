import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { RunnerError, Seat } from '../core/types'
import type { DebateTurn, ScheduledTurn } from '../games/debate/module'
import { IconAlert, IconArrowDown, IconRefresh, IconSkipFwd } from './Icons'
import { Waveform } from './DebaterPanel'

export interface LiveTurn {
  seat: Seat
  label: string
  round: number
  text: string
}

function Bubble({
  seat,
  name,
  label,
  round,
  children,
  speaking,
  className = '',
  meta,
  turnIndex,
}: {
  turnIndex?: number
  seat: Seat
  name: string
  label: string
  round: number
  children: ReactNode
  speaking?: boolean
  className?: string
  meta?: ReactNode
}) {
  return (
    <li data-turn={turnIndex} className={`tb tb-${seat} accent-p${seat + 1} ${speaking ? 'speaking' : ''} ${className}`}>
      <div className="tb-head">
        <span className="seat-dot" />
        <span className="tb-name">{name}</span>
        <span className="tb-label">
          {label}
          {label.startsWith('Round') ? '' : ` · R${round}`}
        </span>
        {speaking && <Waveform active />}
      </div>
      <div className="tb-body">{children}</div>
      {meta && <div className="tb-meta small">{meta}</div>}
    </li>
  )
}

export function Transcript({
  names,
  turns,
  live,
  error,
  errorSlot,
  speakingIndex,
  onRetry,
  onSkip,
  empty,
}: {
  names: [string, string]
  turns: DebateTurn[]
  live: LiveTurn | null
  error: RunnerError | null
  errorSlot: ScheduledTurn | null
  speakingIndex: number | null
  onRetry: () => void
  onSkip: () => void
  empty: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const stick = useRef(true)

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    stick.current = bottom
    setAtBottom(bottom)
  }

  const jump = (smooth = true) => {
    const el = ref.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    stick.current = true
    setAtBottom(true)
  }

  useLayoutEffect(() => {
    if (stick.current) jump(false)
  }, [turns.length, live?.text.length, Boolean(error)])

  // Bring the bubble being read aloud into view (replay / catch-up).
  useEffect(() => {
    if (speakingIndex === null || !stick.current) return
    ref.current?.querySelector(`[data-turn="${speakingIndex}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [speakingIndex])

  const hasContent = turns.length > 0 || live || error
  return (
    <div className="transcript-wrap">
      <div className="transcript" ref={ref} onScroll={onScroll} aria-live="polite" aria-label="Debate transcript">
        {!hasContent ? (
          empty
        ) : (
          <ol className="tlist">
            {turns.map((t, i) => (
                <Bubble
                  key={i}
                  turnIndex={i}
                  seat={t.seat}
                  name={names[t.seat]}
                  label={t.label}
                  round={t.round}
                  speaking={speakingIndex === i}
                  className={t.skipped ? 'skipped' : ''}
                  meta={
                    t.skipped ? null : (
                      <>
                        <span className="mono">{t.words} words</span>
                        {t.trimmed && <span title="Trimmed to the turn-length soft cap">· trimmed</span>}
                      </>
                    )
                  }
                >
                  {t.skipped ? (
                    <span className="tb-note">
                      <IconSkipFwd size={13} /> Turn skipped{t.note ? ` — ${t.note}` : ''}
                    </span>
                  ) : (
                    t.text.split(/\n{2,}/).map((para, k) => <p key={k}>{para}</p>)
                  )}
                </Bubble>
            ))}
            {live && (
                <Bubble seat={live.seat} name={names[live.seat]} label={live.label} round={live.round} className="typing">
                  {live.text ? (
                    <p>
                      {live.text}
                      <span className="caret" aria-hidden />
                    </p>
                  ) : (
                    <span className="thinking-dots">
                      Thinking
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                </Bubble>
            )}
            {error && (
                <Bubble
                  seat={error.seat}
                  name={names[error.seat]}
                  label={errorSlot?.label ?? 'Turn'}
                  round={errorSlot?.round ?? 1}
                  className="is-error"
                >
                  {error.partial && <p className="tb-partial">{error.partial}</p>}
                  <div className="tb-alert" role="alert">
                    <IconAlert size={15} />
                    <div className="grow">
                      <strong>
                        {error.kind === 'refusal'
                          ? 'The model declined this turn'
                          : error.kind === 'timeout'
                            ? 'The turn timed out'
                            : error.kind === 'invalid'
                              ? 'No usable reply'
                              : 'Something went wrong'}
                      </strong>
                      <div className="small muted">{error.message}</div>
                    </div>
                  </div>
                  <div className="tb-actions">
                    <button className="primary-btn small" onClick={onRetry}>
                      <IconRefresh size={14} /> Retry
                    </button>
                    {error.skippable && (
                      <button className="dock-btn" onClick={onSkip}>
                        <IconSkipFwd size={14} /> Skip turn
                      </button>
                    )}
                  </div>
                </Bubble>
            )}
          </ol>
        )}
      </div>
      {!atBottom && hasContent && (
        <button className="jump-latest glass" onClick={() => jump()}>
          <IconArrowDown size={14} /> Jump to latest
        </button>
      )}
    </div>
  )
}
