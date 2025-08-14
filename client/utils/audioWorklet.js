// Audio worklet processor for better cross-platform audio handling
// This file will be loaded by the audio worklet API

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._volume = 1.0;
    this._noiseGateThreshold = 0.01;
    this._active = true;

    // Setup parameter handling
    this.port.onmessage = (event) => {
      const { type, data } = event.data;

      if (type === 'setVolume') {
        this._volume = data.volume;
      } else if (type === 'setNoiseGate') {
        this._noiseGateThreshold = data.threshold;
      } else if (type === 'setActive') {
        this._active = data.active;
      }
    };
  }

  process(inputs, outputs, parameters) {
    // Skip processing if not active
    if (!this._active) return true;

    // Get input and output
    const input = inputs[0];
    const output = outputs[0];

    // If we have no input, just return
    if (!input || !input.length) return true;

    // Process each channel
    for (let channelIndex = 0; channelIndex < input.length; channelIndex++) {
      const inputChannel = input[channelIndex];
      const outputChannel = output[channelIndex];

      if (!inputChannel || !outputChannel) continue;

      // Apply processing to each sample
      for (let i = 0; i < inputChannel.length; i++) {
        // Apply noise gate
        const sample = inputChannel[i];
        const amplitude = Math.abs(sample);

        // If below noise gate threshold, output silence
        if (amplitude < this._noiseGateThreshold) {
          outputChannel[i] = 0;
        } else {
          // Otherwise apply volume adjustment
          outputChannel[i] = sample * this._volume;
        }
      }
    }

    // Return true to keep the processor alive
    return true;
  }
}

// Register the processor
registerProcessor('audio-processor', AudioProcessor);
