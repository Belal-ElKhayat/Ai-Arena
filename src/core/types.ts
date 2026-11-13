import type { ChatMessage, Effort } from '../providers/types'

export type Seat = 0 | 1

export interface PlayerConfig {
  name: string
  providerId: string
  modelId: string
  /** Optional display label for the model. */
  modelLabel?: string
  effort: Effort
  /** Chess playing style id (chess only). */
  styleId?: string
  /** Private custom style text when styleId is 'custom' (chess only). */
  customStyle?: string
}

export type ParseResult<M> =
  | { ok: true; move: M; comment: string }
  /** `halt` stops the turn immediately (no automatic retry) and offers Retry / Skip. */
  | { ok: false; error: string; halt?: boolean }

/** Extra facts about a reply that a module may use while parsing. */
export interface ReplyMeta {
  refused?: boolean
  finishReason?: string
}

export type Outcome =
  | { over: false }
  | { over: true; winnerSide: string | null; reason: string }

/**
 * Every game (chess, Connect Four, Uno, Debate...) implements this interface
 * and plugs into the shared MatchRunner.
 */
export interface GameModule<S, M> {
  id: string
  title: string
  /** Side identifiers in turn order, e.g. ['white', 'black']. */
  sides: readonly [string, string]
  createState(): S
  currentSide(state: S): string
  /** Number of moves (plies) played so far. */
  plyCount(state: S): number
  systemPrompt(side: string): string
  turnPrompt(state: S, side: string): string
  /** Message sent back after an invalid reply. */
  correctionPrompt(state: S, error: string, attempt: number): string
  parseReply(state: S, text: string, meta?: ReplyMeta): ParseResult<M>
  applyMove(state: S, move: M, comment: string): S
  outcome(state: S): Outcome
  /** Outcome when the ply limit is reached. */
  limitOutcome(state: S): Outcome & { over: true }

  // ---- Optional hooks (chess uses none of these) ----
  /** Stream replies token by token when the provider supports it. */
  streaming?: boolean
  /** If present, a stuck turn can be skipped; returns the state after the skip. */
  skipTurn?(state: S, side: string, reason: string): S
  /** What happens after maxIllegalAttempts invalid replies. Default 'forfeit'. */
  exhaustedPolicy?: 'forfeit' | 'halt'
  /** Games with round-based scoring may record an invalid-turn forfeit and continue. */
  forfeitInvalid?(state: S, side: string, reason: string): S
}

export interface SeatStats {
  promptTokens: number
  completionTokens: number
  /** null when the cost could not be determined. */
  costUsd: number | null
  costKnown: boolean
  timeMs: number
  requests: number
  illegalReplies: number
  lastComment: string
}

export type RunnerStatus = 'idle' | 'running' | 'paused' | 'error' | 'over'

export interface RunnerError {
  seat: Seat
  message: string
  retryable: boolean
  /** True when the game supports skipping this turn. */
  skippable?: boolean
  kind?: 'provider' | 'timeout' | 'refusal' | 'invalid'
  /** Text the model produced before the turn was stopped, if any. */
  partial?: string
}

export interface MatchResult {
  winnerSeat: Seat | null
  winnerSide: string | null
  reason: string
}

export interface RunnerSnapshot<S> {
  status: RunnerStatus
  state: S
  thinkingSeat: Seat | null
  attempt: number
  stats: [SeatStats, SeatStats]
  error: RunnerError | null
  result: MatchResult | null
  pauseRequested: boolean
  /** Text streamed so far for the current turn (streaming games only). */
  partial: string
}

export interface MatchSetup {
  players: [PlayerConfig, PlayerConfig]
  /** Which seat plays which side; sideSeat['white'] = 0 means Player 1 is White. */
  sideSeat: Record<string, Seat>
  maxPlies: number
  moveTimeoutMs: number
  maxIllegalAttempts: number
}

export type { ChatMessage }
