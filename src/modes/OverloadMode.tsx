import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { APP_CONFIG, type Speed } from '../config/app'
import { ControlDock } from '../components/ControlDock'
import { HistoryDialog } from '../components/HistoryDrawer'
import { IconAlert, IconHistory, IconMute, IconRefresh, IconSettings, IconVolume } from '../components/Icons'
import { KeyDialog } from '../components/KeyDialog'
import { Modal } from '../components/Modal'
import { PlayerPanel } from '../components/PlayerPanel'
import { PreflightModal } from '../components/PreflightModal'
import { StatusPill } from '../components/StatusPill'
import { StylePicker } from '../components/StylePicker'
import { MatchRunner } from '../core/matchRunner'
import { estimateSeatCost } from '../core/cost'
import type { PlayerConfig, RunnerSnapshot, Seat, SeatStats } from '../core/types'
import { DEFAULT_PROVIDER_ID, getProvider } from '../providers/registry'
import { createOverloadModule } from '../games/overload/module'
import { getOverloadStyle, OVERLOAD_STYLES } from '../games/overload/styles'
import { createOverloadState, itemName, legalActions, replayOverloadActions, type ItemFrequency, type ItemId, type OverloadAction, type OverloadOptions, type OverloadState, type StartingCells } from '../games/overload/rules'
import { HISTORY_STORE, isOverloadRecord, saveMatch, type HistoryRecord, type OverloadMatchRecord, type StyleRef } from '../lib/history'
import { readCredentials, useKeyStore } from '../lib/keys'
import { getCachedModel } from '../lib/models'
import { fmtCost, fmtDuration, fmtTokens, uid } from '../lib/format'
import { playSound } from '../lib/sound'
import { useStore } from '../lib/storage'
import { readStore } from '../lib/storage'
import { DEFAULT_ENGINE_ID } from '../voice/registry'
import { speechQueue } from '../voice/queue'
import type { ModeProps } from './ChessMode'

type Runner = MatchRunner<OverloadState, OverloadAction>
type Snap = RunnerSnapshot<OverloadState>

interface OverloadPrefs {
  rounds: 1 | 3 | 5
  startingCells: StartingCells
  itemFrequency: ItemFrequency
  moveTimeoutSec: number
  speed: Speed
  styleAffects: 'moves' | 'comments'
  spectator: boolean
  voice: boolean
}

const DEFAULT_PREFS: OverloadPrefs = {
  rounds: 3,
  startingCells: 'random',
  itemFrequency: 'normal',
  moveTimeoutSec: APP_CONFIG.defaults.moveTimeoutSec,
  speed: 'normal',
  styleAffects: 'moves',
  spectator: true,
  voice: false,
}

const DEFAULT_PLAYERS: [PlayerConfig, PlayerConfig] = [
  { name: 'Player 1', providerId: DEFAULT_PROVIDER_ID, modelId: '', effort: 'default', styleId: 'calculator' },
  { name: 'Player 2', providerId: DEFAULT_PROVIDER_ID, modelId: '', effort: 'default', styleId: 'gambler' },
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

const ITEM_TIPS: Record<ItemId, string> = {
  scanner: 'Privately reveals the current chamber round to this player.',
  eject: 'Removes and publicly reveals the current round without firing.',
  repair: 'Restores one power cell, up to the round starting maximum.',
  overcharge: 'The next charged round this player fires at the opponent deals two cell damage.',
  lockdown: 'Skips the opponent’s next turn; cannot be used while a skip is already pending.',
}

function seedValue() {
  const word = new Uint32Array(1)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(word)
  else word[0] = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
  return word[0]
}

function Batteries({ count, max, seat }: { count: number; max: number; seat: Seat }) {
  return (
    <div className={`overload-batteries accent-p${seat + 1}`} role="img" aria-label={`${count} of ${max} power cells`}>
      {Array.from({ length: max }, (_, i) => <span key={i} className={`battery ${i < count ? 'charged' : ''}`} aria-hidden />)}
      <b className="mono">{count}/{max}</b>
    </div>
  )
}

function ItemChips({ items }: { items: ItemId[] }) {
  return (
    <div className="overload-items" role="group" aria-label="Held items">
      {items.length ? items.map((item, i) => <span key={`${item}-${i}`} className={`item-chip item-${item}`} tabIndex={0} aria-label={`${itemName(item)}: ${ITEM_TIPS[item]}`} title={ITEM_TIPS[item]}>{itemName(item)}</span>) : <span className="muted small">No items</span>}
    </div>
  )
}

function Cannon({ state, spectator, replay }: { state: OverloadState; spectator: boolean; replay: boolean }) {
  const fired = state.events.filter((event) => event.type === 'fired' || event.type === 'ejected')
  const lastReveal = fired[fired.length - 1]
  const lastAction = state.actions[state.actions.length - 1]?.action
  const impact = lastAction?.type === 'fire' && lastReveal?.type === 'fired' ? lastReveal.result === 'charged' ? 'flash' : 'puff' : ''
  return (
    <div className="overload-cannon glass">
      <div key={`${state.actions.length}-${lastReveal?.round ?? 0}-${lastReveal?.result ?? 'none'}`} className={`cannon-emblem ${impact}`} aria-hidden><span /><span /><span /></div>
      <div className="cannon-title">SURGE CANNON</div>
      <div className="load-counts">
        <span className="round-count charged-round"><i /> {state.loadCounts.charged} charged</span>
        <span className="round-count dud-round"><i /> {state.loadCounts.dud} dud</span>
      </div>
      <div className="chamber-caption small muted">Current load · order hidden from the models</div>
      {spectator && (
        <div className="spectator-order" aria-label="True chamber order for spectator">
          <span className="small">Spectator view{replay ? ' · saved as visible' : ''}</span>
          <div className="chamber-slots">
            {state.chamber.map((round, i) => <i key={i} className={round === 'charged' ? 'charged' : 'dud'} title={round} aria-label={`Round ${i + 1}: ${round}`} />)}
          </div>
        </div>
      )}
      <div className="fired-strip" role="list" aria-label="Fired and ejected history">
        {fired.slice(-14).map((event, i) => <span key={`${event.round}-${i}-${event.type}`} role="listitem" className={`fired-token ${event.result}`} aria-label={`${event.type === 'ejected' ? 'Ejected' : 'Fired'} ${event.result} round`} title={`${event.type === 'ejected' ? 'Ejected' : 'Fired'} · ${event.result}`}><i />{event.type === 'ejected' ? 'E' : 'F'}</span>)}
        {!fired.length && <span className="small muted">No rounds revealed yet</span>}
      </div>
    </div>
  )
}

function Settings({ prefs, onChange, locked, timeout, onTimeout }: {
  prefs: OverloadPrefs
  onChange: (p: Partial<OverloadPrefs>) => void
  locked: boolean
  timeout: number
  onTimeout: (v: number) => void
}) {
  return (
    <div className="form overload-settings">
      <div className="set-grid">
        <label className="field-label">Rounds
          <select className="field select" value={prefs.rounds} disabled={locked} onChange={(e) => onChange({ rounds: Number(e.target.value) as 1 | 3 | 5 })}>
            {[1, 3, 5].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'round' : 'rounds'}</option>)}
          </select>
        </label>
        <label className="field-label">Starting cells
          <select className="field select" value={prefs.startingCells} disabled={locked} onChange={(e) => onChange({ startingCells: e.target.value === 'random' ? 'random' : Number(e.target.value) as 2 | 3 | 4 })}>
            <option value="random">Random (2–4)</option><option value="2">2</option><option value="3">3</option><option value="4">4</option>
          </select>
        </label>
        <label className="field-label">Item frequency
          <select className="field select" value={prefs.itemFrequency} disabled={locked} onChange={(e) => onChange({ itemFrequency: e.target.value as ItemFrequency })}>
            <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
          </select>
        </label>
        <label className="field-label">Per-action timeout (seconds)
          <input className="field" type="number" min={5} max={900} value={timeout} disabled={locked} onChange={(e) => onTimeout(Math.max(5, Math.min(900, Number(e.target.value) || 5)))} />
        </label>
      </div>
      <div className="row gap overload-setting-row">
        <label className="toggle" title="Only you, the spectator, see the true chamber order. Models never receive it.">
          <input type="checkbox" checked={prefs.spectator} disabled={locked} onChange={(e) => onChange({ spectator: e.target.checked })} />
          <span className="toggle-track" /> Spectator sees chamber
        </label>
        <div className="seg" role="radiogroup" aria-label="Style influence">
          <button role="radio" aria-checked={prefs.styleAffects === 'moves'} className={prefs.styleAffects === 'moves' ? 'on' : ''} disabled={locked} onClick={() => onChange({ styleAffects: 'moves' })}>Style affects play</button>
          <button role="radio" aria-checked={prefs.styleAffects === 'comments'} className={prefs.styleAffects === 'comments' ? 'on' : ''} disabled={locked} onClick={() => onChange({ styleAffects: 'comments' })}>Comments only</button>
        </div>
        <label className="toggle" title="Read each player's comments aloud using browser voices">
          <input type="checkbox" checked={prefs.voice} disabled={locked} onChange={(e) => onChange({ voice: e.target.checked })} />
          <span className="toggle-track" /> Voice comments
        </label>
      </div>
    </div>
  )
}

function OverloadResult({ record, onClose, onNewGame }: { record: OverloadMatchRecord; onClose: () => void; onNewGame: () => void }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState('')
  const winner = record.result.winnerSeat
  const allActions = record.actions
  const selfFires: [number, number] = [0, 0]
  const itemsUsed: [number, number] = [0, 0]
  const replayed = replayOverloadActions(record.options, allActions)
  for (const event of replayed.events) {
    if (event.type === 'fired' && event.target === 'self') selfFires[event.actor]++
    if (event.type === 'item' || event.type === 'ejected') itemsUsed[event.actor]++
  }
  const share = [
    `${APP_CONFIG.APP_NAME} — ${APP_CONFIG.overload.name}`,
    winner === null ? `${record.players[0].name} vs ${record.players[1].name}: draw` : `${record.players[winner].name} wins`,
    `Rounds: ${record.roundResults.map((r) => `R${r.round} P${r.winner + 1}`).join(', ') || 'none'}`,
    `Risky self-fires: ${selfFires[0]} vs ${selfFires[1]} · Items: ${itemsUsed[0]} vs ${itemsUsed[1]}`,
    `Tokens: ${record.stats.map((s) => fmtTokens(s.promptTokens + s.completionTokens)).join(' vs ')}`,
    `Cost: ${record.stats.map((s) => fmtCost(s.costUsd, s.costKnown)).join(' vs ')}`,
    record.result.reason,
  ].join('\n')
  return (
    <Modal open onClose={onClose} className={`result ${winner === null ? 'draw' : `win-p${winner + 1}`}`}>
      <div className="result-hero">
        <div className="eyebrow">{winner === null ? 'Match complete' : 'Match winner'}</div>
        <h2 className="result-title serif">{winner === null ? 'Honours even' : record.players[winner].name}</h2>
        <p className="muted">{record.result.reason}</p>
      </div>
      <div className="overload-result-rounds">
        {record.roundResults.map((round) => <div key={round.round} className={`result-card accent-p${round.winner + 1}`}>
          <b>Round {round.round}: {record.players[round.winner].name}</b>
          <span className="small muted">{round.reason}</span>
        </div>)}
      </div>
      <div className="result-grid">
        {([0, 1] as const).map((s) => <div key={s} className={`result-card accent-p${s + 1}`}>
          <div className="seat-tag"><span className="seat-dot" />{record.players[s].name} · {record.styles[s].name}</div>
          <dl>
            <dt>Tokens</dt><dd className="mono">{fmtTokens(record.stats[s].promptTokens + record.stats[s].completionTokens)}</dd>
            <dt>Cost</dt><dd className="mono">{fmtCost(record.stats[s].costUsd, record.stats[s].costKnown)}</dd>
            <dt>Think time</dt><dd className="mono">{fmtDuration(record.stats[s].timeMs)}</dd>
            <dt>Self-fires</dt><dd className="mono">{selfFires[s]}</dd>
            <dt>Items used</dt><dd className="mono">{itemsUsed[s]}</dd>
          </dl>
        </div>)}
      </div>
      <details className="overload-share">
        <summary>Share text</summary>
        <pre>{share}</pre>
      </details>
      {copyError && <p className="privacy-note small warn" role="alert">{copyError}</p>}
      <div className="result-actions">
        <button className="dock-btn" onClick={async () => {
          setCopyError('')
          try { await navigator.clipboard.writeText(share); setCopied(true); setTimeout(() => setCopied(false), 1400) }
          catch { setCopyError('Could not copy automatically. Select and copy the result from the details above.') }
        }}>{copied ? 'Copied' : 'Copy result'}</button>
        <button className="primary-btn" onClick={onNewGame}>New Match</button>
      </div>
    </Modal>
  )
}

export function OverloadMode({ modeSwitch, onBusyChange, initialReplay, onReplayOther }: ModeProps) {
  const [players, setPlayers] = useStore<[PlayerConfig, PlayerConfig]>('overload.players', DEFAULT_PLAYERS)
  const [firstSeatPref, setFirstSeatPref] = useStore<Seat>('overload.firstSeat', 0)
  const [randomize, setRandomize] = useStore('overload.randomize', false)
  const [prefsRaw, setPrefs] = useStore<OverloadPrefs>('overload.prefs', DEFAULT_PREFS)
  const [muted, setMuted] = useStore('muted', false)
  const [history, setHistory] = useStore<HistoryRecord[]>(HISTORY_STORE, [])
  const [keys] = useKeyStore()
  const prefs: OverloadPrefs = { ...DEFAULT_PREFS, ...prefsRaw }
  const patchPrefs = (patch: Partial<OverloadPrefs>) => setPrefs((current) => ({ ...DEFAULT_PREFS, ...current, ...patch }))
  const runnerRef = useRef<Runner | null>(null)
  const [snap, setSnap] = useState<Snap | null>(null)
  const [active, setActive] = useState<{ id: string; players: [PlayerConfig, PlayerConfig]; options: OverloadOptions; styles: [StyleRef, StyleRef]; date: string } | null>(null)
  const [replay, setReplay] = useState<OverloadMatchRecord | null>(null)
  const [replayPly, setReplayPly] = useState(0)
  const [replayPlaying, setReplayPlaying] = useState(false)
  const [savedResult, setSavedResult] = useState<OverloadMatchRecord | null>(null)
  const [keyDialog, setKeyDialog] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [preflightOpen, setPreflightOpen] = useState(false)

  useEffect(() => () => runnerRef.current?.dispose(), [])
  useEffect(() => {
    speechQueue.setMuted(muted)
    if (!prefs.voice) speechQueue.clear()
    return () => speechQueue.clear()
  }, [muted, prefs.voice])

  const dispPlayers = replay?.players ?? active?.players ?? players
  const options = replay?.options ?? active?.options ?? {
    seed: 1, rounds: prefs.rounds, startingCells: prefs.startingCells, itemFrequency: prefs.itemFrequency, firstSeat: firstSeatPref,
  }
  const replayState = useMemo(
    () => replay ? replayOverloadActions(replay.options, replay.actions.slice(0, replayPly)) : null,
    [replay, replayPly],
  )
  const state = replayState ?? snap?.state ?? null
  const stats: [SeatStats, SeatStats] = replay?.stats ?? snap?.stats ?? [emptyStats(), emptyStats()]
  const status = replay ? 'over' : snap?.status ?? 'idle'
  const locked = Boolean(snap) || Boolean(replay)
  const result = replay?.result ?? snap?.result ?? null
  const turnSeat: Seat = state?.turn ?? firstSeatPref
  const error = snap?.error ?? null
  const eventComment = (seat: Seat) => {
    if (!state) return ''
    for (let i = state.events.length - 1; i >= 0; i--) {
      const event = state.events[i]
      if (event.actor === seat && event.comment) return event.comment
    }
    return ''
  }
  const currentRecord = savedResult ?? (replay ?? null)

  const startReason = useMemo(() => {
    for (const seat of [0, 1] as Seat[]) {
      const player = players[seat]
      if (!player.modelId.trim()) return `Choose a model for ${player.name}`
      if (!getProvider(player.providerId).hasCredentials(keys[player.providerId] ?? {})) return `Add credentials for ${player.name}`
    }
    return null
  }, [players, keys])

  const estimateOptions: OverloadOptions = {
    seed: 1, rounds: prefs.rounds, startingCells: prefs.startingCells, itemFrequency: prefs.itemFrequency, firstSeat: firstSeatPref,
  }
  const estimateModule = createOverloadModule(estimateOptions)
  const estimatePrompt = estimateModule.turnPrompt(createOverloadState(estimateOptions), 'player1').length
  const estimates = ([0, 1] as Seat[]).map((seat) => estimateSeatCost({
    model: getCachedModel(players[seat].providerId, keys[players[seat].providerId] ?? {}, players[seat].modelId),
    effort: players[seat].effort,
    firstPromptChars: estimateModule.systemPrompt('player1').length + estimatePrompt,
    maxPlies: APP_CONFIG.overload.maxActions,
  })) as [ReturnType<typeof estimateSeatCost>, ReturnType<typeof estimateSeatCost>]

  const startMatch = () => {
    setPreflightOpen(false)
    const firstSeat: Seat = randomize ? (Math.random() < 0.5 ? 0 : 1) : firstSeatPref
    if (randomize) setFirstSeatPref(firstSeat)
    const frozen = ([0, 1] as Seat[]).map((seat) => {
      const player = players[seat]
      const model = getCachedModel(player.providerId, readCredentials(player.providerId), player.modelId)
      const unsupported = getProvider(player.providerId).effortSupport(model) === false
      return { ...player, name: player.name.trim() || `Player ${seat + 1}`, effort: unsupported ? 'default' : player.effort, styleId: getOverloadStyle(player.styleId).id }
    }) as [PlayerConfig, PlayerConfig]
    const styles: [StyleRef, StyleRef] = ([0, 1] as Seat[]).map((seat) => {
      const style = getOverloadStyle(frozen[seat].styleId)
      return { id: style.id, name: style.name }
    }) as [StyleRef, StyleRef]
    const matchOptions: OverloadOptions = { seed: seedValue(), rounds: prefs.rounds, startingCells: prefs.startingCells, itemFrequency: prefs.itemFrequency, firstSeat }
    const stylePair = [getOverloadStyle(frozen[0].styleId), getOverloadStyle(frozen[1].styleId)] as [typeof OVERLOAD_STYLES[number], typeof OVERLOAD_STYLES[number]]
    const game = createOverloadModule(matchOptions, { styles: stylePair, affects: prefs.styleAffects })
    const id = uid()
    const date = new Date().toISOString()
    const runner = new MatchRunner(game, {
      players: frozen,
      sideSeat: { player1: 0, player2: 1 },
      maxPlies: APP_CONFIG.overload.maxActions,
      moveTimeoutMs: prefs.moveTimeoutSec * 1000,
      maxIllegalAttempts: APP_CONFIG.defaults.maxIllegalAttempts,
    }, {
      getCredentials: (providerId) => readCredentials(providerId),
      getModelInfo: (providerId, modelId) => getCachedModel(providerId, readCredentials(providerId), modelId),
    })
    runner.speed = prefs.speed
    runner.subscribe(setSnap)
    runner.beforeNextTurn = () => prefs.voice && !muted ? speechQueue.drained() : Promise.resolve()
    runner.onMove = (next) => {
      const event = next.events[next.events.length - 1]
      if (event?.type === 'fired') playSound(event.result === 'charged' ? 'capture' : 'move')
      else if (event?.type === 'item' || event?.type === 'ejected') playSound('move')
      if (prefs.voice && !muted && event?.comment) {
        speechQueue.enqueue({
          seat: event.actor,
          turnIndex: next.actions.length - 1,
          text: event.comment,
          engineId: DEFAULT_ENGINE_ID,
          settings: { voiceId: '', rate: 1, pitch: 1 },
        })
      }
    }
    runner.onEnd = (snapshot) => {
      playSound('end')
      setResultOpen(true)
      if (!snapshot.result) return
      const record: OverloadMatchRecord = {
        id, gameId: 'overload', date, players: frozen, options: matchOptions,
        actions: snapshot.state.actions, result: snapshot.result, stats: snapshot.stats,
        roundResults: snapshot.state.roundResults, styles, styleAffects: prefs.styleAffects, spectator: prefs.spectator,
      }
      saveMatch(record)
      setHistory(readStore<HistoryRecord[]>(HISTORY_STORE, []))
      setSavedResult(record)
    }
    setActive({ id, players: frozen, options: matchOptions, styles, date })
    setSavedResult(null)
    setReplay(null)
    setReplayPly(0)
    setSnap(runner.snapshot)
    runnerRef.current = runner
    runner.start()
    playSound('start')
  }

  const newGame = useCallback(() => {
    runnerRef.current?.dispose()
    runnerRef.current = null
    setSnap(null)
    setActive(null)
    setReplay(null)
    setReplayPly(0)
    setReplayPlaying(false)
    setSavedResult(null)
    setResultOpen(false)
  }, [])

  const togglePause = useCallback(() => {
    if (snap?.status === 'running') runnerRef.current?.pause()
    else if (snap?.status === 'paused') runnerRef.current?.resume()
  }, [snap?.status])

  const step = useCallback((delta: number) => {
    if (!replay) return
    setReplayPly((ply) => Math.max(0, Math.min(replay.actions.length, ply + delta)))
  }, [replay])

  const startReplay = (record: HistoryRecord) => {
    setHistoryOpen(false)
    if (!isOverloadRecord(record)) return onReplayOther?.(record)
    newGame()
    setReplay(record)
    setReplayPly(0)
    setReplayPlaying(false)
    setSavedResult(record)
  }

  useEffect(() => {
    if (initialReplay) startReplay(initialReplay)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReplay])

  useEffect(() => {
    if (!replay || !replayPlaying) return
    const timer = setInterval(() => setReplayPly((ply) => {
      if (ply >= replay.actions.length) { setReplayPlaying(false); return ply }
      return ply + 1
    }), APP_CONFIG.speeds[prefs.speed] + 250)
    return () => clearInterval(timer)
  }, [replay, replayPlaying, prefs.speed])

  const modalOpen = Boolean(keyDialog) || settingsOpen || historyOpen || resultOpen || preflightOpen
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (modalOpen) return
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"]') || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === ' ' && !target.closest('button, a')) {
        event.preventDefault()
        if (replay) setReplayPlaying((playing) => !playing)
        else togglePause()
      } else if (event.key === 'ArrowLeft') { event.preventDefault(); setReplayPlaying(false); step(-1) }
      else if (event.key === 'ArrowRight') { event.preventDefault(); setReplayPlaying(false); step(1) }
      else if (event.key.toLowerCase() === 'm') setMuted((value) => !value)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen, replay, step, togglePause, setMuted])

  const busy = Boolean(snap && snap.status !== 'over')
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange])

  const pill = replay
    ? { text: `Replay · action ${replayPly} of ${replay.actions.length}`, tone: 'neutral' as const, live: false }
    : result && snap?.status === 'over'
      ? { text: result.reason, tone: 'done' as const, live: false }
      : error
        ? { text: 'Paused on error · retry available', tone: 'alert' as const, live: false }
        : !state
          ? { text: 'Ready · choose models and styles', tone: 'neutral' as const, live: false }
          : { text: `Round ${state.round}/${options.rounds} · ${dispPlayers[state.turn].name} to act`, tone: (state.turn === 0 ? 'p1' : 'p2') as 'p1' | 'p2', live: snap?.status === 'running' }

  const actionCount = state?.actions.length ?? 0
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden><span /><span /></div>
          <span className="brand-name">{APP_CONFIG.APP_NAME}</span>
          {modeSwitch}
        </div>
        <StatusPill text={pill.text} tone={pill.tone} live={pill.live} sub={state ? `Round ${state.round} · ${state.cells[0]}–${state.cells[1]} cells` : undefined} />
        <nav className="top-actions">
          <button className="icon-btn glass" onClick={() => setHistoryOpen(true)} aria-label="Match history" title="History"><IconHistory /></button>
          <button className="icon-btn glass" onClick={() => setSettingsOpen(true)} aria-label="Overload settings" title="Settings"><IconSettings /></button>
          <button className="icon-btn glass" onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute (M)' : 'Mute (M)'}>{muted ? <IconMute /> : <IconVolume />}</button>
        </nav>
      </header>

      <main className="arena overload-arena">
        {([0, 1] as Seat[]).map((seat) => (
          <div key={seat} className={`slot slot-${seat}`}>
            <PlayerPanel
              seat={seat}
              player={dispPlayers[seat]}
              onChange={(patch) => !locked && setPlayers((current) => seat === 0 ? [{ ...current[0], ...patch }, current[1]] : [current[0], { ...current[1], ...patch }])}
              locked={locked}
              color={seat === 0 ? 'w' : 'b'}
              sideChip={{ label: seat === 0 ? 'Green' : 'Orange', title: `Player ${seat + 1}`, className: `overload-seat-chip p${seat + 1}` }}
              credentials={keys[dispPlayers[seat].providerId] ?? {}}
              onSetKey={() => setKeyDialog(dispPlayers[seat].providerId)}
              stats={stats[seat]}
              thinking={!replay && snap?.thinkingSeat === seat}
              attempt={snap?.attempt ?? 0}
              isTurn={!replay && Boolean(state) && snap?.status !== 'over' && turnSeat === seat}
              captured={[]}
              materialDiff={0}
              pieceTheme="classic"
              comment={eventComment(seat)}
              errorMessage={error?.seat === seat ? error.message : null}
              winner={result ? result.winnerSeat === seat : null}
              hideCaptured
              extra={<>
                <div className="overload-player-state">
                  {state ? <>
                    <Batteries count={state.cells[seat]} max={state.maxCells} seat={seat} />
                    <ItemChips items={state.items[seat]} />
                    {state.overcharged[seat] && <span className="active-effect">Overcharge ready</span>}
                  </> : <span className="muted small">Cells and items dealt at match start</span>}
                </div>
                <StylePicker
                  styleId={dispPlayers[seat].styleId}
                  custom={dispPlayers[seat].customStyle}
                  locked={locked}
                  seat={seat}
                  styleOptions={OVERLOAD_STYLES}
                  onChange={(patch) => !locked && setPlayers((current) => seat === 0 ? [{ ...current[0], ...patch }, current[1]] : [current[0], { ...current[1], ...patch }])}
                />
              </>}
            />
          </div>
        ))}
        <div className="slot slot-board">
          <section className="stage overload-stage">
            <div className="overload-roundline glass">
              <span className="round-badge">Round {state?.round ?? 1} / {options.rounds}</span>
              <span className={`turn-label accent-p${(state?.turn ?? firstSeatPref) + 1}`}>{state ? `${dispPlayers[state.turn].name} to act` : `Player ${firstSeatPref + 1} goes first`}</span>
            </div>
            <Cannon state={state ?? createOverloadState(options)} spectator={replay ? replay.spectator : prefs.spectator} replay={Boolean(replay)} />
            {state && <div className="overload-round-score" aria-label="Round score">
              {([0, 1] as Seat[]).map((seat) => <span key={seat} className={`round-score accent-p${seat + 1}`}>{dispPlayers[seat].name}: {state.roundResults.filter((r) => r.winner === seat).length} round wins</span>)}
            </div>}
            {replay && <div className="live-chip glass">Replay action {replayPly} of {replay.actions.length}</div>}
            {!state && <div className="muted small overload-help">Both players receive the same cells. Choose an item or fire once per turn.</div>}
            <Settings prefs={prefs} onChange={patchPrefs} locked={locked} timeout={prefs.moveTimeoutSec} onTimeout={(moveTimeoutSec) => patchPrefs({ moveTimeoutSec })} />
          </section>
        </div>
      </main>

      <div className="dock-wrap">
        {error && !replay && <div className={`error-card glass accent-p${error.seat + 1}`} role="alert">
          <IconAlert size={16} /><div className="grow"><strong>{dispPlayers[error.seat].name} hit a problem</strong><div className="small muted">{error.message}</div></div>
          <button className="primary-btn small" onClick={() => runnerRef.current?.retry()}><IconRefresh size={14} /> Retry</button>
        </div>}
        <ControlDock
          status={status}
          speed={prefs.speed}
          onSpeed={(speed) => { patchPrefs({ speed }); if (runnerRef.current) runnerRef.current.speed = speed }}
          onStart={() => setPreflightOpen(true)}
          onPause={togglePause}
          onResume={togglePause}
          onResign={(seat) => runnerRef.current?.resign(seat)}
          onNewGame={newGame}
          onSwap={() => setFirstSeatPref((seat) => seat === 0 ? 1 : 0)}
          swapTitle="Swap who goes first in the first round"
          randomize={randomize}
          onRandomize={setRandomize}
          onShowResult={() => setResultOpen(true)}
          playerNames={[dispPlayers[0].name, dispPlayers[1].name]}
          startDisabledReason={startReason}
          extraIdle={<label className="toggle"><input type="checkbox" checked={prefs.spectator} onChange={(e) => patchPrefs({ spectator: e.target.checked })} /><span className="toggle-track" /> Spectator sees chamber</label>}
          replay={replay ? {
            ply: replayPly, total: replay.actions.length, playing: replayPlaying,
            onStep: step, onJump: setReplayPly, onTogglePlay: () => setReplayPlaying((playing) => !playing),
            onExit: newGame,
          } : null}
        />
      </div>

      {keyDialog && <KeyDialog providerId={keyDialog} onClose={() => setKeyDialog(null)} />}
      <HistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} history={history} onReplay={startReplay} onClear={() => {
        const next: HistoryRecord[] = []
        setHistory(next)
      }} />
      {settingsOpen && <Modal open onClose={() => setSettingsOpen(false)} title={`${APP_CONFIG.overload.name} settings`}>
        <Settings prefs={prefs} onChange={patchPrefs} locked={locked} timeout={prefs.moveTimeoutSec} onTimeout={(moveTimeoutSec) => patchPrefs({ moveTimeoutSec })} />
        <p className="muted small">Models receive only their allowed information. The spectator overlay never enters a model prompt.</p>
        <div className="row end"><button className="primary-btn small" onClick={() => setSettingsOpen(false)}>Done</button></div>
      </Modal>}
      {preflightOpen && <PreflightModal
        open
        onClose={() => setPreflightOpen(false)}
        onConfirm={startMatch}
        players={players}
        whiteSeat={firstSeatPref}
        randomize={randomize}
        estimates={estimates}
        maxFullMoves={APP_CONFIG.overload.maxActions}
        timeoutSec={prefs.moveTimeoutSec}
        styles={[getOverloadStyle(players[0].styleId).name, getOverloadStyle(players[1].styleId).name]}
        styleAffects={prefs.styleAffects}
        onStyleAffects={(styleAffects) => patchPrefs({ styleAffects })}
        sideText={(seat) => randomize ? 'First turn: random' : seat === firstSeatPref ? 'Goes first' : 'Goes second'}
        limitText={`${prefs.rounds} rounds / ${APP_CONFIG.overload.maxActions} actions`}
      />}
      {resultOpen && currentRecord && <OverloadResult record={currentRecord} onClose={() => setResultOpen(false)} onNewGame={newGame} />}
      <span className="sr-only" aria-live="polite">{state ? `Action ${actionCount}. ${legalActions(state).length} legal actions.` : ''}</span>
    </div>
  )
}
