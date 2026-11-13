import data from './styles.json'
import type { ChessStyle } from '../chess/styles'

export const OVERLOAD_STYLES = data.styles as ChessStyle[]

export function getOverloadStyle(id: string | undefined) {
  return OVERLOAD_STYLES.find((style) => style.id === id) ?? OVERLOAD_STYLES[0]
}

export function overloadStyleText(id: string | undefined) {
  return getOverloadStyle(id).prompt
}
