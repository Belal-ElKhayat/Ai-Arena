import { useEffect, useState } from 'react'
import { getVoiceEngine } from './registry'
import type { VoiceInfo } from './types'

/** Voices for an engine, loaded asynchronously (browser voices arrive late in Chrome). */
export function useVoices(engineId: string) {
  const [state, setState] = useState<{ voices: VoiceInfo[]; loading: boolean; available: boolean }>({
    voices: [],
    loading: true,
    available: true,
  })
  useEffect(() => {
    let alive = true
    const engine = getVoiceEngine(engineId)
    if (!engine.isAvailable()) {
      setState({ voices: [], loading: false, available: false })
      return
    }
    setState((s) => ({ ...s, loading: true }))
    const load = () =>
      engine
        .listVoices()
        .then((voices) => alive && setState({ voices, loading: false, available: true }))
        .catch(() => alive && setState({ voices: [], loading: false, available: true }))
    void load()
    // Voices can change later (e.g. Chrome loads network voices after start-up).
    const s = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    const onChange = () => void load()
    s?.addEventListener?.('voiceschanged', onChange)
    return () => {
      alive = false
      s?.removeEventListener?.('voiceschanged', onChange)
    }
  }, [engineId])
  return state
}

/** Pick two different voices, preferring the user's language. */
export function pickTwoVoices(voices: VoiceInfo[]): [string, string] {
  if (!voices.length) return ['', '']
  const lang = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2).toLowerCase()
  const same = voices.filter((v) => v.lang.toLowerCase().startsWith(lang))
  const pool = same.length >= 2 ? same : voices
  const a = pool.find((v) => v.local) ?? pool[0]
  const b = pool.find((v) => v.id !== a.id && v.name.split(' ')[0] !== a.name.split(' ')[0]) ?? pool.find((v) => v.id !== a.id) ?? a
  return [a.id, b.id]
}
