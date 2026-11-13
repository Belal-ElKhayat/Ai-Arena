import type { GameModule, Outcome } from '../../core/types'
import { cellName, emptyCells, emptyGrid, evaluate, gridText, parseCell, playTurn, type Dir, type Grid, type Quadrant } from './rules'

export const PENTAGO_SIDES = ['first', 'second'] as const

export interface PentagoMove {
  cell: number
  quad: Quadrant
  dir: Dir
}

export interface PentagoMoveRecord extends PentagoMove {
  marble: 1 | 2
  comment: string
  /** False when the placement already made five, so the twist was skipped. */
  rotated: boolean
  /** Board after the placement, before the twist. */
  placed: Grid
  /** Board after the full turn. */
  grid: Grid
  random?: boolean
}

export interface PentagoState {
  grid: Grid
  moves: PentagoMoveRecord[]
  /** Highlighted winning (or drawing) cells once the game is over. */
  winCells: number[] | null
  version: number
}

const sym = (m: 1 | 2) => (m === 1 ? 'X' : 'O')
const marbleOf = (side: string): 1 | 2 => (side === 'first' ? 1 : 2)
export const quadLabel = (q: Quadrant) => `Q${q + 1}`
export const dirLabel = (d: Dir) => (d === 'cw' ? 'CW' : 'CCW')
export const moveText = (m: PentagoMove & { rotated?: boolean }) =>
  `${cellName(m.cell)} ${m.rotated === false ? '(no twist — won on placement)' : `${quadLabel(m.quad)} ${dirLabel(m.dir)}`}`

/** Apply a turn to a record list (used for live play, random openings and replays). */
export function recordTurn(grid: Grid, mv: PentagoMove, marble: 1 | 2, comment: string, random?: boolean): PentagoMoveRecord | null {
  const t = playTurn(grid, mv.cell, mv.quad, mv.dir, marble)
  if (!t) return null
  return { ...mv, marble, comment, rotated: t.rotated, placed: t.placed, grid: t.grid, random: random || undefined }
}

export function movesFromSaved(saved: Array<PentagoMove & { comment?: string }>, randomMoves: number): PentagoMoveRecord[] {
  let g = emptyGrid()
  const out: PentagoMoveRecord[] = []
  saved.forEach((m, i) => {
    const rec = recordTurn(g, m, i % 2 === 0 ? 1 : 2, m.comment ?? '', i < randomMoves)
    if (!rec) return
    out.push(rec)
    g = rec.grid
  })
  return out
}

function resultCells(grid: Grid) {
  const r = evaluate(grid)
  return r.status === 'ongoing' ? null : r.cells.length ? r.cells : null
}

const RULES = [
  'Pentago rules:',
  '- The board is 6x6: rows A-F (top to bottom), columns 1-6 (left to right). It is split into four 3x3 quadrants:',
  '  Q1 = top-left (rows A-C, cols 1-3), Q2 = top-right (rows A-C, cols 4-6), Q3 = bottom-left (rows D-F, cols 1-3), Q4 = bottom-right (rows D-F, cols 4-6).',
  '- Every turn has TWO mandatory steps: (1) place one marble on any empty cell, then (2) rotate any one quadrant 90 degrees clockwise (CW) or counter-clockwise (CCW). Any quadrant may be rotated, even an empty one.',
  '- Five of your marbles in a row (horizontal, vertical or diagonal, across quadrant borders) wins. If your placement already makes five you win at once and the rotation is skipped.',
  '- A rotation that makes five for your opponent only gives THEM the win. Five for both players at once is a draw, and so is a full board.',
  '- Think about how the rotation moves marbles: it can build or break lines for both players.',
]

export function createPentagoModule(opts: { randomOpening?: boolean } = {}): GameModule<PentagoState, PentagoMove> {
  return {
    id: 'pentago',
    title: 'Pentago',
    sides: PENTAGO_SIDES,

    createState() {
      let grid = emptyGrid()
      const moves: PentagoMoveRecord[] = []
      if (opts.randomOpening) {
        for (let i = 0; i < 2; i++) {
          const cells = emptyCells(grid)
          const mv: PentagoMove = {
            cell: cells[Math.floor(Math.random() * cells.length)],
            quad: Math.floor(Math.random() * 4) as Quadrant,
            dir: Math.random() < 0.5 ? 'cw' : 'ccw',
          }
          const rec = recordTurn(grid, mv, i % 2 === 0 ? 1 : 2, 'Random opening turn', true)!
          moves.push(rec)
          grid = rec.grid
        }
      }
      return { grid, moves, winCells: null, version: 0 }
    },

    currentSide: (s) => (s.moves.length % 2 === 0 ? 'first' : 'second'),
    plyCount: (s) => s.moves.length,

    systemPrompt: (side) =>
      [
        `You are an expert Pentago player playing as ${sym(marbleOf(side))} against another AI. ${side === 'first' ? 'X moves first.' : 'O moves second.'}`,
        ...RULES,
        '',
        'On every turn you get the board, the move history and the list of empty cells.',
        'Reply in EXACTLY this format and nothing else:',
        'PLACE: <one empty cell, e.g. C4>',
        'ROTATE: <quadrant Q1-Q4> <CW or CCW>',
        'COMMENT: <one short sentence about your move, max 20 words>',
      ].join('\n'),

    turnPrompt: (s, side) => {
      const m = marbleOf(side)
      const hist = s.moves.length ? s.moves.map((x, i) => `${i + 1}. ${sym(x.marble)} ${moveText(x)}`).join('; ') : '(none — this is the first turn)'
      return [
        `You are ${sym(m)}. Turn ${s.moves.length + 1}. Your opponent is ${sym(m === 1 ? 2 : 1)}.`,
        'Board ("." is empty; the lines show quadrant borders):',
        gridText(s.grid),
        `Move history: ${hist}`,
        `Empty cells you may place on: ${emptyCells(s.grid).map(cellName).join(' ')}`,
        'Rotations you may choose: Q1 CW, Q1 CCW, Q2 CW, Q2 CCW, Q3 CW, Q3 CCW, Q4 CW, Q4 CCW',
        '',
        'Reply with:',
        'PLACE: <cell>',
        'ROTATE: <Qn> <CW|CCW>',
        'COMMENT: <one sentence>',
      ].join('\n')
    },

    correctionPrompt: (s, error, attempt) =>
      [
        `Your reply was rejected: ${error}.`,
        `Attempt ${attempt} failed. Empty cells: ${emptyCells(s.grid).map(cellName).join(' ')}`,
        'Rotations: Q1-Q4 with CW or CCW.',
        '',
        'Reply with exactly three lines:',
        'PLACE: <cell>',
        'ROTATE: <Qn> <CW|CCW>',
        'COMMENT: <one sentence>',
      ].join('\n'),

    parseReply: (s, text) => {
      const clean = (text ?? '').replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/\*+/g, '').trim()
      if (!clean) return { ok: false, error: 'the reply was empty' }
      const placeLine = clean.match(/PLACE(?:MENT)?\s*[:\-=]\s*([^\n]+)/i)
      const rotLine = clean.match(/ROTAT(?:E|ION)\s*[:\-=]\s*([^\n]+)/i)
      const comment = (clean.match(/COMMENT\s*[:\-=]\s*([^\n]+)/i)?.[1] ?? '').trim().slice(0, 220)
      if (!placeLine) return { ok: false, error: 'no "PLACE:" line was found' }
      if (!rotLine) return { ok: false, error: 'no "ROTATE:" line was found (the rotation is mandatory)' }
      const rawCell = placeLine[1].trim().match(/[A-Fa-f]\s*[-,]?\s*\d|\d\s*[A-Fa-f]/)?.[0] ?? placeLine[1].trim().split(/\s+/)[0]
      const cell = parseCell(rawCell)
      if (cell === null) return { ok: false, error: `"${rawCell}" is not a cell (use a row letter A-F and a column 1-6, e.g. C4)` }
      if (s.grid[cell] !== 0) return { ok: false, error: `cell ${cellName(cell)} is already occupied` }
      const r = rotLine[1].trim()
      const q = r.match(/Q?\s*([1-4])/i)?.[1]
      if (!q) return { ok: false, error: `"${r}" does not name a quadrant (Q1 to Q4)` }
      const ccw = /\b(ccw|counter[\s-]?clockwise|anti[\s-]?clockwise|left)\b/i.test(r)
      const cw = /\b(cw|clockwise|right)\b/i.test(r)
      if (!ccw && !cw) return { ok: false, error: `"${r}" has no direction (CW or CCW)` }
      return { ok: true, move: { cell, quad: (Number(q) - 1) as Quadrant, dir: ccw ? 'ccw' : 'cw' }, comment }
    },

    applyMove: (s, mv, comment) => {
      const rec = recordTurn(s.grid, mv, s.moves.length % 2 === 0 ? 1 : 2, comment)
      if (!rec) return s
      return { grid: rec.grid, moves: [...s.moves, rec], winCells: resultCells(rec.grid), version: s.version + 1 }
    },

    outcome: (s): Outcome => {
      const r = evaluate(s.grid)
      const last = s.moves[s.moves.length - 1]
      if (r.status === 'win') {
        const how = last && !last.rotated ? 'on the placement' : last && last.marble !== r.marble ? 'by the opponent’s twist' : 'after the twist'
        return { over: true, winnerSide: r.marble === 1 ? 'first' : 'second', reason: `Five in a row ${how} — ${sym(r.marble)} wins` }
      }
      if (r.status === 'draw')
        return { over: true, winnerSide: null, reason: r.reason === 'both' ? 'Draw — the twist made five for both players' : 'Draw — the board is full' }
      return { over: false }
    },

    limitOutcome: (s) => ({ over: true, winnerSide: null, reason: `Draw — move limit reached (${s.moves.length} turns)` }),
  }
}
