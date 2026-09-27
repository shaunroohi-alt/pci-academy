// Audio/text identity (§6.3): narration shares the content identity and is
// bound to the text version it was recorded against. If the text has been
// revised since, the narration is stale and is not played as current.

export interface AudioAsset {
  content_id: string
  text_version: number
  audio_version: number
  voice: string
  duration: number
  transcript?: string
  audio_url: string
}

export type NarrationState =
  | { kind: 'recorded'; asset: AudioAsset }
  | { kind: 'stale'; asset: AudioAsset; current_version: number }
  | { kind: 'device' }
  | { kind: 'none' }

export function resolveNarration(
  content: { id: string; content_version: number },
  assets: AudioAsset[],
  deviceSpeech: boolean,
): NarrationState {
  const mine = assets.filter((a) => a.content_id === content.id).sort((a, b) => b.audio_version - a.audio_version)
  const current = mine.find((a) => a.text_version === content.content_version)
  if (current) return { kind: 'recorded', asset: current }
  if (mine.length) return deviceSpeech ? { kind: 'device' } : { kind: 'stale', asset: mine[0], current_version: content.content_version }
  return deviceSpeech ? { kind: 'device' } : { kind: 'none' }
}
