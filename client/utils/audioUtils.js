// Create audio context for generating calling sounds
let audioContext = null;

export const initAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
};

// Generate dial tone sound (2 seconds)
export const playDialTone = () => {
  const ctx = initAudioContext();

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

  // Set volume
  gainNode.gain.setValueAtTime(0.1, ctx.currentTime);

  // Start and stop after 2 seconds
  oscillator.start(ctx.currentTime);
  oscillator2.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 2);
  oscillator2.stop(ctx.currentTime + 2);
};

// Generate hangup sound (short beep)
export const playHangupSound = () => {
  const ctx = initAudioContext();

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
};

// Generate ring tone sound
export const playRingTone = () => {
  const ctx = initAudioContext();

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  // Set frequency for ring tone
  oscillator.frequency.setValueAtTime(480, ctx.currentTime);

  // Create pulsing effect
  const pulseGain = ctx.createGain();
  pulseGain.connect(gainNode);
  oscillator.connect(pulseGain);

  // Set volume with pulsing
  pulseGain.gain.setValueAtTime(0.15, ctx.currentTime);
  pulseGain.gain.setValueAtTime(0.05, ctx.currentTime + 0.5);
  pulseGain.gain.setValueAtTime(0.15, ctx.currentTime + 1);
  pulseGain.gain.setValueAtTime(0.05, ctx.currentTime + 1.5);

  // Start and stop after 2 seconds
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 2);
};
