/**
 * JARVIS Web Audio — cinematic tones inspired by Stark Systems.
 *
 * All sounds synthesized via WebAudio — zero external assets.
 *   - Boot: sine sweep 200→1200→800Hz + triangle harmonic overtone + C6 chime, 2.2s
 *   - Engage: rising sine 660→880Hz with subtle sub-octave, 220ms
 *   - Complete: descending two-note chime, 500ms
 *   - Error: sawtooth siren 440→220Hz + low thud, 350ms
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

/** AI awakening — full boot chime with harmonic overtone, ~2.2s */
export function playBootChime(volume = 1): void {
  try {
    const c = getCtx()
    const now = c.currentTime
    const base = 0.05 * volume

    // Main sine sweep
    const osc1 = c.createOscillator()
    const gain1 = c.createGain()
    osc1.connect(gain1); gain1.connect(c.destination)
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(200, now)
    osc1.frequency.exponentialRampToValueAtTime(1200, now + 1.0)
    osc1.frequency.exponentialRampToValueAtTime(800, now + 1.8)
    gain1.gain.setValueAtTime(base, now)
    gain1.gain.setValueAtTime(base, now + 0.8)
    gain1.gain.linearRampToValueAtTime(0, now + 2.0)
    osc1.start(now); osc1.stop(now + 2.05)

    // Triangle harmonic overtone (one octave up, quieter)
    const osc1b = c.createOscillator()
    const gain1b = c.createGain()
    osc1b.connect(gain1b); gain1b.connect(c.destination)
    osc1b.type = 'triangle'
    osc1b.frequency.setValueAtTime(400, now)
    osc1b.frequency.exponentialRampToValueAtTime(2400, now + 1.0)
    osc1b.frequency.exponentialRampToValueAtTime(1600, now + 1.8)
    gain1b.gain.setValueAtTime(base * 0.25, now)
    gain1b.gain.linearRampToValueAtTime(0, now + 1.8)
    osc1b.start(now); osc1b.stop(now + 1.85)

    // C6 chime at end (1047Hz)
    const osc2 = c.createOscillator()
    const gain2 = c.createGain()
    osc2.connect(gain2); gain2.connect(c.destination)
    osc2.type = 'triangle'
    osc2.frequency.value = 1047
    gain2.gain.setValueAtTime(0, now + 1.4)
    gain2.gain.linearRampToValueAtTime(base * 0.7, now + 1.5)
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 2.2)
    osc2.start(now + 1.4); osc2.stop(now + 2.25)

    // Sub bass warmth
    const osc3 = c.createOscillator()
    const gain3 = c.createGain()
    osc3.connect(gain3); gain3.connect(c.destination)
    osc3.type = 'sine'
    osc3.frequency.setValueAtTime(80, now)
    osc3.frequency.linearRampToValueAtTime(120, now + 1.5)
    gain3.gain.setValueAtTime(base * 0.35, now)
    gain3.gain.linearRampToValueAtTime(0, now + 1.6)
    osc3.start(now); osc3.stop(now + 1.65)
  } catch { /* AudioContext unavailable */ }
}

/** Send/engage tone — rising sine with subtle sub-octave, 220ms. */
export function playSendTone(volume = 1): void {
  try {
    const c = getCtx()
    const now = c.currentTime
    const base = 0.05 * volume

    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain); gain.connect(c.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(660, now)
    osc.frequency.linearRampToValueAtTime(880, now + 0.18)
    gain.gain.setValueAtTime(base, now)
    gain.gain.linearRampToValueAtTime(0, now + 0.22)
    osc.start(now); osc.stop(now + 0.25)

    // Sub octave
    const osc2 = c.createOscillator()
    const gain2 = c.createGain()
    osc2.connect(gain2); gain2.connect(c.destination)
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(330, now)
    osc2.frequency.linearRampToValueAtTime(440, now + 0.18)
    gain2.gain.setValueAtTime(base * 0.2, now)
    gain2.gain.linearRampToValueAtTime(0, now + 0.22)
    osc2.start(now); osc2.stop(now + 0.25)
  } catch { /* noop */ }
}

/** Response complete — descending two-note chime, 500ms. */
export function playCompleteTone(volume = 1): void {
  try {
    const c = getCtx()
    const now = c.currentTime
    const base = 0.04 * volume

    // First note (E5 → D5)
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain); gain.connect(c.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.linearRampToValueAtTime(784, now + 0.2)
    gain.gain.setValueAtTime(base, now)
    gain.gain.linearRampToValueAtTime(base * 0.3, now + 0.2)
    gain.gain.linearRampToValueAtTime(0, now + 0.35)
    osc.start(now); osc.stop(now + 0.4)

    // Second note (G5)
    const osc2 = c.createOscillator()
    const gain2 = c.createGain()
    osc2.connect(gain2); gain2.connect(c.destination)
    osc2.type = 'triangle'
    osc2.frequency.value = 660
    gain2.gain.setValueAtTime(0, now + 0.15)
    gain2.gain.linearRampToValueAtTime(base * 0.6, now + 0.2)
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)
    osc2.start(now + 0.15); osc2.stop(now + 0.55)
  } catch { /* noop */ }
}

/** Error tone — sawtooth siren + impact thud, 350ms. */
export function playErrorTone(volume = 1): void {
  try {
    const c = getCtx()
    const now = c.currentTime
    const base = 0.06 * volume

    // Siren
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.connect(gain); gain.connect(c.destination)
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(440, now)
    osc.frequency.linearRampToValueAtTime(220, now + 0.25)
    gain.gain.setValueAtTime(base, now)
    gain.gain.linearRampToValueAtTime(0, now + 0.3)
    osc.start(now); osc.stop(now + 0.35)

    // Impact thud
    const osc2 = c.createOscillator()
    const gain2 = c.createGain()
    osc2.connect(gain2); gain2.connect(c.destination)
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(80, now)
    osc2.frequency.linearRampToValueAtTime(40, now + 0.15)
    gain2.gain.setValueAtTime(base * 0.5, now)
    gain2.gain.linearRampToValueAtTime(0, now + 0.18)
    osc2.start(now); osc2.stop(now + 0.2)
  } catch { /* noop */ }
}

/** Resume AudioContext after user gesture (browser policy). */
export function resumeAudio(): void {
  ctx?.resume().catch(() => {})
}
