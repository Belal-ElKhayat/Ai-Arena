import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Board, type BoardProps } from '../games/chess/Board'
import {
  BOARD_THEMES,
  PIECE_THEMES,
  VIEW_LABEL,
  type BoardThemeId,
  type BoardView,
  type PieceThemeId,
} from '../games/chess/themes'
import { IconCube, IconPalette } from './Icons'

export function BoardStage({
  boardProps,
  view,
  onCycleView,
  boardTheme,
  pieceTheme,
  onTheme,
  overlay,
}: {
  boardProps: Omit<BoardProps, 'tilt' | 'boardTheme' | 'pieceTheme'>
  view: BoardView
  onCycleView: () => void
  boardTheme: BoardThemeId
  pieceTheme: PieceThemeId
  onTheme: (patch: { boardTheme?: BoardThemeId; pieceTheme?: PieceThemeId }) => void
  overlay?: ReactNode
}) {
  const [themeOpen, setThemeOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!themeOpen) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setThemeOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [themeOpen])

  return (
    <div className="stage">
      <div className="stage-tools">
        <button className="chip-btn glass" onClick={onCycleView} title="Cycle board view (V)">
          <IconCube size={15} />
          View <span className="chip-val">{VIEW_LABEL[view]}</span>
        </button>
        <div className="theme-wrap" ref={ref}>
          <button className="chip-btn glass" onClick={() => setThemeOpen((o) => !o)} aria-expanded={themeOpen}>
            <IconPalette size={15} />
            Theme
          </button>
          {themeOpen && (
            <div className="theme-pop glass">
              <div className="pop-label">Board</div>
              <div className="swatches">
                {(Object.keys(BOARD_THEMES) as BoardThemeId[]).map((id) => (
                  <button
                    key={id}
                    className={`swatch ${id === boardTheme ? 'sel' : ''}`}
                    onClick={() => onTheme({ boardTheme: id })}
                    title={BOARD_THEMES[id].label}
                    aria-label={`${BOARD_THEMES[id].label} board`}
                    aria-pressed={id === boardTheme}
                  >
                    <span style={{ background: BOARD_THEMES[id].light }} />
                    <span style={{ background: BOARD_THEMES[id].dark }} />
                  </button>
                ))}
              </div>
              <div className="pop-label">Pieces</div>
              <div className="seg">
                {(Object.keys(PIECE_THEMES) as PieceThemeId[]).map((id) => (
                  <button key={id} className={id === pieceTheme ? 'on' : ''} onClick={() => onTheme({ pieceTheme: id })} aria-pressed={id === pieceTheme}>
                    {PIECE_THEMES[id].label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={`board-frame glass view-${view}`}>
        <div className="board-persp">
          <Board {...boardProps} tilt={view === 'tilt'} boardTheme={boardTheme} pieceTheme={pieceTheme} />
        </div>
        {overlay}
      </div>
    </div>
  )
}
