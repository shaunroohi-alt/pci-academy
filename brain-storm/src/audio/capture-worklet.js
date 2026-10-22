/* Stereo PCM capture; passes the audible master through unchanged. */
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.enabled = false;
    this.count = 0;
    this.total = 0;
    this.limit = 0;
    this.left = new Float32Array(4096);
    this.right = new Float32Array(4096);
    this.port.onmessage = ({ data }) => {
      if (data.type === "start") {
        this.count = 0;
        this.total = 0;
        this.limit = data.limit;
        this.enabled = true;
      }
      if (data.type === "stop") {
        this.enabled = false;
        this.flush();
        this.port.postMessage({ type: "stopped", request: data.request });
      }
    };
  }
  flush() {
    if (!this.count) return;
    const left = this.left.slice(0, this.count),
      right = this.right.slice(0, this.count);
    this.port.postMessage(
      {
        type: "chunk",
        left: left.buffer,
        right: right.buffer,
        frames: this.count,
      },
      [left.buffer, right.buffer],
    );
    this.count = 0;
  }
  process(inputs, outputs) {
    const input = inputs[0] || [],
      output = outputs[0] || [];
    for (let c = 0; c < output.length; c++) {
      const channel = input[c] || input[0];
      if (channel) output[c].set(channel);
      else output[c].fill(0);
    }
    if (!this.enabled || !input[0]) return true;
    const left = input[0],
      right = input[1] || left;
    for (let i = 0; i < left.length; i++) {
      if (this.total >= this.limit) {
        this.enabled = false;
        this.flush();
        this.port.postMessage({
          type: "error",
          message:
            "Recording exceeded the browser memory limit. Record a shorter take.",
        });
        break;
      }
      this.left[this.count] = left[i];
      this.right[this.count] = right[i];
      this.count++;
      this.total++;
      if (this.count === 4096) this.flush();
    }
    return true;
  }
}
registerProcessor("brain-storm-capture", CaptureProcessor);
