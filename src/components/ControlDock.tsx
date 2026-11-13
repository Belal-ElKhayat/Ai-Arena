import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Speed } from '../config/app'
import type { RunnerStatus, Seat } from '../core/types'
import {
  IconChevronLeft,
  IconChevronRight,
  IconFlag,
  IconPause,
  IconPlay,
  IconRefresh,
  IconShuffle,
  IconSkipBack,
  IconSkipFwd,
  IconSwap,
  IconTrophy,
  IconClose,
} from './Icons'

const SPEEDS: Speed[] = ['slow', 'normal', 'fast']

export function SpeedControl({ speed, onSpeed }: { speed: Speed; onSpeed: (s: Speed) => void }) {
  return (
    <div className="seg speed" role="radiogroup" aria-label="Speed">
      {SPEEDS.map((s) => (
        <button key={s} role="radio" aria-checked={s === speed} className={s === speed ? 'on' : ''} onClick={() => onSpeed(s)}>
          {s[0].toUpperCase() + s.slice(1)}
        </button>
      ))}
    </div>
  )
}

/** Two-step confirm button (no browser dialogs). */
export function ConfirmButton({ onConfirm, children, className = '' }: { onConfirm: () => void; children: ReactNode; className?: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      className={`dock-btn ${className} ${armed ? 'armed' : ''}`}
      onClick={() => {
        if (armed) {
          setArmed(false)
          onConfirm()
        } else setArmed(true)
      }}
    >
      {armed ? 'Confirm?' : children}
    </button>
  )
}

export function ControlDock(props: {
  status: RunnerStatus
  speed: Speed
  onSpeed: (s: Speed) => void
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onResign: (seat: Seat) => void
  onNewGame: () => void
  onSwap: () => void
  randomize: boolean
  onRandomize: (v: boolean) => void
  onShowResult: () => void
  playerNames: [string, string]
  startDisabledReason?: string | null
  /** Tooltip for the Swap sides button. */
  swapTitle?: string
  /** Extra controls shown before the match starts (e.g. "Random opening"). */
  extraIdle?: ReactNode
  replay?: {
    ply: number
    total: number
    playing: boolean
    onStep: (d: number) => void
    onJump: (ply: number) => void
    onTogglePlay: () => void
    onExit: () => void
  } | null
}) {
  const { status, replay } = props
  const [resignOpen, setResignOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!resignOpen) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setResignOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [resignOpen])

  if (replay) {
    return (
      <div className="dock glass">
        <span className="dock-label">Replay</span>
        <button className="icon-btn" onClick={() => replay.onJump(0)} aria-label="First move">
          <IconSkipBack />
        </button>
        <button className="icon-btn" onClick={() => replay.onStep(-1)} aria-label="Previous move (Left arrow)">
          <IconChevronLeft />
        </button>
        <button className="primary-btn small" onClick={replay.onTogglePlay}>
          {replay.playing ? <IconPause /> : <IconPlay />}
          {replay.playing ? 'Pause' : 'Play'}
        </button>
        <button className="icon-btn" onClick={() => replay.onStep(1)} aria-label="Next move (Right arrow)">
          <IconChevronRight />
        </button>
        <button className="icon-btn" onClick={() => replay.onJump(replay.total)} aria-label="Last move">
          <IconSkipFwd />
        </button>
        <span className="dock-counter mono">
          {replay.ply}/{replay.total}
        </span>
        <button className="dock-btn" onClick={replay.onExit}>
          <IconClose size={15} /> Exit
        </button>
      </div>
    )
  }

  if (status === 'idle') {
    return (
      <div className="dock glass">
        <button className="dock-btn" onClick={props.onSwap} disabled={props.randomize} title={props.swapTitle ?? 'Swap who plays White'}>
          <IconSwap size={16} /> Swap sides
        </button>
        <label className="toggle" title="Randomly assign colors when the match starts">
          <input type="checkbox" checked={props.randomize} onChange={(e) => props.onRandomize(e.target.checked)} />
          <span className="toggle-track" />
          <IconShuffle size={15} /> Randomize
        </label>
        {props.extraIdle}
        <button
          className="primary-btn start"
          onClick={props.onStart}
          disabled={Boolean(props.startDisabledReason)}
          title={props.startDisabledReason ?? 'Start the match'}
        >
          <IconPlay size={18} /> Start Match
        </button>
        <SpeedControl speed={props.speed} onSpeed={props.onSpeed} />
      </div>
    )
  }

  if (status === 'over') {
    return (
      <div className="dock glass">
        <button className="dock-btn" onClick={props.onShowResult}>
          <IconTrophy size={16} /> Result
        </button>
        <button className="primary-btn" onClick={props.onNewGame}>
          <IconRefresh size={17} /> New Game
        </button>
      </div>
    )
  }

  const paused = status === 'paused'
  return (
    <div className="dock glass">
      {status === 'error' ? (
        <span className="dock-label alert">Waiting for retry</span>
      ) : (
        <button className="primary-btn" onClick={paused ? props.onResume : props.onPause} title="Space">
          {paused ? <IconPlay size={17} /> : <IconPause size={17} />}
          {paused ? 'Resume' : 'Pause'}
        </button>
      )}
      <SpeedControl speed={props.speed} onSpeed={props.onSpeed} />
      <div className="resign-wrap" ref={ref}>
        <button className="dock-btn" onClick={() => setResignOpen((o) => !o)} aria-expanded={resignOpen}>
          <IconFlag size={15} /> Resign
        </button>
        {resignOpen && (
          <div className="resign-pop glass">
            {([0, 1] as Seat[]).map((s) => (
              <button
                key={s}
                className={`resign-opt accent-p${s + 1}`}
                onClick={() => {
                  setResignOpen(false)
                  props.onResign(s)
                }}
              >
                <span className="seat-dot" /> {props.playerNames[s]} resigns
              </button>
            ))}
          </div>
        )}
      </div>
      <ConfirmButton onConfirm={props.onNewGame}>
        <IconRefresh size={15} /> New Game
      </ConfirmButton>
    </div>
  )
}
