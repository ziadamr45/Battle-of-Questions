// ============================================
// BATTLE AUDIO ENGINE - معركة الأسئلة
// Web Audio API Synthesized Sound System
// Zero external files, zero loading time
// ============================================

// Audio context singleton
let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null
let sfxGain: GainNode | null = null
let musicGain: GainNode | null = null
let ambientGain: GainNode | null = null
let currentAmbient: { source: OscillatorNode; gain: GainNode } | null = null
let heartbeatInterval: ReturnType<typeof setInterval> | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
    masterGain = audioCtx.createGain()
    masterGain.connect(audioCtx.destination)

    sfxGain = audioCtx.createGain()
    sfxGain.connect(masterGain)

    musicGain = audioCtx.createGain()
    musicGain.connect(masterGain)

    ambientGain = audioCtx.createGain()
    ambientGain.connect(masterGain)
  }
  // Resume if suspended (autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {
      // Resume failed - will retry on next sound call
    })
  }
  return audioCtx
}

function setMasterVolume(vol: number) {
  getAudioContext()
  if (masterGain) masterGain.gain.value = vol
}

function setSfxVolume(vol: number) {
  getAudioContext()
  if (sfxGain) sfxGain.gain.value = vol
}

function setMusicVolume(vol: number) {
  getAudioContext()
  if (musicGain) musicGain.gain.value = vol
}

function setAmbientVolume(vol: number) {
  getAudioContext()
  if (ambientGain) ambientGain.gain.value = vol
}

// ============================================
// HELPER: Create noise buffer
// ============================================
function createNoiseBuffer(duration: number, type: 'white' | 'pink' = 'white'): AudioBuffer {
  const ctx = getAudioContext()
  const sampleRate = ctx.sampleRate
  const length = sampleRate * duration
  const buffer = ctx.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)

  if (type === 'white') {
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1
    }
  } else {
    // Pink noise approximation
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + white * 0.0555179
      b1 = 0.99332 * b1 + white * 0.0750759
      b2 = 0.96900 * b2 + white * 0.1538520
      b3 = 0.86650 * b3 + white * 0.3104856
      b4 = 0.55000 * b4 + white * 0.5329522
      b5 = -0.7616 * b5 - white * 0.0168980
      data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362
      data[i] *= 0.11
      b6 = white * 0.115926
    }
  }
  return buffer
}

// ============================================
// HELPER: Play a tone
// ============================================
function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume: number = 0.3,
  startDelay: number = 0,
  targetGain: GainNode | null = null
): OscillatorNode {
  const ctx = getAudioContext()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = type
  osc.frequency.value = freq
  gain.gain.value = 0

  osc.connect(gain)
  gain.connect(targetGain || sfxGain!)

  const now = ctx.currentTime + startDelay
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(volume, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

  osc.start(now)
  osc.stop(now + duration + 0.05)

  return osc
}

// ============================================
// HELPER: Play noise burst
// ============================================
function playNoise(
  duration: number,
  volume: number = 0.3,
  filterFreq: number = 2000,
  filterType: BiquadFilterType = 'bandpass',
  startDelay: number = 0,
  targetGain: GainNode | null = null
) {
  const ctx = getAudioContext()
  const buffer = createNoiseBuffer(duration + 0.1)
  const source = ctx.createBufferSource()
  const gain = ctx.createGain()
  const filter = ctx.createBiquadFilter()

  source.buffer = buffer
  filter.type = filterType
  filter.frequency.value = filterFreq
  filter.Q.value = 1

  source.connect(filter)
  filter.connect(gain)
  gain.connect(targetGain || sfxGain!)

  const now = ctx.currentTime + startDelay
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(volume, now + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

  source.start(now)
  source.stop(now + duration + 0.1)
}

// ============================================
// HELPER: Create reverb effect
// ============================================
function createReverb(duration: number = 1.5, decay: number = 2): ConvolverNode {
  const ctx = getAudioContext()
  const sampleRate = ctx.sampleRate
  const length = sampleRate * duration
  const impulse = ctx.createBuffer(2, length, sampleRate)

  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
    }
  }

  const convolver = ctx.createConvolver()
  convolver.buffer = impulse
  return convolver
}

// ============================================
// SOUND: Splash / Intro
// ============================================
function playSplashIntro() {
  const ctx = getAudioContext()
  if (!sfxGain) return

  // Phase 1: Sword whoosh (0ms - 600ms)
  // Left sword whoosh - rising filtered noise
  playNoise(0.5, 0.35, 800, 'highpass', 0)
  playNoise(0.4, 0.25, 3000, 'bandpass', 0.1)

  // Rising sweep
  const sweepOsc = ctx.createOscillator()
  const sweepGain = ctx.createGain()
  sweepOsc.type = 'sawtooth'
  sweepOsc.frequency.setValueAtTime(200, ctx.currentTime)
  sweepOsc.frequency.exponentialRampToValueAtTime(1500, ctx.currentTime + 0.5)
  sweepGain.gain.setValueAtTime(0, ctx.currentTime)
  sweepGain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.2)
  sweepGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
  sweepOsc.connect(sweepGain)
  sweepGain.connect(sfxGain!)
  sweepOsc.start(ctx.currentTime)
  sweepOsc.stop(ctx.currentTime + 0.7)

  // Phase 2: Metallic Clash (600ms)
  const clashTime = 0.6

  // Impact body - low frequency hit
  playTone(80, 0.4, 'sine', 0.7, clashTime)
  playTone(120, 0.3, 'sine', 0.55, clashTime)

  // Metallic resonances - multiple high harmonics
  playTone(2400, 0.2, 'square', 0.15, clashTime)
  playTone(3200, 0.15, 'square', 0.12, clashTime)
  playTone(4800, 0.1, 'sawtooth', 0.08, clashTime)
  playTone(6400, 0.08, 'sawtooth', 0.06, clashTime)

  // Clash noise burst
  playNoise(0.2, 0.45, 4000, 'highpass', clashTime)

  // Phase 3: Echo / Reverb tail (700ms+)
  const reverb = createReverb(1.5, 3)
  const reverbGain = ctx.createGain()
  reverbGain.gain.setValueAtTime(0, ctx.currentTime + clashTime + 0.1)
  reverbGain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + clashTime + 0.15)
  reverbGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + clashTime + 1.5)
  reverb.connect(reverbGain)
  reverbGain.connect(sfxGain!)

  // Feed the clash into reverb
  const revOsc = ctx.createOscillator()
  revOsc.type = 'square'
  revOsc.frequency.value = 3000
  const revFeed = ctx.createGain()
  revFeed.gain.setValueAtTime(0.2, ctx.currentTime + clashTime)
  revFeed.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + clashTime + 0.3)
  revOsc.connect(revFeed)
  revFeed.connect(reverb)
  revOsc.start(ctx.currentTime + clashTime)
  revOsc.stop(ctx.currentTime + clashTime + 0.5)

  // Phase 4: Title reveal deep hit (1200ms)
  const titleTime = 1.2
  playTone(60, 0.6, 'sine', 0.8, titleTime)
  playTone(90, 0.5, 'sine', 0.6, titleTime)
  playNoise(0.3, 0.2, 200, 'lowpass', titleTime)

  // Sub boom
  playTone(40, 1.0, 'sine', 0.6, titleTime)
}

// ============================================
// SOUND: Screen Transition (Whoosh/Swipe)
// ============================================
let lastTransitionTime = 0
const TRANSITION_COOLDOWN = 150 // ms between transition sounds to prevent overlap

function playTransition(type: 'whoosh' | 'slash' | 'metallic' | 'impact' = 'whoosh') {
  const now = Date.now()
  if (now - lastTransitionTime < TRANSITION_COOLDOWN) return // Debounce
  lastTransitionTime = now

  const ctx = getAudioContext()
  if (!sfxGain) return

  switch (type) {
    case 'whoosh': {
      // Quick filtered noise sweep
      playNoise(0.25, 0.3, 1500, 'bandpass')
      // High frequency sweep
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(500, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.1)
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.2)
      gain.gain.setValueAtTime(0.08, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
      osc.connect(gain)
      gain.connect(sfxGain!)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.25)
      break
    }
    case 'slash': {
      // Sharper, more aggressive whoosh
      playNoise(0.15, 0.35, 3000, 'highpass')
      playNoise(0.1, 0.25, 5000, 'bandpass', 0.02)
      // Quick metallic ring
      playTone(3000, 0.1, 'square', 0.1)
      break
    }
    case 'metallic': {
      // Metallic swipe
      playNoise(0.18, 0.25, 2500, 'bandpass')
      playTone(2000, 0.12, 'square', 0.12)
      playTone(3500, 0.1, 'sawtooth', 0.08, 0.02)
      break
    }
    case 'impact': {
      // Light impact
      playTone(100, 0.2, 'sine', 0.5)
      playTone(200, 0.15, 'sine', 0.35, 0.01)
      playNoise(0.1, 0.3, 2000, 'highpass')
      break
    }
  }
}

// ============================================
// SOUND: Countdown Beep (3-2-1)
// ============================================
function playCountdownBeep(countNumber: number) {
  // Higher pitch for each count
  const baseFreq = 400 + (countNumber * 100)
  playTone(baseFreq, 0.2, 'sine', 0.4)
  playTone(baseFreq * 1.5, 0.15, 'sine', 0.2, 0.01)
}

// ============================================
// SOUND: Battle Start ("ابدأ المعركة")
// ============================================
function playBattleStart() {
  const ctx = getAudioContext()
  if (!sfxGain) return

  // Epic start hit
  playTone(60, 0.6, 'sine', 0.5)
  playTone(80, 0.5, 'sine', 0.4, 0.02)
  playTone(120, 0.3, 'sine', 0.3, 0.03)

  // Horn-like rising tone
  const horn = ctx.createOscillator()
  const hornGain = ctx.createGain()
  horn.type = 'sawtooth'
  horn.frequency.setValueAtTime(200, ctx.currentTime)
  horn.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.3)
  horn.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.5)
  hornGain.gain.setValueAtTime(0, ctx.currentTime)
  hornGain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05)
  hornGain.gain.setValueAtTime(0.08, ctx.currentTime + 0.3)
  hornGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
  horn.connect(hornGain)
  hornGain.connect(sfxGain!)
  horn.start(ctx.currentTime)
  horn.stop(ctx.currentTime + 0.7)

  // Impact noise
  playNoise(0.15, 0.2, 3000, 'highpass')

  // Metallic ring
  playTone(2500, 0.2, 'square', 0.06, 0.05)
  playTone(4000, 0.15, 'square', 0.04, 0.08)
}

// ============================================
// SOUND: Answer Select (subtle, no reveal)
// ============================================
function playAnswerSelect() {
  // Very subtle click - NOT revealing correctness
  playTone(800, 0.05, 'sine', 0.2)
  playTone(1200, 0.04, 'sine', 0.12, 0.01)
}

// ============================================
// SOUND: Time Warning Pulse
// ============================================
function playTimeWarning() {
  // Urgent but not too loud
  playTone(600, 0.1, 'sine', 0.3)
  playTone(800, 0.08, 'sine', 0.2, 0.03)
}

// ============================================
// SOUND: Time Up
// ============================================
function playTimeUp() {
  // Dramatic stop
  playTone(150, 0.5, 'sine', 0.6)
  playTone(100, 0.6, 'sine', 0.5, 0.05)
  playNoise(0.3, 0.2, 500, 'lowpass')
}

// ============================================
// SOUND: Round End / Reveal
// ============================================
function playRoundEndReveal() {
  const ctx = getAudioContext()
  if (!sfxGain) return

  // Moment of silence (handled by caller with setTimeout)

  // Rising tension sweep
  const sweep = ctx.createOscillator()
  const sweepGain = ctx.createGain()
  sweep.type = 'sawtooth'
  sweep.frequency.setValueAtTime(200, ctx.currentTime)
  sweep.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.8)
  sweepGain.gain.setValueAtTime(0, ctx.currentTime)
  sweepGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.4)
  sweepGain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.7)
  sweepGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9)
  sweep.connect(sweepGain)
  sweepGain.connect(sfxGain!)
  sweep.start(ctx.currentTime)
  sweep.stop(ctx.currentTime + 1.0)

  // Impact hit at reveal
  setTimeout(() => {
    playTone(60, 0.5, 'sine', 0.45)
    playTone(90, 0.4, 'sine', 0.35, 0.02)
    playNoise(0.15, 0.2, 3000, 'highpass')

    // Cinematic spread
    playTone(400, 0.3, 'sine', 0.1, 0.05)
    playTone(600, 0.25, 'sine', 0.08, 0.08)
  }, 800)
}

// ============================================
// SOUND: Victory
// ============================================
function playVictory() {
  const ctx = getAudioContext()
  if (!sfxGain) return

  // Epic reveal - deep impact
  playTone(50, 0.8, 'sine', 0.5)
  playTone(75, 0.6, 'sine', 0.4, 0.02)

  // Triumphant chord progression (Major)
  // Root position
  setTimeout(() => {
    playTone(261, 0.6, 'sine', 0.12) // C4
    playTone(329, 0.6, 'sine', 0.10) // E4
    playTone(392, 0.6, 'sine', 0.10) // G4
  }, 200)

  // First inversion with spread
  setTimeout(() => {
    playTone(392, 0.5, 'sine', 0.10) // G4
    playTone(523, 0.5, 'sine', 0.08) // C5
    playTone(659, 0.5, 'sine', 0.08) // E5
  }, 600)

  // Final triumph - higher octave
  setTimeout(() => {
    playTone(523, 0.8, 'sine', 0.12) // C5
    playTone(659, 0.8, 'sine', 0.10) // E5
    playTone(784, 0.8, 'sine', 0.10) // G5
    playTone(1047, 0.6, 'sine', 0.08, 0.1) // C6
  }, 1000)

  // Metallic celebration hits
  setTimeout(() => {
    playTone(3000, 0.1, 'square', 0.04)
    playTone(4500, 0.08, 'square', 0.03, 0.05)
    playNoise(0.1, 0.1, 4000, 'highpass')
  }, 400)

  // Sub boom
  setTimeout(() => {
    playTone(40, 1.0, 'sine', 0.4)
  }, 900)
}

// ============================================
// SOUND: Defeat (not depressing, motivational)
// ============================================
function playDefeat() {
  // Gentle descent - not too sad
  playTone(400, 0.3, 'sine', 0.12)
  setTimeout(() => playTone(350, 0.3, 'sine', 0.10), 200)
  setTimeout(() => playTone(300, 0.4, 'sine', 0.08), 400)

  // Subtle rising note at end (hope)
  setTimeout(() => playTone(350, 0.5, 'sine', 0.06), 700)
}

// ============================================
// SOUND: Podium / Leaderboard Reveal
// ============================================
function playPodiumReveal() {
  const ctx = getAudioContext()
  if (!sfxGain) return

  // Epic start
  playTone(80, 0.5, 'sine', 0.4)
  playTone(120, 0.4, 'sine', 0.3, 0.02)

  // Rising anticipation
  setTimeout(() => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(150, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 1.0)
    gain.gain.setValueAtTime(0.03, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.8)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2)
    osc.connect(gain)
    gain.connect(sfxGain!)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 1.3)
  }, 300)

  // Fanfare
  setTimeout(() => {
    playTone(523, 0.3, 'sine', 0.10) // C5
    playTone(659, 0.3, 'sine', 0.08, 0.1) // E5
    playTone(784, 0.3, 'sine', 0.08, 0.2) // G5
    playTone(1047, 0.5, 'sine', 0.10, 0.35) // C6
  }, 1200)
}

// ============================================
// SOUND: Player Joined Arena
// ============================================
function playPlayerJoined() {
  // Short battle horn
  playTone(200, 0.18, 'sawtooth', 0.15)
  playTone(300, 0.12, 'sawtooth', 0.12, 0.08)
  playTone(400, 0.1, 'sine', 0.1, 0.15)
}

// ============================================
// SOUND: Player Left
// ============================================
function playPlayerLeft() {
  // Descending tone
  playTone(400, 0.15, 'sine', 0.15)
  setTimeout(() => playTone(300, 0.18, 'sine', 0.12), 80)
}

// ============================================
// SOUND: Button Click (subtle)
// ============================================
function playButtonClick() {
  playTone(1000, 0.03, 'sine', 0.1)
}

// ============================================
// AMBIENT: Arena Tension (during gameplay)
// ============================================
function startAmbientTension() {
  const ctx = getAudioContext()
  if (!ambientGain || currentAmbient) return

  // Low drone with subtle modulation
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()

  osc.type = 'sawtooth'
  osc.frequency.value = 55 // Low A

  lfo.type = 'sine'
  lfo.frequency.value = 0.3 // Very slow modulation
  lfoGain.gain.value = 5

  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)

  gain.gain.value = 0.04 // Very subtle

  // Filter the harsh sawtooth
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 200
  filter.Q.value = 2

  osc.connect(filter)
  filter.connect(gain)
  gain.connect(ambientGain!)

  osc.start(ctx.currentTime)
  lfo.start(ctx.currentTime)

  currentAmbient = { source: osc, gain }

  // Also add subtle noise
  const noiseBuffer = createNoiseBuffer(4, 'pink')
  const noiseSource = ctx.createBufferSource()
  noiseSource.buffer = noiseBuffer
  noiseSource.loop = true
  const noiseGain = ctx.createGain()
  const noiseFilter = ctx.createBiquadFilter()
  noiseFilter.type = 'lowpass'
  noiseFilter.frequency.value = 300
  noiseGain.gain.value = 0.015
  noiseSource.connect(noiseFilter)
  noiseFilter.connect(noiseGain)
  noiseGain.connect(ambientGain!)
  noiseSource.start(ctx.currentTime)
}

function stopAmbientTension() {
  if (currentAmbient) {
    try {
      currentAmbient.source.stop()
    } catch { /* already stopped */ }
    currentAmbient = null
  }
  // Stop heartbeat too
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
}

// ============================================
// HEARTBEAT: Near time end
// ============================================
function startHeartbeat(bpm: number = 80) {
  if (heartbeatInterval) clearInterval(heartbeatInterval)

  const intervalMs = (60 / bpm) * 1000
  heartbeatInterval = setInterval(() => {
    // Low thump
    playTone(55, 0.12, 'sine', 0.2)
    // Second beat slightly delayed
    setTimeout(() => playTone(50, 0.08, 'sine', 0.12), 120)
  }, intervalMs)
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
}

// ============================================
// SOUND: Surrender
// ============================================
function playSurrender() {
  playTone(300, 0.2, 'sine', 0.1)
  setTimeout(() => playTone(200, 0.3, 'sine', 0.08), 150)
  setTimeout(() => playTone(150, 0.4, 'sine', 0.06), 350)
  playNoise(0.15, 0.05, 300, 'lowpass')
}

// ============================================
// SOUND: Game Error
// ============================================
function playError() {
  playTone(200, 0.15, 'square', 0.08)
  setTimeout(() => playTone(150, 0.2, 'square', 0.06), 150)
}

// ============================================
// SOUND: Gentle Notification (attention-grabbing but not negative)
// ============================================
function playNotification() {
  // Two gentle ascending chimes — pleasant and noticeable without harshness
  playTone(523, 0.12, 'sine', 0.18)  // C5
  setTimeout(() => playTone(659, 0.18, 'sine', 0.14), 100)  // E5
  setTimeout(() => playTone(784, 0.14, 'sine', 0.10), 200)  // G5
}

// ============================================
// SOUND: Loading Progress Step
// ============================================
function playProgressStep() {
  playTone(600, 0.06, 'sine', 0.1)
  playTone(900, 0.04, 'sine', 0.06, 0.03)
}

// ============================================
// SOUND: Early End Game - Dramatic cinematic horn
// ============================================
function playEarlyEndHorn() {
  // Deep dramatic horn blast
  playTone(80, 0.8, 'sawtooth', 0.3)
  playTone(120, 0.7, 'sine', 0.25, 0.05)
  playNoise(0.4, 0.3, 200, 'lowpass')
  // Rising tension
  setTimeout(() => {
    playTone(150, 0.5, 'sine', 0.15)
    playTone(200, 0.4, 'sine', 0.12, 0.1)
  }, 300)
  // Final impact
  setTimeout(() => {
    playTone(60, 1.0, 'sine', 0.4)
    playTone(90, 0.8, 'sine', 0.3, 0.05)
    playNoise(0.3, 0.15, 150, 'lowpass')
  }, 700)
}

// ============================================
// SOUND: Early End Confirmation - Final buzzer
// ============================================
function playEarlyEndConfirmed() {
  // Low rumble
  playTone(50, 1.2, 'sine', 0.5)
  playNoise(0.5, 0.2, 100, 'lowpass')
  // Dramatic descending tones
  setTimeout(() => {
    playTone(400, 0.3, 'sine', 0.12)
    playTone(350, 0.3, 'sine', 0.10, 0.15)
    playTone(300, 0.4, 'sine', 0.08, 0.3)
  }, 200)
  // Final gong
  setTimeout(() => {
    playTone(100, 1.5, 'sine', 0.4)
    playTone(150, 1.0, 'sine', 0.25, 0.1)
    playNoise(0.2, 0.1, 300, 'lowpass')
  }, 800)
}

// ============================================
// EXPORT: Audio Engine API
// ============================================
export const audioEngine = {
  // Context management
  init: getAudioContext,
  setMasterVolume,
  setSfxVolume,
  setMusicVolume,
  setAmbientVolume,

  // Sounds
  splash: playSplashIntro,
  transition: playTransition,
  countdownBeep: playCountdownBeep,
  battleStart: playBattleStart,
  answerSelect: playAnswerSelect,
  timeWarning: playTimeWarning,
  timeUp: playTimeUp,
  roundEndReveal: playRoundEndReveal,
  victory: playVictory,
  defeat: playDefeat,
  podiumReveal: playPodiumReveal,
  playerJoined: playPlayerJoined,
  playerLeft: playPlayerLeft,
  buttonClick: playButtonClick,
  surrender: playSurrender,
  error: playError,
  notification: playNotification,
  progressStep: playProgressStep,
  earlyEndHorn: playEarlyEndHorn,
  earlyEndConfirmed: playEarlyEndConfirmed,

  // Ambient
  startAmbient: startAmbientTension,
  stopAmbient: stopAmbientTension,
  startHeartbeat,
  stopHeartbeat,
}
