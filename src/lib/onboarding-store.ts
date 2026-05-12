'use client'

import { create } from 'zustand'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type GameplayHintType =
  | 'timer'
  | 'readingArea'
  | 'answerArea'
  | 'leaderboard'
  | 'roundTransition'
  | 'noImmediateAnswers'

// ─── Persistence helpers ───────────────────────────────────────────────────────

const STORAGE_KEY = 'maaraka-onboarding'

function saveToLocalStorage(state: Partial<OnboardingState>) {
  try {
    if (typeof window === 'undefined') return
    const current = loadFromLocalStorage()
    const merged = { ...current, ...state }
    // Only persist data fields, not actions
    const toSave: Record<string, unknown> = {}
    const actionKeys = new Set([
      'completeOnboarding', 'completeCinematicIntro', 'setCinematicIntroStep',
      'startUIHighlight', 'completeUIHighlight', 'setUIHighlightStep',
      'markFirstBattlePlayed', 'showGameplayHint', 'incrementTipsSeen',
      'resetOnboarding',
    ])
    for (const [key, value] of Object.entries(merged)) {
      if (!actionKeys.has(key)) {
        toSave[key] = value
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch {
    // Ignore storage errors (quota, privacy mode, etc.)
  }
}

function loadFromLocalStorage(): Partial<OnboardingState> | null {
  try {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Partial<OnboardingState>
  } catch {
    // Ignore parse errors
  }
  return null
}

function removeFromLocalStorage() {
  try {
    if (typeof window === 'undefined') return
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore
  }
}

// ─── Default state ─────────────────────────────────────────────────────────────

interface OnboardingData {
  onboardingCompleted: boolean
  uiHighlightCompleted: boolean
  firstBattlePlayed: boolean
  cinematicIntroStep: number
  cinematicIntroCompleted: boolean
  uiHighlightStep: number
  uiHighlightActive: boolean
  timerHintShown: boolean
  readingAreaHintShown: boolean
  answerAreaHintShown: boolean
  leaderboardHintShown: boolean
  roundTransitionHintShown: boolean
  noImmediateAnswersHintShown: boolean
  tipsSeenCount: number
  currentTipIndex: number
}

const defaultData: OnboardingData = {
  onboardingCompleted: false,
  uiHighlightCompleted: false,
  firstBattlePlayed: false,
  cinematicIntroStep: 0,
  cinematicIntroCompleted: false,
  uiHighlightStep: 0,
  uiHighlightActive: false,
  timerHintShown: false,
  readingAreaHintShown: false,
  answerAreaHintShown: false,
  leaderboardHintShown: false,
  roundTransitionHintShown: false,
  noImmediateAnswersHintShown: false,
  tipsSeenCount: 0,
  currentTipIndex: 0,
}

// Load persisted data on store creation (safe for SSR)
function getInitialData(): OnboardingData {
  if (typeof window === 'undefined') return { ...defaultData }
  const persisted = loadFromLocalStorage()
  if (!persisted) return { ...defaultData }
  return { ...defaultData, ...persisted }
}

// ─── Gameplay hint key mapping ─────────────────────────────────────────────────

const HINT_KEY_MAP: Record<GameplayHintType, keyof OnboardingData> = {
  timer: 'timerHintShown',
  readingArea: 'readingAreaHintShown',
  answerArea: 'answerAreaHintShown',
  leaderboard: 'leaderboardHintShown',
  roundTransition: 'roundTransitionHintShown',
  noImmediateAnswers: 'noImmediateAnswersHintShown',
}

// ─── Store interface ───────────────────────────────────────────────────────────

interface OnboardingState extends OnboardingData {
  // Actions
  completeOnboarding: () => void
  completeCinematicIntro: () => void
  setCinematicIntroStep: (step: number) => void
  startUIHighlight: () => void
  completeUIHighlight: () => void
  setUIHighlightStep: (step: number) => void
  markFirstBattlePlayed: () => void
  showGameplayHint: (hint: GameplayHintType) => void
  incrementTipsSeen: () => void
  resetOnboarding: () => void
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  ...getInitialData(),

  completeOnboarding: () => {
    const update = { onboardingCompleted: true }
    set(update)
    saveToLocalStorage(update)
  },

  completeCinematicIntro: () => {
    const update: Partial<OnboardingData> = {
      cinematicIntroCompleted: true,
      cinematicIntroStep: 0,
    }
    set(update)
    saveToLocalStorage(update)
  },

  setCinematicIntroStep: (step: number) => {
    const update = { cinematicIntroStep: step }
    set(update)
    // Don't persist transient step state to avoid noise
    // Only the completion state matters for persistence
  },

  startUIHighlight: () => {
    const update: Partial<OnboardingData> = {
      uiHighlightActive: true,
      uiHighlightStep: 0,
    }
    set(update)
    // Don't persist transient active state
  },

  completeUIHighlight: () => {
    const update: Partial<OnboardingData> = {
      uiHighlightActive: false,
      uiHighlightCompleted: true,
      uiHighlightStep: 0,
    }
    set(update)
    saveToLocalStorage(update)
  },

  setUIHighlightStep: (step: number) => {
    const update = { uiHighlightStep: step }
    set(update)
    // Don't persist transient step state
  },

  markFirstBattlePlayed: () => {
    const update = { firstBattlePlayed: true }
    set(update)
    saveToLocalStorage(update)
  },

  showGameplayHint: (hint: GameplayHintType) => {
    const key = HINT_KEY_MAP[hint]
    // Don't re-show already shown hints
    if (get()[key]) return
    const update = { [key]: true } as Partial<OnboardingData>
    set(update)
    saveToLocalStorage(update)
  },

  incrementTipsSeen: () => {
    const state = get()
    const update: Partial<OnboardingData> = {
      tipsSeenCount: state.tipsSeenCount + 1,
      currentTipIndex: (state.currentTipIndex + 1),
    }
    set(update)
    saveToLocalStorage(update)
  },

  resetOnboarding: () => {
    set({ ...defaultData })
    removeFromLocalStorage()
  },
}))

// ─── Helper functions ──────────────────────────────────────────────────────────

/**
 * Returns true if the user has NOT completed onboarding (i.e. is a first-time user).
 */
export function isFirstTimeUser(): boolean {
  if (typeof window === 'undefined') return true
  return !useOnboardingStore.getState().onboardingCompleted
}

/**
 * Returns true if the cinematic intro should be shown.
 * Conditions: onboarding not completed AND cinematic intro not yet completed.
 */
export function shouldShowCinematicIntro(): boolean {
  if (typeof window === 'undefined') return false
  const state = useOnboardingStore.getState()
  return !state.onboardingCompleted && !state.cinematicIntroCompleted
}

/**
 * Returns true if the UI highlight tour should be shown.
 * Conditions: onboarding completed but UI highlight tour not yet completed.
 */
export function shouldShowUIHighlights(): boolean {
  if (typeof window === 'undefined') return false
  const state = useOnboardingStore.getState()
  return state.onboardingCompleted && !state.uiHighlightCompleted
}

/**
 * Returns true if gameplay hints should be shown.
 * Conditions: first battle has not been played yet (hints are only for the first battle).
 */
export function shouldShowGameplayHints(): boolean {
  if (typeof window === 'undefined') return false
  const state = useOnboardingStore.getState()
  return !state.firstBattlePlayed
}
