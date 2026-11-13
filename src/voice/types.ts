/**
 * Pluggable text-to-speech engines. Each engine is one file implementing
 * VoiceEngine, registered in ./registry.ts.
 */

export interface VoiceInfo {
  id: string
  name: string
  lang: string
  /** Installed on the device (vs. network voice). */
  local?: boolean
}

/** Per-debater voice settings. */
export interface VoiceSettings {
  voiceId: string
  /** 0.5 – 2 (1 = normal). */
  rate: number
  /** 0 – 2 (1 = normal). */
  pitch: number
}

export interface SpeakOptions extends VoiceSettings {
  signal: AbortSignal
  /** Engine credentials (paid engines only; the user's own key, kept in the browser). */
  apiKey?: string
}

export interface VoiceEngine {
  id: string
  label: string
  /** Short helper text shown in the voice settings. */
  description: string
  /** Not implemented yet: shown disabled with a "Coming soon" tag. */
  comingSoon?: boolean
  /** Whether this engine needs the user's own API key. */
  needsKey?: boolean
  /** Whether the engine can run in this browser right now. */
  isAvailable(): boolean
  /** List the voices the user can pick from. */
  listVoices(): Promise<VoiceInfo[]>
  /**
   * Speak text and resolve when finished (or when `signal` aborts).
   * Must never reject for normal playback problems — resolve instead so a
   * debate never stalls on audio.
   */
  speak(text: string, opts: SpeakOptions): Promise<void>
  /** Stop anything currently playing. */
  stop(): void
}
