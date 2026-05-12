// ============================================
// AUDIO STATE STORE - معركة الأسئلة
// Manages audio settings with localStorage persistence
// ============================================

import { create } from 'zustand'
import { audioEngine } from './audio-engine'

const AUDIO_SETTINGS_KEY = 'maaraka-audio-settings'

interface AudioSettings {
  masterVolume: number    // 0-1
  sfxVolume: number       // 0-1
  musicVolume: number     // 0-1
  isMuted: boolean
}

interface AudioState {
  settings: AudioSettings
  isInitialized: boolean

  // Actions
  initAudio: () => void          // Call on first user interaction
  setMasterVolume: (v: number) => void
  setSfxVolume: (v: number) => void
  setMusicVolume: (v: number) => void
  toggleMute: () => void
  setMuted: (m: boolean) => void
}

function loadSettings(): AudioSettings {
  try {
    const stored = localStorage.getItem(AUDIO_SETTINGS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        masterVolume: parsed.masterVolume ?? 1.0,
        sfxVolume: parsed.sfxVolume ?? 1.0,
        musicVolume: parsed.musicVolume ?? 1.0,
        isMuted: parsed.isMuted ?? false,
      }
    }
  } catch { /* ignore */ }
  return {
    masterVolume: 1.0,
    sfxVolume: 1.0,
    musicVolume: 1.0,
    isMuted: false,
  }
}

function saveSettings(settings: AudioSettings) {
  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings))
  } catch { /* ignore */ }
}

function applySettings(settings: AudioSettings) {
  const effectiveVolume = settings.isMuted ? 0 : settings.masterVolume
  audioEngine.setMasterVolume(effectiveVolume)
  audioEngine.setSfxVolume(settings.sfxVolume)
  audioEngine.setMusicVolume(settings.musicVolume)
  audioEngine.setAmbientVolume(settings.musicVolume * 0.5) // Ambient is quieter
}

export const useAudioStore = create<AudioState>((set, get) => ({
  settings: loadSettings(),
  isInitialized: false,

  initAudio: () => {
    const { settings } = get()
    audioEngine.init()
    applySettings(settings)
    set({ isInitialized: true })
  },

  setMasterVolume: (v: number) => {
    const settings = { ...get().settings, masterVolume: v }
    applySettings(settings)
    saveSettings(settings)
    set({ settings })
  },

  setSfxVolume: (v: number) => {
    const settings = { ...get().settings, sfxVolume: v }
    applySettings(settings)
    saveSettings(settings)
    set({ settings })
  },

  setMusicVolume: (v: number) => {
    const settings = { ...get().settings, musicVolume: v }
    applySettings(settings)
    saveSettings(settings)
    set({ settings })
  },

  toggleMute: () => {
    const settings = { ...get().settings, isMuted: !get().settings.isMuted }
    applySettings(settings)
    saveSettings(settings)
    set({ settings })
  },

  setMuted: (m: boolean) => {
    const settings = { ...get().settings, isMuted: m }
    applySettings(settings)
    saveSettings(settings)
    set({ settings })
  },
}))
