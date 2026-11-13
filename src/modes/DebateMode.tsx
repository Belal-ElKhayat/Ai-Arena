import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { APP_CONFIG, type Speed } from '../config/app'
import { estimateDebateCost } from '../core/cost'
import { MatchRunner } from '../core/matchRunner'
import type { PlayerConfig, RunnerSnapshot, Seat, SeatStats } from '../core/types'
import { EXAMPLE_TOPICS, randomTopic } from '../games/debate/content'
import { runJudge } from '../games/debate/judge'
import {
  SIDE_SEAT,
  STANCE_LABEL,
  TURN_WORDS,
  buildSchedule,
  createDebateModule,
  effectiveRounds,
  type DebateFormat,
  type DebateMove,
  type DebateSetup,
  type DebateState,
  type DebateTurn,
  type DebaterConfig,
  type Stance,
  type TurnLength,
} from '../games/debate/module'
import { HISTORY_STORE, isDebateRecord, saveMatch, type AudienceVote, type DebateRecord, type HistoryRecord } from '../lib/history'
import { readCredentials, useKeyStore } from '../lib/keys'
import { getCachedModel } from '../lib/models'
import { playSound } from '../lib/sound'
import { useStore } from '../lib/storage'
import { uid } from '../lib/format'
import { DEFAULT_PROVIDER_ID, getProvider } from '../providers/registry'
import { speechQueue, useSpeechState } from '../voice/queue'
import { DEFAULT_ENGINE_ID } from '../voice/registry'
import { pickTwoVoices, useVoices } from '../voice/useVoices'
import { ConfirmButton, SpeedControl } from '../components/ControlDock'
import { DebatePreflight } from '../components/DebatePreflight'
import { DebateResultModal, type JudgeState } from '../components/DebateResultModal'
import { DebateSettingsDialog, type VoicePrefs } from '../components/DebateSettingsDialog'
import { DebaterPanel, type DebaterStatus } from '../components/DebaterPanel'
import { HistoryDialog } from '../components/HistoryDrawer'
import { KeyDialog } from '../components/KeyDialog'
import { KeyStatus, ModelFields } from '../components/ModelFields'
import { StatusPill } from '../components/StatusPill'
import { Transcript, type LiveTurn } from '../components/Transcript'
import {
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconDice,
  IconGavel,
  IconHistory,
  IconLock,
  IconMic,
  IconMute,
  IconPause,
  IconPlay,
  IconRefresh,
  IconSettings,
  IconSkipSpeech,
  IconStop,
  IconSwap,
  IconTrophy,
  IconUsers,
  IconVolume,
} from '../components/Icons'
import type { ModeProps } from './ChessMode'

type Runner = MatchRunner<DebateState, DebateMove>
type Snap = RunnerSnapshot<DebateState>
type First = 0 | 1 | 'random'

interface DebatePrefs {
  topic: string
  format: DebateFormat
  rounds: number
  length: TurnLength
  first: First
  autoOpposite: boolean
  judgeOn: boolean
  judge: PlayerConfig
  voteOn: boolean
  maxTurns: number
  timeoutSec: number
  speed: Speed
}

const DEFAULT_PREFS: DebatePrefs = {
  topic: '',
  format: 'structured',
  rounds: APP_CONFIG.debate.rounds,
  length: 'medium',
  first: 0,
  autoOpposite: true,
  judgeOn: false,
  judge: { name: 'Judge', providerId: DEFAULT_PROVIDER_ID, modelId: '', effort: 'default' },
  voteOn: true,
  maxTurns: APP_CONFIG.debate.maxTurns,
  timeoutSec: APP_CONFIG.debate.turnTimeoutSec,
  speed: 'normal',
}

const DEFAULT_DEBATERS: [DebaterConfig, DebaterConfig] = [
  { name: 'Debater 1', providerId: DEFAULT_PROVIDER_ID, modelId: '', effort: 'default', stance: 'for', instructions: '', preset: 'custom' },
  { name: 'Debater 2', providerId: DEFAULT_PROVIDER_ID, modelId: '', effort: 'default', stance: 'against', instructions: '', preset: 'custom' },
]

const DEFAULT_VOICE: VoicePrefs = {
  enabled: false,
  engineId: DEFAULT_ENGINE_ID,
  waitForVoice: true,
  seats: [
    { voiceId: '', rate: 1, pitch: 1 },
    { voiceId: '', rate: 1, pitch: 0.9 },
  ],
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

const OPPOSITE: Record<Stance, Stance | null> = { for: 'against', against: 'for', free: null }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Everything needed to (re)start a debate with identical settings. */
interface LaunchConfig {
  debaters: [DebaterConfig, DebaterConfig]
  setup: DebateSetup
  judge: PlayerConfig | null
  voteOn: boolean
  timeoutSec: number
}

interface Active {
  id: string
  date: string
  startedAt: number
  cfg: LaunchConfig
}

function Seg<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T
  options: Array<{ id: T; label: string; title?: string }>
  onChange: (v: T) => void
  disabled?: boolean
  label: string
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.id)} role="radio" aria-checked={o.id === value} title={o.title} className={o.id === value ? 'on' : ''} disabled={disabled} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function DebateMode({ modeSwitch, onBusyChange, initialReplay, onReplayOther }: ModeProps) {
  const [debaters, setDebaters] = useStore<[DebaterConfig, DebaterConfig]>('debate.debaters', DEFAULT_DEBATERS)
  const [prefsRaw, setPrefs] = useStore<DebatePrefs>('debate.prefs', DEFAULT_PREFS)
  const [voiceRaw, setVoice] = useStore<VoicePrefs>('debate.voice', DEFAULT_VOICE)
  const [muted, setMuted] = useStore('muted', false)
  const [history, setHistory] = useStore<HistoryRecord[]>(HISTORY_STORE, [])
  const [keys] = useKeyStore()
  const p: DebatePrefs = { ...DEFAULT_PREFS, ...prefsRaw, judge: { ...DEFAULT_PREFS.judge, ...(prefsRaw?.judge ?? {}) } }
  const voice: VoicePrefs = { ...DEFAULT_VOICE, ...voiceRaw, seats: voiceRaw?.seats ?? DEFAULT_VOICE.seats }
  const patch = (x: Partial<DebatePrefs>) => setPrefs((cur) => ({ ...DEFAULT_PREFS, ...cur, ...x }))
  const patchVoice = (x: Partial<VoicePrefs>) => setVoice((cur) => ({ ...DEFAULT_VOICE, ...cur, ...x }))

  const runnerRef = useRef<Runner | null>(null)
  const judgeAbort = useRef<AbortController | null>(null)
  const [snap, setSnap] = useState<Snap | null>(null)
  const [active, setActive] = useState<Active | null>(null)
  const [record, setRecord] = useState<DebateRecord | null>(null)
  const [judge, setJudge] = useState<JudgeState>({ status: 'off', verdict: null, stats: null })
  const [vote, setVote] = useState<AudienceVote>(null)
  const [replay, setReplay] = useState<DebateRecord | null>(null)
  const [replayIdx, setReplayIdx] = useState(0)
  const [replayPlaying, setReplayPlaying] = useState(false)

  const [keyDialog, setKeyDialog] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [preflightOpen, setPreflightOpen] = useState(false)

  const speech = useSpeechState()
  const { voices, available: voicesAvailable, loading: voicesLoading } = useVoices(voice.engineId)
  const voiceUsable = voice.enabled && voicesAvailable && voices.length > 0

  // Live values for runner callbacks (which outlive renders).
  const live = useRef({ voice, muted, voiceUsable })
  live.current = { voice, muted, voiceUsable }

  // ---------- Voice housekeeping ----------
  useEffect(() => speechQueue.setMuted(muted), [muted])
  useEffect(() => {
    if (!voice.enabled) speechQueue.clear()
  }, [voice.enabled])
  useEffect(() => () => speechQueue.clear(), [])
  // Auto-assign two different voices the first time voices are available.
  useEffect(() => {
    if (!voices.length) return
    const ok = (id: string) => voices.some((v) => v.id === id)
    if (ok(voice.seats[0].voiceId) && ok(voice.seats[1].voiceId)) return
    const [a, b] = pickTwoVoices(voices)
    patchVoice({
      seats: [
        { ...voice.seats[0], voiceId: ok(voice.seats[0].voiceId) ? voice.seats[0].voiceId : a },
        { ...voice.seats[1], voiceId: ok(voice.seats[1].voiceId) ? voice.seats[1].voiceId : b },
      ],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voices])

  const speak = useCallback((seat: Seat, turnIndex: number, text: string) => {
    const v = live.current
    if (!v.voiceUsable || v.muted || !text.trim()) return
    speechQueue.enqueue({ seat, turnIndex, text, engineId: v.voice.engineId, settings: v.voice.seats[seat] })
  }, [])

  const voiceLabel = (s: Seat) => (voiceUsable ? voices.find((v) => v.id === voice.seats[s].voiceId)?.name ?? null : null)

  useEffect(
    () => () => {
      runnerRef.current?.dispose()
      judgeAbort.current?.abort()
    },
    [],
  )

  // ---------- Derived display ----------
  const locked = Boolean(snap) || Boolean(replay)
  const dispDebaters: [DebaterConfig, DebaterConfig] = replay?.players ?? active?.cfg.debaters ?? debaters
  const names: [string, string] = replay?.setup.names ?? active?.cfg.setup.names ?? [
    debaters[0].name.trim() || 'Debater 1',
    debaters[1].name.trim() || 'Debater 2',
  ]
  const turns: DebateTurn[] = replay ? replay.turns.slice(0, replayIdx) : snap?.state.turns ?? []
  const schedule = snap?.state.schedule ?? []
  const nextSlot = snap ? schedule[snap.state.turns.length] ?? null : null
  const stats: [SeatStats, SeatStats] = replay?.stats ?? snap?.stats ?? [emptyStats(), emptyStats()]
  const status = replay ? 'over' : snap?.status ?? 'idle'
  const err = !replay ? snap?.error ?? null : null
  const topic = replay?.setup.topic ?? active?.cfg.setup.topic ?? p.topic

  const liveTurn: LiveTurn | null =
    snap && !replay && snap.thinkingSeat !== null && nextSlot
      ? { seat: snap.thinkingSeat, label: nextSlot.label, round: nextSlot.round, text: snap.partial }
      : null

  const speakingSeat = speech.speaking && speech.speaking.turnIndex >= 0 ? speech.speaking.seat : null
  const statusOf = (s: Seat): DebaterStatus => {
    if (speakingSeat === s) return 'speaking'
    if (replay) return 'idle'
    if (!snap) return 'idle'
    if (err?.seat === s) return 'error'
    if (snap.thinkingSeat === s) return 'thinking'
    if (snap.status === 'over') return 'idle'
    return nextSlot?.seat === s ? 'turn' : 'waiting'
  }
  const spoken = (s: Seat) => turns.filter((t) => t.seat === s && !t.skipped).length
  const words = (s: Seat) => turns.filter((t) => t.seat === s).reduce((a, t) => a + t.words, 0)

  const verdictWinner: Seat | null = replay
    ? replay.judge?.verdict?.winner ?? null
    : judge.verdict && (!active?.cfg.voteOn || vote !== null)
      ? judge.verdict.winner
      : null

  // Preview of the schedule before start.
  const previewSetup: DebateSetup = {
    topic: p.topic,
    format: p.format,
    rounds: p.rounds,
    length: p.length,
    firstSeat: p.first === 'random' ? 0 : p.first,
    names,
    stances: [debaters[0].stance, debaters[1].stance],
    instructions: [debaters[0].instructions, debaters[1].instructions],
    maxTurns: p.maxTurns,
  }
  const previewSchedule = buildSchedule(previewSetup)
  const roundsTotal = active ? effectiveRounds(active.cfg.setup) : replay ? effectiveRounds(replay.setup) : effectiveRounds(previewSetup)

  // ---------- Status pill ----------
  const pill = (() => {
    if (replay) return { text: `Replay · turn ${replayIdx} of ${replay.turns.length}`, tone: 'neutral' as const, live: false }
    if (!snap) return { text: 'Ready · set a topic and two models', tone: 'neutral' as const, live: false }
    if (snap.status === 'over') {
      if (speakingSeat !== null) return { text: `${names[speakingSeat]} speaking · debate complete`, tone: (speakingSeat === 0 ? 'p1' : 'p2') as 'p1' | 'p2', live: true }
      return { text: snap.result?.reason ?? 'Debate complete', tone: 'done' as const, live: false }
    }
    if (snap.status === 'error' && err) return { text: `${names[err.seat]} hit a problem · retry or skip`, tone: 'alert' as const, live: false }
    const slot = nextSlot
    const round = `Round ${slot?.round ?? roundsTotal} of ${roundsTotal}`
    if (speakingSeat !== null && snap.thinkingSeat === null)
      return { text: `${round} · ${names[speakingSeat]} speaking`, tone: (speakingSeat === 0 ? 'p1' : 'p2') as 'p1' | 'p2', live: true }
    const who = slot ? names[slot.seat] : ''
    const state = snap.status === 'paused' ? 'Paused' : snap.thinkingSeat !== null ? (snap.partial ? 'typing' : 'thinking') : 'up next'
    return { text: `${round} · ${who} · ${state}`, tone: ((slot?.seat ?? 0) === 0 ? 'p1' : 'p2') as 'p1' | 'p2', live: snap.status === 'running' }
  })()

  // ---------- Start validation & estimates ----------
  const startReason = (() => {
    if (!p.topic.trim()) return 'Type a debate topic first'
    for (const s of [0, 1] as Seat[]) {
      const d = debaters[s]
      if (!d.modelId.trim()) return `Choose a model for ${names[s]}`
      if (!getProvider(d.providerId).hasCredentials(keys[d.providerId] ?? {})) return `Add credentials for ${names[s]}`
    }
    if (p.judgeOn) {
      if (!p.judge.modelId.trim()) return 'Choose a model for the judge'
      if (!getProvider(p.judge.providerId).hasCredentials(keys[p.judge.providerId] ?? {})) return 'Add credentials for the judge'
    }
    return null
  })()

  const estimates = useMemo(() => {
    const mod = createDebateModule(previewSetup)
    const sys = mod.systemPrompt('debater1').length
    const W = TURN_WORDS[p.length]
    const n = previewSchedule.length
    const seat = (s: Seat) =>
      estimateDebateCost({
        model: getCachedModel(debaters[s].providerId, keys[debaters[s].providerId] ?? {}, debaters[s].modelId),
        effort: debaters[s].effort,
        systemChars: sys,
        wordsPerTurn: W,
        totalTurns: n,
        role: 'debater',
      })
    const j = p.judgeOn
      ? estimateDebateCost({
          model: getCachedModel(p.judge.providerId, keys[p.judge.providerId] ?? {}, p.judge.modelId),
          effort: p.judge.effort,
          systemChars: 800,
          wordsPerTurn: W,
          totalTurns: n,
          role: 'judge',
        })
      : null
    return { seats: [seat(0), seat(1)] as [ReturnType<typeof seat>, ReturnType<typeof seat>], judge: j, turns: n }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debaters, keys, p.length, p.rounds, p.format, p.maxTurns, p.judgeOn, p.judge, preflightOpen])

  // ---------- Debater edits ----------
  const changeDebater = (s: Seat, x: Partial<DebaterConfig>) => {
    if (locked) return
    setDebaters((cur) => {
      const next = [{ ...cur[0] }, { ...cur[1] }] as [DebaterConfig, DebaterConfig]
      next[s] = { ...next[s], ...x }
      if (x.stance && p.autoOpposite) {
        const opp = OPPOSITE[x.stance]
        if (opp) next[1 - s] = { ...next[1 - s], stance: opp }
      }
      return next
    })
  }

  // ---------- Judge ----------
  const startJudge = useCallback(async (rec: DebateRecord, timeoutSec: number) => {
    if (!rec.judge) return
    judgeAbort.current?.abort()
    const ctrl = new AbortController()
    judgeAbort.current = ctrl
    const player = rec.judge.player
    if (!rec.turns.some((t) => !t.skipped)) {
      const error = 'Nothing to judge — no turns were spoken.'
      setJudge({ status: 'error', verdict: null, stats: null, error })
      return
    }
    setJudge({ status: 'running', verdict: null, stats: null })
    try {
      const { verdict, stats: js } = await runJudge({
        judge: player,
        setup: rec.setup,
        turns: rec.turns,
        credentials: readCredentials(player.providerId),
        modelInfo: getCachedModel(player.providerId, readCredentials(player.providerId), player.modelId),
        timeoutMs: Math.max(timeoutSec, APP_CONFIG.debate.judgeTimeoutSec) * 1000,
        signal: ctrl.signal,
      })
      if (ctrl.signal.aborted) return
      setJudge({ status: 'done', verdict, stats: js })
      setRecord((r) => {
        if (!r || r.id !== rec.id) return r
        const next = { ...r, judge: { player, verdict, stats: js } }
        saveMatch(next)
        return next
      })
      playSound('end')
    } catch (e) {
      if (ctrl.signal.aborted) return
      const error = (e as Error)?.message || 'The judge could not be reached.'
      setJudge({ status: 'error', verdict: null, stats: null, error })
      setRecord((r) => {
        if (!r || r.id !== rec.id) return r
        const next = { ...r, judge: { player, verdict: null, stats: null, error } }
        saveMatch(next)
        return next
      })
    }
  }, [])

  // ---------- Lifecycle ----------
  const reset = useCallback(() => {
    runnerRef.current?.dispose()
    runnerRef.current = null
    judgeAbort.current?.abort()
    speechQueue.clear()
    setSnap(null)
    setActive(null)
    setRecord(null)
    setJudge({ status: 'off', verdict: null, stats: null })
    setVote(null)
    setResultOpen(false)
    setReplay(null)
    setReplayPlaying(false)
    setReplayIdx(0)
  }, [])

  const buildLaunch = (): LaunchConfig => {
    const freeze = <T extends PlayerConfig>(pl: T, fallback: string): T => {
      const info = getCachedModel(pl.providerId, readCredentials(pl.providerId), pl.modelId)
      const unsupported = getProvider(pl.providerId).effortSupport(info) === false
      return { ...pl, name: pl.name.trim() || fallback, effort: unsupported ? 'default' : pl.effort }
    }
    const ds: [DebaterConfig, DebaterConfig] = [freeze(debaters[0], 'Debater 1'), freeze(debaters[1], 'Debater 2')]
    if (ds[0].name === ds[1].name) ds[1] = { ...ds[1], name: `${ds[1].name} (2)` }
    const firstSeat: Seat = p.first === 'random' ? (Math.random() < 0.5 ? 0 : 1) : p.first
    return {
      debaters: ds,
      setup: {
        topic: p.topic.trim(),
        format: p.format,
        rounds: p.rounds,
        length: p.length,
        firstSeat,
        names: [ds[0].name, ds[1].name],
        stances: [ds[0].stance, ds[1].stance],
        instructions: [ds[0].instructions, ds[1].instructions],
        maxTurns: p.maxTurns,
      },
      judge: p.judgeOn ? freeze(p.judge, 'Judge') : null,
      voteOn: p.voteOn,
      timeoutSec: p.timeoutSec,
    }
  }

  const launch = (cfg: LaunchConfig) => {
    reset()
    setPreflightOpen(false)
    const id = uid()
    const date = new Date().toISOString()
    const startedAt = Date.now()
    const module = createDebateModule(cfg.setup)
    const runner: Runner = new MatchRunner(
      module,
      {
        players: cfg.debaters,
        sideSeat: SIDE_SEAT as Record<string, Seat>,
        maxPlies: cfg.setup.maxTurns,
        moveTimeoutMs: cfg.timeoutSec * 1000,
        maxIllegalAttempts: APP_CONFIG.defaults.maxIllegalAttempts,
      },
      {
        getCredentials: (pid) => readCredentials(pid),
        getModelInfo: (pid, mid) => getCachedModel(pid, readCredentials(pid), mid),
      },
    )
    runner.speed = p.speed
    runner.beforeNextTurn = () => {
      const v = live.current
      return v.voiceUsable && v.voice.waitForVoice && !v.muted ? speechQueue.drained() : Promise.resolve()
    }
    runner.subscribe(setSnap)
    runner.onMove = (state) => {
      const i = state.turns.length - 1
      const t = state.turns[i]
      if (!t || t.skipped) return
      if (!live.current.voiceUsable) playSound('move')
      speak(t.seat, i, t.text)
    }
    runner.onEnd = (s) => {
      const rec: DebateRecord = {
        id,
        gameId: 'debate',
        date,
        players: cfg.debaters,
        setup: cfg.setup,
        turns: s.state.turns,
        result: s.result ?? { winnerSeat: null, winnerSide: null, reason: 'Debate complete' },
        stats: s.stats,
        durationMs: Date.now() - startedAt,
        judge: cfg.judge ? { player: cfg.judge, verdict: null, stats: null } : undefined,
        vote: cfg.voteOn ? null : undefined,
      }
      saveMatch(rec)
      setRecord(rec)
      if (!cfg.judge) playSound('end')
      // Give the last speech a moment before covering the screen.
      setTimeout(() => setResultOpen(true), live.current.voiceUsable ? 600 : 300)
      if (cfg.judge) void startJudge(rec, cfg.timeoutSec)
    }
    runnerRef.current = runner
    setActive({ id, date, startedAt, cfg })
    setSnap(runner.snapshot)
    playSound('start')
    runner.start()
  }

  const rematch = (swap: boolean) => {
    const cfg = active?.cfg
    if (!cfg) return
    if (!swap) return launch(cfg)
    const ds: [DebaterConfig, DebaterConfig] = [
      { ...cfg.debaters[0], stance: cfg.debaters[1].stance },
      { ...cfg.debaters[1], stance: cfg.debaters[0].stance },
    ]
    launch({ ...cfg, debaters: ds, setup: { ...cfg.setup, stances: [ds[0].stance, ds[1].stance] } })
  }

  const castVote = (v: AudienceVote) => {
    setVote(v)
    setRecord((r) => {
      if (!r) return r
      const next = { ...r, vote: v }
      saveMatch(next)
      return next
    })
  }

  const togglePause = useCallback(() => {
    const r = runnerRef.current
    if (!r) return
    if (r.snapshot.status === 'running') r.pause()
    else if (r.snapshot.status === 'paused') r.resume()
  }, [])

  // ---------- Replay ----------
  const startReplay = useCallback(
    (rec: HistoryRecord) => {
      setHistoryOpen(false)
      if (!isDebateRecord(rec)) return onReplayOther?.(rec)
      reset()
      setReplay(rec)
      setReplayIdx(0)
      setReplayPlaying(true)
    },
    [reset, onReplayOther],
  )

  useEffect(() => {
    if (initialReplay) startReplay(initialReplay)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReplay])

  useEffect(() => {
    if (!replay || !replayPlaying) return
    if (replayIdx >= replay.turns.length) {
      setReplayPlaying(false)
      return
    }
    let cancelled = false
    ;(async () => {
      const v = live.current
      const voiced = v.voiceUsable && !v.muted
      if (voiced) await speechQueue.drained()
      if (cancelled) return
      const prev = replay.turns[replayIdx - 1]
      const factor = p.speed === 'slow' ? 1.6 : p.speed === 'fast' ? 0.3 : 1
      const read = voiced || !prev ? 500 : Math.min(9000, 900 + prev.words * 55) * factor
      await sleep(replayIdx === 0 ? 400 : read)
      if (cancelled) return
      const t = replay.turns[replayIdx]
      setReplayIdx(replayIdx + 1)
      if (!t.skipped) {
        if (voiced) speakReplay(t, replayIdx, replay)
        else playSound('move')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay, replayPlaying, replayIdx, p.speed])

  const speakReplay = (t: DebateTurn, idx: number, _r: DebateRecord) => speak(t.seat, idx, t.text)

  const replayStep = (d: number) => {
    if (!replay) return
    setReplayPlaying(false)
    speechQueue.clear()
    setReplayIdx((i) => Math.max(0, Math.min(replay.turns.length, i + d)))
  }

  // ---------- Busy state for the shell ----------
  const busy = Boolean(snap) && snap!.status !== 'over'
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange])

  // ---------- Keyboard ----------
  const anyModal = keyDialog || settingsOpen || historyOpen || resultOpen || preflightOpen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (anyModal) return
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (e.key === ' ' && !t.closest('button, a')) {
        e.preventDefault()
        if (replay) {
          if (replayPlaying) speechQueue.clear()
          setReplayPlaying((x) => !x)
        } else togglePause()
      } else if (k === 'm') setMuted((m) => !m)
      else if (k === 's') speechQueue.skip()
      else if (replay && e.key === 'ArrowLeft') replayStep(-1)
      else if (replay && e.key === 'ArrowRight') replayStep(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyModal, replay, replayPlaying, togglePause, setMuted])

  // ---------- Pieces ----------
  const firstLabel = p.first === 'random' ? 'A random debater' : names[p.first]
  const setupLocked = locked
  const showJudge = p.judgeOn && !locked
  const activeSetup = replay?.setup ?? active?.cfg.setup ?? null
  const activeJudge = replay?.judge?.player ?? active?.cfg.judge ?? null

  const emptyState = (
    <div className="t-empty">
      <div className="t-empty-art" aria-hidden>
        <span className="pv-b l">
          <i style={{ width: '80%' }} />
          <i style={{ width: '50%' }} />
        </span>
        <span className="pv-b r">
          <i style={{ width: '70%' }} />
          <i style={{ width: '40%' }} />
        </span>
      </div>
      <p>The transcript appears here, turn by turn.</p>
      <ol className="sched">
        {previewSchedule.slice(0, 10).map((s, i) => (
          <li key={i} className={`accent-p${(p.first === 'random' ? i % 2 : s.seat) + 1}`}>
            <span className="seat-dot" />
            {p.first === 'random' ? (i % 2 ? 'Second speaker' : 'First speaker') : names[s.seat]} · {s.label}
          </li>
        ))}
        {previewSchedule.length > 10 && <li className="muted">+{previewSchedule.length - 10} more</li>}
      </ol>
    </div>
  )

  const showResult = Boolean(record) && Boolean(active)

  return (
    <div className="app debate-app">
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
          <button className="icon-btn glass" onClick={() => setHistoryOpen(true)} aria-label="History" title="History">
            <IconHistory />
          </button>
          <button className="icon-btn glass" onClick={() => setSettingsOpen(true)} aria-label="Debate settings" title="Settings & voice">
            <IconSettings />
          </button>
          <button
            className={`icon-btn glass ${voice.enabled ? 'on' : ''}`}
            onClick={() => patchVoice({ enabled: !voice.enabled })}
            aria-label={voice.enabled ? 'Turn voice off' : 'Turn voice on'}
            title={voice.enabled ? 'Voice on' : 'Voice off'}
          >
            <IconMic />
          </button>
          <button className="icon-btn glass" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute (M)' : 'Mute (M)'}>
            {muted ? <IconMute /> : <IconVolume />}
          </button>
        </nav>
      </header>

      <main className="arena debate">
        {([0, 1] as Seat[]).map((s) => (
          <div key={s} className={`slot slot-${s}`}>
            <DebaterPanel
              seat={s}
              debater={dispDebaters[s]}
              onChange={(x) => changeDebater(s, x)}
              locked={locked}
              credentials={keys[dispDebaters[s].providerId] ?? {}}
              onSetKey={() => setKeyDialog(dispDebaters[s].providerId)}
              stats={stats[s]}
              status={statusOf(s)}
              turnsSpoken={spoken(s)}
              words={words(s)}
              winner={verdictWinner === s}
              voiceLabel={voiceLabel(s)}
            />
          </div>
        ))}

        <div className="slot slot-stage">
          <section className="stage-debate glass">
            <div className={`topic-box ${locked ? 'is-locked' : ''}`}>
              <div className="topic-head">
                <span className="eyebrow">Topic</span>
                {locked ? (
                  <span className="lock" title="Locked during the debate">
                    <IconLock size={13} />
                  </span>
                ) : (
                  <button className="chip-btn" onClick={() => patch({ topic: randomTopic(p.topic) })}>
                    <IconDice size={14} /> Random topic
                  </button>
                )}
              </div>
              {locked ? (
                <h2 className="topic-text serif">{topic}</h2>
              ) : (
                <textarea
                  className="topic-input serif"
                  value={p.topic}
                  rows={2}
                  maxLength={300}
                  placeholder="What should they debate? e.g. “Should cities ban cars from their centres?”"
                  aria-label="Debate topic"
                  onChange={(e) => patch({ topic: e.target.value })}
                />
              )}
              {!locked && (
                <div className="topic-examples">
                  {EXAMPLE_TOPICS.map((t) => (
                    <button key={t} className={`ex-chip ${p.topic === t ? 'on' : ''}`} onClick={() => patch({ topic: t })}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!setupLocked ? (
              <div className="setup-bar">
                <div className="setup-item">
                  <span className="setup-label">Format</span>
                  <Seg
                    label="Format"
                    value={p.format}
                    onChange={(v) => patch({ format: v })}
                    options={[
                      { id: 'structured', label: 'Structured', title: 'Opening statements, rebuttals, closing statements' },
                      { id: 'freeflow', label: 'Free-flow', title: 'Alternating turns' },
                    ]}
                  />
                </div>
                <div className="setup-item">
                  <span className="setup-label">Rounds</span>
                  <div className="stepper">
                    <button onClick={() => patch({ rounds: Math.max(p.format === 'structured' ? 2 : 1, p.rounds - 1) })} aria-label="Fewer rounds">
                      −
                    </button>
                    <span className="mono">{p.rounds}</span>
                    <button onClick={() => patch({ rounds: Math.min(12, p.rounds + 1) })} aria-label="More rounds">
                      +
                    </button>
                  </div>
                </div>
                <div className="setup-item">
                  <span className="setup-label">Turn length</span>
                  <Seg
                    label="Turn length"
                    value={p.length}
                    onChange={(v) => patch({ length: v })}
                    options={(['short', 'medium', 'long'] as TurnLength[]).map((l) => ({ id: l, label: l[0].toUpperCase() + l.slice(1), title: `~${TURN_WORDS[l]} words` }))}
                  />
                </div>
                <div className="setup-item">
                  <span className="setup-label">First speaker</span>
                  <Seg<string>
                    label="Who speaks first"
                    value={String(p.first)}
                    onChange={(v) => patch({ first: v === 'random' ? 'random' : (Number(v) as Seat) })}
                    options={[
                      { id: '0', label: names[0].length > 12 ? 'Debater 1' : names[0] },
                      { id: '1', label: names[1].length > 12 ? 'Debater 2' : names[1] },
                      { id: 'random', label: 'Random' },
                    ]}
                  />
                </div>
                <div className="setup-toggles">
                  <label className="toggle" title="Changing one stance sets the other to the opposite">
                    <input type="checkbox" checked={p.autoOpposite} onChange={(e) => patch({ autoOpposite: e.target.checked })} />
                    <span className="toggle-track" />
                    Opposite stances
                  </label>
                  <label className="toggle">
                    <input type="checkbox" checked={p.judgeOn} onChange={(e) => patch({ judgeOn: e.target.checked })} />
                    <span className="toggle-track" />
                    <IconGavel size={14} /> AI judge
                  </label>
                  <label className="toggle">
                    <input type="checkbox" checked={p.voteOn} onChange={(e) => patch({ voteOn: e.target.checked })} />
                    <span className="toggle-track" />
                    <IconUsers size={14} /> Audience vote
                  </label>
                </div>
                {showJudge && (
                  <div className="judge-card accent-judge">
                    <div className="judge-head">
                      <span className="seat-tag">
                        <IconGavel size={13} /> Judge
                      </span>
                      <span className="muted small">Reads the full transcript at the end. Never sees private instructions.</span>
                    </div>
                    <KeyStatus providerId={p.judge.providerId} credentials={keys[p.judge.providerId] ?? {}} onSetKey={() => setKeyDialog(p.judge.providerId)} />
                    <ModelFields
                      player={p.judge}
                      onChange={(x) => patch({ judge: { ...p.judge, ...x } })}
                      locked={false}
                      credentials={keys[p.judge.providerId] ?? {}}
                      accent="judge"
                      idPrefix="judge"
                    />
                  </div>
                )}
              </div>
            ) : (
              activeSetup && (
                <div className="setup-summary small">
                  <IconLock size={12} />
                  <span>{activeSetup.format === 'structured' ? 'Structured' : 'Free-flow'}</span>
                  <span>·</span>
                  <span>{effectiveRounds(activeSetup)} rounds</span>
                  <span>·</span>
                  <span>~{TURN_WORDS[activeSetup.length]} words/turn</span>
                  <span>·</span>
                  <span>
                    {STANCE_LABEL[activeSetup.stances[0]]} vs {STANCE_LABEL[activeSetup.stances[1]]}
                  </span>
                  {activeJudge && (
                    <>
                      <span>·</span>
                      <span className="ellipsis" title={activeJudge.modelId}>
                        <IconGavel size={12} /> {activeJudge.modelId}
                      </span>
                    </>
                  )}
                </div>
              )
            )}

            <Transcript
              names={names}
              turns={turns}
              live={liveTurn}
              error={err}
              errorSlot={err ? nextSlot : null}
              speakingIndex={speech.speaking && speech.speaking.turnIndex >= 0 ? speech.speaking.turnIndex : null}
              onRetry={() => runnerRef.current?.retry()}
              onSkip={() => runnerRef.current?.skip()}
              empty={emptyState}
            />
          </section>
        </div>
      </main>

      <div className="dock-wrap">
        {replay ? (
          <div className="dock glass">
            <span className="dock-label">Replay</span>
            <button className="icon-btn" onClick={() => replayStep(-1)} aria-label="Previous turn">
              <IconChevronLeft />
            </button>
            <button
              className="primary-btn small"
              onClick={() => {
                if (replayPlaying) speechQueue.clear()
                else if (replayIdx >= replay.turns.length) setReplayIdx(0)
                setReplayPlaying((x) => !x)
              }}
            >
              {replayPlaying ? <IconPause /> : <IconPlay />}
              {replayPlaying ? 'Pause' : 'Play'}
            </button>
            <button className="icon-btn" onClick={() => replayStep(1)} aria-label="Next turn">
              <IconChevronRight />
            </button>
            <span className="dock-counter mono">
              {replayIdx}/{replay.turns.length}
            </span>
            <label className="toggle" title="Read the replay aloud">
              <input type="checkbox" checked={voice.enabled} onChange={(e) => patchVoice({ enabled: e.target.checked })} />
              <span className="toggle-track" />
              <IconMic size={14} /> Voice
            </label>
            <button className="dock-btn" onClick={reset}>
              <IconClose size={15} /> Exit
            </button>
          </div>
        ) : status === 'idle' ? (
          <div className="dock glass">
            <button
              className="dock-btn"
              onClick={() =>
                setDebaters((cur) => [
                  { ...cur[0], stance: cur[1].stance },
                  { ...cur[1], stance: cur[0].stance },
                ])
              }
              title="Swap the two stances"
            >
              <IconSwap size={16} /> Swap stances
            </button>
            <button className="primary-btn start" onClick={() => setPreflightOpen(true)} disabled={Boolean(startReason)} title={startReason ?? 'Start the debate'}>
              <IconPlay size={18} /> Start Debate
            </button>
            <SpeedControl speed={p.speed} onSpeed={(sp) => patch({ speed: sp })} />
          </div>
        ) : status === 'over' ? (
          <div className="dock glass">
            {speakingSeat !== null && (
              <button className="dock-btn" onClick={() => speechQueue.skip()} title="Skip speech (S)">
                <IconSkipSpeech size={16} /> Skip speech
              </button>
            )}
            <button className="dock-btn" onClick={() => setResultOpen(true)} disabled={!showResult}>
              <IconTrophy size={16} /> Result
            </button>
            <button className="dock-btn" onClick={() => rematch(false)}>
              <IconRefresh size={15} /> Rematch
            </button>
            <button className="primary-btn" onClick={reset}>
              New debate
            </button>
          </div>
        ) : (
          <div className="dock glass">
            {status === 'error' ? (
              <span className="dock-label alert">Waiting for retry or skip</span>
            ) : (
              <button className="primary-btn" onClick={togglePause} title="Space">
                {status === 'paused' ? <IconPlay size={17} /> : <IconPause size={17} />}
                {status === 'paused' ? 'Resume' : 'Pause'}
              </button>
            )}
            <SpeedControl
              speed={p.speed}
              onSpeed={(sp) => {
                patch({ speed: sp })
                if (runnerRef.current) runnerRef.current.speed = sp
              }}
            />
            {voiceUsable && (
              <button className="dock-btn" onClick={() => speechQueue.skip()} disabled={speakingSeat === null} title="Skip speech (S)">
                <IconSkipSpeech size={16} /> Skip speech
              </button>
            )}
            <ConfirmButton onConfirm={() => runnerRef.current?.stop('Debate ended early')}>
              <IconStop size={13} /> End Debate
            </ConfirmButton>
          </div>
        )}
        {startReason && status === 'idle' && !replay && <div className="dock-hint small">{startReason}</div>}
        {voice.enabled && !voiceUsable && !voicesLoading && (
          <div className="dock-hint small">No speech voices are available in this browser — the debate runs in text mode.</div>
        )}
        <footer className="debate-foot small">AI debates are generated text and may be inaccurate or one-sided. Do not treat them as facts.</footer>
      </div>

      <KeyDialog providerId={keyDialog} onClose={() => setKeyDialog(null)} />
      <DebateSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        locked={Boolean(snap)}
        limits={{ maxTurns: p.maxTurns, timeoutSec: p.timeoutSec }}
        onLimits={(x) => patch(x)}
        voice={voice}
        onVoice={patchVoice}
        voices={voices}
        voicesAvailable={voicesAvailable}
        voicesLoading={voicesLoading}
        names={names}
      />
      <HistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} history={history} onReplay={startReplay} onClear={() => setHistory([])} />
      <DebatePreflight
        open={preflightOpen}
        onClose={() => setPreflightOpen(false)}
        onConfirm={() => launch(buildLaunch())}
        topic={p.topic}
        debaters={debaters}
        judge={p.judgeOn ? p.judge : null}
        estimates={estimates.seats}
        judgeEstimate={estimates.judge}
        turns={estimates.turns}
        timeoutSec={p.timeoutSec}
        firstLabel={firstLabel}
        voiceOn={voiceUsable}
      />
      {showResult && record && (
        <DebateResultModal
          open={resultOpen}
          onClose={() => setResultOpen(false)}
          record={record}
          judge={judge}
          voteOn={Boolean(active?.cfg.voteOn)}
          vote={vote}
          onVote={castVote}
          onRetryJudge={() => record && void startJudge(record, active?.cfg.timeoutSec ?? p.timeoutSec)}
          onRematch={() => rematch(false)}
          onRematchSwap={() => rematch(true)}
          onNew={reset}
        />
      )}
    </div>
  )
}
