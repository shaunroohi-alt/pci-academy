**Lee-Meet II by MP Audio** — mastering limiter / maximizer.

| File | Use |
|---|---|
| `*-macOS-AU.zip` | Logic Pro, GarageBand, MainStage (Audio Unit, universal arm64 + x86_64). Unzip into `~/Library/Audio/Plug-Ins/Components/` |
| `*-macOS-VST3.zip` | Other macOS DAWs. Unzip into `~/Library/Audio/Plug-Ins/VST3/` |
| `*-Windows-VST3.zip` | Unzip into `C:\Program Files\Common Files\VST3\` |
| `*-Linux-VST3.zip` | Unzip into `~/.vst3/` |

macOS builds are ad-hoc signed unless the repository has Developer ID secrets configured.
If Gatekeeper refuses the bundle, remove the quarantine flag once:

```
xattr -dr com.apple.quarantine ~/Library/Audio/Plug-Ins/Components/Lee-Meet\ II.component
```

Then restart Logic Pro: it validates new Audio Units on launch (Logic Pro > Settings > Plug-in Manager shows the result).
