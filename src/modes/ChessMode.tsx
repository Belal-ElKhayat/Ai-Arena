import { Chess, type Move } from 'chess.js'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { APP_CONFIG, type Speed } from '../config/app'
import { estimateSeatCost } from '../core/cost'
import { MatchRunner } from '../core/matchRunner'
import type { PlayerConfig, RunnerSnapshot, Seat, SeatStats } from '../core/types'
import { chessModule, createChessModule, type ChessMoveRecord, type ChessState } from '../games/chess/module'
import { getStyle, styleText } from '../games/chess/styles'
import { StylePicker } from '../components/StylePicker'
import { buildPgn } from '../games/chess/pgn'
import { VIEW_CYCLE, type BoardThemeId, type BoardView, type PieceThemeId } from '../games/chess/themes'
import { HISTORY_STORE, isChessRecord, saveMatch, type HistoryRecord, type MatchRecord } from '../lib/history'
import { readCredentials, useKeyStore } from '../lib/keys'
import { getCachedModel } from '../lib/models'
import { playSound } from '../lib/sound'
import { useStore } from '../lib/storage'
import { uid } from '../lib/format'
import { DEFAULT_PROVIDER_ID, getProvider } from '../providers/registry'
import { BoardStage } from '../components/BoardStage'
import { ControlDock } from '../components/ControlDock'
import { HistoryDialog } from '../components/HistoryDrawer'
import { KeyDialog } from '../components/KeyDialog'
import { MoveDrawer } from '../components/MoveDrawer'
import { PlayerPanel, materialFromCaptures } from '../components/PlayerPanel'
import { PreflightModal } from '../components/PreflightModal'
import { ResultModal } from '../components/ResultModal'
import { SettingsDialog } from '../components/SettingsDialog'
import { StatusPill } from '../components/StatusPill'
import { IconAlert, IconHistory, IconList, IconMute, IconRefresh, IconSettings, IconVolume } from '../components/Icons'

type Runner = MatchRunner<ChessState, Move>
type Snap = RunnerSnapshot<ChessState>

const START_FEN = new Chess().fen()

const DEFAULT_PLAYERS: [PlayerConfig, PlayerConfig] = [
  { name: 'Player 1', providerId: DEFAULT_PROVIDER_ID, modelId: '', effort: 'default' },
  { name: 'Player 2', providerId: DEFAULT_PROVIDER_ID, modelId: '', effort: 'default' },
]

interface Prefs {
  view: BoardView
  boardTheme: BoardThemeId
  pieceTheme: PieceThemeId
  speed: Speed
  maxFullMoves: number
  moveTimeoutSec: number
  /** Whether playing styles change move choice or comments only. */
  styleAffects: 'moves' | 'comments'
}

const DEFAULT_PREFS: Prefs = {
  view: 'flat',
  boardTheme: 'glass',
  pieceTheme: 'classic',
  speed: 'normal',
  maxFullMoves: APP_CONFIG.defaults.maxFullMoves,
  moveTimeoutSec: APP_CONFIG.defaults.moveTimeoutSec,
  styleAffects: 'moves',
}

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

function recordsFromSans(sans: string[], comments: string[]): ChessMoveRecord[] {
  const c = new Chess()
  const out: ChessMoveRecord[] = []
  sans.forEach((san, i) => {
    try {
      const m = c.move(san)
      out.push({
        san: m.san,
        from: m.from,
        to: m.to,
        color: m.color,
        piece: m.piece,
        captured: m.captured,
        flags: m.flags,
        comment: comments[i] ?? '',
        fen: c.fen(),
      })
    } catch {
      /* stop at first bad move */
    }
  })
  return out
}

function findKing(fen: string, color: 'w' | 'b') {
  const rows = fen.split(' ')[0].split('/')
  const target = color === 'w' ? 'K' : 'k'
  for (let r = 0; r < 8; r++) {
    let f = 0
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) f += Number(ch)
      else {
        if (ch === target) return `${'abcdefgh'[f]}${8 - r}`
        f++
      }
    }
  }
  return null
}

const resultTag = (winnerSide: string | null | undefined, over: boolean) =>
  !over ? '*' : winnerSide === 'white' ? '1-0' : winnerSide === 'black' ? '0-1' : '1/2-1/2'

export interface ModeProps {
  /** Mode switcher rendered next to the brand. */
  modeSwitch?: ReactNode
  /** Reports whether a match is in progress (the shell locks mode switching). */
  onBusyChange?: (busy: boolean) => void
  /** A history record to replay as soon as the mode opens. */
  initialReplay?: HistoryRecord | null
  /** Called when the user picks a history record that belongs to another mode. */
  onReplayOther?: (r: HistoryRecord) => void
}

export function ChessMode({ modeSwitch, onBusyChange, initialReplay, onReplayOther }: ModeProps) {
  const [players, setPlayers] = useStore<[PlayerConfig, PlayerConfig]>('players', DEFAULT_PLAYERS)
  const [whiteSeatPref, setWhiteSeatPref] = useStore<Seat>('whiteSeat', 0)
  const [randomize, setRandomize] = useStore('randomize', false)
  const [prefs, setPrefs] = useStore<Prefs>('prefs', DEFAULT_PREFS)
  const [muted, setMuted] = useStore('muted', false)
  const [onboarded, setOnboarded] = useStore('onboarded', false)
  const [history, setHistory] = useStore<HistoryRecord[]>(HISTORY_STORE, [])
  const [keys] = useKeyStore()
  const p: Prefs = { ...DEFAULT_PREFS, ...prefs }
  const patchPrefs = (patch: Partial<Prefs>) => setPrefs((cur) => ({ ...DEFAULT_PREFS, ...cur, ...patch }))

  const runnerRef = useRef<Runner | null>(null)
  const [snap, setSnap] = useState<Snap | null>(null)
  const [active, setActive] = useState<{
    id: string
    players: [PlayerConfig, PlayerConfig]
    whiteSeat: Seat
    date: string
    styleAffects: 'moves' | 'comments'
  } | null>(null)
  const [replay, setReplay] = useState<MatchRecord | null>(null)
  const [replayPlaying, setReplayPlaying] = useState(false)
  const [viewPly, setViewPly] = useState<number | null>(null)

  const [keyDialog, setKeyDialog] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [preflightOpen, setPreflightOpen] = useState(false)

  useEffect(() => () => runnerRef.current?.dispose(), [])

  // ---------- Derived display data ----------
  const dispPlayers = replay?.players ?? active?.players ?? players
  const whiteSeat: Seat = replay ? replay.whiteSeat : active ? active.whiteSeat : whiteSeatPref
  const colorOf = (s: Seat): 'w' | 'b' => (s === whiteSeat ? 'w' : 'b')
  const seatOfColor = (c: 'w' | 'b'): Seat => (c === 'w' ? whiteSeat : ((1 - whiteSeat) as Seat))

  const records: ChessMoveRecord[] = useMemo(
    () => (replay ? recordsFromSans(replay.sans, replay.comments) : snap?.state.moves ?? []),
    [replay, snap?.state],
  )
  const total = records.length
  const ply = viewPly === null ? total : Math.min(viewPly, total)
  const fen = ply === 0 ? START_FEN : records[ply - 1].fen
  const last = ply > 0 ? records[ply - 1] : null
  const turnColor = fen.split(' ')[1] as 'w' | 'b'
  const inCheck = useMemo(() => {
    try {
      return new Chess(fen).inCheck()
    } catch {
      return false
    }
  }, [fen])
  const checkSquare = inCheck ? findKing(fen, turnColor) : null

  const stats: [SeatStats, SeatStats] = replay?.stats ?? snap?.stats ?? [emptyStats(), emptyStats()]
  const status = replay ? 'over' : snap?.status ?? 'idle'
  const locked = Boolean(snap) || Boolean(replay)

  const captures = (s: Seat) =>
    records
      .slice(0, ply)
      .filter((r) => r.color === colorOf(s) && r.captured)
      .map((r) => r.captured as string)
  const capturedBy: [string[], string[]] = [captures(0), captures(1)]
  const material: [number, number] = [materialFromCaptures(capturedBy[0]), materialFromCaptures(capturedBy[1])]
  const commentFor = (s: Seat) => {
    for (let i = ply - 1; i >= 0; i--) if (records[i].color === colorOf(s) && records[i].comment) return records[i].comment
    return ''
  }

  const result = replay?.result ?? snap?.result ?? null
  const pgn = useMemo(
    () =>
      buildPgn(
        records.map((r) => r.san),
        {
          white: `${dispPlayers[whiteSeat].name} (${dispPlayers[whiteSeat].modelId || 'unknown'})`,
          black: `${dispPlayers[1 - whiteSeat].name} (${dispPlayers[1 - whiteSeat].modelId || 'unknown'})`,
          result: resultTag(result?.winnerSide, Boolean(result)),
          reason: result?.reason,
          date: replay ? new Date(replay.date) : undefined,
        },
        records.map((r) => r.comment),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, result, whiteSeat, dispPlayers],
  )

  // ---------- Style matchup ----------
  const styleRefs: [{ id: string; name: string }, { id: string; name: string }] = replay?.styles ?? [
    { id: getStyle(dispPlayers[0].styleId).id, name: getStyle(dispPlayers[0].styleId).name },
    { id: getStyle(dispPlayers[1].styleId).id, name: getStyle(dispPlayers[1].styleId).name },
  ]
  const matchup = (replay ? Boolean(replay.styles) : Boolean(active)) ? `${styleRefs[0].name} vs ${styleRefs[1].name}` : undefined
  const affects = replay?.styleAffects ?? active?.styleAffects ?? p.styleAffects

  // ---------- Status pill ----------
  const pill = (() => {
    const moveNo = Math.floor(ply / 2) + 1
    const sideTxt = turnColor === 'w' ? 'White' : 'Black'
    const turnSeat = seatOfColor(turnColor)
    if (replay) return { text: `Replay · move ${Math.ceil(ply / 2)} of ${Math.ceil(total / 2)}`, tone: 'neutral' as const, live: false }
    if (!snap) return { text: 'Ready · pick two models', tone: 'neutral' as const, live: false }
    if (snap.status === 'over' && snap.result && viewPly === null) return { text: snap.result.reason, tone: 'done' as const, live: false }
    if (snap.status === 'error') return { text: 'Paused on error · retry available', tone: 'alert' as const, live: false }
    const chk = inCheck ? (new Chess(fen).isCheckmate() ? ' · Checkmate' : ' · Check') : ''
    const prefix = snap.status === 'paused' ? 'Paused · ' : viewPly !== null ? 'Viewing · ' : ''
    return {
      text: `${prefix}${sideTxt} to move · Move ${moveNo}${chk}`,
      tone: (turnSeat === 0 ? 'p1' : 'p2') as 'p1' | 'p2',
      live: snap.status === 'running',
    }
  })()

  // ---------- Match lifecycle ----------
  const startReason = (() => {
    for (const s of [0, 1] as Seat[]) {
      const pl = players[s]
      if (!pl.modelId.trim()) return `Choose a model for ${pl.name}`
      if (!getProvider(pl.providerId).hasCredentials(keys[pl.providerId] ?? {})) return `Add credentials for ${pl.name}`
    }
    return null
  })()

  const estimates = useMemo(() => {
    const init = chessModule.createState()
    const chars = chessModule.systemPrompt('white').length + chessModule.turnPrompt(init, 'white').length
    return ([0, 1] as Seat[]).map((s) =>
      estimateSeatCost({
        model: getCachedModel(players[s].providerId, keys[players[s].providerId] ?? {}, players[s].modelId),
        effort: players[s].effort,
        firstPromptChars: chars,
        maxPlies: p.maxFullMoves * 2,
      }),
    ) as [ReturnType<typeof estimateSeatCost>, ReturnType<typeof estimateSeatCost>]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, keys, p.maxFullMoves, preflightOpen])

  const startMatch = () => {
    setPreflightOpen(false)
    const ws: Seat = randomize ? (Math.random() < 0.5 ? 0 : 1) : whiteSeatPref
    if (randomize) setWhiteSeatPref(ws)
    const freeze = (s: Seat): PlayerConfig => {
      const pl = players[s]
      const info = getCachedModel(pl.providerId, readCredentials(pl.providerId), pl.modelId)
      const unsupported = getProvider(pl.providerId).effortSupport(info) === false
      const st = getStyle(pl.styleId)
      return {
        ...pl,
        name: pl.name.trim() || `Player ${s + 1}`,
        effort: unsupported ? 'default' : pl.effort,
        styleId: st.id,
        customStyle: st.id === 'custom' ? (pl.customStyle ?? '').trim() : undefined,
      }
    }
    const frozen: [PlayerConfig, PlayerConfig] = [freeze(0), freeze(1)]
    const styleAffects = p.styleAffects
    const styles: [{ id: string; name: string }, { id: string; name: string }] = [
      { id: getStyle(frozen[0].styleId).id, name: getStyle(frozen[0].styleId).name },
      { id: getStyle(frozen[1].styleId).id, name: getStyle(frozen[1].styleId).name },
    ]
    const styleFor = (seat: Seat) => ({ text: styleText(frozen[seat].styleId, frozen[seat].customStyle), name: styles[seat].name })
    const game = createChessModule({
      styles: { white: styleFor(ws), black: styleFor((1 - ws) as Seat) },
      commentsOnly: styleAffects === 'comments',
    })
    const id = uid()
    const date = new Date().toISOString()
    const runner: Runner = new MatchRunner(
      game,
      {
        players: frozen,
        sideSeat: { white: ws, black: (1 - ws) as Seat },
        maxPlies: p.maxFullMoves * 2,
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
    runner.onMove = (state) => {
      const m = state.moves[state.moves.length - 1]
      playSound(m.captured ? 'capture' : /[+#]/.test(m.san) ? 'check' : 'move')
    }
    runner.onEnd = (s) => {
      playSound('end')
      setViewPly(null)
      setResultOpen(true)
      if (!s.result) return
      const sans = s.state.moves.map((m) => m.san)
      const comments = s.state.moves.map((m) => m.comment)
      saveMatch({
        id,
        gameId: chessModule.id,
        date,
        players: frozen,
        whiteSeat: ws,
        sans,
        comments,
        result: s.result,
        stats: s.stats,
        styles,
        styleAffects,
        pgn: buildPgn(sans, {
          white: frozen[ws].name,
          black: frozen[1 - ws].name,
          result: resultTag(s.result.winnerSide, true),
          reason: s.result.reason,
        }, comments),
      })
    }
    runnerRef.current?.dispose()
    runnerRef.current = runner
    setActive({ id, players: frozen, whiteSeat: ws, date, styleAffects })
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
        if (next !== cur && next > 0) playSound('move')
        return next === total && !replay ? null : next
      })
    },
    [total, replay],
  )

  const cycleView = useCallback(() => {
    setPrefs((cur) => {
      const c = { ...DEFAULT_PREFS, ...cur }
      return { ...c, view: VIEW_CYCLE[(VIEW_CYCLE.indexOf(c.view) + 1) % VIEW_CYCLE.length] }
    })
  }, [setPrefs])

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
        playSound(records[cur]?.captured ? 'capture' : 'move')
        return cur + 1
      })
    }, APP_CONFIG.speeds[p.speed] + 400)
    return () => clearInterval(t)
  }, [replay, replayPlaying, total, records, p.speed])

  // Keyboard shortcuts
  const anyModal = keyDialog || settingsOpen || historyOpen || resultOpen || preflightOpen || !onboarded
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
        step(1)
      } else if (e.key.toLowerCase() === 'v') cycleView()
      else if (e.key.toLowerCase() === 'm') setMuted((m) => !m)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [anyModal, replay, togglePause, step, cycleView, setMuted])

  const startReplay = (rec: HistoryRecord) => {
    if (!isChessRecord(rec)) {
      setHistoryOpen(false)
      onReplayOther?.(rec)
      return
    }
    const r: MatchRecord = rec
    newGame()
    setHistoryOpen(false)
    setReplay(r)
    setViewPly(0)
    setReplayPlaying(true)
  }

  const busy = Boolean(snap) && snap!.status !== 'over'
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange])
  useEffect(() => {
    if (initialReplay) startReplay(initialReplay)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReplay])

  const err = snap?.error ?? null
  const accent: 'p1' | 'p2' | null = last ? (seatOfColor(last.color) === 0 ? 'p1' : 'p2') : null

  return (
    <div className={`app ${drawerOpen ? 'drawer-open' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <span />
            <span />
          </div>
          <span className="brand-name">{APP_CONFIG.APP_NAME}</span>
          {modeSwitch}
        </div>
        <StatusPill text={pill.text} tone={pill.tone} live={pill.live} sub={matchup && (affects === 'comments' ? `${matchup} · comments only` : matchup)} />
        <nav className="top-actions">
          <button className={`icon-btn glass ${drawerOpen ? 'on' : ''}`} onClick={() => setDrawerOpen((o) => !o)} aria-label="Moves and PGN" title="Moves & PGN">
            <IconList />
          </button>
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
              onChange={(patch) => !locked && setPlayers((cur) => (s === 0 ? [{ ...cur[0], ...patch }, cur[1]] : [cur[0], { ...cur[1], ...patch }]))}
              locked={locked}
              color={colorOf(s)}
              credentials={keys[dispPlayers[s].providerId] ?? {}}
              onSetKey={() => setKeyDialog(dispPlayers[s].providerId)}
              stats={stats[s]}
              thinking={snap?.thinkingSeat === s && !replay}
              attempt={snap?.attempt ?? 0}
              isTurn={!replay && Boolean(snap) && status !== 'over' && seatOfColor(turnColor) === s}
              captured={capturedBy[s]}
              materialDiff={material[s] - material[1 - s]}
              pieceTheme={p.pieceTheme}
              comment={commentFor(s)}
              errorMessage={err && err.seat === s ? err.message : null}
              winner={result ? result.winnerSeat === s : null}
              extra={
                <StylePicker
                  seat={s}
                  styleId={replay ? replay.styles?.[s].id : dispPlayers[s].styleId}
                  custom={dispPlayers[s].customStyle}
                  locked={locked}
                  onChange={(patch) => !locked && setPlayers((cur) => (s === 0 ? [{ ...cur[0], ...patch }, cur[1]] : [cur[0], { ...cur[1], ...patch }]))}
                />
              }
            />
          </div>
        ))}

        <div className="slot slot-board">
          <BoardStage
            boardProps={{
              fen,
              lastMove: last,
              orientation: p.view === 'flip' ? 'b' : 'w',
              accent,
              animKey: ply,
              checkSquare,
            }}
            view={p.view}
            onCycleView={cycleView}
            boardTheme={p.boardTheme}
            pieceTheme={p.pieceTheme}
            onTheme={(patch) => patchPrefs(patch)}
            overlay={
              viewPly !== null && !replay && snap ? (
                <button className="live-chip glass" onClick={() => setViewPly(null)}>
                  Viewing move {Math.ceil(ply / 2)} · Back to live →
                </button>
              ) : null
            }
          />
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
          onSwap={() => setWhiteSeatPref((w) => (w === 0 ? 1 : 0))}
          randomize={randomize}
          onRandomize={setRandomize}
          onShowResult={() => setResultOpen(true)}
          playerNames={[dispPlayers[0].name, dispPlayers[1].name]}
          startDisabledReason={startReason}
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

      <MoveDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sans={records.map((r) => r.san)}
        comments={records.map((r) => r.comment)}
        activePly={ply}
        onJump={(n) => {
          setReplayPlaying(false)
          setViewPly(n === total && !replay ? null : n)
        }}
        pgn={pgn}
        whiteSeat={whiteSeat}
      />

      <KeyDialog providerId={keyDialog} onClose={() => setKeyDialog(null)} />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        prefs={{ maxFullMoves: p.maxFullMoves, moveTimeoutSec: p.moveTimeoutSec }}
        onChange={(x) => patchPrefs(x)}
        locked={locked}
        onShowIntro={() => {
          setSettingsOpen(false)
          setOnboarded(false)
        }}
      />
      <HistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={history}
        onReplay={startReplay}
        onClear={() => setHistory([])}
      />
      <PreflightModal
        open={preflightOpen}
        onClose={() => setPreflightOpen(false)}
        onConfirm={startMatch}
        players={players}
        whiteSeat={whiteSeatPref}
        randomize={randomize}
        estimates={estimates}
        maxFullMoves={p.maxFullMoves}
        timeoutSec={p.moveTimeoutSec}
        styles={[getStyle(players[0].styleId).name, getStyle(players[1].styleId).name]}
        styleAffects={p.styleAffects}
        onStyleAffects={(v) => patchPrefs({ styleAffects: v })}
      />
      {snap?.result && active && (
        <ResultModal
          open={resultOpen}
          onClose={() => setResultOpen(false)}
          result={snap.result}
          players={active.players}
          stats={snap.stats}
          whiteSeat={active.whiteSeat}
          plies={snap.state.moves.length}
          pgn={pgn}
          onNewGame={newGame}
          styles={[styleRefs[0].name, styleRefs[1].name]}
          styleAffects={active.styleAffects}
        />
      )}
    </div>
  )
}
