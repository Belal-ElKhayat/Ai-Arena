import { chessModule } from './chess/module'
import { createDebateModule } from './debate/module'
import { createConnectFourModule } from './connect4/module'
import { createPentagoModule } from './pentago/module'
import { createOverloadModule } from './overload/module'
import { APP_CONFIG } from '../config/app'

/**
 * Every game is a module in /src/games/<game> implementing GameModule.
 * Fixed-rule games export a module; configurable ones (debate) export a factory.
 */
export const GAMES = {
  chess: chessModule,
  debate: createDebateModule,
  connect4: createConnectFourModule,
  pentago: createPentagoModule,
  overload: createOverloadModule,
} as const

export type GameId = keyof typeof GAMES

/** Modes shown in the mode switcher. `available: false` renders a "Coming soon" card. */
export type ModeId = GameId | 'uno'

export const MODES: Array<{ id: ModeId; title: string; blurb: string; available: boolean }> = [
  { id: 'chess', title: 'Chess', blurb: 'Two models play a full game, every move checked by chess.js.', available: true },
  { id: 'debate', title: 'Debate', blurb: 'Two models argue a topic of your choice, with an optional judge and voices.', available: true },
  { id: 'connect4', title: 'Connect Four', blurb: 'Two models drop discs on a 7×6 board — first to connect four wins.', available: true },
  { id: 'pentago', title: 'Pentago', blurb: 'Place a marble, twist a quadrant. Five in a row wins — and every twist can backfire.', available: true },
  { id: 'overload', title: APP_CONFIG.overload.name, blurb: 'Hidden rounds, power cells and items: choose when to risk a surge cannon shot.', available: true },
  { id: 'uno', title: 'Uno', blurb: 'Hidden hands, wild colors and a table full of rival AIs.', available: true },
]
