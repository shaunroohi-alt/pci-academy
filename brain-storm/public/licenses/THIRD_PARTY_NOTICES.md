# Brain Storm / Samplify browser notices

This browser adaptation is distributed under GPL-3.0, matching the native Samplify application's license. The complete application license is [GPL-3.0.txt](GPL-3.0.txt). The browser implementation was modified on 22 October 2026. The application is supplied without warranty under the terms of that license.

This is an independent sampler implementation. It does not contain Serato Pitch 'n Time, Serato Stems or desktop AU/VST3 plugin binaries. The browser uses SoundTouchJS and Web Audio for pitch/time and effects; native Samplify uses different DSP.

| Component | Installed version | Terms and full notice |
| --- | --- | --- |
| SoundTouchJS audio-worklet, core, interpolation-strategy-lanczos, worklet-base | 2.1.1 | MPL-2.0; [complete license](MPL-2.0.txt), [package notices and source links](SoundTouchJS-NOTICE.txt) |
| React / ReactDOM | 19.2.0 | MIT; [runtime dependency notices](runtime-dependencies.txt) |
| React scheduler | 0.27.0 | MIT; [runtime dependency notices](runtime-dependencies.txt) |
| Lucide React | 0.468.0 | ISC, including its preserved Feather attribution; [runtime dependency notices](runtime-dependencies.txt) |
| JSZip | 3.10.1 | MIT option of its MIT-or-GPL dual license; [runtime dependency notices](runtime-dependencies.txt) |
| pako | 1.0.11 | MIT and Zlib; [runtime dependency notices](runtime-dependencies.txt) |
| JSZip runtime dependencies | Versions listed in notices | MIT/ISC; [runtime dependency notices](runtime-dependencies.txt) |
| demucs.cpp | f1206e9adeea103aef4a636b9e62297cf1f8e34e | MIT; [backend license](../stems/DemucsCpp-MIT.txt) and [source/model details](../stems/NativeStems-Notice.txt) |
| Demucs / HTDemucs checkpoint and converted model | 955717e8-8726e21a.th | MIT; [model license](../stems/Demucs-MIT.txt) and [checkpoint/conversion details](../stems/NativeStems-Notice.txt) |
| Eigen | dd8c71e62852b2fe429edb6682ac91fd1c578a26 | MPL-2.0; [complete license](../stems/Eigen-MPL-2.0.txt) and [corresponding source details](../stems/NativeStems-Notice.txt) |

SoundTouchJS source for the pinned release is available at <https://github.com/cutterbl/SoundTouchJS/tree/d9e39a7ddcf74c7a145bbba45856f30068c82b79> (tag `v2.1.1`). The exact unmodified npm package archives are linked in its package notices. Application source distributions include the lockfile and build scripts needed to select these versions. Preserve this directory and the stem notices when distributing the browser build.
