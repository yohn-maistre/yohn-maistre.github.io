// AudioContext is instantiated at 16 kHz so the browser handles resampling at
// the MediaStreamSource. This worklet just batches Float32 samples into 30 ms
// Int16 chunks and ships them to the main thread for base64 + WebSocket send.
class PCM16Processor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = []
    this.chunkSamples = 480
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (!channel) return true
    for (let i = 0; i < channel.length; i++) this.buffer.push(channel[i])
    while (this.buffer.length >= this.chunkSamples) {
      const chunk = this.buffer.splice(0, this.chunkSamples)
      const out = new Int16Array(chunk.length)
      for (let i = 0; i < chunk.length; i++) {
        const v = Math.max(-1, Math.min(1, chunk[i]))
        out[i] = v < 0 ? v * 0x8000 : v * 0x7fff
      }
      this.port.postMessage(out.buffer, [out.buffer])
    }
    return true
  }
}
registerProcessor('pcm16-downsampler', PCM16Processor)
