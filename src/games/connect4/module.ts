import type { GameModule, Outcome } from '../../core/types'
import { COLS, drop, emptyGrid, evaluate, gridText, legalColumns, type Grid, type Win } from './rules'

/** Side identifiers: 'first' moves first and plays X (disc 1), 'second' plays O (disc 2). */
export const C4_SIDES = ['first', 'second'] as const
export type C4Side = (typeof C4_SIDES)[number]

export interface C4MoveRecord {
  /** 0-based column. */
  col: number
  row: number
  disc: 1 | 2
  comment: string
  /** Placed by the "Random opening" option, not by a model. */
  random?: boolean
}

export interface C4State {
  grid: Grid
  moves: C4MoveRecord[]
  win: Win | null
  version: number
}

const discOf = (side: string): 1 | 2 => (side === 'first' ? 1 : 2)
const sideOf = (disc: 1 | 2): C4Side => (disc === 1 ? 'first' : 'second')
const sym = (d: 1 | 2) => (d === 1 ? 'X' : 'O')
const legal1 = (g: Grid) => legalColumns(g).map((c) => c + 1)

const DIR_TEXT = { horizontal: 'horizontally', vertical: 'vertically', diagonal: 'diagonally' }

export function createConnectFourModule(opts: { randomOpening?: boolean } = {}): GameModule<C4State, number> {
  return {
    id: 'connect4',
    title: 'Connect Four',
    sides: C4_SIDES,

    createState() {
      let grid = emptyGrid()
      const moves: C4MoveRecord[] = []
      if (opts.randomOpening) {
        for (let i = 0; i < 2; i++) {
          const cols = legalColumns(grid)
          const col = cols[Math.floor(Math.random() * cols.length)]
          const disc = (i % 2 === 0 ? 1 : 2) as 1 | 2
          const r = drop(grid, col, disc)!
          grid = r.grid
          moves.push({ col, row: r.row, disc, comment: 'Random opening move', random: true })
        }
      }
      return { grid, moves, win: null, version: 0 }
    },

    currentSide: (s) => (s.moves.length % 2 === 0 ? 'first' : 'second'),
    plyCount: (s) => s.moves.length,

    systemPrompt: (side) =>
      [
        `You are an expert Connect Four player playing as ${sym(discOf(side))} against another AI.`,
        `${side === 'first' ? 'X moves first' : 'O moves second'}. The board has 7 columns (numbered 1 to 7) and 6 rows. A disc dropped into a column falls to the lowest empty cell.`,
        'Win by connecting four of your discs in a row horizontally, vertically or diagonally. Block your opponent’s threats.',
        'On every turn you get the board, the move history and the list of legal columns. Pick exactly ONE column from the legal list.',
        'Reply in EXACTLY this format and nothing else:',
        'COLUMN: <a single column number from the legal list>',
        'COMMENT: <one short sentence about your move, max 20 words>',
      ].join('\n'),

    turnPrompt: (s, side) => {
      const d = discOf(side)
      const hist = s.moves.length ? s.moves.map((m) => `${sym(m.disc)}${m.col + 1}`).join(' ') : '(none — this is the first move)'
      return [
        `You are ${sym(d)}. Move ${s.moves.length + 1}. Your opponent is ${sym(d === 1 ? 2 : 1)}.`,
        'Board (row A is the top, row F is the bottom, "." is empty):',
        gridText(s.grid),
        `Move history (disc + column): ${hist}`,
        `Legal columns: ${legal1(s.grid).join(', ')}`,
        '',
        'Reply with:',
        'COLUMN: <number>',
        'COMMENT: <one sentence>',
      ].join('\n')
    },

    correctionPrompt: (s, error, attempt) =>
      [
        `Your reply was rejected: ${error}.`,
        `Attempt ${attempt} failed. Choose ONE column from this list of legal columns: ${legal1(s.grid).join(', ')}`,
        '',
        'Reply with exactly two lines:',
        'COLUMN: <number>',
        'COMMENT: <one sentence>',
      ].join('\n'),

    parseReply: (s, text) => {
      const clean = (text ?? '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').trim()
      if (!clean) return { ok: false, error: 'the reply was empty' }
      const line = clean.match(/(?:COLUMN|COL|MOVE)\s*[:\-=]\s*\**\s*([^\n]+)/i)
      const comment = (clean.match(/COMMENT\s*[:\-=]\s*\**\s*([^\n]+)/i)?.[1] ?? '').replace(/\*+/g, '').trim().slice(0, 220)
      if (!line) return { ok: false, error: 'no "COLUMN:" line was found' }
      const num = line[1].match(/\d+/)?.[0]
      if (!num) return { ok: false, error: `"${line[1].trim().slice(0, 20)}" is not a column number` }
      const n = Number(num)
      if (n < 1 || n > COLS) return { ok: false, error: `column ${n} does not exist (columns are 1 to 7)` }
      if (!legalColumns(s.grid).includes(n - 1)) return { ok: false, error: `column ${n} is full` }
      return { ok: true, move: n - 1, comment }
    },

    applyMove: (s, col, comment) => {
      const disc = s.moves.length % 2 === 0 ? 1 : 2
      const r = drop(s.grid, col, disc)
      if (!r) return s
      const res = evaluate(r.grid)
      return {
        grid: r.grid,
        moves: [...s.moves, { col, row: r.row, disc, comment }],
        win: res.status === 'win' ? res.win : null,
        version: s.version + 1,
      }
    },

    outcome: (s): Outcome => {
      const res = evaluate(s.grid)
      if (res.status === 'win')
        return { over: true, winnerSide: sideOf(res.win.disc), reason: `Four in a row ${DIR_TEXT[res.win.direction]} — ${sym(res.win.disc)} wins` }
      if (res.status === 'draw') return { over: true, winnerSide: null, reason: 'Draw — the board is full' }
      return { over: false }
    },

    limitOutcome: (s) => ({ over: true, winnerSide: null, reason: `Draw — move limit reached (${s.moves.length} moves)` }),
  }
}
