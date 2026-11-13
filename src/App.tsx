import { useCallback, useEffect, useState } from 'react'
import { APP_CONFIG } from './config/app'
import { Background } from './components/Background'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ModeHome } from './components/ModeHome'
import { ModeSwitch } from './components/ModeSwitch'
import { Onboarding } from './components/Onboarding'
import { MODES, type ModeId } from './games/registry'
import { HISTORY_STORE, isC4Record, isChessRecord, isDebateRecord, isOverloadRecord, isPentagoRecord, isUnoRecord, recordKind, type HistoryRecord } from './lib/history'
import { useStore } from './lib/storage'
import { ChessMode } from './modes/ChessMode'
import { DebateMode } from './modes/DebateMode'
import { ConnectFourMode } from './modes/ConnectFourMode'
import { PentagoMode } from './modes/PentagoMode'
import { OverloadMode } from './modes/OverloadMode'
import { UnoMode } from './modes/UnoMode'

type Playable = 'chess' | 'debate' | 'connect4' | 'pentago' | 'overload' | 'uno'
const isPlayable = (m: unknown): m is Playable => MODES.some((x) => x.id === m && x.available)

/**
 * App shell: background, first-run intro, mode switching. Each mode owns its
 * own arena; switching is locked while a match is in progress.
 */
export default function App() {
  const [lastMode, setLastMode] = useStore<ModeId | null>('lastMode', null)
  const [onboarded, setOnboarded] = useStore('onboarded', false)
  const [view, setView] = useState<Playable | 'home'>(() => (isPlayable(lastMode) ? lastMode : 'home'))
  const [busy, setBusy] = useState(false)
  const [pendingReplay, setPendingReplay] = useState<HistoryRecord | null>(null)
  const [history] = useStore<HistoryRecord[]>(HISTORY_STORE, [])

  const open = useCallback(
    (m: ModeId, replay: HistoryRecord | null = null) => {
      if (!isPlayable(m)) return
      setPendingReplay(replay)
      setLastMode(m)
      setView(m)
      setBusy(false)
    },
    [setLastMode],
  )

  useEffect(() => {
    const title = view === 'home' ? null : MODES.find((mode) => mode.id === view)?.title
    document.title = title ? `${APP_CONFIG.APP_NAME} — AI vs AI ${title}` : APP_CONFIG.APP_NAME
  }, [view])

  const onReplayOther = useCallback(
    (r: HistoryRecord) => open(recordKind(r), r),
    [open],
  )

  const modeSwitch =
    view === 'home' ? null : <ModeSwitch mode={view} onChange={(m) => open(m)} onHome={() => setView('home')} locked={busy} />

  return (
    <>
      <Background />
      {view === 'home' && (
        <div className="app">
          <ModeHome lastMode={lastMode} onPick={(m) => open(m)} history={history} onReplay={onReplayOther} />
        </div>
      )}
      {view === 'chess' && (
        <ErrorBoundary onReset={() => setView('home')}>
        <ChessMode
          key="chess"
          modeSwitch={modeSwitch}
          onBusyChange={setBusy}
          initialReplay={pendingReplay && isChessRecord(pendingReplay) ? pendingReplay : null}
          onReplayOther={onReplayOther}
        />
        </ErrorBoundary>
      )}
      {view === 'debate' && (
        <ErrorBoundary onReset={() => setView('home')}>
          <DebateMode
            key="debate"
            modeSwitch={modeSwitch}
            onBusyChange={setBusy}
            initialReplay={pendingReplay && isDebateRecord(pendingReplay) ? pendingReplay : null}
            onReplayOther={onReplayOther}
          />
        </ErrorBoundary>
      )}
      {view === 'connect4' && (
        <ErrorBoundary onReset={() => setView('home')}>
          <ConnectFourMode
            key="connect4"
            modeSwitch={modeSwitch}
            onBusyChange={setBusy}
            initialReplay={pendingReplay && isC4Record(pendingReplay) ? pendingReplay : null}
            onReplayOther={onReplayOther}
          />
        </ErrorBoundary>
      )}
      {view === 'pentago' && (
        <ErrorBoundary onReset={() => setView('home')}>
          <PentagoMode
            key="pentago"
            modeSwitch={modeSwitch}
            onBusyChange={setBusy}
            initialReplay={pendingReplay && isPentagoRecord(pendingReplay) ? pendingReplay : null}
            onReplayOther={onReplayOther}
          />
        </ErrorBoundary>
      )}
      {view === 'overload' && (
        <ErrorBoundary onReset={() => setView('home')}>
          <OverloadMode
            key="overload"
            modeSwitch={modeSwitch}
            onBusyChange={setBusy}
            initialReplay={pendingReplay && isOverloadRecord(pendingReplay) ? pendingReplay : null}
            onReplayOther={onReplayOther}
          />
        </ErrorBoundary>
      )}
      {view === 'uno' && (
        <ErrorBoundary onReset={() => setView('home')}>
          <UnoMode
            key="uno"
            modeSwitch={modeSwitch}
            onBusyChange={setBusy}
            initialReplay={pendingReplay && isUnoRecord(pendingReplay) ? pendingReplay : null}
            onReplayOther={onReplayOther}
          />
        </ErrorBoundary>
      )}
      {!onboarded && <Onboarding onDone={() => setOnboarded(true)} />}
    </>
  )
}
