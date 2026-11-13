import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { APP_CONFIG, type Speed } from '../config/app'
import { estimateSeatCost } from '../core/cost'
import { MatchRunner } from '../core/matchRunner'
import type { PlayerConfig, RunnerSnapshot, Seat, SeatStats } from '../core/types'
import { PentagoBoard, PentagoMini } from '../games/pentago/Board'
import { createPentagoModule, dirLabel, movesFromSaved, quadLabel, type PentagoMove, type PentagoMoveRecord, type PentagoState } from '../games/pentago/module'
import { SIZE, cellName, emptyGrid, evaluate, rotatedCell, type Grid } from '../games/pentago/rules'
import { HISTORY_STORE, isPentagoRecord, saveMatch, type HistoryRecord, type PentagoMatchRecord } from '../lib/history'
import { readCredentials, useKeyStore } from '../lib/keys'
import { getCachedModel } from '../lib/models'
import { playSound } from '../lib/sound'
import { useStore } from '../lib/storage'
import { uid } from '../lib/format'
import { DEFAULT_PROVIDER_ID, getProvider } from '../providers/registry'
import { C4ResultModal } from '../components/C4ResultModal'
import { ControlDock } from '../components/ControlDock'
import { HistoryDialog } from '../components/HistoryDrawer'
import { KeyDialog } from '../components/KeyDialog'
import { Modal } from '../components/Modal'
import { PlayerPanel } from '../components/PlayerPanel'
import { PreflightModal } from '../components/PreflightModal'
import { StatusPill } from '../components/StatusPill'
import { IconAlert, IconDice, IconHistory, IconMute, IconRefresh, IconSettings, IconVolume } from '../components/Icons'
import type { ModeProps } from './ChessMode'

type Runner = MatchRunner<PentagoState, PentagoMove>
type Snap = RunnerSnapshot<PentagoState>

const MAX_PLIES = SIZE * SIZE
/** How long the placement is shown before the twist animates (ms). */
const TWIST_DELAY = 650

interface PgPrefs {
  speed: Speed
  moveTimeoutSec: number
  randomOpening: boolean
}
const DEFAULT_PREFS: PgPrefs = { speed: 'normal', moveTimeoutSec: APP_CONFIG.defaults.moveTimeoutSec, randomOpening: false }

const DEFAULT_PLAYERS: [PlayerConfig, PlayerConfig] = [
  { name: 'Player 1', providerId: DEFAULT_PROVIDER_ID, modelId: '', effort: 'default' },
  { name: 'Player 2', providerId: DEFAULT_PROVIDER_ID, modelId: '', effort: 'default' },
]

const emptyStats = (): SeatStats => ({
  promptTokens: 0,
  completionTokens: 0,
  costUsd: 0,
  costKnown: true,
  timeMs: 0,
  requests: 0,
  illegalReplies: 0,
  lastComment: '',
})

/** Board shown at a display step: step 2k-1 = turn k placed, step 2k = turn k twisted. */
function viewAt(moves: PentagoMoveRecord[], step: number) {
  if (step <= 0) return { grid: emptyGrid() as Grid, rec: null as PentagoMoveRecord | null, turn: 0, placed: false }
  const turn = Math.ceil(step / 2)
  const rec = moves[turn - 1]
  const placed = step % 2 === 1
  return { grid: placed ? rec.placed : rec.grid, rec, turn, placed }
}

export function PentagoMode({ modeSwitch, onBusyChange, initialReplay, onReplayOther }: ModeProps) {
  const [players, setPlayers] = useStore<[PlayerConfig, PlayerConfig]>('pentago.players', DEFAULT_PLAYERS)
  const [firstSeatPref, setFirstSeatPref] = useStore<Seat>('pentago.firstSeat', 0)
  const [randomize, setRandomize] = useStore('pentago.randomize', false)
  const [prefsRaw, setPrefs] = useStore<PgPrefs>('pentago.prefs', DEFAULT_PREFS)
  const [muted, setMuted] = useStore('muted', false)
  const [history, setHistory] = useStore<HistoryRecord[]>(HISTORY_STORE, [])
  const [keys] = useKeyStore()
  const p: PgPrefs = { ...DEFAULT_PREFS, ...prefsRaw }
  const patchPrefs = (x: Partial<PgPrefs>) => setPrefs((cur) => ({ ...DEFAULT_PREFS, ...cur, ...x }))

  const runnerRef = useRef<Runner | null>(null)
  const [snap, setSnap] = useState<Snap | null>(null)
  const [active, setActive] = useState<{ id: string; players: [PlayerConfig, PlayerConfig]; firstSeat: Seat; date: string } | null>(null)
  const [replay, setReplay] = useState<PentagoMatchRecord | null>(null)
  const [replayPlaying, setReplayPlaying] = useState(false)
  const [viewPly, setViewPly] = useState<number | null>(null)
  /** 1 while a new live turn shows its placement before the twist animates. */
  const [lag, setLag] = useState(0)
  const lagTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [keyDialog, setKeyDialog] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [preflightOpen, setPreflightOpen] = useState(false)

  useEffect(
    () => () => {
      runnerRef.current?.dispose()
      if (lagTimer.current) clearTimeout(lagTimer.current)
    },
    [],
  )

  // ---------- Derived ----------
  const dispPlayers = replay?.players ?? active?.players ?? players
  const firstSeat: Seat = replay ? replay.firstSeat : active ? active.firstSeat : firstSeatPref
  const seatOfDisc = (d: 1 | 2): Seat => (d === 1 ? firstSeat : ((1 - firstSeat) as Seat))

  const moves: PentagoMoveRecord[] = useMemo(
    () =>
      replay
        ? movesFromSaved(replay.moves.map((m, i) => ({ ...m, comment: replay.comments[i] })), replay.randomMoves)
        : snap?.state.moves ?? [],
    [replay, snap?.state],
  )
  /** Each turn is two display steps: placement, then twist. */
  const total = moves.length * 2
  const curStep = viewPly === null ? total - lag : Math.min(viewPly, total)
  const view = viewAt(moves, curStep)
  const grid = view.grid
  const rec = view.rec
  const lastCell = rec ? (view.placed || !rec.rotated ? rec.cell : rotatedCell(rec.cell, rec.quad, rec.dir)) : null
  const spin = rec && !view.placed && rec.rotated ? { quad: rec.quad, dir: rec.dir, key: curStep } : null
  const pending = rec && view.placed && rec.rotated ? { quad: rec.quad, dir: rec.dir } : null
  const res = useMemo(() => evaluate(grid), [grid])
  const winCells = res.status === 'ongoing' || !res.cells.length ? null : res.cells
  const turnsDone = view.placed ? view.turn - 1 : view.turn
  const turnSeat: Seat = seatOfDisc(turnsDone % 2 === 0 ? 1 : 2)
  const phase = view.placed ? 'Rotation' : 'Placement'

  const stats: [SeatStats, SeatStats] = replay?.stats ?? snap?.stats ?? [emptyStats(), emptyStats()]
  const status = replay ? 'over' : snap?.status ?? 'idle'
  const locked = Boolean(snap) || Boolean(replay)
  const result = replay?.result ?? snap?.result ?? null
  const err = snap?.error ?? null

  const commentFor = (s: Seat) => {
    for (let i = view.turn - 1; i >= 0; i--) if (seatOfDisc(moves[i].marble) === s && moves[i].comment && !moves[i].random) return moves[i].comment
    return ''
  }

  // ---------- Pill ----------
  const pill = (() => {
    const moveTxt = rec ? `${cellName(rec.cell)}${rec.rotated ? ` · ${quadLabel(rec.quad)} ${dirLabel(rec.dir)}` : ''}` : ''
    if (replay) return { text: `Replay · turn ${view.turn} of ${moves.length} · ${curStep === 0 ? 'Start' : phase}${moveTxt ? ` · ${moveTxt}` : ''}`, tone: 'neutral' as const, live: false }
    if (!snap) return { text: 'Ready · pick two models', tone: 'neutral' as const, live: false }
    if (snap.status === 'over' && snap.result && viewPly === null) return { text: snap.result.reason, tone: 'done' as const, live: false }
    if (snap.status === 'error') return { text: 'Paused on error · retry available', tone: 'alert' as const, live: false }
    const prefix = snap.status === 'paused' ? 'Paused · ' : viewPly !== null ? 'Viewing · ' : ''
    if (lag)
      return { text: `${prefix}${dispPlayers[turnSeat].name} · Rotation · ${rec ? `${quadLabel(rec.quad)} ${dirLabel(rec.dir)}` : ''}`, tone: (turnSeat === 0 ? 'p1' : 'p2') as 'p1' | 'p2', live: true }
    return {
      text: `${prefix}${dispPlayers[turnSeat].name} · Placement + rotation · Turn ${turnsDone + 1}`,
      tone: (turnSeat === 0 ? 'p1' : 'p2') as 'p1' | 'p2',
      live: snap.status === 'running',
    }
  })()

  // ---------- Start ----------
  const startReason = (() => {
    for (const s of [0, 1] as Seat[]) {
      const pl = players[s]
      if (!pl.modelId.trim()) return `Choose a model for ${pl.name}`
      if (!getProvider(pl.providerId).hasCredentials(keys[pl.providerId] ?? {})) return `Add credentials for ${pl.name}`
    }
    return null
  })()

  const estimates = useMemo(() => {
    const mod = createPentagoModule()
    const chars = mod.systemPrompt('first').length + mod.turnPrompt(mod.createState(), 'first').length
    return ([0, 1] as Seat[]).map((s) =>
      estimateSeatCost({
        model: getCachedModel(players[s].providerId, keys[players[s].providerId] ?? {}, players[s].modelId),
        effort: players[s].effort,
        firstPromptChars: chars,
        maxPlies: MAX_PLIES,
      }),
    ) as [ReturnType<typeof estimateSeatCost>, ReturnType<typeof estimateSeatCost>]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, keys, preflightOpen])

  const startMatch = () => {
    setPreflightOpen(false)
    const fs: Seat = randomize ? (Math.random() < 0.5 ? 0 : 1) : firstSeatPref
    if (randomize) setFirstSeatPref(fs)
    const freeze = (s: Seat): PlayerConfig => {
      const pl = players[s]
      const info = getCachedModel(pl.providerId, readCredentials(pl.providerId), pl.modelId)
      const unsupported = getProvider(pl.providerId).effortSupport(info) === false
      return { ...pl, name: pl.name.trim() || `Player ${s + 1}`, effort: unsupported ? 'default' : pl.effort }
    }
    const frozen: [PlayerConfig, PlayerConfig] = [freeze(0), freeze(1)]
    const id = uid()
    const date = new Date().toISOString()
    const randomOpening = p.randomOpening
    const runner: Runner = new MatchRunner(
      createPentagoModule({ randomOpening }),
      {
        players: frozen,
        sideSeat: { first: fs, second: (1 - fs) as Seat },
        maxPlies: MAX_PLIES,
        moveTimeoutMs: p.moveTimeoutSec * 1000,
        maxIllegalAttempts: APP_CONFIG.defaults.maxIllegalAttempts,
      },
      {
        getCredentials: (pid) => readCredentials(pid),
        getModelInfo: (pid, mid) => getCachedModel(pid, readCredentials(pid), mid),
      },
    )
    runner.speed = p.speed
    runner.subscribe(setSnap)
    runner.onMove = (st) => {
      playSound('move')
      // Show the placement first, then animate the twist.
      if (st.moves[st.moves.length - 1]?.rotated) {
        if (lagTimer.current) clearTimeout(lagTimer.current)
        setLag(1)
        lagTimer.current = setTimeout(() => {
          setLag(0)
          playSound('capture')
        }, TWIST_DELAY)
      }
    }
    runner.onEnd = (s) => {
      playSound('end')
      setViewPly(null)
      setResultOpen(true)
      if (!s.result) return
      saveMatch({
        id,
        gameId: 'pentago',
        date,
        players: frozen,
        firstSeat: fs,
        moves: s.state.moves.map((m) => ({ cell: m.cell, quad: m.quad, dir: m.dir })),
        comments: s.state.moves.map((m) => m.comment),
        randomMoves: s.state.moves.filter((m) => m.random).length,
        result: s.result,
        stats: s.stats,
      })
    }
    runnerRef.current?.dispose()
    runnerRef.current = runner
    setActive({ id, players: frozen, firstSeat: fs, date })
    setSnap(runner.snapshot)
    setViewPly(null)
    playSound('start')
    runner.start()
  }

  const newGame = useCallback(() => {
    runnerRef.current?.dispose()
    runnerRef.current = null
    setSnap(null)
    setActive(null)
    setViewPly(null)
    setResultOpen(false)
    setReplay(null)
    setReplayPlaying(false)
    setLag(0)
  }, [])

  const togglePause = useCallback(() => {
    const r = runnerRef.current
    if (!r) return
    if (r.snapshot.status === 'running') r.pause()
    else if (r.snapshot.status === 'paused') r.resume()
  }, [])

  const step = useCallback(
    (d: number) => {
      if (!total) return
      setViewPly((v) => {
        const cur = v === null ? total : v
        const next = Math.max(0, Math.min(total, cur + d))
        if (next > cur) playSound(next % 2 === 0 ? 'capture' : 'move')
        return next === total && !replay ? null : next
      })
    },
    [total, replay],
  )

  // Replay autoplay
  useEffect(() => {
    if (!replay || !replayPlaying) return
    const t = setInterval(() => {
      setViewPly((v) => {
        const cur = v ?? 0
        if (cur >= total) {
          setReplayPlaying(false)
          return cur
        }
        playSound((cur + 1) % 2 === 0 ? 'capture' : 'move')
        return cur + 1
      })
    }, Math.round((APP_CONFIG.speeds[p.speed] + 400) * 0.7))
    return () => clearInterval(t)
  }, [replay, replayPlaying, total, p.speed])

  const anyModal = keyDialog || settingsOpen || historyOpen || resultOpen || preflightOpen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (anyModal) return
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ' ' && !t.closest('button, a')) {
        e.preventDefault()
        if (replay) setReplayPlaying((x) => !x)
        else togglePause()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setReplayPlaying(false)
        step(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setReplayPlaying(false)
        step(1)
      } else if (e.key.toLowerCase() === 'm') setMuted((m) => !m)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anyModal, replay, togglePause, step, setMuted])

  const startReplay = (rec: HistoryRecord) => {
    setHistoryOpen(false)
    if (!isPentagoRecord(rec)) return onReplayOther?.(rec)
    newGame()
    setReplay(rec)
    setViewPly(0)
    setReplayPlaying(true)
  }

  useEffect(() => {
    if (initialReplay) startReplay(initialReplay)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReplay])

  const busy = Boolean(snap) && snap!.status !== 'over'
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange])

  const sideChip = (s: Seat) => ({
    label: s === firstSeat ? 'First' : 'Second',
    title: s === firstSeat ? 'Moves first (X)' : 'Moves second (O)',
    className: `pgchip s${s}`,
  })

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <span />
            <span />
          </div>
          <span className="brand-name">{APP_CONFIG.APP_NAME}</span>
          {modeSwitch}
        </div>
        <StatusPill text={pill.text} tone={pill.tone} live={pill.live} />
        <nav className="top-actions">
          <button className="icon-btn glass" onClick={() => setHistoryOpen(true)} aria-label="Match history" title="History">
            <IconHistory />
          </button>
          <button className="icon-btn glass" onClick={() => setSettingsOpen(true)} aria-label="Match settings" title="Settings">
            <IconSettings />
          </button>
          <button className="icon-btn glass" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute (M)' : 'Mute (M)'}>
            {muted ? <IconMute /> : <IconVolume />}
          </button>
        </nav>
      </header>

      <main className="arena">
        {([0, 1] as Seat[]).map((s) => (
          <div key={s} className={`slot slot-${s}`}>
            <PlayerPanel
              seat={s}
              player={dispPlayers[s]}
              onChange={(x) => !locked && setPlayers((cur) => (s === 0 ? [{ ...cur[0], ...x }, cur[1]] : [cur[0], { ...cur[1], ...x }]))}
              locked={locked}
              color={s === firstSeat ? 'w' : 'b'}
              sideChip={sideChip(s)}
              hideCaptured
              credentials={keys[dispPlayers[s].providerId] ?? {}}
              onSetKey={() => setKeyDialog(dispPlayers[s].providerId)}
              stats={stats[s]}
              thinking={snap?.thinkingSeat === s && !replay}
              attempt={snap?.attempt ?? 0}
              isTurn={!replay && Boolean(snap) && status !== 'over' && turnSeat === s}
              captured={[]}
              materialDiff={0}
              pieceTheme="classic"
              comment={commentFor(s)}
              errorMessage={err && err.seat === s ? err.message : null}
              winner={result ? result.winnerSeat === s : null}
            />
          </div>
        ))}

        <div className="slot slot-board">
          <div className="stage pg-stage">
            <PentagoBoard
              grid={grid}
              firstSeat={firstSeat}
              lastCell={lastCell}
              spin={spin}
              pending={pending}
              winCells={winCells}
              turnSeat={status === 'over' ? null : turnSeat}
              ghost={!winCells && status !== 'over' && viewPly === null && !lag}
            />
            <div className="pg-legend small muted" aria-live="polite">
              {rec ? (
                <>
                  <span className={`seat-dot-inline s${seatOfDisc(rec.marble)}`} /> {dispPlayers[seatOfDisc(rec.marble)].name}: placed <b>{cellName(rec.cell)}</b>
                  {rec.rotated ? (
                    <>
                      , {view.placed ? 'twisting' : 'twisted'} <b>{quadLabel(rec.quad)} {rec.dir === 'cw' ? '↻ CW' : '↺ CCW'}</b>
                    </>
                  ) : (
                    ' — five in a row, no twist needed'
                  )}
                  {rec.random && ' (random opening)'}
                </>
              ) : (
                'Each turn: place a marble, then twist one quadrant 90°. Five in a row wins.'
              )}
            </div>
            {viewPly !== null && !replay && snap && (
              <button className="live-chip glass" onClick={() => setViewPly(null)}>
                Viewing turn {view.turn} · Back to live →
              </button>
            )}
          </div>
        </div>
      </main>

      <div className="dock-wrap">
        {err && !replay && (
          <div className={`error-card glass accent-p${err.seat + 1}`} role="alert">
            <IconAlert size={16} />
            <div className="grow">
              <strong>{dispPlayers[err.seat].name} hit a problem</strong>
              <div className="small muted">{err.message}</div>
            </div>
            <button className="primary-btn small" onClick={() => runnerRef.current?.retry()}>
              <IconRefresh size={14} /> Retry
            </button>
          </div>
        )}
        <ControlDock
          status={status}
          speed={p.speed}
          onSpeed={(sp) => {
            patchPrefs({ speed: sp })
            if (runnerRef.current) runnerRef.current.speed = sp
          }}
          onStart={() => setPreflightOpen(true)}
          onPause={togglePause}
          onResume={togglePause}
          onResign={(s) => runnerRef.current?.resign(s)}
          onNewGame={newGame}
          onSwap={() => setFirstSeatPref((w) => (w === 0 ? 1 : 0))}
          swapTitle="Swap who moves first"
          randomize={randomize}
          onRandomize={setRandomize}
          onShowResult={() => setResultOpen(true)}
          playerNames={[dispPlayers[0].name, dispPlayers[1].name]}
          startDisabledReason={startReason}
          extraIdle={
            <label className="toggle" title="The first two turns use random placements and twists so games vary">
              <input type="checkbox" checked={p.randomOpening} onChange={(e) => patchPrefs({ randomOpening: e.target.checked })} />
              <span className="toggle-track" />
              <IconDice size={15} /> Random opening
            </label>
          }
          replay={
            replay
              ? {
                  ply: curStep,
                  total,
                  playing: replayPlaying,
                  onStep: (d) => {
                    setReplayPlaying(false)
                    step(d)
                  },
                  onJump: (n) => {
                    setReplayPlaying(false)
                    setViewPly(n)
                  },
                  onTogglePlay: () => {
                    if (curStep >= total) setViewPly(0)
                    setReplayPlaying((x) => !x)
                  },
                  onExit: newGame,
                }
              : null
          }
        />
        {startReason && status === 'idle' && !replay && <div className="dock-hint small">{startReason}</div>}
      </div>

      <KeyDialog providerId={keyDialog} onClose={() => setKeyDialog(null)} />
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Pentago settings">
        <div className="form">
          {locked && <div className="privacy-note small">Settings are locked while a match is in progress.</div>}
          <label className="field-label">
            Per-move timeout <span className="muted">(seconds)</span>
            <input
              className="field"
              type="number"
              min={5}
              max={900}
              value={p.moveTimeoutSec}
              disabled={locked}
              onChange={(e) => patchPrefs({ moveTimeoutSec: Math.max(5, Math.min(900, Number(e.target.value) || 5)) })}
            />
          </label>
          <label className="toggle">
            <input type="checkbox" checked={p.randomOpening} disabled={locked} onChange={(e) => patchPrefs({ randomOpening: e.target.checked })} />
            <span className="toggle-track" />
            Random opening (first 2 turns are random)
          </label>
          <p className="muted small">
            Each turn is a placement plus a mandatory 90° twist. Five after the placement wins at once; a twist that gives five to one player makes that player win (even the opponent); five for both, or a full board ({MAX_PLIES} turns), is a draw. A model gets {APP_CONFIG.defaults.maxIllegalAttempts} attempts per turn; after that it forfeits.
          </p>
          <div className="kbd-list small">
            <div>
              <kbd>Space</kbd> Pause / resume
            </div>
            <div>
              <kbd>←</kbd> <kbd>→</kbd> Step through placements and twists
            </div>
            <div>
              <kbd>M</kbd> Mute
            </div>
          </div>
          <div className="row end">
            <button className="primary-btn small" onClick={() => setSettingsOpen(false)}>
              Done
            </button>
          </div>
        </div>
      </Modal>
      <HistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} history={history} onReplay={startReplay} onClear={() => setHistory([])} />
      <PreflightModal
        open={preflightOpen}
        onClose={() => setPreflightOpen(false)}
        onConfirm={startMatch}
        players={players}
        whiteSeat={firstSeatPref}
        randomize={randomize}
        estimates={estimates}
        maxFullMoves={MAX_PLIES}
        timeoutSec={p.moveTimeoutSec}
        sideText={(s) => (randomize ? 'Order: random' : s === firstSeatPref ? 'Moves first' : 'Moves second')}
        limitText={`a full board (${MAX_PLIES} turns)`}
      />
      {snap?.result && active && (
        <C4ResultModal
          open={resultOpen}
          onClose={() => setResultOpen(false)}
          result={snap.result}
          players={active.players}
          stats={snap.stats}
          firstSeat={active.firstSeat}
          moves={snap.state.moves.length}
          grid={snap.state.grid}
          winCells={snap.state.winCells}
          onNewGame={newGame}
          gameTitle="Pentago"
          moveWord="turns"
          board={<PentagoMini grid={snap.state.grid} firstSeat={active.firstSeat} winCells={snap.state.winCells} />}
          shareRows={Array.from({ length: 6 }, (_, r) =>
            snap.state.grid
              .slice(r * 6, r * 6 + 6)
              .map((v, c) => (v === 0 ? '⚪' : (v === 1 ? active.firstSeat : 1 - active.firstSeat) === 0 ? '🟢' : '🟠') + (c === 2 ? ' ' : ''))
              .join(''),
          )}
        />
      )}
    </div>
  )
}
