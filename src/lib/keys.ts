import type { Credentials } from '../providers/types'
import { readStore, useStore } from './storage'

/**
 * API keys are stored ONLY in this browser's localStorage and are sent ONLY to
 * the provider the user selected. They are never logged.
 */
export type KeyStore = Record<string, Credentials>

export const KEYS_STORE = 'credentials'

export const readCredentials = (providerId: string): Credentials =>
  readStore<KeyStore>(KEYS_STORE, {})[providerId] ?? {}

export const useKeyStore = () => useStore<KeyStore>(KEYS_STORE, {})
