/**
 * Provider adapter contract. Each AI provider is one file implementing
 * ProviderAdapter and registered in ./registry.ts.
 */

export type Effort = 'default' | 'off' | 'low' | 'medium' | 'high'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface Credentials {
  apiKey?: string
  baseUrl?: string
  useProxy?: boolean
}

/** Price per single token in USD. null = unknown. */
export interface Pricing {
  prompt: number | null
  completion: number | null
}

export interface ModelInfo {
  id: string
  name: string
  contextLength: number | null
  pricing: Pricing
  /** true / false when known, null when the provider doesn't say. */
  supportsReasoning: boolean | null
  /** Provider-specific extras (e.g. capability flags) kept for the adapter's own use. */
  meta?: Record<string, unknown>
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  /** Cost in USD as reported by the provider, if available. */
  costUsd: number | null
}

export interface SendMoveRequest {
  model: string
  messages: ChatMessage[]
  effort: Effort
  credentials: Credentials
  signal: AbortSignal
  /** Cached model metadata, when the runner has it (lets adapters map effort per model). */
  modelInfo?: ModelInfo
}

export interface SendMoveResponse {
  text: string
  usage: TokenUsage
  /** True when the provider reports a safety refusal / content filter stop. */
  refused?: boolean
  /** Raw stop / finish reason, if reported. */
  finishReason?: string
}

/** Receives each streamed text fragment as it arrives. */
export type DeltaHandler = (fragment: string) => void

export interface ProviderAdapter {
  id: string
  label: string
  /** Short helper shown in the key dialog. */
  keyHelp: string
  keyUrl?: string
  needsBaseUrl: boolean
  /** Fetch the live model list. Should not require a key when the provider allows it. */
  listModels(credentials: Credentials, signal?: AbortSignal): Promise<ModelInfo[]>
  sendMove(req: SendMoveRequest): Promise<SendMoveResponse>
  /**
   * Optional token streaming. Calls onDelta with each text fragment and resolves
   * with the full text + usage. Games that don't stream (chess) never call it.
   */
  streamMove?(req: SendMoveRequest, onDelta: DeltaHandler): Promise<SendMoveResponse>
  /** Grouping in the provider dropdown. */
  group?: 'gateway' | 'direct' | 'custom'
  /** Whether the effort control applies to this model (null = unknown, allowed). */
  effortSupport(model: ModelInfo | undefined): boolean | null
  hasCredentials(credentials: Credentials): boolean
}

/** Errors thrown by adapters. `retryable` drives the Retry button. */
export class ProviderError extends Error {
  status?: number
  retryable: boolean
  kind: 'auth' | 'rate_limit' | 'timeout' | 'network' | 'server' | 'bad_request' | 'unknown'
  constructor(
    message: string,
    opts: { status?: number; retryable?: boolean; kind?: ProviderError['kind'] } = {},
  ) {
    super(message)
    this.name = 'ProviderError'
    this.status = opts.status
    this.retryable = opts.retryable ?? true
    this.kind = opts.kind ?? 'unknown'
  }
}
