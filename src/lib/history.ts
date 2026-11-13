import { APP_CONFIG } from '../config/app'
import type { MatchResult, PlayerConfig, SeatStats } from '../core/types'
import type { JudgeVerdict } from '../games/debate/judge'
import type { DebateSetup, DebateTurn, DebaterConfig } from '../games/debate/module'
import type { OverloadAction, OverloadOptions, OverloadRoundResult } from '../games/overload/rules'
import type { UnoAction, UnoState } from '../games/uno/rules'
import { readStore, writeStore } from './storage'

export interface ChessMatchRecord {
  id: string
  gameId: string
  date: string
  players: [PlayerConfig, PlayerConfig]
  /** Seat that played White. */
  whiteSeat: 0 | 1
  sans: string[]
  comments: string[]
  result: MatchResult
  stats: [SeatStats, SeatStats]
  pgn: string
  /** Playing style per seat (matches saved before styles existed have none). */
  styles?: [StyleRef, StyleRef]
  /** Whether styles changed move choice or comments only. */
  styleAffects?: 'moves' | 'comments'
}

export interface StyleRef {
  id: string
  name: string
}

export interface C4MatchRecord {
  id: string
  gameId: 'connect4'
  date: string
  players: [PlayerConfig, PlayerConfig]
  /** Seat that moved first (plays X). */
  firstSeat: 0 | 1
  /** 0-based columns in play order. */
  cols: number[]
  comments: string[]
  /** Number of leading moves placed by "Random opening". */
  randomMoves: number
  result: MatchResult
  stats: [SeatStats, SeatStats]
}

export interface PentagoMatchRecord {
  id: string
  gameId: 'pentago'
  date: string
  players: [PlayerConfig, PlayerConfig]
  /** Seat that moved first (plays X). */
  firstSeat: 0 | 1
  /** Turns in play order: placement cell (0-35, row-major), quadrant (0-3), direction. */
  moves: Array<{ cell: number; quad: 0 | 1 | 2 | 3; dir: 'cw' | 'ccw' }>
  comments: string[]
  /** Number of leading turns placed by "Random opening". */
  randomMoves: number
  result: MatchResult
  stats: [SeatStats, SeatStats]
}

export interface OverloadMatchRecord {
  id: string
  gameId: 'overload'
  date: string
  players: [PlayerConfig, PlayerConfig]
  options: OverloadOptions
  actions: Array<{ action: OverloadAction; comment: string }>
  result: MatchResult
  stats: [SeatStats, SeatStats]
  roundResults: OverloadRoundResult[]
  styles: [StyleRef, StyleRef]
  styleAffects: 'moves' | 'comments'
  spectator: boolean
}

export interface UnoMatchRecord {
  id: string
  gameId: 'uno'
  date: string
  players: PlayerConfig[]
  initialState: UnoState
  actions: UnoAction[]
  result: { winnerSeat: number | null; winnerSide: string | null; reason: string }
  stats: SeatStats[]
  spectatorSeesHands: boolean
}

/** Kept for existing imports: a chess record. */
export type MatchRecord = ChessMatchRecord

export type AudienceVote = 0 | 1 | 'tie' | 'skipped' | null

export interface DebateRecord {
  id: string
  gameId: 'debate'
  date: string
  players: [DebaterConfig, DebaterConfig]
  setup: DebateSetup
  turns: DebateTurn[]
  result: MatchResult
  stats: [SeatStats, SeatStats]
  durationMs: number
  judge?: {
    player: PlayerConfig
    verdict: JudgeVerdict | null
    stats: SeatStats | null
    error?: string
  }
  vote?: AudienceVote
}

export type HistoryRecord = ChessMatchRecord | DebateRecord | C4MatchRecord | PentagoMatchRecord | OverloadMatchRecord | UnoMatchRecord

export const isDebateRecord = (r: HistoryRecord): r is DebateRecord => r.gameId === 'debate'
export const isC4Record = (r: HistoryRecord): r is C4MatchRecord => r.gameId === 'connect4'
export const isPentagoRecord = (r: HistoryRecord): r is PentagoMatchRecord => r.gameId === 'pentago'
export const isOverloadRecord = (r: HistoryRecord): r is OverloadMatchRecord => r.gameId === 'overload'
export const isUnoRecord = (r: HistoryRecord): r is UnoMatchRecord => r.gameId === 'uno'
export const isChessRecord = (r: HistoryRecord): r is ChessMatchRecord => !isDebateRecord(r) && !isC4Record(r) && !isPentagoRecord(r) && !isOverloadRecord(r) && !isUnoRecord(r)

export type RecordKind = 'chess' | 'debate' | 'connect4' | 'pentago' | 'overload' | 'uno'
export const recordKind = (r: HistoryRecord): RecordKind =>
  isDebateRecord(r) ? 'debate' : isC4Record(r) ? 'connect4' : isPentagoRecord(r) ? 'pentago' : isOverloadRecord(r) ? 'overload' : isUnoRecord(r) ? 'uno' : 'chess'
export const KIND_LABEL: Record<RecordKind, string> = { chess: 'Chess', debate: 'Debate', connect4: 'Connect 4', pentago: 'Pentago', overload: 'Overload', uno: 'Uno' }

export const HISTORY_STORE = 'history'

/** Chess and debate records share one list (newest first). */
export function saveMatch(rec: HistoryRecord) {
  const list = readStore<HistoryRecord[]>(HISTORY_STORE, [])
  const next = [rec, ...list.filter((r) => r.id !== rec.id)].slice(0, APP_CONFIG.defaults.historyLimit)
  writeStore(HISTORY_STORE, next)
}
