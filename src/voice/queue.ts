import { useSyncExternalStore } from 'react'
import type { Seat } from '../core/types'
import { getVoiceEngine } from './registry'
import type { VoiceSettings } from './types'

export interface SpeechItem {
  seat: Seat
  /** Transcript index of the turn being spoken (for highlighting). */
  turnIndex: number
  text: string
  engineId: string
  settings: VoiceSettings
}

export interface SpeechState {
  speaking: { seat: Seat; turnIndex: number } | null
  pending: number
}

/**
 * One global, strictly sequential speech queue: two voices can never overlap.
 * `drained()` lets the debate wait for the voice before requesting the next turn.
 */
class SpeechQueue {
  private items: SpeechItem[] = []
  private current: { item: SpeechItem; ctrl: AbortController } | null = null
  private running = false
  private muted = false
  private waiters: Array<() => void> = []
  private listeners = new Set<() => void>()
  state: SpeechState = { speaking: null, pending: 0 }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getState = () => this.state

  private emit() {
    this.state = {
      speaking: this.current ? { seat: this.current.item.seat, turnIndex: this.current.item.turnIndex } : null,
      pending: this.items.length,
    }
    this.listeners.forEach((l) => l())
    if (!this.current && !this.items.length) {
      const w = this.waiters
      this.waiters = []
      w.forEach((r) => r())
    }
  }

  enqueue(item: SpeechItem) {
    if (this.muted || !item.text.trim()) return
    this.items.push(item)
    this.emit()
    void this.pump()
  }

  private async pump() {
    if (this.running) return
    this.running = true
    try {
      while (this.items.length && !this.muted) {
        const item = this.items.shift()!
        const ctrl = new AbortController()
        this.current = { item, ctrl }
        this.emit()
        try {
          await getVoiceEngine(item.engineId).speak(item.text, { ...item.settings, signal: ctrl.signal })
        } catch {
          /* audio problems never stall the debate */
        }
        this.current = null
      }
    } finally {
      this.running = false
      this.current = null
      this.emit()
    }
  }

  /** Stop the current speech and move to the next queued item. */
  skip() {
    this.current?.ctrl.abort()
  }

  /** Stop everything and drop the queue. */
  clear() {
    this.items = []
    this.current?.ctrl.abort()
    if (this.current) getVoiceEngine(this.current.item.engineId).stop()
    this.emit()
  }

  setMuted(m: boolean) {
    this.muted = m
    if (m) this.clear()
  }

  isIdle() {
    return !this.current && !this.items.length
  }

  /** Resolves once nothing is speaking or queued. */
  drained(): Promise<void> {
    if (this.isIdle()) return Promise.resolve()
    return new Promise((resolve) => this.waiters.push(resolve))
  }
}

export const speechQueue = new SpeechQueue()

export function useSpeechState(): SpeechState {
  return useSyncExternalStore(speechQueue.subscribe, speechQueue.getState, speechQueue.getState)
}
