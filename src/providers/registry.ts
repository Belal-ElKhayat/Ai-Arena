import { anthropicAdapter } from './anthropic'
import { customOpenAIAdapter } from './customOpenAI'
import {
  deepseekAdapter,
  geminiAdapter,
  groqAdapter,
  mistralAdapter,
  openAIAdapter,
  togetherAdapter,
  xaiAdapter,
} from './direct'
import { openRouterAdapter } from './openrouter'
import type { ProviderAdapter } from './types'

/**
 * To add a provider: create one file that exports a ProviderAdapter (or one
 * `openAICompatibleProvider({...})` config for OpenAI-style APIs) and add it here.
 */
export const PROVIDERS: ProviderAdapter[] = [
  openRouterAdapter,
  openAIAdapter,
  anthropicAdapter,
  geminiAdapter,
  xaiAdapter,
  groqAdapter,
  mistralAdapter,
  deepseekAdapter,
  togetherAdapter,
  customOpenAIAdapter,
]

export const DEFAULT_PROVIDER_ID = openRouterAdapter.id

export const PROVIDER_GROUPS: Array<{ id: NonNullable<ProviderAdapter['group']>; label: string }> = [
  { id: 'gateway', label: 'Gateway' },
  { id: 'direct', label: 'Direct' },
  { id: 'custom', label: 'Custom' },
]

export function getProvider(id: string): ProviderAdapter {
  return PROVIDERS.find((p) => p.id === id) ?? openRouterAdapter
}
