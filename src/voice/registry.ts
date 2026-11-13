import { browserVoiceEngine } from './browser'
import { elevenLabsEngine, openAITtsEngine } from './stubs'
import type { VoiceEngine } from './types'

/** Add a TTS engine: one file implementing VoiceEngine + one line here. */
export const VOICE_ENGINES: VoiceEngine[] = [browserVoiceEngine, openAITtsEngine, elevenLabsEngine]

export const DEFAULT_ENGINE_ID = browserVoiceEngine.id

export function getVoiceEngine(id: string): VoiceEngine {
  const e = VOICE_ENGINES.find((v) => v.id === id)
  return e && !e.comingSoon ? e : browserVoiceEngine
}
