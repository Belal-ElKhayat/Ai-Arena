/**
 * Pure Connect Four rules. No imports, so it runs under `node --test` directly.
 * Grid: 6 rows x 7 columns, flat array, index = row * 7 + col, row 0 = top.
 * Cell values: 0 empty, 1 = first player's disc, 2 = second player's disc.
 */
export const ROWS = 6
export const COLS = 7
export type Cell = 0 | 1 | 2
export type Grid = Cell[]
export type Direction = 'horizontal' | 'vertical' | 'diagonal'

export interface Win {
  disc: 1 | 2
  cells: number[]
  direction: Direction
}

export const emptyGrid = (): Grid => Array<Cell>(ROWS * COLS).fill(0)
export const idx = (row: number, col: number) => row * COLS + col

/** Columns (0-based) that still have room. */
export function legalColumns(grid: Grid): number[] {
  const out: number[] = []
  for (let c = 0; c < COLS; c++) if (grid[idx(0, c)] === 0) out.push(c)
  return out
}

/** Row a disc dropped into `col` would land on, or -1 if the column is full. */
export function landingRow(grid: Grid, col: number): number {
  if (col < 0 || col >= COLS) return -1
  for (let r = ROWS - 1; r >= 0; r--) if (grid[idx(r, col)] === 0) return r
  return -1
}

/** Returns a new grid with the disc dropped, or null when the move is illegal. */
export function drop(grid: Grid, col: number, disc: 1 | 2): { grid: Grid; row: number } | null {
  const row = landingRow(grid, col)
  if (row < 0) return null
  const next = grid.slice()
  next[idx(row, col)] = disc
  return { grid: next, row }
}

const DIRS: Array<[number, number, Direction]> = [
  [0, 1, 'horizontal'],
  [1, 0, 'vertical'],
  [1, 1, 'diagonal'],
  [1, -1, 'diagonal'],
]

/** Four (or more) in a row anywhere on the board. All connected cells are returned. */
export function findWin(grid: Grid): Win | null {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const disc = grid[idx(r, c)]
      if (!disc) continue
      for (const [dr, dc, direction] of DIRS) {
        // Only start counting from the first cell of a run.
        const pr = r - dr
        const pc = c - dc
        if (pr >= 0 && pr < ROWS && pc >= 0 && pc < COLS && grid[idx(pr, pc)] === disc) continue
        const cells: number[] = []
        let rr = r
        let cc = c
        while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && grid[idx(rr, cc)] === disc) {
          cells.push(idx(rr, cc))
          rr += dr
          cc += dc
        }
        if (cells.length >= 4) return { disc, cells, direction }
      }
    }
  }
  return null
}

export const isFull = (grid: Grid) => legalColumns(grid).length === 0

export type GameResult = { status: 'win'; win: Win } | { status: 'draw' } | { status: 'ongoing' }

export function evaluate(grid: Grid): GameResult {
  const win = findWin(grid)
  if (win) return { status: 'win', win }
  if (isFull(grid)) return { status: 'draw' }
  return { status: 'ongoing' }
}

/** Replay a list of 0-based columns (alternating discs, first player = 1). */
export function gridFromColumns(cols: number[]): Grid {
  let g = emptyGrid()
  cols.forEach((c, i) => {
    const r = drop(g, c, (i % 2 === 0 ? 1 : 2) as 1 | 2)
    if (r) g = r.grid
  })
  return g
}

/** Readable grid for prompts: column header + rows top to bottom. */
export function gridText(grid: Grid, symbols: Record<1 | 2, string> = { 1: 'X', 2: 'O' }) {
  const lines = ['  ' + Array.from({ length: COLS }, (_, c) => c + 1).join(' ')]
  for (let r = 0; r < ROWS; r++) {
    const row: string[] = []
    for (let c = 0; c < COLS; c++) {
      const v = grid[idx(r, c)]
      row.push(v ? symbols[v as 1 | 2] : '.')
    }
    lines.push(`${String.fromCharCode(65 + r)} ` + row.join(' '))
  }
  return lines.join('\n')
}
