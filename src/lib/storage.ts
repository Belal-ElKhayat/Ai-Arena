import { useCallback, useEffect, useState } from 'react'
import { APP_CONFIG } from '../config/app'

const k = (name: string) => `${APP_CONFIG.STORAGE_PREFIX}:${name}`

export function readStore<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k(name))
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeStore<T>(name: string, value: T) {
  try {
    localStorage.setItem(k(name), JSON.stringify(value))
  } catch {
    /* storage full or disabled — ignore */
  }
  window.dispatchEvent(new CustomEvent('arena-store', { detail: name }))
}

/** localStorage-backed state that stays in sync across components. */
export function useStore<T>(name: string, fallback: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readStore(name, fallback))
  useEffect(() => {
    const onChange = (e: Event) => {
      if ((e as CustomEvent).detail === name) setValue(readStore(name, fallback))
    }
    window.addEventListener('arena-store', onChange)
    return () => window.removeEventListener('arena-store', onChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(readStore(name, fallback)) : v
      writeStore(name, next)
      setValue(next)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name],
  )
  return [value, set]
}
