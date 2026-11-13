/**
 * Single source of truth for product branding and match defaults.
 * Rename the product by changing APP_NAME here.
 */
export const APP_CONFIG = {
  APP_NAME: 'AI Arena',
  TAGLINE: 'Two models. One board. No mercy.',
  /** Storage namespace for everything kept in localStorage. */
  STORAGE_PREFIX: 'ai-arena',
  /** Defaults the user can change in Match settings. */
  defaults: {
    maxFullMoves: 150,
    moveTimeoutSec: 90,
    maxIllegalAttempts: 3,
    historyLimit: 40,
  },
  /** Debate-mode defaults (user-adjustable before a debate starts). */
  debate: {
    rounds: 3,
    maxTurns: 24,
    turnTimeoutSec: 90,
    judgeTimeoutSec: 120,
  },
  overload: {
    /** Placeholder game title; change here to rebrand this mode. */
    name: 'OVERLOAD',
    maxActions: 300,
  },
  /** Delay between moves for each speed preset (ms). */
  speeds: {
    slow: 2600,
    normal: 1000,
    fast: 150,
  },
  /** Path of the optional stateless proxy function. */
  proxyPath: '/api/proxy',
} as const

export type Speed = keyof typeof APP_CONFIG.speeds
