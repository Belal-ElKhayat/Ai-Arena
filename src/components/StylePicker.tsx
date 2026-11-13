import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ALL_STYLES, CUSTOM_STYLE_ID, STYLE_MAX_CHARS, getStyle, hexToRgb, randomStyleId, type ChessStyle } from '../games/chess/styles'
import {
  IconBolt,
  IconChat,
  IconChevron,
  IconCompass,
  IconCrown,
  IconDice,
  IconHourglass,
  IconLock,
  IconMask,
  IconPen,
  IconScale,
  IconShield,
  IconSword,
  IconTarget,
} from './Icons'

const ICONS: Record<string, typeof IconScale> = {
  scale: IconScale,
  sword: IconSword,
  shield: IconShield,
  compass: IconCompass,
  target: IconTarget,
  chat: IconChat,
  mask: IconMask,
  crown: IconCrown,
  hourglass: IconHourglass,
  bolt: IconBolt,
  dice: IconDice,
  pen: IconPen,
}

export function StyleIcon({ style, size = 15 }: { style: ChessStyle; size?: number }) {
  const I = ICONS[style.icon] ?? IconScale
  return (
    <span className="style-icon" style={{ '--sa': style.accent, '--sa-rgb': hexToRgb(style.accent) } as CSSProperties}>
      <I size={size} />
    </span>
  )
}

export const styleVars = (s: ChessStyle) => ({ '--sa': s.accent, '--sa-rgb': hexToRgb(s.accent) }) as CSSProperties

/** "Style" dropdown for a chess player panel, with Random and a private Custom box. */
export function StylePicker({
  styleId,
  custom,
  locked,
  seat,
  onChange,
  styleOptions,
}: {
  styleId: string | undefined
  custom: string | undefined
  locked: boolean
  seat: 0 | 1
  onChange: (patch: { styleId?: string; customStyle?: string }) => void
  styleOptions?: ChessStyle[]
}) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const choices = styleOptions ?? ALL_STYLES
  const cur = choices.find((s) => s.id === styleId) ?? (styleOptions ? styleOptions[0] : getStyle(styleId))

  useEffect(() => {
    if (!open) return
    setHi(Math.max(0, choices.findIndex((s) => s.id === cur.id)))
    const h = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pick = (id: string) => {
    onChange({ styleId: id })
    setOpen(false)
  }

  return (
    <div className="style-field" style={styleVars(cur)}>
      <div className="style-label">
        <span>Style</span>
        {locked ? (
          <span className="lock small-lock" title="Style is locked during the match">
            <IconLock size={12} />
          </span>
        ) : (
          <button className="link small" onClick={() => onChange({ styleId: styleOptions ? choices.filter((s) => s.id !== cur.id)[Math.floor(Math.random() * Math.max(1, choices.length - 1))]?.id ?? cur.id : randomStyleId(cur.id) })} title="Pick a random built-in style">
            <IconDice size={12} /> Random style
          </button>
        )}
      </div>
      <div className={`picker style-picker ${open ? 'open' : ''}`} ref={root}>
        <button
          type="button"
          className="field picker-trigger style-trigger"
          disabled={locked}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Player ${seat + 1} style: ${cur.name}`}
          onKeyDown={(e) => {
            if (!open) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHi((h) => Math.min(ALL_STYLES.length - 1, h + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHi((h) => Math.max(0, h - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              pick(ALL_STYLES[hi].id)
            } else if (e.key === 'Escape') {
              e.stopPropagation()
              setOpen(false)
            }
          }}
        >
          <StyleIcon style={cur} />
          <span className="picker-value">
            <span className="picker-name">{cur.name}</span>
            <span className="picker-id">{cur.description}</span>
          </span>
          <IconChevron className="chev" />
        </button>
        {open && (
          <div className={`picker-pop glass accent-p${seat + 1}`}>
            <ul className="picker-list style-list" role="listbox">
              {choices.map((s, i) => (
                <li
                  key={s.id}
                  role="option"
                  aria-selected={s.id === cur.id}
                  className={`picker-opt style-opt ${i === hi ? 'hi' : ''} ${s.id === cur.id ? 'sel' : ''}`}
                  style={styleVars(s)}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(s.id)
                  }}
                >
                  <StyleIcon style={s} />
                  <div className="opt-main">
                    <span className="opt-name">{s.name}</span>
                    <span className="opt-desc">{s.description}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {cur.id === CUSTOM_STYLE_ID && (
        <div className="instr">
          <div className="instr-head">
            <span className="field-label-text">Private instructions</span>
            <span className="private-tag" title="Only this player sees these instructions. The opponent never does.">
              <IconLock size={11} /> private
            </span>
          </div>
          <textarea
            className="field instr-box"
            value={custom ?? ''}
            disabled={locked}
            maxLength={STYLE_MAX_CHARS}
            rows={3}
            placeholder="How should this model play and talk? e.g. “Castle late, love knight moves, comment like a sports commentator.”"
            aria-label={`Private style instructions for Player ${seat + 1}`}
            onChange={(e) => onChange({ customStyle: e.target.value.slice(0, STYLE_MAX_CHARS) })}
          />
          <div className="instr-foot small muted">
            <span>Only this player sees it.</span>
            <span className="mono">
              {(custom ?? '').length}/{STYLE_MAX_CHARS}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Short label like "Aggressive" or "Custom". */
export const styleName = (id: string | undefined) => getStyle(id).name
