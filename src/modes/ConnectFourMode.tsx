import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { APP_CONFIG, type Speed } from '../config/app'
import { estimateSeatCost } from '../core/cost'
import { MatchRunner } from '../core/matchRunner'
import type { PlayerConfig, RunnerSnapshot, Seat, SeatStats } from '../core/types'
import { C4Board } from '../games/connect4/Board'
import { createConnectFourModule, type C4MoveRecord, type C4State } from '../games/connect4/module'
import { COLS, ROWS, drop, emptyGrid, findWin, type Grid } from '../games/connect4/rules'
import { HISTORY_STORE, isC4Record, saveMatch, type C4MatchRecord, type HistoryRecord } from '../lib/history'
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

type Runner = MatchRunner<C4State, number>
type Snap = RunnerSnapshot<C4State>

const MAX_PLIES = ROWS * COLS

interface C4Prefs {
  speed: Speed
  moveTimeoutSec: number
  randomOpening: boolean
}
const DEFAULT_PREFS: C4Prefs = { speed: 'normal', moveTimeoutSec: APP_CONFIG.defaults.moveTimeoutSec, randomOpening: false }

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

/** Rebuild move records (with landing rows) from saved columns. */
function movesFromCols(cols: number[], comments: string[], randomMoves: number): C4MoveRecord[] {
  let g = emptyGrid()
  const out: C4MoveRecord[] = []
  cols.forEach((col, i) => {
    const disc = (i % 2 === 0 ? 1 : 2) as 1 | 2
    const r = drop(g, col, disc)
    if (!r) return
    g = r.grid
    out.push({ col, row: r.row, disc, comment: comments[i] ?? '', random: i < randomMoves || undefined })
  })
  return out
}

function gridAt(moves: C4MoveRecord[], ply: number): Grid {
  const g = emptyGrid()
  for (const m of moves.slice(0, ply)) g[m.row * COLS + m.col] = m.disc
  return g
}

export function ConnectFourMode({ modeSwitch, onBusyChange, initialReplay, onReplayOther }: ModeProps) {
  const [players, setPlayers] = useStore<[PlayerConfig, PlayerConfig]>('c4.players', DEFAULT_PLAYERS)
  const [firstSeatPref, setFirstSeatPref] = useStore<Seat>('c4.firstSeat', 0)
  const [randomize, setRandomize] = useStore('c4.randomize', false)
  const [prefsRaw, setPrefs] = useStore<C4Prefs>('c4.prefs', DEFAULT_PREFS)
  const [muted, setMuted] = useStore('muted', false)
  const [history, setHistory] = useStore<HistoryRecord[]>(HISTORY_STORE, [])
  const [keys] = useKeyStore()
  const p: C4Prefs = { ...DEFAULT_PREFS, ...prefsRaw }
  const patchPrefs = (x: Partial<C4Prefs>) => setPrefs((cur) => ({ ...DEFAULT_PREFS, ...cur, ...x }))

  const runnerRef = useRef<Runner | null>(null)
  const [snap, setSnap] = useState<Snap | null>(null)
  const [active, setActive] = useState<{ id: string; players: [PlayerConfig, PlayerConfig]; firstSeat: Seat; date: string } | null>(null)
  const [replay, setReplay] = useState<C4MatchRecord | null>(null)
  const [replayPlaying, setReplayPlaying] = useState(false)
  const [viewPly, setViewPly] = useState<number | null>(null)

  const [keyDialog, setKeyDialog] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [preflightOpen, setPreflightOpen] = useState(false)

  useEffect(() => () => runnerRef.current?.dispose(), [])

  // ---------- Derived ----------
  const dispPlayers = replay?.players ?? active?.players ?? players
  const firstSeat: Seat = replay ? replay.firstSeat : active ? active.firstSeat : firstSeatPref
  const seatOfDisc = (d: 1 | 2): Seat => (d === 1 ? firstSeat : ((1 - firstSeat) as Seat))

  const moves: C4MoveRecord[] = useMemo(
    () => (replay ? movesFromCols(replay.cols, replay.comments, replay.randomMoves) : snap?.state.moves ?? []),
    [replay, snap?.state],
  )
  const total = moves.length
  const ply = viewPly === null ? total : Math.min(viewPly, total)
  const grid = useMemo(() => gridAt(moves, ply), [moves, ply])
  const last = ply > 0 ? moves[ply - 1] : null
  const win = useMemo(() => findWin(grid), [grid])
  const turnSeat: Seat = seatOfDisc(ply % 2 === 0 ? 1 : 2)

  const stats: [SeatStats, SeatStats] = replay?.stats ?? snap?.stats ?? [emptyStats(), emptyStats()]
  const status = replay ? 'over' : snap?.status ?? 'idle'
  const locked = Boolean(snap) || Boolean(replay)
  const result = replay?.result ?? snap?.result ?? null
  const err = snap?.error ?? null

  const commentFor = (s: Seat) => {
    for (let i = ply - 1; i >= 0; i--) if (seatOfDisc(moves[i].disc) === s && moves[i].comment && !moves[i].random) return moves[i].comment
    return ''
  }

  // ---------- Pill ----------
  const pill = (() => {
    if (replay) return { text: `Replay · move ${ply} of ${total}`, tone: 'neutral' as const, live: false }
    if (!snap) return { text: 'Ready · pick two models', tone: 'neutral' as const, live: false }
    if (snap.status === 'over' && snap.result && viewPly === null) return { text: snap.result.reason, tone: 'done' as const, live: false }
    if (snap.status === 'error') return { text: 'Paused on error · retry available', tone: 'alert' as const, live: false }
    const prefix = snap.status === 'paused' ? 'Paused · ' : viewPly !== null ? 'Viewing · ' : ''
    return {
      text: `${prefix}${dispPlayers[turnSeat].name} to move · Move ${ply + 1}`,
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
    const mod = createConnectFourModule()
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
      createConnectFourModule({ randomOpening }),
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
    runner.onMove = () => playSound('move')
    runner.onEnd = (s) => {
      playSound('end')
      setViewPly(null)
      setResultOpen(true)
      if (!s.result) return
      saveMatch({
        id,
        gameId: 'connect4',
        date,
        players: frozen,
        firstSeat: fs,
        cols: s.state.moves.map((m) => m.col),
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
        if (next > cur) playSound('move')
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
        playSound('move')
        return cur + 1
      })
    }, APP_CONFIG.speeds[p.speed] + 400)
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
    if (!isC4Record(rec)) return onReplayOther?.(rec)
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
    className: `c4chip s${s}`,
  })
  const finalGrid = snap ? snap.state.grid : grid
  const finalWin = snap?.state.win ?? win

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
          <div className="stage c4-stage">
            <C4Board
              grid={grid}
              firstSeat={firstSeat}
              last={last ? { row: last.row, col: last.col } : null}
              winCells={win?.cells ?? null}
              animKey={ply}
              turnSeat={status === 'over' ? null : turnSeat}
              ghost={!win && status !== 'over' && viewPly === null}
            />
            {last?.random && <div className="c4-note small muted">Random opening move</div>}
            {viewPly !== null && !replay && snap && (
              <button className="live-chip glass" onClick={() => setViewPly(null)}>
                Viewing move {ply} · Back to live →
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
            <label className="toggle" title="The first two moves are random so games vary">
              <input type="checkbox" checked={p.randomOpening} onChange={(e) => patchPrefs({ randomOpening: e.target.checked })} />
              <span className="toggle-track" />
              <IconDice size={15} /> Random opening
            </label>
          }
          replay={
            replay
              ? {
                  ply,
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
                    if (ply >= total) setViewPly(0)
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
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Connect Four settings">
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
            Random opening (first 2 moves are random)
          </label>
          <p className="muted small">
            The game ends after at most {MAX_PLIES} moves (a full board). A model gets {APP_CONFIG.defaults.maxIllegalAttempts} attempts per turn to pick a legal column; after that it forfeits.
          </p>
          <div className="kbd-list small">
            <div>
              <kbd>Space</kbd> Pause / resume
            </div>
            <div>
              <kbd>←</kbd> <kbd>→</kbd> Step through moves
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
        limitText={`a full board (${MAX_PLIES} moves)`}
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
          grid={finalGrid}
          winCells={finalWin?.cells ?? null}
          onNewGame={newGame}
        />
      )}
    </div>
  )
}
