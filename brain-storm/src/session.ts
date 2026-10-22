import JSZip from "jszip";
import { validateSession } from "./model";
import type { SessionState, SourceInfo } from "./model";
import type { AudioEngine } from "./contracts";

export function wav(
  buffer: AudioBuffer,
  format: "float32" | "pcm24" = "float32",
): Blob {
  const channels = buffer.numberOfChannels,
    frames = buffer.length,
    bytes = format === "float32" ? 4 : 3;
  const storage = new ArrayBuffer(44 + frames * channels * bytes),
    v = new DataView(storage);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  v.setUint32(4, storage.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, format === "float32" ? 3 : 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * channels * bytes, true);
  v.setUint16(32, channels * bytes, true);
  v.setUint16(34, bytes * 8, true);
  text(36, "data");
  v.setUint32(40, frames * channels * bytes, true);
  const data = Array.from({ length: channels }, (_, c) =>
    buffer.getChannelData(c),
  );
  let at = 44;
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels; c++) {
      const value = Number.isFinite(data[c][i]) ? data[c][i] : 0;
      if (bytes === 4) {
        v.setFloat32(at, value, true);
        at += 4;
      } else {
        const scaled = Math.round(
          Math.max(-1, Math.min(1, value)) * (value < 0 ? 8388608 : 8388607),
        );
        v.setUint8(at++, scaled & 255);
        v.setUint8(at++, (scaled >> 8) & 255);
        v.setUint8(at++, (scaled >> 16) & 255);
      }
    }
  return new Blob([storage], { type: "audio/wav" });
}
export function readFloatWav(bytes: ArrayBuffer): AudioBuffer {
  const v = new DataView(bytes);
  const str = (p: number, n: number) =>
    String.fromCharCode(...new Uint8Array(bytes, p, n));
  if (bytes.byteLength < 44 || str(0, 4) !== "RIFF" || str(8, 4) !== "WAVE")
    throw new Error("Session audio is not a WAV file.");
  let format = 0,
    channels = 0,
    rate = 0,
    bits = 0,
    offset = 0,
    length = 0;
  for (let p = 12; p + 8 <= bytes.byteLength; ) {
    const n = v.getUint32(p + 4, true);
    if (p + 8 + n > bytes.byteLength)
      throw new Error("Session audio is truncated.");
    const tag = str(p, 4);
    if (tag === "fmt " && n >= 16) {
      format = v.getUint16(p + 8, true);
      channels = v.getUint16(p + 10, true);
      rate = v.getUint32(p + 12, true);
      bits = v.getUint16(p + 22, true);
    }
    if (tag === "data") {
      offset = p + 8;
      length = n;
    }
    p += 8 + n + (n % 2);
  }
  const frameBytes = channels * 4,
    frames = length / frameBytes;
  if (
    format !== 3 ||
    bits !== 32 ||
    channels < 1 ||
    channels > 2 ||
    rate < 8000 ||
    rate > 384000 ||
    !offset ||
    !Number.isInteger(frames) ||
    frames < 1 ||
    frames > 32000000
  )
    throw new Error("Unsupported or oversized session audio.");
  const buffer = new AudioBuffer({
    numberOfChannels: channels,
    length: frames,
    sampleRate: rate,
  });
  for (let c = 0; c < channels; c++) {
    const out = buffer.getChannelData(c);
    for (let i = 0; i < frames; i++) {
      const x = v.getFloat32(offset + (i * channels + c) * 4, true);
      if (!Number.isFinite(x))
        throw new Error("Session audio contains invalid samples.");
      out[i] = x;
    }
  }
  return buffer;
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const safeName = (name: string) =>
  name.replace(/[^\w .-]/g, "_").slice(0, 80) || "Samplify";
const MAX_SESSION_BYTES = 1024 * 1024 * 1024;
// Check declared expansion before JSZip's CRC pass allocates decoded entries.
export function validateArchiveSize(bytes: ArrayBuffer): void {
  const view = new DataView(bytes);
  let end = -1;
  for (
    let p = bytes.byteLength - 22;
    p >= Math.max(0, bytes.byteLength - 65557);
    p--
  ) {
    if (
      view.getUint32(p, true) === 0x06054b50 &&
      p + 22 + view.getUint16(p + 20, true) === bytes.byteLength
    ) {
      end = p;
      break;
    }
  }
  if (end < 0) throw new Error("Choose a valid Brain Storm session archive.");
  const count = view.getUint16(end + 10, true),
    size = view.getUint32(end + 12, true),
    start = view.getUint32(end + 16, true);
  if (
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0 ||
    count > 80 ||
    start + size > end
  )
    throw new Error("Unsupported session archive.");
  let expanded = 0,
    p = start;
  for (let i = 0; i < count; i++) {
    if (p + 46 > start + size || view.getUint32(p, true) !== 0x02014b50)
      throw new Error("Session archive is truncated.");
    const length = view.getUint32(p + 24, true);
    expanded += length;
    if (length > 256 * 1024 * 1024 + 44 || expanded > MAX_SESSION_BYTES)
      throw new Error("This session exceeds the browser audio memory limit.");
    p +=
      46 +
      view.getUint16(p + 28, true) +
      view.getUint16(p + 30, true) +
      view.getUint16(p + 32, true);
  }
  if (p !== start + size) throw new Error("Invalid session archive index.");
}
export async function saveSession(
  state: SessionState,
  engine: AudioEngine,
  progress: (n: number) => void,
): Promise<Blob> {
  validateSession(state);
  const archive = new JSZip();
  const ids = new Set([
    ...(state.source ? [state.source.assetId] : []),
    ...state.assets.map((a) => a.assetId),
  ]);
  const entries: Array<{ id: string; path: string }> = [];
  const buffers = [...ids]
    .map((id) => {
      const b = engine.getBuffer(id);
      if (!b) throw new Error("A referenced audio file is missing.");
      return b;
    })
    .concat(engine.getStems().filter((b): b is AudioBuffer => b !== null));
  if (
    buffers.reduce(
      (total, b) => total + 44 + b.length * b.numberOfChannels * 4,
      0,
    ) >
    MAX_SESSION_BYTES - 4 * 1024 * 1024
  )
    throw new Error(
      "This session exceeds the browser export limit. Export unused audio and remove it before saving.",
    );
  let index = 0;
  for (const id of ids) {
    const buffer = engine.getBuffer(id);
    if (!buffer)
      throw new Error(
        "A referenced audio file is missing. Locate it before saving this session.",
      );
    const path = `audio/asset-${index++}.wav`;
    archive.file(path, await wav(buffer).arrayBuffer());
    entries.push({ id, path });
  }
  const stems: (string | null)[] = [];
  for (const [i, buffer] of engine.getStems().entries()) {
    if (!buffer) {
      stems.push(null);
      continue;
    }
    const path = `audio/stem-${i}.wav`;
    archive.file(path, await wav(buffer).arrayBuffer());
    stems.push(path);
  }
  archive.file(
    "session.json",
    JSON.stringify({
      format: "brain-storm",
      version: 1,
      state,
      audio: entries,
      stems,
    }),
  );
  return archive.generateAsync(
    { type: "blob", compression: "STORE", mimeType: "application/zip" },
    (meta) => progress(meta.percent / 100),
  );
}
export async function openSession(
  file: File,
  engine: AudioEngine,
  shouldCommit: () => boolean = () => true,
): Promise<SessionState> {
  if (file.size > MAX_SESSION_BYTES)
    throw new Error("This session exceeds the browser import limit.");
  const bytes = await file.arrayBuffer();
  validateArchiveSize(bytes);
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const entry = zip.file("session.json");
  if (!entry)
    throw new Error(
      "Choose a Brain Storm .brainstorm session. Native .samplify files use local filesystem references and open in the Mac app.",
    );
  const text = await entry.async("string");
  if (text.length > 4 * 1024 * 1024)
    throw new Error("Session metadata is too large.");
  const manifest = JSON.parse(text) as {
    format: string;
    version: number;
    state: SessionState;
    audio: { id: string; path: string }[];
    stems: (string | null)[];
  };
  if (
    manifest.format !== "brain-storm" ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.audio) ||
    manifest.audio.length > 65 ||
    !Array.isArray(manifest.stems) ||
    manifest.stems.length !== 4
  )
    throw new Error("Unsupported session format.");
  const state = validateSession(manifest.state);
  const loaded = new Map<string, AudioBuffer>();
  for (const e of manifest.audio) {
    if (typeof e.id !== "string" || !/^audio\/asset-\d+\.wav$/.test(e.path))
      throw new Error("Invalid audio reference.");
    const f = zip.file(e.path);
    if (!f) throw new Error("A session audio file is missing.");
    loaded.set(e.id, readFloatWav(await f.async("arraybuffer")));
  }
  const stems: (AudioBuffer | null)[] = [];
  for (const path of manifest.stems) {
    if (path === null) {
      stems.push(null);
      continue;
    }
    if (!/^audio\/stem-[0-3]\.wav$/.test(path))
      throw new Error("Invalid stem reference.");
    const f = zip.file(path);
    if (!f) throw new Error("A cached stem is missing.");
    stems.push(readFloatWav(await f.async("arraybuffer")));
  }
  const metadata: SourceInfo[] = [
    ...(state.source ? [state.source] : []),
    ...state.assets,
  ];
  for (const info of metadata) {
    const buffer = loaded.get(info.assetId);
    if (!buffer) throw new Error(`Audio is missing for ${info.name}.`);
    if (Math.abs(buffer.duration - info.duration) > 0.01)
      throw new Error("Session audio duration does not match its metadata.");
  }
  if (state.source && stems.some(Boolean)) {
    const source = loaded.get(state.source.assetId)!;
    if (
      stems.some(
        (b) =>
          b &&
          (b.sampleRate !== source.sampleRate || b.length !== source.length),
      )
    )
      throw new Error("Cached stems are not aligned with the source.");
  }
  if (!shouldCommit()) throw new DOMException("Cancelled", "AbortError");
  for (const info of metadata)
    engine.installBuffer(info, loaded.get(info.assetId)!);
  engine.setStems(stems, state.source?.assetId);
  return state;
}
export const sessionName = (s: SessionState) =>
  safeName(s.name) + ".brainstorm";

const DB = "brain-storm-sampler-v1";
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("state");
      req.result.createObjectStore("audio");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function put(store: string, key: string, value: unknown) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export const persistState = (state: SessionState) =>
  put("state", "current", state);
export async function persistBuffer(id: string, buffer: AudioBuffer) {
  return put("audio", id, {
    sampleRate: buffer.sampleRate,
    channels: Array.from({ length: buffer.numberOfChannels }, (_, c) =>
      buffer.getChannelData(c).slice(),
    ),
  });
}
export async function restoreDraft(
  engine: AudioEngine,
  shouldCommit: () => boolean = () => true,
): Promise<SessionState | null> {
  const db = await database();
  try {
    const get = (store: string, key: string) =>
      new Promise<unknown>((resolve, reject) => {
        const r = db.transaction(store).objectStore(store).get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    const raw = await get("state", "current");
    if (!raw) return null;
    const state = validateSession(raw);
    const infos = [...(state.source ? [state.source] : []), ...state.assets];
    const loaded = new Map<string, AudioBuffer>();
    for (const info of infos) {
      const data = (await get("audio", info.assetId)) as
        | { sampleRate: number; channels: Float32Array[] }
        | undefined;
      if (!data)
        throw new Error(
          "The local draft audio is missing. Open a saved .brainstorm session or load audio again.",
        );
      const buffer = new AudioBuffer({
        numberOfChannels: data.channels.length,
        length: data.channels[0].length,
        sampleRate: data.sampleRate,
      });
      data.channels.forEach((c, i) => buffer.getChannelData(i).set(c));
      loaded.set(info.assetId, buffer);
    }
    const stems: (AudioBuffer | null)[] = [];
    for (let i = 0; i < 4; i++) {
      const data = state.source
        ? ((await get("audio", `${state.source.assetId}:stem:${i}`)) as
            | { sampleRate: number; channels: Float32Array[] }
            | undefined)
        : undefined;
      if (!data) {
        stems.push(null);
        continue;
      }
      const b = new AudioBuffer({
        numberOfChannels: data.channels.length,
        length: data.channels[0].length,
        sampleRate: data.sampleRate,
      });
      data.channels.forEach((c, n) => b.getChannelData(n).set(c));
      stems.push(b);
    }
    if (!shouldCommit()) return null;
    for (const info of infos)
      engine.installBuffer(info, loaded.get(info.assetId)!);
    engine.setStems(stems, state.source?.assetId);
    return state;
  } finally {
    db.close();
  }
}
