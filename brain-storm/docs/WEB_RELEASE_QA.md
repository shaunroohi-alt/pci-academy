# Brain Storm browser release

The accepted reference is the Samplify 0.4 native MPC console, source commit
`065cdf2eae75bd3113c39f37c8fd4f335b3610e7` in `sroohi/mellowdy-chop`.
This port preserves that approved layout, rather than generating another visual concept.

## Visual fidelity

Actual Chromium renders were compared with native screenshots at 1440 × 890.
The browser tool was unavailable in this environment; Playwright driving installed
Chromium was used for screenshots and interactions. Mobile was checked at 390 × 844.

| Reference detail | Browser evidence | Result / deliberate difference |
|---|---|---|
| Beige chassis, dark left rail, green LCD | `screenshots/sample-desktop.png` | Same materials, panel hierarchy and work surface placement |
| Four-by-four pads, bottom-left pad 01, A/B banks | `screenshots/sample-desktop.png` | Same ordering, 32 cue ownership and active-pad frame |
| Source overview, detail waveform, five edit modules | `screenshots/sample-desktop.png` | Same hierarchy; waveform is rendered from real decoded browser PCM |
| Shared transport dock and pattern memory | All desktop captures | Same clock, tempo, pattern, play/stop, note/mix recording and meters |
| Separate Pattern and Song work surfaces | `screenshots/pattern-desktop.png`, `screenshots/song-desktop.png` | Real editable timelines and inspectors |
| Cartridge effect rack and mixer/performer | `screenshots/effects-desktop.png`, `screenshots/perform-desktop.png` | Real DSP, eight channels, sends, crossfader and four launch scenes |
| Small viewport | `screenshots/sample-mobile.png` | Rail becomes top navigation; vertical layout retains readable pads and controls without horizontal page overflow |

Copy remains SAMPLIFY, CHOP LAB, PERFORMANCE PADS, SAMPLING DECK, the five module
names, and the five work surface names. Icon-only native actions have descriptive
browser labels (Reverse, Favorite, Options). The browser file extension is
`.brainstorm`; native `.samplify` files depend on Mac filesystem references.

## Functional evidence

- 48 unit tests: metadata formats, bounded import validation, self-contained session
  PCM/stem round-trip, real key analysis and sequencer scheduling/ownership.
- Real Chromium audio checks cover audible PCM, envelopes, future cancellation,
  independent pitch/time, varispeed, live pitch edits, WAV capture/export, pattern
  rendering, stem isolation and source-bound cached-stem restoration.
- All 15 built-in effects were rendered through OfflineAudioContext; active effects
  changed actual signals, while Off and bypass preserved dry audio. Presets validated.
- Real neural inference ran the verified HTDemucs model in Chromium, returning four
  distinct finite aligned stems; original PCM, cancellation and checksum rejection
  were checked. This is local inference, not a server or a simulated progress bar.
- Actual timeline pointer workflows covered creation, move, resize, copy and deletion.
- PCI integration checks: lint, typecheck, 201 unit/SQL/route/cache tests, manuscript
  consistency and shared edge-engine consistency passed before publication.

## Browser boundaries

Native AU/VST3 plugins require the Mac app. The browser rack runs built-in Web Audio
DSP and SoundTouch pitch/time processing. Web MIDI depends on browser support;
computer keys, pointer and touch pads remain available. Browser session archives and
IndexedDB drafts contain the audio rather than external filesystem paths. Neural
inference downloads an approximately 84 MB pinned model on demand; it is excluded
from PCI's global offline cache. Model files stay below Cloudflare's per-asset limit.

Additional release checks passed: 31 full-console UI assertions; 19 complete audio
workflow assertions (including both banks, note ownership across surface changes,
audible pattern bounce, track-eight scene launch, stereo mix recording, portable
session reopen over another source and IndexedDB restoration); all 23 existing PCI
Playwright desktop/mobile tests; repeatable database migrations and seed checks;
Deno typecheck and all three edge tests. Runtime workflow captures reported no
page errors or failed asset requests. The production build was verified at both
the domain-root path and the GitHub Pages prefix.
