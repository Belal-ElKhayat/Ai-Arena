import { MODES, type ModeId } from '../games/registry'
import { IconCards, IconChat, IconDiscs, IconGrid, IconKnight, IconOverload, IconPentago } from './Icons'

const ICON: Partial<Record<ModeId, typeof IconChat>> = { chess: IconKnight, debate: IconChat, connect4: IconDiscs, pentago: IconPentago, overload: IconOverload, uno: IconCards }

/** Compact glass segmented control in the top bar: Chess · Debate · all modes. */
export function ModeSwitch({
  mode,
  onChange,
  onHome,
  locked,
}: {
  mode: ModeId
  onChange: (m: ModeId) => void
  onHome: () => void
  locked: boolean
}) {
  const title = locked ? 'Finish or end the current match to switch modes' : undefined
  return (
    <div className="mode-switch glass" role="tablist" aria-label="Game mode" title={title}>
      {MODES.filter((m) => m.available).map((m) => {
        const Icon = ICON[m.id] ?? IconGrid
        return (
          <button
            key={m.id}
            role="tab"
            aria-selected={m.id === mode}
            className={m.id === mode ? 'on' : ''}
            disabled={locked && m.id !== mode}
            onClick={() => m.id !== mode && onChange(m.id)}
          >
            <Icon size={14} />
            <span className="mode-switch-label">{m.title}</span>
          </button>
        )
      })}
      <button className="mode-switch-home" onClick={onHome} disabled={locked} aria-label="All modes" title={title ?? 'All modes'}>
        <IconGrid size={14} />
      </button>
    </div>
  )
}
