export const BOARD_THEMES = {
  glass: { label: 'Glass', light: 'rgba(236, 240, 245, 0.78)', dark: 'rgba(120, 132, 150, 0.55)' },
  walnut: { label: 'Walnut', light: '#e9d6b6', dark: '#9a6b47' },
  slate: { label: 'Slate', light: '#c9d1dc', dark: '#56637a' },
  sage: { label: 'Sage', light: '#e4ead9', dark: '#6f8f6a' },
  ember: { label: 'Ember', light: '#f1ddd0', dark: '#b66f4c' },
} as const

export const PIECE_THEMES = {
  classic: { label: 'Classic' },
  frost: { label: 'Frost' },
  glyph: { label: 'Glyph' },
} as const

export type BoardThemeId = keyof typeof BOARD_THEMES
export type PieceThemeId = keyof typeof PIECE_THEMES
export type BoardView = 'flat' | 'tilt' | 'flip'

export const VIEW_CYCLE: BoardView[] = ['flat', 'tilt', 'flip']
export const VIEW_LABEL: Record<BoardView, string> = { flat: '2D', tilt: '3D', flip: 'Flipped' }
