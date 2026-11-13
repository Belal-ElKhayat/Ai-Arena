/**
 * Pure Pentago rules. No imports, so it runs under `node --test` directly.
 * Grid: 6x6 flat array, index = row * 6 + col, row 0 = top.
 * Cells: 0 empty, 1 = first player's marble, 2 = second player's marble.
 * Quadrants (0-based): 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
 */
export const SIZE = 6
export type Cell = 0 | 1 | 2
export type Grid = Cell[]
export type Dir = 'cw' | 'ccw'
export type Quadrant = 0 | 1 | 2 | 3

export const emptyGrid = (): Grid => Array<Cell>(SIZE * SIZE).fill(0)
export const idx = (row: number, col: number) => row * SIZE + col
export const quadrantOrigin = (q: Quadrant) => ({ row: q < 2 ? 0 : 3, col: q % 2 === 0 ? 0 : 3 })
export const quadrantOf = (cell: number): Quadrant => {
  const r = Math.floor(cell / SIZE)
  const c = cell % SIZE
  return ((r < 3 ? 0 : 2) + (c < 3 ? 0 : 1)) as Quadrant
}

/** Human cell name: rows A-F (top to bottom), columns 1-6 (left to right). "C4" = row 2, col 3. */
export const cellName = (cell: number) => `${String.fromCharCode(65 + Math.floor(cell / SIZE))}${(cell % SIZE) + 1}`
export function parseCell(text: string): number | null {
  const t = text.trim().toUpperCase()
  let m = t.match(/^([A-F])\s*[-,]?\s*([1-6])$/)
  if (m) return idx(m[1].charCodeAt(0) - 65, Number(m[2]) - 1)
  m = t.match(/^([1-6])\s*([A-F])$/)
  if (m) return idx(m[2].charCodeAt(0) - 65, Number(m[1]) - 1)
  return null
}

export const emptyCells = (g: Grid) => g.reduce<number[]>((a, v, i) => (v === 0 ? (a.push(i), a) : a), [])

/** Rotate one 3x3 quadrant by 90 degrees. Returns a new grid. */
export function rotate(grid: Grid, q: Quadrant, dir: Dir): Grid {
  const { row: r0, col: c0 } = quadrantOrigin(q)
  const next = grid.slice()
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      // Clockwise: new[r][c] = old[2 - c][r]. Counter-clockwise: new[r][c] = old[c][2 - r].
      const [sr, sc] = dir === 'cw' ? [2 - c, r] : [c, 2 - r]
      next[idx(r0 + r, c0 + c)] = grid[idx(r0 + sr, c0 + sc)]
    }
  }
  return next
}

/** Where a cell ends up after rotating quadrant q (cells outside q are unchanged). */
export function rotatedCell(cell: number, q: Quadrant, dir: Dir): number {
  if (quadrantOf(cell) !== q) return cell
  const { row: r0, col: c0 } = quadrantOrigin(q)
  const r = Math.floor(cell / SIZE) - r0
  const c = (cell % SIZE) - c0
  const [nr, nc] = dir === 'cw' ? [c, 2 - r] : [2 - c, r]
  return idx(r0 + nr, c0 + nc)
}

const DIRS: Array<[number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]

/**
 * Every five-in-a-row on the board (lines cross quadrant borders freely; a row
 * of six counts). Returns the winning cells per marble colour.
 */
export function findFives(grid: Grid): Partial<Record<1 | 2, number[]>> {
  const out: Partial<Record<1 | 2, Set<number>>> = {}
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid[idx(r, c)]
      if (!v) continue
      for (const [dr, dc] of DIRS) {
        const er = r + dr * 4
        const ec = c + dc * 4
        if (er < 0 || er >= SIZE || ec < 0 || ec >= SIZE) continue
        let ok = true
        for (let k = 1; k < 5 && ok; k++) ok = grid[idx(r + dr * k, c + dc * k)] === v
        if (!ok) continue
        const set = (out[v as 1 | 2] ??= new Set())
        for (let k = 0; k < 5; k++) set.add(idx(r + dr * k, c + dc * k))
      }
    }
  }
  const res: Partial<Record<1 | 2, number[]>> = {}
  for (const k of [1, 2] as const) if (out[k]) res[k] = [...out[k]!].sort((a, b) => a - b)
  return res
}

export type TurnResult =
  | { status: 'ongoing' }
  | { status: 'win'; marble: 1 | 2; cells: number[]; when: 'placement' | 'rotation' }
  | { status: 'draw'; reason: 'both' | 'full'; cells: number[] }

export interface TurnOutcome {
  /** Grid after the placement (before the twist). */
  placed: Grid
  /** Final grid after the turn. */
  grid: Grid
  /** False when the placement already won, so the twist was skipped. */
  rotated: boolean
  result: TurnResult
}

/**
 * Play one full Pentago turn: place, then twist. Standard rules:
 * - five after the placement wins immediately (the twist is skipped);
 * - otherwise the twist is applied; if it makes five for exactly one colour,
 *   that colour wins (even if it is the opponent's);
 * - five for both colours at once is a draw;
 * - a full board with no five is a draw.
 * Returns null if the placement cell is not empty.
 */
export function playTurn(grid: Grid, cell: number, q: Quadrant, dir: Dir, marble: 1 | 2): TurnOutcome | null {
  if (cell < 0 || cell >= SIZE * SIZE || grid[cell] !== 0) return null
  const placed = grid.slice()
  placed[cell] = marble
  const early = findFives(placed)[marble]
  if (early) return { placed, grid: placed, rotated: false, result: { status: 'win', marble, cells: early, when: 'placement' } }
  const next = rotate(placed, q, dir)
  return { placed, grid: next, rotated: true, result: evaluate(next) }
}

/** Static evaluation of a board after a full turn. */
export function evaluate(grid: Grid): TurnResult {
  const f = findFives(grid)
  if (f[1] && f[2]) return { status: 'draw', reason: 'both', cells: [...f[1], ...f[2]] }
  if (f[1]) return { status: 'win', marble: 1, cells: f[1], when: 'rotation' }
  if (f[2]) return { status: 'win', marble: 2, cells: f[2], when: 'rotation' }
  if (grid.every((v) => v !== 0)) return { status: 'draw', reason: 'full', cells: [] }
  return { status: 'ongoing' }
}

/** Readable board for prompts. */
export function gridText(grid: Grid, symbols: Record<1 | 2, string> = { 1: 'X', 2: 'O' }) {
  const lines = ['    1 2 3   4 5 6']
  for (let r = 0; r < SIZE; r++) {
    if (r === 3) lines.push('    ------+------')
    const cells: string[] = []
    for (let c = 0; c < SIZE; c++) {
      const v = grid[idx(r, c)]
      cells.push(v ? symbols[v as 1 | 2] : '.')
    }
    lines.push(`${String.fromCharCode(65 + r)}   ${cells.slice(0, 3).join(' ')} | ${cells.slice(3).join(' ')}`)
  }
  return lines.join('\n')
}
