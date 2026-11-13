import { useState, type CSSProperties } from 'react'
import { IconRotateCcw, IconRotateCw } from '../../components/Icons'
import { SIZE, cellName, idx, quadrantOrigin, type Dir, type Grid, type Quadrant } from './rules'

export interface PentagoBoardProps {
  grid: Grid
  /** Seat that owns marble 1 (moved first). */
  firstSeat: 0 | 1
  /** Cell of the most recent marble, in the coordinates of `grid`. */
  lastCell: number | null
  /** Quadrant that just turned (animates in). `key` restarts the animation. */
  spin: { quad: Quadrant; dir: Dir; key: number } | null
  /** Quadrant about to turn (placement shown, twist pending). */
  pending: { quad: Quadrant; dir: Dir } | null
  winCells: number[] | null
  turnSeat: 0 | 1 | null
  ghost: boolean
}

const QUADS: Quadrant[] = [0, 1, 2, 3]

export function PentagoBoard({ grid, firstSeat, lastCell, spin, pending, winCells, turnSeat, ghost }: PentagoBoardProps) {
  const [hoverCell, setHoverCell] = useState<number | null>(null)
  const [hoverQuad, setHoverQuad] = useState<Quadrant | null>(null)
  const [hoverHandle, setHoverHandle] = useState<{ q: Quadrant; dir: Dir } | null>(null)
  const win = new Set(winCells ?? [])
  const seatOf = (v: number) => (v === 1 ? firstSeat : ((1 - firstSeat) as 0 | 1))

  return (
    <div className="pg-frame glass" onMouseLeave={() => (setHoverCell(null), setHoverQuad(null), setHoverHandle(null))}>
      <div className="pg-cols mono" aria-hidden>
        {Array.from({ length: SIZE }, (_, c) => (
          <span key={c}>{c + 1}</span>
        ))}
      </div>
      <div className="pg-rows mono" aria-hidden>
        {Array.from({ length: SIZE }, (_, r) => (
          <span key={r}>{String.fromCharCode(65 + r)}</span>
        ))}
      </div>
      <div className={`pg-board ${winCells ? 'has-win' : ''}`} aria-label="Pentago board">
        {QUADS.map((q) => {
          const { row: r0, col: c0 } = quadrantOrigin(q)
          const spinning = spin && spin.quad === q
          const pend = pending && pending.quad === q
          const preview = hoverHandle && hoverHandle.q === q ? hoverHandle.dir : null
          return (
            <div
              key={spinning ? `q${q}-${spin.key}` : `q${q}`}
              className={`pg-quad pq${q} ${hoverQuad === q ? 'hover' : ''} ${spinning ? `spin-${spin.dir}` : ''} ${pend ? `pending pending-${pending.dir}` : ''} ${preview ? `preview-${preview}` : ''}`}
              onMouseEnter={() => setHoverQuad(q)}
              aria-label={`Quadrant ${q + 1}`}
            >
              <span className="pg-qlabel mono" aria-hidden>
                Q{q + 1}
              </span>
              {Array.from({ length: 9 }, (_, i) => {
                const cell = idx(r0 + Math.floor(i / 3), c0 + (i % 3))
                const v = grid[cell]
                return (
                  <div
                    key={cell}
                    className="pg-cell"
                    onMouseEnter={() => setHoverCell(cell)}
                    aria-label={`${cellName(cell)}: ${v ? `Player ${seatOf(v) + 1}` : 'empty'}`}
                    title={cellName(cell)}
                  >
                    {v !== 0 ? (
                      <span className={`pg-marble s${seatOf(v)} ${cell === lastCell ? 'last' : ''} ${win.has(cell) ? 'win' : ''}`} />
                    ) : (
                      ghost && hoverCell === cell && turnSeat !== null && <span className={`pg-marble ghost s${turnSeat}`} aria-hidden />
                    )}
                  </div>
                )
              })}
              {(['ccw', 'cw'] as Dir[]).map((d) => (
                <span
                  key={d}
                  className={`pg-handle h-${d} ${pend && pending!.dir === d ? 'on' : ''}`}
                  title={`Q${q + 1} ${d === 'cw' ? 'clockwise' : 'counter-clockwise'}`}
                  onMouseEnter={() => setHoverHandle({ q, dir: d })}
                  onMouseLeave={() => setHoverHandle(null)}
                  aria-hidden
                >
                  {d === 'cw' ? <IconRotateCw size={13} /> : <IconRotateCcw size={13} />}
                </span>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Small static board for the result screen. */
export function PentagoMini({ grid, firstSeat, winCells }: { grid: Grid; firstSeat: 0 | 1; winCells: number[] | null }) {
  const win = new Set(winCells ?? [])
  return (
    <div className="pg-mini" aria-label="Final board">
      {grid.map((v, i) => (
        <span
          key={i}
          className={`pg-mini-cell ${v ? `s${v === 1 ? firstSeat : 1 - firstSeat}` : ''} ${win.has(i) ? 'win' : ''}`}
          style={{ '--gap-r': i % 6 === 2 ? '8px' : '0px', '--gap-b': Math.floor(i / 6) === 2 ? '8px' : '0px' } as CSSProperties}
        />
      ))}
    </div>
  )
}
