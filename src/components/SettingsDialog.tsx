import { Modal } from './Modal'

export interface MatchPrefs {
  maxFullMoves: number
  moveTimeoutSec: number
}

export function SettingsDialog({
  open,
  onClose,
  prefs,
  onChange,
  locked,
  onShowIntro,
}: {
  open: boolean
  onClose: () => void
  prefs: MatchPrefs
  onChange: (p: Partial<MatchPrefs>) => void
  locked: boolean
  onShowIntro: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="Match settings">
      <div className="form">
        {locked && <div className="privacy-note small">Limits are locked while a match is in progress.</div>}
        <label className="field-label">
          Max moves per game <span className="muted">(full moves; draw when reached)</span>
          <input
            className="field"
            type="number"
            min={5}
            max={1000}
            value={prefs.maxFullMoves}
            disabled={locked}
            onChange={(e) => onChange({ maxFullMoves: Math.max(5, Math.min(1000, Number(e.target.value) || 5)) })}
          />
        </label>
        <label className="field-label">
          Per-move timeout <span className="muted">(seconds)</span>
          <input
            className="field"
            type="number"
            min={5}
            max={900}
            value={prefs.moveTimeoutSec}
            disabled={locked}
            onChange={(e) => onChange({ moveTimeoutSec: Math.max(5, Math.min(900, Number(e.target.value) || 5)) })}
          />
        </label>
        <p className="muted small">
          A model gets 3 attempts per turn to give a legal move; after 3 invalid replies it forfeits.
        </p>
        <div className="kbd-list small">
          <div><kbd>Space</kbd> Pause / resume</div>
          <div><kbd>←</kbd> <kbd>→</kbd> Step through moves</div>
          <div><kbd>V</kbd> Cycle board view</div>
          <div><kbd>M</kbd> Mute</div>
        </div>
        <div className="row gap end">
          <button className="link" onClick={onShowIntro}>Show welcome screen</button>
          <button className="primary-btn small" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  )
}
