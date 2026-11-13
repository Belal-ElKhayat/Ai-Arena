import { Chess, type Move } from 'chess.js'
import type { GameModule, Outcome } from '../../core/types'

export interface ChessMoveRecord {
  san: string
  from: string
  to: string
  color: 'w' | 'b'
  piece: string
  captured?: string
  flags: string
  comment: string
  fen: string
}

export interface ChessState {
  chess: Chess
  moves: ChessMoveRecord[]
  /** Bumped on every move so React sees a new object. */
  version: number
}

export type ChessMoveInput = string | { from: string; to: string; promotion?: string }

const sideName = (c: 'w' | 'b') => (c === 'w' ? 'white' : 'black')

function historyText(moves: ChessMoveRecord[]) {
  if (!moves.length) return '(none — this is the first move)'
  const parts: string[] = []
  for (let i = 0; i < moves.length; i += 2) {
    const n = i / 2 + 1
    parts.push(`${n}. ${moves[i].san}${moves[i + 1] ? ' ' + moves[i + 1].san : ''}`)
  }
  return parts.join(' ')
}

/** Normalise the many ways a model might write a move. */
export function normaliseMoveToken(raw: string): string {
  let t = raw.trim()
  t = t.replace(/[`*_"']/g, '')
  t = t.replace(/^\d+\.(\.\.)?\s*/, '') // "12." or "12..."
  t = t.replace(/^\.\.\.\s*/, '')
  t = t.replace(/[.,;:!?)]+$/, '')
  t = t.replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O').replace(/o-o-o/g, 'O-O-O').replace(/o-o/g, 'O-O')
  t = t.replace(/(e\.p\.|ep)$/i, '')
  t = t.replace(/[+#]+$/, '')
  return t.trim()
}

export function tryMove(chess: Chess, token: string): Move | null {
  const t = normaliseMoveToken(token)
  if (!t) return null
  const legal = chess.moves({ verbose: true })
  const bySan = legal.find((m) => m.san.replace(/[+#]/g, '') === t)
  if (bySan) return bySan
  // Accept UCI-style "e2e4" / "e7e8q" as a courtesy.
  const uci = t.toLowerCase().match(/^([a-h][1-8])-?([a-h][1-8])=?([qrbn])?$/)
  if (uci) {
    const m = legal.find((l) => l.from === uci[1] && l.to === uci[2] && (!l.promotion || l.promotion === (uci[3] ?? 'q')))
    if (m) return m
  }
  // Promotion without "=" (e8Q) or lowercase piece.
  const promo = t.match(/^([a-h]x?[a-h]?[18])=?([QRBNqrbn])$/)
  if (promo) {
    const san = `${promo[1]}=${promo[2].toUpperCase()}`
    const m = legal.find((l) => l.san.replace(/[+#]/g, '') === san)
    if (m) return m
  }
  return null
}

/**
 * System prompt. An optional style block sits between the role and the reply
 * format so the strict MOVE / COMMENT instructions are always the last thing
 * the model reads.
 */
export function chessSystemPrompt(side: string, style?: { text: string; name: string; commentsOnly: boolean }) {
  const lines = [
    `You are a strong chess player playing as ${side.toUpperCase()} in a game against another AI.`,
    'On every turn you receive the position (FEN), the move history (SAN) and the complete list of legal moves.',
  ]
  if (style?.text.trim()) {
    lines.push(
      '',
      style.commentsOnly
        ? `PERSONALITY (${style.name}): this affects your COMMENT only. Choose your move purely on chess strength, as if you had no personality:`
        : `PLAYING STYLE (${style.name}): let this shape which legal move you prefer and the tone of your comment:`,
      `<style>\n${style.text.trim()}\n</style>`,
      'The style never changes the rules or the reply format. You must still choose a move from the legal list. Personality belongs in the COMMENT line only.',
      '',
    )
  }
  lines.push(
    'Pick exactly ONE move from the legal move list.',
    'Reply in EXACTLY this format and nothing else:',
    'MOVE: <move in SAN, copied exactly from the legal list>',
    'COMMENT: <one short sentence about your move, max 20 words>',
  )
  return lines.join('\n')
}

export const chessModule: GameModule<ChessState, Move> = {
  id: 'chess',
  title: 'Chess',
  sides: ['white', 'black'],

  createState: () => ({ chess: new Chess(), moves: [], version: 0 }),

  currentSide: (s) => sideName(s.chess.turn()),

  plyCount: (s) => s.moves.length,

  systemPrompt: (side) => chessSystemPrompt(side),

  turnPrompt: (s, side) => {
    const legal = s.chess.moves()
    const n = Math.floor(s.moves.length / 2) + 1
    return [
      `You are ${side.toUpperCase()}. It is move ${n}, ${side} to play.`,
      s.chess.inCheck() ? 'You are IN CHECK.' : '',
      `FEN: ${s.chess.fen()}`,
      `Move history: ${historyText(s.moves)}`,
      `Legal moves (${legal.length}): ${legal.join(' ')}`,
      '',
      'Reply with:',
      'MOVE: <SAN>',
      'COMMENT: <one sentence>',
    ]
      .filter(Boolean)
      .join('\n')
  },

  correctionPrompt: (s, error, attempt) =>
    [
      `Your reply was rejected: ${error}.`,
      `Attempt ${attempt} failed. Choose ONE move copied exactly from this list of legal moves:`,
      s.chess.moves().join(' '),
      '',
      'Reply with exactly two lines:',
      'MOVE: <SAN>',
      'COMMENT: <one sentence>',
    ].join('\n'),

  parseReply: (s, text) => {
    const clean = (text ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    if (!clean) return { ok: false, error: 'the reply was empty' }
    const moveLine = clean.match(/MOVE\s*[:\-=]\s*\**\s*([^\n]+)/i)
    const commentLine = clean.match(/COMMENT\s*[:\-=]\s*\**\s*([^\n]+)/i)
    const comment = (commentLine?.[1] ?? '').replace(/\*+/g, '').trim().slice(0, 220)
    if (!moveLine) return { ok: false, error: 'no "MOVE:" line was found' }
    const token = moveLine[1].trim().split(/\s+/)[0] ?? ''
    const move = tryMove(s.chess, token)
    if (!move) return { ok: false, error: `"${normaliseMoveToken(token) || token}" is not a legal move in this position` }
    return { ok: true, move, comment }
  },

  applyMove: (s, move, comment) => {
    const res = s.chess.move({ from: move.from, to: move.to, promotion: move.promotion })
    return {
      chess: s.chess,
      version: s.version + 1,
      moves: [
        ...s.moves,
        {
          san: res.san,
          from: res.from,
          to: res.to,
          color: res.color,
          piece: res.piece,
          captured: res.captured,
          flags: res.flags,
          comment,
          fen: s.chess.fen(),
        },
      ],
    }
  },

  outcome: (s): Outcome => {
    const c = s.chess
    if (c.isCheckmate()) {
      const winner = c.turn() === 'w' ? 'black' : 'white'
      return { over: true, winnerSide: winner, reason: `Checkmate — ${winner === 'white' ? 'White' : 'Black'} wins` }
    }
    if (c.isStalemate()) return { over: true, winnerSide: null, reason: 'Draw by stalemate' }
    if (c.isInsufficientMaterial()) return { over: true, winnerSide: null, reason: 'Draw by insufficient material' }
    if (c.isThreefoldRepetition()) return { over: true, winnerSide: null, reason: 'Draw by threefold repetition' }
    if (c.isDrawByFiftyMoves()) return { over: true, winnerSide: null, reason: 'Draw by the 50-move rule' }
    if (c.isDraw()) return { over: true, winnerSide: null, reason: 'Draw' }
    return { over: false }
  },

  limitOutcome: (s) => ({
    over: true,
    winnerSide: null,
    reason: `Draw — move limit reached (${Math.ceil(s.moves.length / 2)} moves)`,
  }),
}

/** Chess with a playing style per side. Legality, parsing and outcomes are unchanged. */
export function createChessModule(opts: {
  styles: Partial<Record<'white' | 'black', { text: string; name: string }>>
  commentsOnly: boolean
}): GameModule<ChessState, Move> {
  return {
    ...chessModule,
    systemPrompt: (side) => {
      const st = opts.styles[side as 'white' | 'black']
      return chessSystemPrompt(side, st ? { ...st, commentsOnly: opts.commentsOnly } : undefined)
    },
  }
}
