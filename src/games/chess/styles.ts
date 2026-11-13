import data from './styles.json'

/**
 * Chess playing styles. All built-in style data lives in styles.json.
 * A style only changes move preference and comment tone; move legality
 * always comes from chess.js.
 */
export interface ChessStyle {
  id: string
  name: string
  icon: string
  accent: string
  description: string
  prompt: string
}

export const STYLE_MAX_CHARS = 600
export const CUSTOM_STYLE_ID = 'custom'
export const DEFAULT_STYLE_ID = 'balanced'

export const BUILT_IN_STYLES: ChessStyle[] = (data.styles as ChessStyle[]).map((s) => ({
  ...s,
  prompt: s.prompt.slice(0, STYLE_MAX_CHARS),
}))

export const CUSTOM_STYLE: ChessStyle = {
  id: CUSTOM_STYLE_ID,
  name: 'Custom',
  icon: 'pen',
  accent: '#e8e2b0',
  description: 'Your own private instructions.',
  prompt: '',
}

export const ALL_STYLES: ChessStyle[] = [...BUILT_IN_STYLES, CUSTOM_STYLE]

export function getStyle(id: string | undefined): ChessStyle {
  return ALL_STYLES.find((s) => s.id === id) ?? BUILT_IN_STYLES.find((s) => s.id === DEFAULT_STYLE_ID) ?? BUILT_IN_STYLES[0]
}

/** Final style text for a player: built-in prompt, or the user's custom text. */
export function styleText(styleId: string | undefined, custom: string | undefined) {
  if (styleId === CUSTOM_STYLE_ID) return (custom ?? '').trim().slice(0, STYLE_MAX_CHARS)
  return getStyle(styleId).prompt
}

export function randomStyleId(exclude?: string) {
  const pool = BUILT_IN_STYLES.filter((s) => s.id !== exclude)
  return pool[Math.floor(Math.random() * pool.length)].id
}

export const hexToRgb = (hex: string) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}
