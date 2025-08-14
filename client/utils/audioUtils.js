// Create audio context for generating calling sounds
let audioContext = null;

// Audio context initialization that works across platforms
export const initAudioContext = (userInitiated = false) => {
  // Check if we're in a browser environment
  if (!isBrowser) return null;

  // iOS requires user interaction to create or resume audio context
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
      console.error("Failed to create AudioContext:", error);
      return null;
    }
  }

  // If context is suspended and this was triggered by user interaction, try to resume
  if (audioContext?.state === 'suspended' && userInitiated) {
    audioContext.resume().catch(err => {
      console.warn("Failed to resume AudioContext:", err);
    });
  }

  return audioContext;
};

// Generate dial tone sound (2 seconds)
export const playDialTone = () => {
  try {
    const ctx = initAudioContext(true);
    if (!ctx) {
      console.warn("AudioContext not available");
      return;
    }

    // Create oscillator for dial tone
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Set frequency to typical dial tone (350Hz + 440Hz)
    oscillator.frequency.setValueAtTime(350, ctx.currentTime);

    // Create a second oscillator for the dual tone
    const oscillator2 = ctx.createOscillator();
    oscillator2.connect(gainNode);
    oscillator2.frequency.setValueAtTime(440, ctx.currentTime);

    // Set normal volume
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);

    // Start and stop after 2 seconds
    oscillator.start(ctx.currentTime);
    oscillator2.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 2);
    oscillator2.stop(ctx.currentTime + 2);
  } catch (error) {
    console.log('Dial tone error:', error);
  }
};

// Generate hangup sound (short beep)
export const playHangupSound = () => {
  try {
    const ctx = initAudioContext(true);
    if (!ctx) {
      console.warn("AudioContext not available");
      return;
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Set frequency for hangup sound
    oscillator.frequency.setValueAtTime(800, ctx.currentTime);

    // Set volume with fade out
    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    // Start and stop after 0.3 seconds
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch (error) {
    console.log('Hangup sound error:', error);
  }
};

// Generate ring tone sound
export const playRingTone = () => {
  try {
    const ctx = initAudioContext(true);
    if (!ctx) {
      console.warn("AudioContext not available");
      return;
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Set frequency for ring tone
    oscillator.frequency.setValueAtTime(480, ctx.currentTime);

    // Set volume with pulsing
    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime + 0.5);
    gainNode.gain.setValueAtTime(0.2, ctx.currentTime + 1);
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime + 1.5);

    // Start and stop after 2 seconds
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 2);
  } catch (error) {
    console.log('Ring tone error:', error);
  }
};

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';

// Detect iOS device - safely check for browser environment first
export const isIOS = () => {
  if (!isBrowser) return false;

  return [
    'iPad Simulator',
    'iPhone Simulator',
    'iPod Simulator',
    'iPad',
    'iPhone',
    'iPod'
  ].includes(navigator.platform) ||
  (navigator.userAgent.includes("Mac") && "ontouchend" in document);
};

// Setup audio for iOS - must be called from a user interaction event
export const setupIOSAudio = () => {
  if (!isIOS()) return true;

  try {
    // Create a silent audio buffer
    const ctx = initAudioContext(true);
    if (!ctx) return false;

    // Just resume the audio context
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    return true;
  } catch (error) {
    console.error("iOS audio setup failed:", error);
    return false;
  }
};

// Initialize audio with fallbacks for cross-platform support
export const initializeAudioSystem = (userInitiated = false) => {
  // Try to initialize audio context
  const ctx = initAudioContext(userInitiated);

  // For iOS, we need special handling
  if (isIOS()) {
    setupIOSAudio();
  }

  return !!ctx;
};

/**
 * Enhance an audio stream with audio processing
 * @param {MediaStream} stream - The media stream to enhance
 * @returns {MediaStream} - The enhanced media stream
 */
export const enhanceAudioStream = (stream) => {
  // Just return the original stream since we're not using audio worklet
  return stream;
};
