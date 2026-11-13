import { errorFromResponse, providerFetch } from './http'
import { readSSE } from './openaiCompatible'
import type { ChatMessage, DeltaHandler, ModelInfo, ProviderAdapter, SendMoveRequest, SendMoveResponse, TokenUsage } from './types'
import { ProviderError } from './types'

/**
 * Anthropic Messages API, called straight from the browser with the user's key
 * (the `anthropic-dangerous-direct-browser-access` header enables CORS).
 *
 * Effort mapping uses the live capability flags from GET /v1/models:
 *  - models with adaptive thinking: thinking {type: adaptive} + output_config.effort
 *  - older models with budgeted thinking only: thinking {type: enabled, budget_tokens}
 *  - Default / Off: no thinking parameters (the model's own default)
 */
const BASE = 'https://api.anthropic.com/v1'
const VERSION = '2023-06-01'
const BUDGET: Record<'low' | 'medium' | 'high', number> = { low: 2048, medium: 6000, high: 14000 }

function headers(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

const cap = (caps: any, ...path: string[]): boolean | null => {
  let cur = caps
  for (const p of path) {
    if (!cur || typeof cur !== 'object') return null
    cur = cur[p]
  }
  return typeof cur?.supported === 'boolean' ? cur.supported : null
}

function buildBody(req: SendMoveRequest, stream: boolean) {
  const system = req.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const messages = req.messages
    .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))
  const caps = (req.modelInfo?.meta?.capabilities ?? null) as any
  const modelMax = typeof req.modelInfo?.meta?.maxOutput === 'number' ? (req.modelInfo.meta.maxOutput as number) : null
  let maxTokens = stream ? 32000 : 16000
  if (modelMax) maxTokens = Math.min(maxTokens, modelMax)
  const body: Record<string, unknown> = { model: req.model, max_tokens: maxTokens, messages }
  if (system) body.system = system
  if (stream) body.stream = true

  const e = req.effort
  if (e === 'low' || e === 'medium' || e === 'high') {
    const adaptive = cap(caps, 'thinking', 'types', 'adaptive')
    const budgeted = cap(caps, 'thinking', 'types', 'enabled')
    const effortOk = cap(caps, 'effort', e)
    if (adaptive !== false && (adaptive === true || budgeted !== true)) {
      body.thinking = { type: 'adaptive' }
      if (effortOk !== false) body.output_config = { effort: e }
    } else if (budgeted) {
      const budget = Math.min(BUDGET[e], maxTokens - 1024)
      if (budget >= 1024) body.thinking = { type: 'enabled', budget_tokens: budget }
    }
  }
  return body
}

function usageOf(u: any, prev?: TokenUsage): TokenUsage {
  const input = Number(u?.input_tokens ?? 0) + Number(u?.cache_read_input_tokens ?? 0) + Number(u?.cache_creation_input_tokens ?? 0)
  return {
    promptTokens: input || prev?.promptTokens || 0,
    completionTokens: Number(u?.output_tokens ?? 0) || prev?.completionTokens || 0,
    costUsd: null,
  }
}

async function post(req: SendMoveRequest, stream: boolean) {
  if (!req.credentials.apiKey) throw new ProviderError('No Anthropic API key set.', { kind: 'auth' })
  const res = await providerFetch(`${BASE}/messages`, {
    method: 'POST',
    headers: headers(req.credentials.apiKey),
    body: JSON.stringify(buildBody(req, stream)),
    signal: req.signal,
    useProxy: req.credentials.useProxy,
  })
  if (!res.ok) throw await errorFromResponse(res)
  return res
}

export const anthropicAdapter: ProviderAdapter = {
  id: 'anthropic',
  label: 'Anthropic',
  keyHelp: 'Create a key in the Anthropic Console. Effort maps to adaptive thinking effort (or a thinking budget on older models).',
  keyUrl: 'https://console.anthropic.com/settings/keys',
  needsBaseUrl: false,
  group: 'direct',
  hasCredentials: (c) => Boolean(c.apiKey?.trim()),

  async listModels(c, signal) {
    if (!c.apiKey) throw new ProviderError('Add an Anthropic API key to load the live model list.', { kind: 'auth' })
    const out: ModelInfo[] = []
    let after: string | null = null
    for (let page = 0; page < 10; page++) {
      const q = new URLSearchParams({ limit: '1000' })
      if (after) q.set('after_id', after)
      const res = await providerFetch(`${BASE}/models?${q}`, { headers: headers(c.apiKey), signal, useProxy: c.useProxy })
      if (!res.ok) throw await errorFromResponse(res)
      const data = await res.json()
      for (const m of Array.isArray(data?.data) ? data.data : []) {
        const thinking = cap(m.capabilities, 'thinking')
        out.push({
          id: String(m.id),
          name: String(m.display_name ?? m.id),
          contextLength: typeof m.max_input_tokens === 'number' ? m.max_input_tokens : null,
          pricing: { prompt: null, completion: null },
          supportsReasoning: thinking,
          meta: { capabilities: m.capabilities ?? null, maxOutput: typeof m.max_tokens === 'number' ? m.max_tokens : null },
        })
      }
      if (!data?.has_more || !data?.last_id) break
      after = String(data.last_id)
    }
    return out
  },

  effortSupport: (m) => (m ? m.supportsReasoning : null),

  async sendMove(req) {
    const res = await post(req, false)
    const data = await res.json().catch(() => null)
    if (!data) throw new ProviderError('Provider returned an unreadable response.', { kind: 'server' })
    const text = (Array.isArray(data.content) ? data.content : [])
      .filter((b: any) => b?.type === 'text')
      .map((b: any) => b.text ?? '')
      .join('')
    return {
      text,
      usage: usageOf(data.usage),
      finishReason: data.stop_reason,
      refused: data.stop_reason === 'refusal',
    }
  },

  async streamMove(req, onDelta: DeltaHandler): Promise<SendMoveResponse> {
    const res = await post(req, true)
    let text = ''
    let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, costUsd: null }
    let stop: string | undefined
    let err: string | null = null
    await readSSE(res, (ev) => {
      switch (ev?.type) {
        case 'message_start':
          usage = usageOf(ev.message?.usage, usage)
          break
        case 'content_block_delta':
          if (ev.delta?.type === 'text_delta' && ev.delta.text) {
            text += ev.delta.text
            onDelta(ev.delta.text)
          }
          break
        case 'message_delta':
          if (ev.delta?.stop_reason) stop = ev.delta.stop_reason
          if (ev.usage) usage = { ...usage, completionTokens: Number(ev.usage.output_tokens ?? usage.completionTokens) }
          break
        case 'error':
          err = ev.error?.message ?? 'Stream error'
          break
      }
    })
    if (err && !text) {
      const overloaded = /overload/i.test(err)
      throw new ProviderError(`Provider error: ${err}`, { kind: overloaded ? 'rate_limit' : 'server' })
    }
    return { text, usage, finishReason: stop, refused: stop === 'refusal' }
  },
}
