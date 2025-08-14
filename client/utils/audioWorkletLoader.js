// Audio worklet loader utility
// This handles loading and initializing the audio worklet for better audio processing

let audioWorkletNode = null;

/**
 * Load and initialize the audio worklet
 * @param {AudioContext} audioContext - The audio context to use
 * @returns {Promise<AudioWorkletNode|null>} - The audio worklet node or null if failed
 */
export const initializeAudioWorklet = async (audioContext) => {
  if (!audioContext) return null;

  try {
    // Check if the browser supports AudioWorklet
    if (!audioContext.audioWorklet) {
      console.warn('AudioWorklet not supported in this browser');
      return null;
    }

    // Load the audio worklet module
    await audioContext.audioWorklet.addModule('./utils/audioWorklet.js');

    // Create the audio worklet node
    audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');

    // Set default parameters
    setWorkletVolume(1.0);
    setWorkletNoiseGate(0.01);

    return audioWorkletNode;
  } catch (error) {
    console.error('Failed to initialize audio worklet:', error);
    return null;
  }
};

/**
 * Get the current audio worklet node
 * @returns {AudioWorkletNode|null} - The audio worklet node or null if not initialized
 */
export const getAudioWorkletNode = () => {
  return audioWorkletNode;
};

/**
 * Set the volume for the audio worklet
 * @param {number} volume - Volume level (0.0 to 1.0)
 */
export const setWorkletVolume = (volume) => {
  if (!audioWorkletNode) return;

  audioWorkletNode.port.postMessage({
    type: 'setVolume',
    data: { volume: Math.max(0, Math.min(1, volume)) }
  });
};

/**
 * Set the noise gate threshold for the audio worklet
 * @param {number} threshold - Noise gate threshold (0.0 to 1.0)
 */
export const setWorkletNoiseGate = (threshold) => {
  if (!audioWorkletNode) return;

  audioWorkletNode.port.postMessage({
    type: 'setNoiseGate',
    data: { threshold: Math.max(0, Math.min(1, threshold)) }
  });
};

/**
 * Enable or disable the audio worklet processing
 * @param {boolean} active - Whether the worklet should process audio
 */
export const setWorkletActive = (active) => {
  if (!audioWorkletNode) return;

  audioWorkletNode.port.postMessage({
    type: 'setActive',
    data: { active }
  });
};

/**
 * Connect an audio source to the audio worklet
 * @param {MediaStreamAudioSourceNode} source - The audio source to connect
 * @param {AudioNode} destination - The destination node (usually audioContext.destination)
 * @returns {boolean} - True if connected successfully, false otherwise
 */
export const connectAudioWorklet = (source, destination) => {
  if (!audioWorkletNode || !source || !destination) return false;

  try {
    // Connect source -> worklet -> destination
    source.connect(audioWorkletNode);
    audioWorkletNode.connect(destination);
    return true;
  } catch (error) {
    console.error('Failed to connect audio worklet:', error);
    return false;
  }
};

/**
 * Disconnect the audio worklet
 */
export const disconnectAudioWorklet = () => {
  if (!audioWorkletNode) return;

  try {
    audioWorkletNode.disconnect();
  } catch (error) {
    console.error('Failed to disconnect audio worklet:', error);
  }
};
