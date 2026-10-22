import type {StemService, StemProgress} from '../contracts';
import type {StemRequest, StemResponse} from './protocol';

/** Real local HTDemucs inference. Source PCM is copied, never transferred away. */
export class BrowserStemService implements StemService {
  private active = false;

  async separate(buffer: AudioBuffer, onProgress: (p: StemProgress) => void, signal: AbortSignal): Promise<AudioBuffer[]> {
    if (signal.aborted) throw new DOMException('Stem separation cancelled.', 'AbortError');
    if (this.active) throw new Error('Stem separation is already running.');
    if (buffer.numberOfChannels < 1 || buffer.numberOfChannels > 2 || buffer.length < 2 || buffer.length > 32_000_000)
      throw new Error('Stem separation supports mono or stereo sources up to 32 million frames.');
    if (!Number.isFinite(buffer.sampleRate) || buffer.sampleRate < 8000 || buffer.sampleRate > 384000)
      throw new Error('This source sample rate is not supported for stem separation.');
    this.active = true;
    const worker = new Worker(new URL('./separator.worker.ts', import.meta.url), {type: 'module', name: 'brain-storm-stems'});
    try {
      const channels = Array.from({length: buffer.numberOfChannels}, (_, i) => new Float32Array(buffer.getChannelData(i)));
      const base = new URL(import.meta.env.BASE_URL, document.baseURI);
      const request: StemRequest = {
        moduleUrl: new URL('stems/demucs.js', base).href,
        manifestUrl: new URL('models/manifest.json', base).href,
        sampleRate: buffer.sampleRate, frames: buffer.length, channels,
      };
      return await new Promise<AudioBuffer[]>((resolve, reject) => {
        const cancel = () => {
          worker.terminate();
          reject(new DOMException('Stem separation cancelled.', 'AbortError'));
        };
        const finish = () => signal.removeEventListener('abort', cancel);
        signal.addEventListener('abort', cancel, {once: true});
        if (signal.aborted) { cancel(); return; }
        worker.onmessage = (event: MessageEvent<StemResponse>) => {
          const message = event.data;
          if (message.type === 'progress') { onProgress({progress: message.progress, message: message.message}); return; }
          if (message.type === 'error') { finish(); reject(new Error(message.message)); return; }
          if (message.type !== 'complete') return;
          finish();
          try {
            if (message.frames !== buffer.length || message.sampleRate !== buffer.sampleRate || message.channels.length !== 4)
              throw new Error('The stem separator returned audio with incorrect alignment.');
            const stems = message.channels.map(stem => {
              if (stem.length !== buffer.numberOfChannels || stem.some(channel => channel.length !== buffer.length))
                throw new Error('The stem separator returned unexpected channel dimensions.');
              const audio = new AudioBuffer({length: buffer.length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate});
              stem.forEach((channel, i) => audio.copyToChannel(new Float32Array(channel), i));
              return audio;
            });
            resolve(stems);
          } catch (error) { reject(error); }
        };
        worker.onerror = () => {
          finish();
          reject(new Error('Stem separation could not finish in this browser. Retry with a shorter source, or import four aligned stem files.'));
        };
        onProgress({progress: 0, message: 'Preparing local stem separation…'});
        worker.postMessage(request, channels.map(channel => channel.buffer));
      });
    } finally { worker.terminate(); this.active = false; }
  }
}
