class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(4096);
    this.used = 0;
    this.port.onmessage = event => {
      if (event.data === 'flush') {
        this.flush();
        this.port.postMessage({ type: 'flushed' });
      }
    };
  }
  flush() {
    if (!this.used) return;
    const chunk = this.used === this.buffer.length ? this.buffer : this.buffer.slice(0, this.used);
    this.port.postMessage(chunk, [chunk.buffer]);
    this.buffer = new Float32Array(4096);
    this.used = 0;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input) {
      let offset = 0;
      while (offset < input.length) {
        const count = Math.min(input.length - offset, this.buffer.length - this.used);
        this.buffer.set(input.subarray(offset, offset + count), this.used);
        this.used += count; offset += count;
        if (this.used === this.buffer.length) this.flush();
      }
    }
    return true;
  }
}
registerProcessor('dictation-capture', Capture);
