import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Speed } from '../config/app'
import { APP_CONFIG } from '../config/app'
import type { PlayerConfig, SeatStats } from '../core/types'
import { IconAlert, IconCards, IconHistory, IconLock, IconPlay, IconPlus, IconRefresh, IconTrash, IconUsers } from '../components/Icons'
import { HistoryDialog } from '../components/HistoryDrawer'
import { KeyDialog } from '../components/KeyDialog'
import { Modal } from '../components/Modal'
import { ModelFields } from '../components/ModelFields'
import { StatusPill } from '../components/StatusPill'
import { DEFAULT_PROVIDER_ID, getProvider } from '../providers/registry'
import { ProviderError, type ChatMessage } from '../providers/types'
import { getCachedModel } from '../lib/models'
import { readCredentials, useKeyStore } from '../lib/keys'
import { HISTORY_STORE, isUnoRecord, saveMatch, type HistoryRecord, type UnoMatchRecord } from '../lib/history'
import { fmtCost, fmtDuration, fmtTokens, uid } from '../lib/format'
import { useStore, readStore } from '../lib/storage'
import { applyUnoMove, createUnoState, isStalemate, parseUnoReply, playableIndices, unoSystemPrompt, unoTurnPrompt, type UnoCard, type UnoMove, type UnoState } from '../games/uno/rules'
import type { ModeProps } from './ChessMode'

const MAX_PLAYERS = 4
const MAX_TURNS = 700
const MAX_ATTEMPTS = APP_CONFIG.defaults.maxIllegalAttempts

const DEFAULT_PLAYERS: PlayerConfig[] = [
  { name: 'Nova', providerId: DEFAULT_PROVIDER_ID, modelId: '', effort: 'default' },
  { name: 'Atlas', providerId: DEFAULT_PROVIDER_ID, modelId: '', effort: 'default' },
]

const EMPTY_STATS = (): SeatStats => ({
  promptTokens: 0,
  completionTokens: 0,
  costUsd: 0,
  costKnown: true,
  timeMs: 0,
  requests: 0,
  illegalReplies: 0,
  lastComment: '',
})

const SEAT_COLORS = ['#62e3ac', '#ff9a4d', '#a88bff', '#58c7ec']
const SPEED_DELAY: Record<Speed, number> = { slow: 1250, normal: 650, fast: 220 }

type UnoStatus = 'idle' | 'running' | 'paused' | 'error' | 'over'
interface UnoError {
  seat: number
  message: string
}
interface UnoResult {
  winnerSeat: number | null
  winnerSide: string | null
  reason: string
}
interface UnoSnapshot {
  status: UnoStatus
  state: UnoState | null
  stats: SeatStats[]
  thinkingSeat: number | null
  attempt: number
  partial: string
  error: UnoError | null
  result: UnoResult | null
}
interface UnoSession {
  id: string
  initialState: UnoState
  state: UnoState
  players: PlayerConfig[]
  stats: SeatStats[]
  loopActive: boolean
  cancelled: boolean
  paused: boolean
  wake: (() => void) | null
  controller: AbortController | null
  turnCount: number
  date: string
}

function cardLabel(card: UnoCard): string {
  if (card.kind === 'wild') return 'WILD'
  if (card.kind === 'number') return String(card.value)
  return card.kind === 'draw2' ? '+2' : card.kind === 'reverse' ? '↶' : 'SKIP'
}

function cardColor(card: UnoCard): string {
  return card.color ?? 'wild'
}

function Card({ card, back = false, small = false, className = '' }: { card?: UnoCard; back?: boolean; small?: boolean; className?: string }) {
  if (back || !card) {
    return <span className={`uno-card uno-back ${small ? 'small' : ''} ${className}`} aria-label="Face-down card"><i>UNO</i></span>
  }
  const color = cardColor(card)
  return (
    <span className={`uno-card uno-${color} ${small ? 'small' : ''} ${className}`} aria-label={card.kind === 'number' ? `${card.color} ${card.value}` : `${card.color ?? ''} ${card.kind}`}>
      <i className="uno-card-oval" />
      <b>{cardLabel(card)}</b>
      <small>{card.kind === 'number' ? card.value : card.kind === 'wild' ? 'W' : card.kind === 'draw2' ? '+2' : card.kind.slice(0, 1).toUpperCase()}</small>
    </span>
  )
}

function ActionText({ state }: { state: UnoState }) {
  const last = state.actions[state.actions.length - 1]
  if (!last) return <span className="muted">The table is ready. Let the first card fly.</span>
  if (last.type === 'penalty') return <span>{last.comment}</span>
  const who = state.players[last.player]?.name ?? `Player ${last.player + 1}`
  if (last.type === 'draw') return <span><b>{who}</b> drew a card. {last.comment}</span>
  return <span><b>{who}</b> played {last.card ? cardLabel(last.card) : 'a card'}{last.chosenColor ? ` · ${last.chosenColor} is live` : ''}. {last.comment}</span>
}

function SeatSetup({
  player,
  index,
  locked,
  credentials,
  onChange,
  onSetKey,
  onRemove,
  canRemove,
}: {
  player: PlayerConfig
  index: number
  locked: boolean
  credentials: ReturnType<typeof readCredentials>
  onChange: (patch: Partial<PlayerConfig>) => void
  onSetKey: () => void
  onRemove: () => void
  canRemove: boolean
}) {
  return (
    <section className="uno-config glass" style={{ '--uno-seat': SEAT_COLORS[index] } as CSSProperties}>
      <header className="uno-config-head">
        <span className="uno-seat-id"><i /> SEAT {String(index + 1).padStart(2, '0')}</span>
        {canRemove && !locked && <button className="uno-remove" onClick={onRemove} aria-label={`Remove ${player.name}`} title="Remove player"><IconTrash size={15} /></button>}
      </header>
      <input className="name-input" value={player.name} disabled={locked} maxLength={32} spellCheck={false} aria-label={`Seat ${index + 1} name`} onChange={(e) => onChange({ name: e.target.value })} />
      <div className="uno-config-provider">
        <ModelFields player={player} onChange={onChange} locked={locked} credentials={credentials} accent={index % 2 ? 'p2' : 'p1'} idPrefix={`uno-${index}`} />
        <button className="link" onClick={onSetKey}>{getProvider(player.providerId).hasCredentials(credentials) ? 'Manage key' : 'Set key'}</button>
      </div>
    </section>
  )
}

function replayState(record: UnoMatchRecord, actionCount: number): UnoState {
  let state = record.initialState
  let turns = 0
  for (const action of record.actions) {
    if (action.type === 'penalty') continue
    if (turns >= actionCount) break
    const move: UnoMove = action.type === 'draw'
      ? { type: 'draw', comment: action.comment }
      : { type: 'play', cardIndex: action.cardIndex ?? -1, chosenColor: action.chosenColor, declaredUno: Boolean(action.declaredUno), comment: action.comment }
    state = applyUnoMove(state, move)
    turns++
  }
  return state
}

function resultFromState(state: UnoState, reason: string): UnoResult {
  const winner = state.winner
  return {
    winnerSeat: winner,
    winnerSide: winner === null ? null : `player${winner + 1}`,
    reason: winner === null ? reason : `${state.players[winner].name} emptied their hand`,
  }
}

export function UnoMode({ modeSwitch, onBusyChange, initialReplay, onReplayOther }: ModeProps) {
  const [players, setPlayers] = useStore<PlayerConfig[]>('uno.players', DEFAULT_PLAYERS)
  const [history, setHistory] = useStore<HistoryRecord[]>(HISTORY_STORE, [])
  const [spectatorFull, setSpectatorFull] = useStore('uno.spectatorFull', true)
  const [speed, setSpeed] = useStore<Speed>('uno.speed', 'normal')
  const [timeoutSec, setTimeoutSec] = useStore<number>('uno.timeoutSec', APP_CONFIG.defaults.moveTimeoutSec)
  const [startingHand, setStartingHand] = useStore<5 | 7 | 9>('uno.startingHand', 7)
  const [keys] = useKeyStore()
  const [snapshot, setSnapshot] = useState<UnoSnapshot>({
    status: 'idle', state: null, stats: players.map(EMPTY_STATS), thinkingSeat: null, attempt: 0, partial: '', error: null, result: null,
  })
  const [keyDialog, setKeyDialog] = useState<string | null>(null)
  const [preflightOpen, setPreflightOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [hoverSeat, setHoverSeat] = useState<number | null>(null)
  const [replay, setReplay] = useState<UnoMatchRecord | null>(null)
  const [replayStep, setReplayStep] = useState(0)
  const [replayPlaying, setReplayPlaying] = useState(false)
  const [savedRecord, setSavedRecord] = useState<UnoMatchRecord | null>(null)
  const [sessionPlayers, setSessionPlayers] = useState<PlayerConfig[] | null>(null)
  const sessionRef = useRef<UnoSession | null>(null)
  const requestId = useRef(0)
  const speedRef = useRef(speed)
  speedRef.current = speed

  const state = replay ? replayState(replay, replayStep) : snapshot.state
  const displayPlayers = replay?.players ?? sessionPlayers ?? players
  const stats = replay?.stats ?? snapshot.stats
  const busy = snapshot.status === 'running' || snapshot.status === 'paused' || snapshot.status === 'error'
  const locked = Boolean(replay) || busy || snapshot.status === 'over'
  const currentSeat = state?.currentPlayer ?? 0
  const top = state?.discardPile[state.discardPile.length - 1]
  const legal = state ? playableIndices(state) : []
  const moveCount = state?.actions.filter((action) => action.type !== 'penalty').length ?? 0
  const replayTotal = replay?.actions.filter((action) => action.type !== 'penalty').length ?? 0
  const result = replay?.result ?? snapshot.result

  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange])
  useEffect(() => () => {
    const session = sessionRef.current
    if (session) {
      session.cancelled = true
      session.controller?.abort()
      session.wake?.()
    }
  }, [])

  const patchPlayer = (index: number, patch: Partial<PlayerConfig>) => {
    setPlayers((current) => current.map((player, seat) => seat === index ? { ...player, ...patch } : player))
  }

  const startDisabledReason = useMemo(() => {
    if (players.length < 2) return 'Add at least two players'
    for (const [index, player] of players.entries()) {
      if (!player.modelId) return `Choose a model for ${player.name || `Seat ${index + 1}`}`
      const provider = getProvider(player.providerId)
      const credentials = keys[player.providerId] ?? {}
      if (!provider.hasCredentials(credentials)) return `Configure credentials for ${player.name || `Seat ${index + 1}`}`
    }
    return null
  }, [players, keys])

  const saveResult = (session: UnoSession, matchResult: UnoResult) => {
    const record: UnoMatchRecord = {
      id: session.id,
      gameId: 'uno',
      date: session.date,
      players: session.players,
      initialState: session.initialState,
      actions: session.state.actions,
      result: { winnerSeat: matchResult.winnerSeat, winnerSide: matchResult.winnerSide, reason: matchResult.reason },
      stats: session.stats,
      spectatorSeesHands: spectatorFull,
    }
    saveMatch(record)
    setHistory(readStore<HistoryRecord[]>(HISTORY_STORE, []))
    setSavedRecord(record)
    setResultOpen(true)
  }

  const finish = (session: UnoSession, matchResult: UnoResult) => {
    if (session.cancelled || sessionRef.current !== session) return
    session.cancelled = true
    session.controller?.abort()
    session.wake?.()
    setSnapshot({ status: 'over', state: session.state, stats: session.stats, thinkingSeat: null, attempt: 0, partial: '', error: null, result: matchResult })
    saveResult(session, matchResult)
  }

  const runLoop = async (session: UnoSession) => {
    if (session.loopActive || session.cancelled) return
    session.loopActive = true
    try {
      while (!session.cancelled && sessionRef.current === session) {
        if (session.paused) {
          await new Promise<void>((resolve) => { session.wake = resolve })
          session.wake = null
          continue
        }
        if (session.state.winner !== null) {
          finish(session, resultFromState(session.state, ''))
          return
        }
        if (isStalemate(session.state)) {
          finish(session, resultFromState(session.state, 'Draw — no cards can be played and the draw pile is exhausted'))
          return
        }
        if (session.turnCount >= MAX_TURNS) {
          finish(session, resultFromState(session.state, `No hand emptied after ${MAX_TURNS} turns`))
          return
        }

        const seat = session.state.currentPlayer
        const player = session.players[seat]
        const provider = getProvider(player.providerId)
        const credentials = readCredentials(player.providerId)
        const modelInfo = getCachedModel(player.providerId, credentials, player.modelId)
        const messages: ChatMessage[] = [
          { role: 'system', content: unoSystemPrompt(seat, session.players.map((entry) => entry.name)) },
          { role: 'user', content: unoTurnPrompt(session.state) },
        ]
        let accepted: UnoMove | null = null
        let failed = false

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          if (session.cancelled || sessionRef.current !== session) return
          const currentSnap = snapshotForSession(session, 'running', seat, attempt, '')
          setSnapshot(currentSnap)
          const controller = new AbortController()
          session.controller = controller
          let timedOut = false
          const startedAt = performance.now()
          const timer = setTimeout(() => {
            timedOut = true
            controller.abort()
          }, timeoutSec * 1000)
          let partial = ''
          try {
            const request = { model: player.modelId, messages, effort: player.effort, credentials, signal: controller.signal, modelInfo }
            let response: Awaited<ReturnType<typeof provider.sendMove>>
            if (provider.streamMove) {
              try {
                response = await provider.streamMove(request, (fragment) => {
                  partial += fragment
                  if (!session.cancelled) setSnapshot(snapshotForSession(session, session.paused ? 'paused' : 'running', seat, attempt, partial))
                })
              } catch (error) {
                if (error instanceof ProviderError && error.kind === 'bad_request' && !partial && !controller.signal.aborted) {
                  response = await provider.sendMove(request)
                } else {
                  throw error
                }
              }
            } else {
              response = await provider.sendMove(request)
            }
            clearTimeout(timer)
            const elapsed = performance.now() - startedAt
            const reportedCost = response.usage.costUsd
            const pricedCost = reportedCost ?? (modelInfo?.pricing.prompt != null && modelInfo.pricing.completion != null
              ? response.usage.promptTokens * modelInfo.pricing.prompt + response.usage.completionTokens * modelInfo.pricing.completion
              : null)
            session.stats[seat] = {
              ...session.stats[seat],
              promptTokens: session.stats[seat].promptTokens + response.usage.promptTokens,
              completionTokens: session.stats[seat].completionTokens + response.usage.completionTokens,
              costUsd: pricedCost === null ? session.stats[seat].costUsd : (session.stats[seat].costUsd ?? 0) + pricedCost,
              costKnown: session.stats[seat].costKnown && pricedCost !== null,
              timeMs: session.stats[seat].timeMs + elapsed,
              requests: session.stats[seat].requests + 1,
            }
            const parsed = parseUnoReply(session.state, response.text)
            if (parsed.ok) {
              accepted = parsed.move
              session.stats[seat] = { ...session.stats[seat], lastComment: parsed.move.comment }
              break
            }
            session.stats[seat] = { ...session.stats[seat], illegalReplies: session.stats[seat].illegalReplies + 1 }
            messages.push({ role: 'assistant', content: response.text || '(empty reply)' })
            messages.push({
              role: 'user',
              content: `Your response was invalid: ${parsed.error}. Choose an action from this legal list and reply in the required format.\n${unoTurnPrompt(session.state)}`,
            })
          } catch (error) {
            clearTimeout(timer)
            session.stats[seat] = { ...session.stats[seat], timeMs: session.stats[seat].timeMs + performance.now() - startedAt }
            if (session.cancelled || sessionRef.current !== session) return
            const message = timedOut
              ? `No reply within ${timeoutSec}s (per-turn timeout).`
              : error instanceof ProviderError
                ? error.message
                : error instanceof Error && error.name === 'AbortError'
                  ? 'The request was cancelled.'
                  : `Unexpected provider error: ${error instanceof Error ? error.message : String(error)}`
            setSnapshot(snapshotForSession(session, 'error', null, 0, '', { seat, message }))
            session.loopActive = false
            failed = true
            return
          } finally {
            clearTimeout(timer)
            if (session.controller === controller) session.controller = null
          }
        }

        if (failed || session.cancelled) return
        if (!accepted) {
          const opponent = (seat + 1) % session.players.length
          finish(session, {
            winnerSeat: opponent,
            winnerSide: `player${opponent + 1}`,
            reason: `${player.name} forfeited after ${MAX_ATTEMPTS} invalid replies`,
          })
          return
        }

        session.state = applyUnoMove(session.state, accepted)
        session.turnCount++
        setSnapshot({
          status: session.paused ? 'paused' : 'running',
          state: session.state,
          stats: [...session.stats],
          thinkingSeat: null,
          attempt: 0,
          partial: '',
          error: null,
          result: null,
        })
        await new Promise<void>((resolve) => setTimeout(resolve, SPEED_DELAY[speedRef.current]))
      }
    } finally {
      session.loopActive = false
    }
  }

  const startMatch = () => {
    setPreflightOpen(false)
    const frozen = players.map((player, index) => {
      const credentials = readCredentials(player.providerId)
      const model = getCachedModel(player.providerId, credentials, player.modelId)
      const unsupported = getProvider(player.providerId).effortSupport(model) === false
      return { ...player, name: player.name.trim() || `Player ${index + 1}`, effort: unsupported ? 'default' : player.effort }
    })
    const initialState = createUnoState(frozen.map((player) => player.name), undefined, startingHand)
    const session: UnoSession = {
      id: uid(), initialState, state: initialState, players: frozen, stats: frozen.map(EMPTY_STATS),
      loopActive: false, cancelled: false, paused: false, wake: null, controller: null,
      turnCount: 0, date: new Date().toISOString(),
    }
    sessionRef.current?.controller?.abort()
    sessionRef.current = session
    setReplay(null)
    setSavedRecord(null)
    setSessionPlayers(frozen)
    setSnapshot({ status: 'running', state: initialState, stats: session.stats, thinkingSeat: null, attempt: 0, partial: '', error: null, result: null })
    void runLoop(session)
  }

  const retry = () => {
    const session = sessionRef.current
    if (!session || snapshot.status !== 'error') return
    setSnapshot((current) => ({ ...current, status: 'running', error: null }))
    void runLoop(session)
  }

  const togglePause = () => {
    const session = sessionRef.current
    if (!session) return
    if (session.paused) {
      session.paused = false
      setSnapshot((current) => ({ ...current, status: 'running' }))
      session.wake?.()
    } else {
      session.paused = true
      setSnapshot((current) => ({ ...current, status: 'paused' }))
    }
  }

  const stopMatch = useCallback(() => {
    const session = sessionRef.current
    if (session) {
      session.cancelled = true
      session.controller?.abort()
      session.wake?.()
      sessionRef.current = null
    }
    setSnapshot({ status: 'idle', state: null, stats: players.map(EMPTY_STATS), thinkingSeat: null, attempt: 0, partial: '', error: null, result: null })
    setSessionPlayers(null)
    setReplay(null)
    setReplayPlaying(false)
    setSavedRecord(null)
    setResultOpen(false)
  }, [players])

  const startReplay = (record: HistoryRecord) => {
    setHistoryOpen(false)
    if (!isUnoRecord(record)) {
      onReplayOther?.(record)
      return
    }
    stopMatch()
    setReplay(record)
    setReplayStep(0)
    setSavedRecord(record)
    setSnapshot((current) => ({ ...current, status: 'over', result: record.result, state: record.initialState, stats: record.stats }))
  }

  useEffect(() => {
    if (initialReplay) startReplay(initialReplay)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReplay])

  useEffect(() => {
    if (!replay || !replayPlaying) return
    const timer = setInterval(() => setReplayStep((step) => {
      if (step >= replayTotal) {
        setReplayPlaying(false)
        return step
      }
      return step + 1
    }), SPEED_DELAY[speed] + 250)
    return () => clearInterval(timer)
  }, [replay, replayPlaying, replayTotal, speed])

  const changeReplayStep = (step: number) => setReplayStep(Math.max(0, Math.min(replayTotal, step)))
  const addPlayer = () => {
    if (players.length >= MAX_PLAYERS || locked) return
    setPlayers((current) => [...current, {
      name: `Player ${current.length + 1}`,
      providerId: DEFAULT_PROVIDER_ID,
      modelId: '',
      effort: 'default',
    }])
  }
  const removePlayer = (index: number) => {
    if (players.length <= 2 || locked) return
    setPlayers((current) => current.filter((_, seat) => seat !== index))
  }

  const handFor = (seat: number) => state?.players[seat]?.hand ?? []
  const currentPlayerName = state ? displayPlayers[state.currentPlayer]?.name : null
  const statusText = replay
    ? `Replay · turn ${replayStep} of ${replayTotal}`
    : snapshot.status === 'error'
      ? 'Turn paused · retry available'
      : snapshot.status === 'over'
        ? result?.reason ?? 'Game over'
        : state
          ? snapshot.status === 'paused' ? 'Table paused' : snapshot.thinkingSeat !== null ? `${displayPlayers[snapshot.thinkingSeat]?.name} is thinking` : `${currentPlayerName} to play`
          : 'Build your table'

  const maxTokens = stats.reduce((total, entry) => total + entry.promptTokens + entry.completionTokens, 0)
  const totalCost = stats.reduce((total, entry) => total + (entry.costUsd ?? 0), 0)
  const costKnown = stats.every((entry) => entry.costKnown)
  const lastPlay = state ? [...state.actions].reverse().find((action) => action.type === 'play') : undefined
  const statusTone = state ? `p${(state.currentPlayer % 2) + 1}` as 'p1' | 'p2' : 'neutral'
  const showHand = (seat: number) => (replay ? replay.spectatorSeesHands : spectatorFull) && (hoverSeat === seat || snapshot.status === 'idle' || snapshot.status === 'over')

  return (
    <div className="app uno-app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden><span /><span /></div>
          <span className="brand-name">{APP_CONFIG.APP_NAME}</span>
          {modeSwitch}
        </div>
        <StatusPill text={statusText} tone={statusTone} live={snapshot.status === 'running' && !replay} sub={state ? `${state.players.length} players · ${moveCount} turns · ${state.drawPile.length} cards in deck` : undefined} />
        <nav className="top-actions">
          <button className="icon-btn glass" onClick={() => setHistoryOpen(true)} aria-label="Match history" title="History"><IconHistory /></button>
          <button className="icon-btn glass" onClick={() => setPreflightOpen(true)} disabled={locked || Boolean(startDisabledReason)} aria-label="Start match" title="Start match"><IconPlay /></button>
        </nav>
      </header>

      <main className="uno-main">
        {!state && (
          <section className="uno-lobby">
            <div className="uno-intro">
              <span className="uno-kicker"><IconCards size={15} /> THE TABLE IS YOURS</span>
              <h1 className="serif">Deal in the <em>machines.</em></h1>
              <p>Four seats max. Private hands. Public bluffs. Every model gets only the cards it is allowed to see.</p>
            </div>
            <div className="uno-seat-grid">
              {players.map((player, index) => (
                <SeatSetup
                  key={index}
                  player={player}
                  index={index}
                  locked={locked}
                  credentials={keys[player.providerId] ?? {}}
                  onChange={(patch) => patchPlayer(index, patch)}
                  onSetKey={() => setKeyDialog(player.providerId)}
                  onRemove={() => removePlayer(index)}
                  canRemove={players.length > 2}
                />
              ))}
              {players.length < MAX_PLAYERS && (
                <button className="uno-add-seat glass" onClick={addPlayer}>
                  <IconPlus size={19} /><b>Add a player</b><span>{players.length}/{MAX_PLAYERS} seats</span>
                </button>
              )}
            </div>
            <div className="uno-lobby-settings">
              <label className="field-label">Starting hand
                <select className="field select" value={startingHand} onChange={(e) => setStartingHand(Number(e.target.value) as 5 | 7 | 9)}>
                  <option value={5}>5 cards · quick match</option>
                  <option value={7}>7 cards · classic deal</option>
                  <option value={9}>9 cards · long game</option>
                </select>
              </label>
              <div className="uno-rule-chip"><IconCards size={15} /><span><b>104-card simplified deck</b><small>Numbers · Skip · Reverse · Draw Two · Wild</small></span></div>
              <div className="uno-rule-chip"><IconLock size={15} /><span><b>Missed Uno</b><small>Automatic +2 card penalty</small></span></div>
            </div>
            <div className="uno-lobby-foot">
              <span><IconLock size={14} /> Opponents never see each other’s hands</span>
              <button className="primary-btn" disabled={Boolean(startDisabledReason)} title={startDisabledReason ?? undefined} onClick={() => setPreflightOpen(true)}>
                <IconPlay size={16} /> Deal the cards
              </button>
            </div>
          </section>
        )}

        {state && (
          <section className={`uno-table-wrap ${snapshot.status === 'over' || replay ? 'is-over' : ''}`}>
            <div className="uno-table">
              <div className="uno-table-glow" />
              <div className="uno-seats">
                {state.players.map((seatPlayer, index) => {
                  const isTurn = !replay && snapshot.status !== 'over' && snapshot.status !== 'paused' && state.currentPlayer === index
                  const hand = handFor(index)
                  const reveal = showHand(index)
                  const latest = [...state.actions].reverse().find((action) => action.player === index && action.type !== 'penalty')
                  return (
                    <article
                      key={index}
                      className={`uno-avatar-seat seat-pos-${state.players.length}-${index} ${isTurn ? 'is-turn' : ''} ${snapshot.thinkingSeat === index && !replay ? 'is-thinking' : ''}`}
                      style={{ '--uno-seat': SEAT_COLORS[index] } as CSSProperties}
                      onMouseEnter={() => setHoverSeat(index)}
                      onMouseLeave={() => setHoverSeat((current) => current === index ? null : current)}
                    >
                      <div className="uno-avatar">
                        <span className="uno-avatar-face"><i /><i /></span>
                        <span className="uno-avatar-body" />
                        {isTurn && <span className="uno-turn-aura" />}
                      </div>
                      <div className="uno-avatar-meta" title={`${displayPlayers[index]?.modelLabel ?? displayPlayers[index]?.modelId ?? 'No model selected'} · ${fmtTokens(stats[index]?.promptTokens + stats[index]?.completionTokens || 0)} tokens`}>
                        <strong>{seatPlayer.name}</strong>
                        <small>{snapshot.thinkingSeat === index && !replay ? `Thinking · try ${snapshot.attempt}` : `${hand.length} cards`}</small>
                        <span className="uno-avatar-model">{displayPlayers[index]?.modelLabel ?? displayPlayers[index]?.modelId ?? 'Model not set'}</span>
                        <span className="uno-mini-hand" aria-label={`${hand.length} cards`}>
                          {Array.from({ length: Math.min(hand.length, 7) }, (_, i) => <Card key={i} back small />)}
                          {hand.length > 7 && <b>+{hand.length - 7}</b>}
                        </span>
                      </div>
                      {reveal && hand.length > 0 && (
                        <div className="uno-reveal-hand" aria-label={`${seatPlayer.name}'s hand`}>
                          {hand.map((card) => <Card key={card.id} card={card} small />)}
                        </div>
                      )}
                      {latest?.comment && <div className="uno-speech">{latest.comment}</div>}
                    </article>
                  )
                })}
              </div>

              <div className="uno-center">
                <div className="uno-center-caption">
                  <span className="uno-live-dot" />
                  {state.players[state.currentPlayer]?.name} {snapshot.status === 'running' && snapshot.thinkingSeat !== null ? 'is choosing' : 'to play'}
                </div>
                <div className="uno-piles">
                  <div className="uno-draw-stack" aria-label={`${state.drawPile.length} cards in draw pile`}>
                    <Card back />
                    <span className="uno-pile-count">{state.drawPile.length}</span>
                    <small>DRAW</small>
                  </div>
                  <div className="uno-discard">
                    <Card card={top} className="uno-top-card" />
                    <span className={`uno-color-orbit orbit-${state.currentColor}`} title={`Active color: ${state.currentColor}`} />
                    <small>DISCARD</small>
                  </div>
                </div>
                <div className={`uno-active-color active-${state.currentColor}`}><i /> {state.currentColor} is live</div>
                <div className="uno-direction">{state.direction === 1 ? '↻' : '↺'} <span>{state.direction === 1 ? 'Clockwise' : 'Counter-clockwise'}</span></div>
                {lastPlay?.card?.kind === 'wild' && lastPlay.chosenColor && (
                  <div key={lastPlay.card.id} className={`uno-color-callout callout-${lastPlay.chosenColor}`}><span>Wild chose</span><b>{lastPlay.chosenColor}</b></div>
                )}
              </div>
            </div>

            <div className="uno-stage-footer glass">
              <div className="uno-commentary"><span className="uno-sound-bars"><i /><i /><i /></span><ActionText state={state} />{snapshot.partial && <span className="uno-partial">{snapshot.partial}</span>}</div>
              <div className="uno-stage-tools">
                {state.players.map((player, index) => (
                  <span key={index} className={`uno-count-chip ${index === state.currentPlayer ? 'active' : ''}`} style={{ '--uno-seat': SEAT_COLORS[index] } as CSSProperties}>
                    <i /> {player.name} <b>{player.hand.length}</b>
                  </span>
                ))}
              </div>
            </div>

            <div className="uno-settings-bar glass">
              <label className="uno-toggle">
                <input type="checkbox" checked={spectatorFull} onChange={(e) => setSpectatorFull(e.target.checked)} disabled={Boolean(replay)} />
                <span className="uno-switch" /> Spectator sees all hands
              </label>
              {!replay && snapshot.status === 'running' && (
                <button className="dock-btn" onClick={togglePause}>Pause</button>
              )}
              {!replay && snapshot.status === 'paused' && <button className="primary-btn small" onClick={togglePause}>Resume match</button>}
              {!replay && (snapshot.status === 'running' || snapshot.status === 'paused' || snapshot.status === 'error') && (
                <button className="dock-btn" onClick={stopMatch}><IconRefresh size={14} /> End match</button>
              )}
              {replay && (
                <div className="uno-replay-controls">
                  <button className="icon-btn" onClick={() => changeReplayStep(0)} aria-label="First turn">|‹</button>
                  <button className="icon-btn" onClick={() => changeReplayStep(replayStep - 1)} aria-label="Previous turn">‹</button>
                  <button className="primary-btn small" onClick={() => setReplayPlaying((playing) => !playing)}>{replayPlaying ? 'Pause' : 'Play'}</button>
                  <button className="icon-btn" onClick={() => changeReplayStep(replayStep + 1)} aria-label="Next turn">›</button>
                  <button className="icon-btn" onClick={() => changeReplayStep(replayTotal)} aria-label="Last turn">›|</button>
                  <span className="mono small">{replayStep}/{replayTotal}</span>
                  <button className="dock-btn" onClick={stopMatch}>Exit replay</button>
                </div>
              )}
              {!replay && snapshot.status === 'over' && <button className="primary-btn small" onClick={stopMatch}><IconRefresh size={14} /> New game</button>}
              <span className="uno-table-cost">{fmtTokens(maxTokens)} tok · {fmtCost(totalCost, costKnown)}</span>
            </div>
          </section>
        )}

        {snapshot.error && !replay && (
          <div className="uno-error glass" role="alert">
            <IconAlert size={16} /><span><b>{displayPlayers[snapshot.error.seat]?.name} needs attention</b> · {snapshot.error.message}</span>
            <button className="primary-btn small" onClick={retry}>Retry turn</button>
          </div>
        )}
      </main>

      {keyDialog && <KeyDialog providerId={keyDialog} onClose={() => setKeyDialog(null)} />}
      <HistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} history={history} onReplay={startReplay} onClear={() => setHistory([])} />

      <Modal open={preflightOpen} onClose={() => setPreflightOpen(false)} title="Ready to deal?">
        <div className="uno-preflight">
          <div className="uno-preflight-roster">{players.map((player, index) => (
            <div key={index} style={{ '--uno-seat': SEAT_COLORS[index] } as CSSProperties}>
              <i /> <b>{player.name || `Player ${index + 1}`}</b><small>{player.modelId || 'No model selected'}</small>
            </div>
          ))}</div>
          <div className="privacy-note small"><IconLock size={14} /> Each turn gets a fresh private prompt. The model never receives opponents’ cards.</div>
          <label className="field-label">Per-turn timeout · {timeoutSec}s
            <input className="field" type="range" min={30} max={300} step={15} value={timeoutSec} onChange={(e) => setTimeoutSec(Number(e.target.value))} />
          </label>
          <label className="field-label">Table pace
            <select className="field select" value={speed} onChange={(e) => setSpeed(e.target.value as Speed)}>
              <option value="slow">Cinematic</option><option value="normal">Normal</option><option value="fast">Fast</option>
            </select>
          </label>
          {startDisabledReason && <div className="privacy-note small warn"><IconAlert size={14} /> {startDisabledReason}</div>}
          <div className="row gap end">
            <button className="dock-btn" onClick={() => setPreflightOpen(false)}>Cancel</button>
            <button className="primary-btn" disabled={Boolean(startDisabledReason)} onClick={startMatch}><IconPlay size={16} /> Start Uno</button>
          </div>
        </div>
      </Modal>

      <Modal open={resultOpen} onClose={() => setResultOpen(false)} title={result?.winnerSeat === null ? 'The table is tied' : `${displayPlayers[result?.winnerSeat ?? -1]?.name ?? 'Winner'} takes the table`}>
        <div className="uno-result">
          <div className="uno-result-emblem"><IconCards size={28} /></div>
          <p>{result?.reason ?? 'Match complete'}</p>
          <div className="uno-result-stats">
            {stats.map((entry, index) => (
              <div key={index} style={{ '--uno-seat': SEAT_COLORS[index] } as CSSProperties}>
                <b>{displayPlayers[index]?.name ?? `Player ${index + 1}`}</b>
                <span>{fmtTokens(entry.promptTokens + entry.completionTokens)} tokens · {fmtDuration(entry.timeMs)}</span>
                <span>{fmtCost(entry.costUsd, entry.costKnown)}</span>
              </div>
            ))}
          </div>
          <div className="row gap end"><button className="dock-btn" onClick={() => setResultOpen(false)}>Close</button><button className="primary-btn" onClick={stopMatch}><IconRefresh size={15} /> New game</button></div>
        </div>
      </Modal>

      <div className="uno-bottom-dock glass">
        <span className="uno-bottom-label"><IconUsers size={15} /> {displayPlayers.length} AIs · {state?.startingHand ?? startingHand}-card deal · simplified rules</span>
        {!state && <button className="dock-btn" onClick={() => setHistoryOpen(true)}>History</button>}
        {state && !replay && snapshot.status === 'over' && <button className="dock-btn" onClick={() => setResultOpen(true)}>Match result</button>}
        <span className="uno-rule-note">No stacking · missed UNO draws 2</span>
      </div>
    </div>
  )
}

function snapshotForSession(
  session: UnoSession,
  status: UnoStatus,
  thinkingSeat: number | null,
  attempt: number,
  partial: string,
  error: UnoError | null = null,
): UnoSnapshot {
  return {
    status,
    state: session.state,
    stats: [...session.stats],
    thinkingSeat,
    attempt,
    partial,
    error,
    result: null,
  }
}
