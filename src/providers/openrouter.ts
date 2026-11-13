import { APP_CONFIG } from '../config/app'
import { errorFromResponse, providerFetch } from './http'
import { chatCompletion, chatCompletionStream } from './openaiCompatible'
import type { ModelInfo, ProviderAdapter, SendMoveRequest } from './types'

const BASE = 'https://openrouter.ai/api/v1'

function price(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export const openRouterAdapter: ProviderAdapter = {
  id: 'openrouter',
  label: 'OpenRouter',
  keyHelp: 'Create a key at openrouter.ai/keys. One key gives access to hundreds of models.',
  keyUrl: 'https://openrouter.ai/keys',
  needsBaseUrl: false,
  group: 'gateway',

  hasCredentials: (c) => Boolean(c.apiKey?.trim()),

  async listModels(_c, signal) {
    // Public endpoint, no key required.
    const res = await providerFetch(`${BASE}/models`, { signal })
    if (!res.ok) throw await errorFromResponse(res)
    const data = await res.json()
    const list: any[] = Array.isArray(data?.data) ? data.data : []
    return list
      .map<ModelInfo>((m) => {
        const params: string[] | undefined = Array.isArray(m.supported_parameters)
          ? m.supported_parameters
          : undefined
        return {
          id: String(m.id),
          name: String(m.name ?? m.id),
          contextLength: typeof m.context_length === 'number' ? m.context_length : null,
          pricing: { prompt: price(m.pricing?.prompt), completion: price(m.pricing?.completion) },
          supportsReasoning: params ? params.includes('reasoning') || params.includes('include_reasoning') : null,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  },

  effortSupport: (m) => (m ? m.supportsReasoning : null),

  sendMove: (req) => chatCompletion(request(req)),
  streamMove: (req, onDelta) => chatCompletionStream({ ...request(req), onDelta }),
}

function request({ model, messages, effort, credentials, signal }: SendMoveRequest) {
  const body: Record<string, unknown> = { model }
  if (effort === 'off') body.reasoning = { enabled: false }
  else if (effort !== 'default') body.reasoning = { effort, exclude: true }
  body.usage = { include: true }
  return {
    url: `${BASE}/chat/completions`,
    apiKey: credentials.apiKey,
    body,
    messages,
    signal,
    useProxy: credentials.useProxy,
    extraHeaders: {
      'HTTP-Referer': typeof location !== 'undefined' ? location.origin : '',
      'X-Title': APP_CONFIG.APP_NAME,
    },
  }
}
