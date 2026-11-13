import { errorFromResponse, providerFetch } from './http'
import { chatCompletion, chatCompletionStream, joinUrl } from './openaiCompatible'
import type { Effort, ModelInfo, ProviderAdapter, SendMoveRequest } from './types'
import { ProviderError } from './types'

/**
 * Builds an adapter for a provider that speaks the OpenAI `/chat/completions`
 * dialect at a fixed base URL (OpenAI, xAI, Groq, Mistral, DeepSeek, Gemini...).
 * Each provider file is then a small config object.
 */
export interface OpenAICompatConfig {
  id: string
  label: string
  baseUrl: string
  keyUrl: string
  keyHelp: string
  /** How each effort level is sent. Missing entries are omitted from the request. */
  effortMap?: Partial<Record<Effort, Record<string, unknown>>>
  /** Whether to request usage in the final stream chunk (stream_options.include_usage). */
  streamUsage?: boolean
  /** Hide non-chat models (embeddings, audio, images) from the list. */
  isChatModel?: (id: string, raw: any) => boolean
  /** Normalise model IDs from /models (e.g. strip a "models/" prefix). */
  mapId?: (id: string) => string
  /** Convert one raw /models entry's pricing to USD per token (null = unknown). */
  pricing?: (raw: any) => { prompt: number | null; completion: number | null }
}

/** Shared filter for IDs that are clearly not chat models. */
export const NON_CHAT =
  /(embed|whisper|tts|dall-e|image|moderation|transcribe|realtime|audio|speech|search|davinci|babbage|guard|rerank|imagen|veo|aqa|ocr)/i

export const REASONING_EFFORT: OpenAICompatConfig['effortMap'] = {
  low: { reasoning_effort: 'low' },
  medium: { reasoning_effort: 'medium' },
  high: { reasoning_effort: 'high' },
}

export function openAICompatibleProvider(cfg: OpenAICompatConfig): ProviderAdapter {
  const request = ({ model, messages, effort, credentials, signal }: SendMoveRequest) => {
    if (!credentials.apiKey) throw new ProviderError(`No ${cfg.label} API key set.`, { kind: 'auth' })
    return {
      url: joinUrl(cfg.baseUrl, 'chat/completions'),
      apiKey: credentials.apiKey,
      body: { model, ...(cfg.effortMap?.[effort] ?? {}) },
      messages,
      signal,
      useProxy: credentials.useProxy,
    }
  }

  return {
    id: cfg.id,
    label: cfg.label,
    keyHelp: cfg.keyHelp,
    keyUrl: cfg.keyUrl,
    needsBaseUrl: false,
    group: 'direct',
    hasCredentials: (c) => Boolean(c.apiKey?.trim()),

    async listModels(c, signal) {
      if (!c.apiKey) throw new ProviderError(`Add a ${cfg.label} API key to load the live model list.`, { kind: 'auth' })
      const res = await providerFetch(joinUrl(cfg.baseUrl, 'models'), {
        headers: { Authorization: `Bearer ${c.apiKey}` },
        signal,
        useProxy: c.useProxy,
      })
      if (!res.ok) throw await errorFromResponse(res)
      const data = await res.json()
      const list: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
      return list
        .filter((m) => m && m.id && (cfg.isChatModel ? cfg.isChatModel(String(m.id), m) : !NON_CHAT.test(String(m.id))))
        .map<ModelInfo>((m) => {
          const id = cfg.mapId ? cfg.mapId(String(m.id)) : String(m.id)
          const ctx = m.context_length ?? m.context_window ?? m.max_context_length ?? null
          return {
            id,
            name: String(m.display_name ?? m.name ?? id),
            contextLength: typeof ctx === 'number' ? ctx : null,
            pricing: cfg.pricing ? cfg.pricing(m) : { prompt: null, completion: null },
            supportsReasoning: null,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    },

    // Model lists from these APIs don't say which models accept a reasoning setting.
    effortSupport: () => null,

    sendMove: (req) => chatCompletion(request(req)),
    streamMove: (req, onDelta) => chatCompletionStream({ ...request(req), onDelta, includeUsage: cfg.streamUsage }),
  }
}
