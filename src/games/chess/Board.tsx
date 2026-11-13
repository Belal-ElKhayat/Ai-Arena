import { defaultPieces } from 'react-chessboard'
import { useMemo, type CSSProperties } from 'react'
import { BOARD_THEMES, type BoardThemeId, type PieceThemeId } from './themes'

const FILES = 'abcdefgh'
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }

export interface BoardProps {
  fen: string
  lastMove?: { from: string; to: string; flags?: string; color?: 'w' | 'b' } | null
  /** Bottom side. */
  orientation: 'w' | 'b'
  tilt: boolean
  boardTheme: BoardThemeId
  pieceTheme: PieceThemeId
  /** Accent for last-move glow: 'p1' green, 'p2' orange. */
  accent: 'p1' | 'p2' | null
  /** Changes on every move so the slide animation restarts. */
  animKey: string | number
  checkSquare?: string | null
}

interface Placed {
  square: string
  type: string
  color: 'w' | 'b'
}

function parseFen(fen: string): Placed[] {
  const rows = fen.split(' ')[0].split('/')
  const out: Placed[] = []
  rows.forEach((row, r) => {
    let f = 0
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch)
      else {
        out.push({ square: `${FILES[f]}${8 - r}`, type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? 'w' : 'b' })
        f++
      }
    }
  })
  return out
}

function coords(square: string, orientation: 'w' | 'b') {
  const f = FILES.indexOf(square[0])
  const r = Number(square[1]) - 1
  return orientation === 'w' ? { x: f, y: 7 - r } : { x: 7 - f, y: r }
}

function PieceArt({ type, color, theme }: { type: string; color: 'w' | 'b'; theme: PieceThemeId }) {
  if (theme === 'glyph') {
    return (
      <span className={`glyph glyph-${color}`} aria-hidden>
        {GLYPH[type]}
        {'︎'}
      </span>
    )
  }
  const key = `${color}${type.toUpperCase()}`
  const render = defaultPieces[key]
  const fill = theme === 'frost' ? (color === 'w' ? '#f3f7fb' : '#262b35') : undefined
  return render ? render({ fill, svgStyle: { display: 'block' } }) : null
}

export function Board(props: BoardProps) {
  const { fen, lastMove, orientation, tilt, boardTheme, pieceTheme, accent, animKey, checkSquare } = props
  const pieces = useMemo(() => parseFen(fen), [fen])
  const theme = BOARD_THEMES[boardTheme]

  // Map destination square -> origin square for sliding (king + rook on castling).
  const slides = useMemo(() => {
    const m = new Map<string, string>()
    if (!lastMove) return m
    m.set(lastMove.to, lastMove.from)
    const rank = lastMove.color === 'b' ? '8' : '1'
    if (lastMove.flags?.includes('k')) m.set(`f${rank}`, `h${rank}`)
    if (lastMove.flags?.includes('q')) m.set(`d${rank}`, `a${rank}`)
    return m
  }, [lastMove])

  const squares = []
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const file = orientation === 'w' ? x : 7 - x
      const rank = orientation === 'w' ? 7 - y : y
      const sq = `${FILES[file]}${rank + 1}`
      const light = (file + rank) % 2 === 1
      const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq)
      squares.push(
        <div
          key={sq}
          className={`sq ${light ? 'light' : 'dark'} ${isLast ? 'last' : ''} ${checkSquare === sq ? 'check' : ''}`}
        >
          {x === 0 && <span className="coord rank">{rank + 1}</span>}
          {y === 7 && <span className="coord file">{FILES[file]}</span>}
        </div>,
      )
    }
  }

  return (
    <div
      className={`board ${tilt ? 'tilt' : ''} accent-${accent ?? 'none'} pieces-${pieceTheme}`}
      style={{ '--sq-light': theme.light, '--sq-dark': theme.dark } as CSSProperties}
      role="img"
      aria-label={`Chess position ${fen}`}
    >
      <div className="squares">{squares}</div>
      <div className="pieces">
        {pieces.map((p) => {
          const { x, y } = coords(p.square, orientation)
          const from = slides.get(p.square)
          const style: Record<string, string> = { '--tx': `${x * 100}%`, '--ty': `${y * 100}%` }
          let cls = 'piece'
          if (from) {
            const o = coords(from, orientation)
            style['--fx'] = `${o.x * 100}%`
            style['--fy'] = `${o.y * 100}%`
            cls += ' sliding'
          }
          return (
            <div key={from ? `${p.square}-${animKey}` : p.square} className={cls} style={style as CSSProperties}>
              <div className="piece-inner">
                <PieceArt type={p.type} color={p.color} theme={pieceTheme} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Small piece icon for captured-material rows. */
export function MiniPiece({ type, color, theme }: { type: string; color: 'w' | 'b'; theme: PieceThemeId }) {
  return (
    <span className="mini-piece">
      <PieceArt type={type} color={color} theme={theme} />
    </span>
  )
}
