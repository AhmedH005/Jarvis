/**
 * JARVIS Web Audio — cinematic tones inspired by Stark Systems.
 *
 * All sounds synthesized via WebAudio — zero external assets.
 *   - Boot: sine sweep 200→1200→800Hz + triangle harmonic overtone + C6 chime, 2.2s
 *   - Activation: engine-like reactor spool-up with filtered air rush, 4.1s
 *   - Engage: rising sine 660→880Hz with subtle sub-octave, 220ms
 *   - Complete: descending two-note chime, 500ms
 *   - Error: sawtooth siren 440→220Hz + low thud, 350ms
 */

let ctx: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

export function getAudioContext(): AudioContext {
  return getCtx()
}

function getNoiseBuffer(c: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === c.sampleRate) return noiseBuffer

  const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let i = 0; i < channel.length; i++) {
    channel[i] = Math.random() * 2 - 1
  }
  noiseBuffer = buffer
  return buffer
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

/** Activation spool-up — engine-like acceleration with turbine hiss, ~4.1s. */
export function playActivationRamp(volume = 1): () => void {
  try {
    const c = getCtx()
    const now = c.currentTime
    const duration = 4.1
    const end = now + duration
    const base = 0.075 * volume

    const master = c.createGain()
    const drive = c.createWaveShaper()
    const curve = new Float32Array(256)
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1
      curve[i] = Math.tanh(x * 2.8)
    }
    drive.curve = curve
    drive.oversample = '4x'

    master.connect(drive)
    drive.connect(c.destination)
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(base * 1.6, now + 0.22)
    master.gain.linearRampToValueAtTime(base * 2.35, now + 2.6)
    master.gain.linearRampToValueAtTime(base * 1.85, end)
    master.gain.exponentialRampToValueAtTime(0.0001, end + 0.08)

    const lowOsc = c.createOscillator()
    const lowGain = c.createGain()
    lowOsc.type = 'sawtooth'
    lowOsc.frequency.setValueAtTime(38, now)
    lowOsc.frequency.exponentialRampToValueAtTime(132, end)
    lowGain.gain.setValueAtTime(base * 1.05, now)
    lowGain.gain.linearRampToValueAtTime(base * 1.45, now + 2.5)
    lowGain.gain.linearRampToValueAtTime(base * 1.12, end)
    lowOsc.connect(lowGain)
    lowGain.connect(master)

    const bodyOsc = c.createOscillator()
    const bodyGain = c.createGain()
    bodyOsc.type = 'sawtooth'
    bodyOsc.frequency.setValueAtTime(76, now)
    bodyOsc.frequency.exponentialRampToValueAtTime(360, end)
    bodyGain.gain.setValueAtTime(base * 0.44, now)
    bodyGain.gain.linearRampToValueAtTime(base * 0.78, end)
    bodyOsc.connect(bodyGain)
    bodyGain.connect(master)

    const gritOsc = c.createOscillator()
    const gritGain = c.createGain()
    gritOsc.type = 'square'
    gritOsc.frequency.setValueAtTime(120, now)
    gritOsc.frequency.exponentialRampToValueAtTime(420, end)
    gritGain.gain.setValueAtTime(base * 0.08, now)
    gritGain.gain.linearRampToValueAtTime(base * 0.2, end)
    gritOsc.connect(gritGain)
    gritGain.connect(master)

    const whineOsc = c.createOscillator()
    const whineGain = c.createGain()
    whineOsc.type = 'sine'
    whineOsc.frequency.setValueAtTime(220, now)
    whineOsc.frequency.exponentialRampToValueAtTime(1400, end)
    whineGain.gain.setValueAtTime(0.0001, now)
    whineGain.gain.exponentialRampToValueAtTime(base * 0.16, now + 0.35)
    whineGain.gain.linearRampToValueAtTime(base * 0.62, end)
    whineOsc.connect(whineGain)
    whineGain.connect(master)

    const wobble = c.createOscillator()
    const wobbleGain = c.createGain()
    wobble.type = 'sine'
    wobble.frequency.setValueAtTime(9, now)
    wobble.frequency.linearRampToValueAtTime(24, end)
    wobbleGain.gain.setValueAtTime(7, now)
    wobbleGain.gain.linearRampToValueAtTime(18, end)
    wobble.connect(wobbleGain)
    wobbleGain.connect(lowOsc.detune)

    const flutter = c.createOscillator()
    const flutterGain = c.createGain()
    flutter.type = 'triangle'
    flutter.frequency.setValueAtTime(12, now)
    flutter.frequency.linearRampToValueAtTime(36, end)
    flutterGain.gain.setValueAtTime(5, now)
    flutterGain.gain.linearRampToValueAtTime(14, end)
    flutter.connect(flutterGain)
    flutterGain.connect(whineOsc.detune)

    const noise = c.createBufferSource()
    const noiseFilter = c.createBiquadFilter()
    const noiseHighpass = c.createBiquadFilter()
    const noiseGain = c.createGain()
    noise.buffer = getNoiseBuffer(c)
    noise.loop = true
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.setValueAtTime(300, now)
    noiseFilter.frequency.exponentialRampToValueAtTime(3200, end)
    noiseFilter.Q.setValueAtTime(1.2, now)
    noiseFilter.Q.linearRampToValueAtTime(5.5, end)
    noiseHighpass.type = 'highpass'
    noiseHighpass.frequency.setValueAtTime(120, now)
    noiseHighpass.frequency.linearRampToValueAtTime(620, end)
    noiseGain.gain.setValueAtTime(0.0001, now)
    noiseGain.gain.exponentialRampToValueAtTime(base * 0.16, now + 0.35)
    noiseGain.gain.linearRampToValueAtTime(base * 0.62, end)
    noise.connect(noiseFilter)
    noiseFilter.connect(noiseHighpass)
    noiseHighpass.connect(noiseGain)
    noiseGain.connect(master)

    const nodes = [lowOsc, bodyOsc, gritOsc, whineOsc, wobble, flutter, noise] as const
    nodes.forEach((node) => node.start(now))
    nodes.forEach((node) => node.stop(end + 0.12))

    let stopped = false
    return () => {
      if (stopped) return
      stopped = true
      const stopAt = c.currentTime
      master.gain.cancelScheduledValues(stopAt)
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), stopAt)
      master.gain.exponentialRampToValueAtTime(0.0001, stopAt + 0.08)
      nodes.forEach((node) => {
        try { node.stop(stopAt + 0.1) } catch { /* already stopped */ }
      })
    }
  } catch {
    return () => {}
  }
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
