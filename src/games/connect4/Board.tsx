import { useState, type CSSProperties } from 'react'
import { COLS, ROWS, idx, landingRow, type Grid } from './rules'

/** Disc colour follows the player seat (green P1, orange P2), not X/O. */
export interface C4BoardProps {
  grid: Grid
  /** Seat that owns disc 1 (moved first). */
  firstSeat: 0 | 1
  last: { row: number; col: number } | null
  winCells: number[] | null
  /** Changes on each new move so only the newest disc animates. */
  animKey: number
  /** Seat whose turn it is (for the ghost disc colour), or null. */
  turnSeat: 0 | 1 | null
  /** Show the hover ghost disc. */
  ghost: boolean
}

export function C4Board({ grid, firstSeat, last, winCells, animKey, turnSeat, ghost }: C4BoardProps) {
  const [hover, setHover] = useState<number | null>(null)
  const seatOfDisc = (d: number) => (d === 1 ? firstSeat : ((1 - firstSeat) as 0 | 1))
  const win = new Set(winCells ?? [])
  const ghostRow = hover !== null ? landingRow(grid, hover) : -1

  return (
    <div className="c4-frame glass">
      <div className="c4-ghosts" aria-hidden>
        {Array.from({ length: COLS }, (_, c) => (
          <span key={c} className="c4-ghost-slot">
            {ghost && hover === c && ghostRow >= 0 && turnSeat !== null && <span className={`c4-disc ghost s${turnSeat}`} />}
          </span>
        ))}
      </div>
      <div
        className={`c4-board ${winCells ? 'has-win' : ''}`}
        aria-label="Connect Four board"
        onMouseLeave={() => setHover(null)}
      >
        {Array.from({ length: COLS }, (_, c) => (
          <div key={c} className={`c4-col ${hover === c ? 'hover' : ''}`} onMouseEnter={() => setHover(c)} aria-label={`Column ${c + 1}`}>
            {Array.from({ length: ROWS }, (_, r) => {
              const v = grid[idx(r, c)]
              const isLast = last && last.row === r && last.col === c
              return (
                <div key={r} className="c4-cell" aria-label={v ? `Player ${seatOfDisc(v) + 1} disc` : 'empty'}>
                  {ghost && hover === c && ghostRow === r && turnSeat !== null && <span className={`c4-disc landing s${turnSeat}`} aria-hidden />}
                  {v !== 0 && (
                    <span
                      key={isLast ? `d${animKey}` : `d${r}`}
                      className={`c4-disc s${seatOfDisc(v)} ${isLast ? 'last drop' : ''} ${win.has(idx(r, c)) ? 'win' : ''}`}
                      style={isLast ? ({ '--fall': r + 1 } as CSSProperties) : undefined}
                    />
                  )}
                </div>
              )
            })}
            <span className="c4-num mono" aria-hidden>
              {c + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Small static board used on the result screen. */
export function C4Mini({ grid, firstSeat, winCells }: { grid: Grid; firstSeat: 0 | 1; winCells: number[] | null }) {
  const win = new Set(winCells ?? [])
  return (
    <div className="c4-mini" aria-label="Final board">
      {grid.map((v, i) => (
        <span key={i} className={`c4-mini-cell ${v ? `s${v === 1 ? firstSeat : 1 - firstSeat}` : ''} ${win.has(i) ? 'win' : ''}`} />
      ))}
    </div>
  )
}
