import { ENGINE_VERSION } from '@/lib/pci/canon'
import { analyzeLocally } from '@/lib/pci/engine'
import { splitSentences } from '@/lib/pci/text'
import { hashedEmbedding } from '@/lib/pci/vector'
import { speak, speechAvailable } from '@/lib/audio/speech'
import type { PCIProvider } from './provider'

/** The on-device PCI Engine: deterministic, lexical, offline. Material never leaves the device. */
export const localProvider: PCIProvider = {
  id: 'local',
  label: 'PCI Local Engine',
  model: ENGINE_VERSION,
  description:
    'Runs on this device. Deterministic and lexical: it separates the material by its wording and structure. It does not understand meaning the way a language model does, and it does not send anything anywhere.',
  capabilities: {
    analyze: true,
    embed: true,
    summarize: true,
    transcribe: false,
    synthesizeSpeech: typeof window !== 'undefined' && speechAvailable(),
    offline: true,
    sendsMaterial: false,
  },
  async analyze(input) {
    return analyzeLocally(input)
  },
  async embed(texts) {
    return texts.map((t) => hashedEmbedding(t))
  },
  async summarize(text) {
    // Extractive only: the opening sentences, verbatim. No paraphrase, no interpretation.
    return splitSentences(text)
      .slice(0, 2)
      .map((s) => s.text)
      .join(' ')
  },
  synthesizeSpeech(text, opts) {
    return speak([text], { rate: opts?.rate ?? 1, voice: opts?.voice })
  },
}
