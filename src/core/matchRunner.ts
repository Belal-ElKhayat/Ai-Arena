import { APP_CONFIG, type Speed } from '../config/app'
import { getProvider } from '../providers/registry'
import type { ChatMessage, Credentials, ModelInfo } from '../providers/types'
import { ProviderError } from '../providers/types'
import type {
  GameModule,
  ReplyMeta,
  MatchResult,
  MatchSetup,
  RunnerSnapshot,
  Seat,
  SeatStats,
} from './types'

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

export interface RunnerDeps {
  getCredentials(providerId: string): Credentials
  getModelInfo(providerId: string, modelId: string): ModelInfo | undefined
}

type Listener<S> = (snap: RunnerSnapshot<S>) => void

/**
 * Game-agnostic match loop: asks the seat to move, validates through the game
 * module, retries invalid replies, handles errors/timeouts, pause and speed.
 */
export class MatchRunner<S, M> {
  private snap: RunnerSnapshot<S>
  private listeners = new Set<Listener<S>>()
  private abort: AbortController | null = null
  private loopActive = false
  private disposed = false
  private wake: (() => void) | null = null
  speed: Speed = 'normal'
  onMove?: (state: S, seat: Seat) => void
  onEnd?: (snap: RunnerSnapshot<S>) => void
  /**
   * Awaited before each new turn is requested (after the first). Debate uses it
   * to wait for the voice queue so two speakers never overlap.
   */
  beforeNextTurn?: () => Promise<void>

  constructor(
    readonly game: GameModule<S, M>,
    readonly setup: MatchSetup,
    private deps: RunnerDeps,
  ) {
    this.snap = {
      status: 'idle',
      state: game.createState(),
      thinkingSeat: null,
      attempt: 0,
      stats: [emptyStats(), emptyStats()],
      error: null,
      result: null,
      pauseRequested: false,
      partial: '',
    }
  }

  get snapshot() {
    return this.snap
  }

  subscribe(fn: Listener<S>) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private set(patch: Partial<RunnerSnapshot<S>>) {
    this.snap = { ...this.snap, ...patch }
    this.listeners.forEach((l) => l(this.snap))
  }

  private seatFor(side: string): Seat {
    return this.setup.sideSeat[side] ?? 0
  }

  start() {
    if (this.snap.status !== 'idle') return
    this.set({ status: 'running' })
    void this.loop()
  }

  pause() {
    if (this.snap.status === 'running') this.set({ status: 'paused', pauseRequested: true })
  }

  resume() {
    if (this.snap.status === 'paused') {
      this.set({ status: 'running', pauseRequested: false })
      this.wake?.()
      if (!this.loopActive) void this.loop()
    }
  }

  retry() {
    if (this.snap.status !== 'error') return
    this.set({ status: 'running', error: null })
    void this.loop()
  }

  /** Skip the stuck turn (games with skipTurn only) and continue. */
  skip() {
    const err = this.snap.error
    if (this.snap.status !== 'error' || !err?.skippable || !this.game.skipTurn) return
    const side = this.game.currentSide(this.snap.state)
    const next = this.game.skipTurn(this.snap.state, side, err.message)
    this.set({ state: next, status: 'running', error: null, partial: '', thinkingSeat: null, attempt: 0 })
    this.onMove?.(next, err.seat)
    void this.loop()
  }

  /** End the match now without a winner (e.g. "End Debate"). */
  stop(reason: string) {
    if (this.snap.status === 'over' || this.snap.status === 'idle') return
    this.finish({ winnerSeat: null, winnerSide: null, reason })
    this.wake?.()
  }

  resign(seat: Seat) {
    if (this.snap.status === 'over') return
    const other: Seat = seat === 0 ? 1 : 0
    this.finish({
      winnerSeat: other,
      winnerSide: this.sideOfSeat(other),
      reason: `${this.setup.players[seat].name} resigned`,
    })
  }

  dispose() {
    this.disposed = true
    this.abort?.abort()
    this.wake?.()
    this.listeners.clear()
  }

  /** Read through a method so TypeScript doesn't narrow status across awaits. */
  private isOver() {
    return this.snap.status === 'over'
  }

  private sideOfSeat(seat: Seat): string | null {
    return Object.entries(this.setup.sideSeat).find(([, s]) => s === seat)?.[0] ?? null
  }

  private finish(result: MatchResult) {
    this.abort?.abort()
    this.set({ status: 'over', result, thinkingSeat: null, error: null, partial: '' })
    this.onEnd?.(this.snap)
  }

  private wait(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        this.wake = null
        resolve()
      }, ms)
      this.wake = () => {
        clearTimeout(t)
        this.wake = null
        resolve()
      }
    })
  }

  private async waitWhilePaused() {
    while (this.snap.status === 'paused' && !this.disposed) {
      await new Promise<void>((resolve) => (this.wake = resolve))
    }
  }

  private async loop() {
    if (this.loopActive) return
    this.loopActive = true
    let first = true
    try {
      while (!this.disposed) {
        if (!first && this.beforeNextTurn) {
          await this.beforeNextTurn()
          if (this.disposed) break
        }
        first = false
        await this.waitWhilePaused()
        if (this.snap.status !== 'running') break

        const outcome = this.game.outcome(this.snap.state)
        if (outcome.over) {
          this.finish({
            winnerSide: outcome.winnerSide,
            winnerSeat: outcome.winnerSide ? this.seatFor(outcome.winnerSide) : null,
            reason: outcome.reason,
          })
          break
        }
        if (this.game.plyCount(this.snap.state) >= this.setup.maxPlies) {
          const lo = this.game.limitOutcome(this.snap.state)
          this.finish({
            winnerSide: lo.winnerSide,
            winnerSeat: lo.winnerSide ? this.seatFor(lo.winnerSide) : null,
            reason: lo.reason,
          })
          break
        }

        const ok = await this.playTurn()
        if (!ok || this.disposed) break
        if (this.isOver()) break

        await this.wait(APP_CONFIG.speeds[this.speed])
      }
    } finally {
      this.loopActive = false
    }
  }

  /** Returns false when the loop should stop (error, forfeit). */
  private async playTurn(): Promise<boolean> {
    const state = this.snap.state
    const side = this.game.currentSide(state)
    const seat = this.seatFor(side)
    const player = this.setup.players[seat]
    const provider = getProvider(player.providerId)
    const credentials = this.deps.getCredentials(player.providerId)
    const modelInfo = this.deps.getModelInfo(player.providerId, player.modelId)

    const messages: ChatMessage[] = [
      { role: 'system', content: this.game.systemPrompt(side) },
      { role: 'user', content: this.game.turnPrompt(state, side) },
    ]
    const skippable = Boolean(this.game.skipTurn)

    const max = this.setup.maxIllegalAttempts
    for (let attempt = 1; attempt <= max; attempt++) {
      if (this.disposed || this.snap.status === 'over') return false
      this.set({ thinkingSeat: seat, attempt, partial: '' })

      const ctrl = new AbortController()
      this.abort = ctrl
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        ctrl.abort()
      }, this.setup.moveTimeoutMs)
      const t0 = performance.now()
      let text = ''
      let meta: ReplyMeta = {}
      let streamed = ''
      let flushTimer: ReturnType<typeof setTimeout> | null = null
      const flush = () => {
        flushTimer = null
        if (!this.disposed && this.snap.thinkingSeat === seat) this.set({ partial: streamed })
      }
      try {
        const req = {
          model: player.modelId,
          messages,
          effort: player.effort,
          credentials,
          signal: ctrl.signal,
          modelInfo,
        }
        let res
        if (this.game.streaming && provider.streamMove) {
          try {
            res = await provider.streamMove(req, (piece) => {
              streamed += piece
              // Throttle snapshot updates to ~25 per second.
              if (!flushTimer) flushTimer = setTimeout(flush, 40)
            })
          } catch (e) {
            // Some endpoints reject streaming options: fall back to a normal request once.
            if (e instanceof ProviderError && e.kind === 'bad_request' && !streamed && !ctrl.signal.aborted) {
              res = await provider.sendMove(req)
            } else throw e
          }
        } else {
          res = await provider.sendMove(req)
        }
        if (flushTimer) clearTimeout(flushTimer)
        text = res.text
        meta = { refused: res.refused, finishReason: res.finishReason }
        this.addUsage(seat, res.usage.promptTokens, res.usage.completionTokens, res.usage.costUsd, modelInfo, performance.now() - t0)
      } catch (err) {
        clearTimeout(timer)
        if (flushTimer) clearTimeout(flushTimer)
        this.addTime(seat, performance.now() - t0)
        if (this.disposed || this.isOver()) return false
        const message = timedOut
          ? `No reply within ${Math.round(this.setup.moveTimeoutMs / 1000)}s (per-move timeout).`
          : err instanceof ProviderError
            ? err.message
            : (err as Error)?.name === 'AbortError'
              ? 'Request was cancelled.'
              : `Unexpected error: ${(err as Error)?.message ?? String(err)}`
        this.set({
          status: 'error',
          thinkingSeat: null,
          partial: '',
          error: {
            seat,
            message,
            retryable: err instanceof ProviderError ? err.retryable : true,
            skippable,
            kind: timedOut ? 'timeout' : 'provider',
            partial: streamed || undefined,
          },
        })
        return false
      } finally {
        clearTimeout(timer)
        this.abort = null
      }

      if (this.isOver() || this.disposed) return false

      const parsed = this.game.parseReply(state, text, meta)
      if (parsed.ok) {
        const next = this.game.applyMove(state, parsed.move, parsed.comment)
        const stats = [...this.snap.stats] as RunnerSnapshot<S>['stats']
        stats[seat] = { ...stats[seat], lastComment: parsed.comment }
        this.set({ state: next, stats, thinkingSeat: null, attempt: 0, partial: '' })
        this.onMove?.(next, seat)
        return true
      }

      const stats = [...this.snap.stats] as RunnerSnapshot<S>['stats']
      stats[seat] = { ...stats[seat], illegalReplies: stats[seat].illegalReplies + 1 }
      this.set({ stats })
      if (parsed.halt || (attempt === max && this.game.exhaustedPolicy === 'halt')) {
        this.set({
          status: 'error',
          thinkingSeat: null,
          partial: '',
          error: {
            seat,
            message: parsed.error,
            retryable: true,
            skippable,
            kind: parsed.halt ? 'refusal' : 'invalid',
            partial: text || undefined,
          },
        })
        return false
      }
      messages.push({ role: 'assistant', content: text || '(empty reply)' })
      messages.push({ role: 'user', content: this.game.correctionPrompt(state, parsed.error, attempt) })

      if (attempt === max) {
        if (this.game.forfeitInvalid) {
          const next = this.game.forfeitInvalid(state, side, parsed.error)
          this.set({ state: next, thinkingSeat: null, attempt: 0, partial: '' })
          this.onMove?.(next, seat)
          return true
        }
        const other: Seat = seat === 0 ? 1 : 0
        this.finish({
          winnerSeat: other,
          winnerSide: this.sideOfSeat(other),
          reason: `${player.name} forfeited after ${max} invalid replies (last: ${parsed.error})`,
        })
        return false
      }
    }
    return false
  }

  private addTime(seat: Seat, ms: number) {
    const stats = [...this.snap.stats] as RunnerSnapshot<S>['stats']
    stats[seat] = { ...stats[seat], timeMs: stats[seat].timeMs + ms }
    this.set({ stats })
  }

  private addUsage(
    seat: Seat,
    p: number,
    c: number,
    reportedCost: number | null,
    model: ModelInfo | undefined,
    ms: number,
  ) {
    const s = this.snap.stats[seat]
    let cost: number | null = reportedCost
    if (cost === null && model && model.pricing.prompt !== null && model.pricing.completion !== null) {
      cost = p * model.pricing.prompt + c * model.pricing.completion
    }
    const stats = [...this.snap.stats] as RunnerSnapshot<S>['stats']
    stats[seat] = {
      ...s,
      promptTokens: s.promptTokens + p,
      completionTokens: s.completionTokens + c,
      costUsd: cost === null ? s.costUsd : (s.costUsd ?? 0) + cost,
      costKnown: s.costKnown && cost !== null,
      timeMs: s.timeMs + ms,
      requests: s.requests + 1,
    }
    this.set({ stats })
  }
}
