---
title: Stem Master
emoji: 🎚️
# Hugging Face accepts only red, yellow, green, blue, indigo, purple, pink and
# gray here; yellow is the closest to MP Audio's signal orange.
colorFrom: yellow
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
short_description: GPU stem separation API for the Stem Master iOS app
---

# Stem Master by MP Audio: separation server

This Space runs the API that the **Stem Master** iPhone app sends audio to. It
has no web page; it serves the REST API in `SPEC.md` section 4 of the source
repository.

- Health check: `GET /v1/health` (no key needed). `device` says whether the
  GPU is in use (`cuda`) or the Space fell back to `cpu`.
- Every other `/v1/*` route needs `Authorization: Bearer <key>` when the
  `STEM_MASTER_API_KEY` secret is set on this Space.

What it produces: vocals (lead / backing, optional dry + reverb), a drum kit
split into kick, snare, toms, hi-hat, ride and crash, bass, guitar, piano &
keys, and synths & other, with optional Cleanup (bleed removal) and Denoise
(AI-generation artifact removal). Whatever those two options remove is
returned as separate `removed_*` stems, so nothing is thrown away silently.

The files in this Space are overwritten on every deploy from the repository
(`stem-master/server`, deployed by `.github/workflows/stem-master-space.yml`).
Edit the source there, not here.

Models are downloaded on first use. Without a storage volume mounted at
`/data`, they are downloaded again after each restart or wake-up from sleep.
