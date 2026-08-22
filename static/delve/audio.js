// audio.js - lightweight procedural sound effects via the Web Audio API. No
// external audio files, no libraries - every sound is synthesized on the fly
// from oscillators/noise + gain envelopes, matching the rest of the project's
// "no external assets" approach.
//
// Browsers require a user gesture before audio can actually play, so
// initAudio() must be called from inside an existing click/mousedown handler
// (see main.js's global mousedown listener) rather than on page load. If
// AudioContext isn't available at all (very old/locked-down browsers),
// initAudio() silently no-ops and playSound() stays a no-op forever - sound
// degrades to silently absent, it never throws or breaks the game.
//
// Public API is deliberately generic - callers just say what happened
// ("swing", "hit", "pickup", ...) and never touch oscillators/envelopes
// directly. See SOUNDS below for the full list of names.

let audioCtx = null;
let masterGain = null;
let noiseBuffer = null; // one shared white-noise buffer, sliced by noiseSource()

// Master volume - kept modest since combat sounds (swing/hit) fire
// constantly and shouldn't fatigue the ear on repeat.
const MASTER_VOLUME = 0.35;

/**
 * Creates (or resumes) the shared AudioContext. Safe to call from any user
 * gesture handler as often as you like - only does real work the first time,
 * or when the context is suspended (some browsers start a fresh
 * AudioContext suspended until a gesture resumes it). A no-op if Web Audio
 * isn't supported at all.
 */
export function initAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return; // no Web Audio support - playSound() stays a no-op
  try {
    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = MASTER_VOLUME;
    masterGain.connect(audioCtx.destination);
  } catch {
    audioCtx = null;
    masterGain = null;
  }
}

// Lazily builds (once) and returns a fresh BufferSource over a shared 0.5s
// white-noise buffer - used for the "whoosh"/"impact"/"poof" style sounds
// below, where a pitched oscillator would read as too musical/artificial.
function noiseSource() {
  if (!noiseBuffer) {
    const length = Math.floor(audioCtx.sampleRate * 0.5);
    noiseBuffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffer;
  return src;
}

// Plays a single oscillator tone with a short attack/exponential-decay
// envelope. `freqEnd`, if given, glides the oscillator's frequency there over
// `duration` - a cheap way to get a "pew"/rising-chime pitch bend without
// extra nodes. Envelope floors at 0.0001 (not 0) since
// exponentialRampToValueAtTime can't ramp to/from an actual zero.
function tone({ freq, freqEnd, type = 'sine', duration = 0.15, peak = 0.3, delay = 0 }) {
  const t0 = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
  }

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.015, duration * 0.2));
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

// Plays a burst of band-passed noise with the same attack/decay envelope
// shape as tone() above.
function noiseBurst({ duration = 0.15, filterFreq = 1000, filterQ = 1, peak = 0.3, delay = 0 }) {
  const t0 = audioCtx.currentTime + delay;
  const src = noiseSource();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  filter.Q.value = filterQ;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.01, duration * 0.2));
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

// ---------------------------------------------------------------------------
// Sound library. Every entry schedules one or more tone()/noiseBurst() calls
// and returns immediately (Web Audio API scheduling is async/self-cleaning -
// nodes disconnect themselves once their envelope finishes). Keep every
// sound well under a second and gentle (soft envelopes, moderate peak gain)
// since several of these fire constantly during combat.
// ---------------------------------------------------------------------------

const SOUNDS = {
  // Melee swing - a short, soft whoosh (band-passed noise, no pitch).
  swing: () => noiseBurst({ duration: 0.12, filterFreq: 1400, filterQ: 0.6, peak: 0.22 }),

  // Ranged shot - a quick descending "pew".
  shot: () => tone({ freq: 900, freqEnd: 480, type: 'triangle', duration: 0.1, peak: 0.22 }),

  // Enemy or player taking a hit - a low thump plus a touch of impact noise.
  hit: () => {
    tone({ freq: 180, freqEnd: 80, type: 'sine', duration: 0.12, peak: 0.28 });
    noiseBurst({ duration: 0.08, filterFreq: 700, filterQ: 0.8, peak: 0.14 });
  },

  // Enemy death - a falling tone plus a wider noise "poof".
  enemyDeath: () => {
    tone({ freq: 260, freqEnd: 60, type: 'sawtooth', duration: 0.25, peak: 0.16 });
    noiseBurst({ duration: 0.2, filterFreq: 500, filterQ: 0.5, peak: 0.18 });
  },

  // Item pickup - a bright two-note chime.
  pickup: () => {
    tone({ freq: 660, type: 'sine', duration: 0.09, peak: 0.2 });
    tone({ freq: 990, type: 'sine', duration: 0.12, peak: 0.2, delay: 0.06 });
  },

  // Potion used - a soft rising "glug".
  potion: () => tone({ freq: 420, freqEnd: 640, type: 'sine', duration: 0.18, peak: 0.2 }),

  // Floor transition - a short three-note ascending arpeggio.
  floor: () => {
    tone({ freq: 440, type: 'triangle', duration: 0.16, peak: 0.18 });
    tone({ freq: 554, type: 'triangle', duration: 0.16, peak: 0.18, delay: 0.1 });
    tone({ freq: 660, type: 'triangle', duration: 0.32, peak: 0.2, delay: 0.2 });
  },

  // Menu perk purchase - a tiny click.
  perkBuy: () => tone({ freq: 800, type: 'square', duration: 0.05, peak: 0.14 }),

  // "Descend" confirmation - a short two-note upward chime.
  descend: () => {
    tone({ freq: 330, type: 'sine', duration: 0.14, peak: 0.2 });
    tone({ freq: 494, type: 'sine', duration: 0.22, peak: 0.2, delay: 0.09 });
  },
};

/**
 * Plays a named synthesized sound effect. Valid names: 'swing', 'shot',
 * 'hit', 'enemyDeath', 'pickup', 'potion', 'floor', 'perkBuy', 'descend'
 * (see SOUNDS above). Always safe to call - silently does nothing if audio
 * hasn't been unlocked yet (initAudio() not yet called from a user gesture),
 * isn't available at all, or the name isn't recognized; callers never need
 * to guard this themselves.
 */
export function playSound(name) {
  if (!audioCtx || !masterGain) return;
  const play = SOUNDS[name];
  if (!play) return;
  try {
    play();
  } catch {
    // Never let a synthesis glitch crash the game.
  }
}
