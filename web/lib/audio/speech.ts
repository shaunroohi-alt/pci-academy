// Device narration via the Web Speech API. It reads the exact text currently
// displayed, so it cannot drift from the text version (§6.3). Recorded
// narration, when it exists, is preferred and version-checked in ./narration.
import type { SpeechHandle } from '@/lib/ai/provider'

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

export function voices(): SpeechSynthesisVoice[] {
  if (!speechAvailable()) return []
  return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'))
}

export interface SpeakOptions {
  rate?: number
  voice?: string
  startAt?: number
  onBlock?: (index: number) => void
}

/** Speak a list of blocks (paragraphs) in order, reporting the current block. */
export function speak(blocks: string[], opts: SpeakOptions = {}): SpeechHandle {
  let stopped = false
  let resolveDone: () => void = () => {}
  const done = new Promise<void>((r) => (resolveDone = r))
  if (!speechAvailable()) {
    resolveDone()
    return { pause() {}, resume() {}, stop() {}, done }
  }
  const synth = window.speechSynthesis
  synth.cancel()
  const voice = opts.voice ? synth.getVoices().find((v) => v.name === opts.voice) : undefined

  const play = (i: number) => {
    if (stopped || i >= blocks.length) {
      resolveDone()
      return
    }
    const text = blocks[i].trim()
    if (!text) return play(i + 1)
    const u = new SpeechSynthesisUtterance(text)
    u.rate = opts.rate ?? 1
    if (voice) u.voice = voice
    u.onstart = () => opts.onBlock?.(i)
    u.onend = () => play(i + 1)
    u.onerror = () => {
      stopped = true
      resolveDone()
    }
    synth.speak(u)
  }
  play(Math.max(0, opts.startAt ?? 0))

  return {
    pause: () => synth.pause(),
    resume: () => synth.resume(),
    stop: () => {
      stopped = true
      synth.cancel()
      resolveDone()
    },
    done,
  }
}
