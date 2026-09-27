// AI provider abstraction (§8.1). PCI is not hard-wired to one model
// provider: anything implementing this interface can run behind the PCI
// contract, schema, validator and integrity audit without redefining PCI.
import type { EngineInput } from '@/lib/pci/types'

export interface ProviderCapabilities {
  analyze: boolean
  embed: boolean
  summarize: boolean
  transcribe: boolean
  synthesizeSpeech: boolean
  /** Runs without a network connection. */
  offline: boolean
  /** Material leaves the device. */
  sendsMaterial: boolean
}

export interface SpeechHandle {
  pause(): void
  resume(): void
  stop(): void
  readonly done: Promise<void>
}

export interface PCIProvider {
  id: string
  label: string
  model: string
  description: string
  capabilities: ProviderCapabilities
  analyze(input: EngineInput): Promise<unknown>
  embed(texts: string[]): Promise<number[][]>
  summarize(text: string): Promise<string>
  transcribe?(audio: Blob): Promise<string>
  synthesizeSpeech?(text: string, opts?: { rate?: number; voice?: string }): SpeechHandle
}

export type ProviderId = 'local' | 'remote'
