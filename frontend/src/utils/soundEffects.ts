/**
 * Sound Effects System — Premium UI Audio Feedback
 * 
 * Uses Web Audio API to generate procedural sounds.
 * No external audio files needed — everything synthesized in real-time.
 * 
 * Sounds are subtle, professional, and non-intrusive.
 * Each sound is designed to provide tactile feedback without being annoying.
 */

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let enabled = true;
let volume = 0.3; // 0-1, default low

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(audioCtx.destination);
  }
  // Resume if suspended (browser policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function getMasterGain(): GainNode {
  if (!masterGain) getAudioContext();
  return masterGain!;
}

// ── Configuration ─────────────────────────────────────────────────────────────

export function setSoundEnabled(val: boolean) { enabled = val; }
export function isSoundEnabled() { return enabled; }
export function setSoundVolume(val: number) { volume = Math.max(0, Math.min(1, val)); if (masterGain) masterGain.gain.value = volume; }
export function getSoundVolume() { return volume; }

// ── Core Sound Generators ─────────────────────────────────────────────────────

/**
 * Click — soft tap feedback
 * Used for: button clicks, tab switches, selections
 */
export function playClick() {
  if (!enabled) return;
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.05);

  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

  osc.connect(gain);
  gain.connect(getMasterGain());
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.08);
}

/**
 * Hover — ultra-subtle tick
 * Used for: card hovers, important element focus
 */
export function playHover() {
  if (!enabled) return;
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.02);

  gain.gain.setValueAtTime(0.04, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);

  osc.connect(gain);
  gain.connect(getMasterGain());
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.03);
}

/**
 * Success — ascending chime (2 notes)
 * Used for: job created, trigger enabled, connection successful
 */
export function playSuccess() {
  if (!enabled) return;
  const ctx = getAudioContext();

  // Note 1
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
  gain1.gain.setValueAtTime(0.2, ctx.currentTime);
  gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
  osc1.connect(gain1);
  gain1.connect(getMasterGain());
  osc1.start(ctx.currentTime);
  osc1.stop(ctx.currentTime + 0.2);

  // Note 2 — higher, delayed
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
  gain2.gain.setValueAtTime(0, ctx.currentTime);
  gain2.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
  gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
  osc2.connect(gain2);
  gain2.connect(getMasterGain());
  osc2.start(ctx.currentTime + 0.1);
  osc2.stop(ctx.currentTime + 0.35);
}

/**
 * Error — low buzz
 * Used for: API errors, validation failures, connection lost
 */
export function playError() {
  if (!enabled) return;
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(150, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.15);

  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

  osc.connect(gain);
  gain.connect(getMasterGain());
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.2);
}

/**
 * Warning — attention pulse
 * Used for: active instances detected, force finish prompt
 */
export function playWarning() {
  if (!enabled) return;
  const ctx = getAudioContext();

  [0, 0.12].forEach((delay) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, ctx.currentTime + delay);
    gain.gain.setValueAtTime(0.1, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.1);
    osc.connect(gain);
    gain.connect(getMasterGain());
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + 0.1);
  });
}

/**
 * Delete — descending sweep
 * Used for: job deletion confirmed, trigger removed
 */
export function playDelete() {
  if (!enabled) return;
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);

  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

  osc.connect(gain);
  gain.connect(getMasterGain());
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);
}

/**
 * Connect — warm rising tone
 * Used for: UAC session established
 */
export function playConnect() {
  if (!enabled) return;
  const ctx = getAudioContext();

  const notes = [261.63, 329.63, 392.00]; // C4, E4, G4 (major chord arpeggio)
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const delay = i * 0.08;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

    gain.gain.setValueAtTime(0, ctx.currentTime + delay);
    gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);

    osc.connect(gain);
    gain.connect(getMasterGain());
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + 0.25);
  });
}

/**
 * Disconnect — descending chord
 * Used for: session ended, disconnected
 */
export function playDisconnect() {
  if (!enabled) return;
  const ctx = getAudioContext();

  const notes = [392.00, 329.63, 261.63]; // G4, E4, C4 (descending)
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const delay = i * 0.08;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

    gain.gain.setValueAtTime(0, ctx.currentTime + delay);
    gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2);

    osc.connect(gain);
    gain.connect(getMasterGain());
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + 0.2);
  });
}

/**
 * Complete — triumphant fanfare (3-note ascending)
 * Used for: all jobs created, full batch done
 */
export function playComplete() {
  if (!enabled) return;
  const ctx = getAudioContext();

  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const delay = i * 0.12;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

    gain.gain.setValueAtTime(0, ctx.currentTime + delay);
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + delay + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.4);

    // Add a harmonic for richness
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, ctx.currentTime + delay);
    gain2.gain.setValueAtTime(0, ctx.currentTime + delay);
    gain2.gain.linearRampToValueAtTime(0.06, ctx.currentTime + delay + 0.03);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.3);

    osc.connect(gain);
    gain.connect(getMasterGain());
    osc2.connect(gain2);
    gain2.connect(getMasterGain());

    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + 0.4);
    osc2.start(ctx.currentTime + delay);
    osc2.stop(ctx.currentTime + delay + 0.3);
  });
}

/**
 * Notification — soft bell
 * Used for: new alert, monitoring event
 */
export function playNotification() {
  if (!enabled) return;
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime); // A5

  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

  osc.connect(gain);
  gain.connect(getMasterGain());
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.4);
}

/**
 * Tick — progress step tick (very subtle)
 * Used for: each step in SSE stream, verification checks
 */
export function playTick() {
  if (!enabled) return;
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(1000 + Math.random() * 200, ctx.currentTime);

  gain.gain.setValueAtTime(0.03, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);

  osc.connect(gain);
  gain.connect(getMasterGain());
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.02);
}

/**
 * Whoosh — tab/page transition
 * Used for: switching tabs, opening new sections
 */
export function playWhoosh() {
  if (!enabled) return;
  const ctx = getAudioContext();

  // White noise burst, band-passed
  const bufferSize = ctx.sampleRate * 0.08;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(2000, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.08);
  filter.Q.value = 1;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(getMasterGain());
  source.start(ctx.currentTime);
}

// ── Presets — common UI action bundles ────────────────────────────────────────

export const SFX = {
  click:        playClick,
  hover:        playHover,
  success:      playSuccess,
  error:        playError,
  warning:      playWarning,
  delete:       playDelete,
  connect:      playConnect,
  disconnect:   playDisconnect,
  complete:     playComplete,
  notification: playNotification,
  tick:         playTick,
  whoosh:       playWhoosh,
} as const;

export type SFXType = keyof typeof SFX;

/**
 * Play any sound by name
 */
export function playSFX(name: SFXType) {
  SFX[name]?.();
}

// ── Initialize on first user interaction ──────────────────────────────────────
// Browser requires user gesture before AudioContext can play
if (typeof window !== 'undefined') {
  const initAudio = () => {
    getAudioContext();
    document.removeEventListener('click', initAudio);
    document.removeEventListener('keydown', initAudio);
  };
  document.addEventListener('click', initAudio, { once: true });
  document.addEventListener('keydown', initAudio, { once: true });
}
