import { create } from 'zustand'

export type GameType = 'قراءة متحررة' | 'نصوص'
export type Difficulty = 'سهل' | 'متوسط' | 'صعب'
export type RoomType = 'عامة' | 'خاصة'
export type Screen = 'home' | 'create' | 'join' | 'lobby' | 'loading' | 'game' | 'results' | 'round-transition'

export interface Player {
  id: string
  name: string
  score: number
  isHost: boolean
  isReady: boolean
  joinOrder: number
  roundWins?: number
}

export interface Question {
  id: number
  text: string
  options: string[]
  correctAnswer: number
  explanation: string
}

export interface GameContent {
  title: string
  text: string
  source: string
  questions: Question[]
}

export interface GameSettings {
  gameType: GameType
  difficulty: Difficulty
  timePerRound: number      // minutes per round
  numberOfRounds: number
  maxPlayers: number
}

export interface RoomInfo {
  roomCode: string
  roomType: RoomType
  hasPassword: boolean
  hostName: string
  playerCount: number
  maxPlayers: number
  settings: GameSettings
  status: 'waiting' | 'playing' | 'finished'
}

export interface RoundScore {
  playerId: string
  playerName: string
  score: number
  correctAnswers: number
  totalQuestions: number
}

// ─── Session Storage Helpers ──────────────────────────────────────────────────

const SESSION_KEY = 'maaraka-session'

interface PersistedState {
  screen: Screen
  playerName: string
  roomCode: string
  roomType: RoomType
  roomPassword: string
  isHost: boolean
  gameSettings: GameSettings
  players: Player[]
  gameContent: GameContent | null
  currentQuestionIndex: number
  answers: Record<number, number>
  timeLeft: number
  scores: Player[]
  currentRound: number
  totalRounds: number
  roundWinners: Record<number, string>
  roundResults: Record<number, RoundScore[]>
}

function saveToSessionStorage(state: PersistedState) {
  try {
    // Only save if the user is in an active session (not home/join/create)
    if (state.screen === 'home' || state.screen === 'join' || state.screen === 'create') {
      if (!state.roomCode) {
        sessionStorage.removeItem(SESSION_KEY)
        return
      }
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage errors
  }
}

export function loadFromSessionStorage(): PersistedState | null {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored)
    // Validate the stored data has the minimum required fields
    if (!parsed.roomCode || !parsed.playerName || !parsed.screen) return null
    // Only restore if they were in an active room/game
    if (parsed.screen === 'home' || parsed.screen === 'join' || parsed.screen === 'create') {
      if (!parsed.roomCode) return null
    }
    return parsed as PersistedState
  } catch {
    return null
  }
}

export function clearSessionStorage() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Ignore
  }
}

// ─── Game Store ───────────────────────────────────────────────────────────────

interface GameState {
  screen: Screen
  setScreen: (screen: Screen) => void

  playerName: string
  setPlayerName: (name: string) => void

  roomCode: string
  setRoomCode: (code: string) => void

  roomType: RoomType
  setRoomType: (type: RoomType) => void

  roomPassword: string
  setRoomPassword: (password: string) => void

  isHost: boolean
  setIsHost: (isHost: boolean) => void

  gameSettings: GameSettings
  setGameSettings: (settings: Partial<GameSettings>) => void

  players: Player[]
  setPlayers: (players: Player[]) => void
  addPlayer: (player: Player) => void
  removePlayer: (playerId: string) => void

  gameContent: GameContent | null
  setGameContent: (content: GameContent | null) => void

  currentQuestionIndex: number
  setCurrentQuestionIndex: (index: number) => void
  nextQuestion: () => void

  answers: Record<number, number>
  setAnswer: (questionIndex: number, answerIndex: number) => void
  resetAnswers: () => void

  timeLeft: number
  setTimeLeft: (time: number) => void
  decrementTime: () => void

  scores: Player[]
  setScores: (scores: Player[]) => void

  isConnected: boolean
  setIsConnected: (connected: boolean) => void

  isLoading: boolean
  setIsLoading: (loading: boolean) => void

  error: string | null
  setError: (error: string | null) => void

  publicRooms: RoomInfo[]
  setPublicRooms: (rooms: RoomInfo[]) => void

  // Reconnection state
  isReconnecting: boolean
  setIsReconnecting: (reconnecting: boolean) => void

  // Round tracking
  currentRound: number
  setCurrentRound: (round: number) => void
  totalRounds: number
  setTotalRounds: (total: number) => void

  // Round results
  roundWinners: Record<number, string>
  setRoundWinners: (winners: Record<number, string>) => void
  roundResults: Record<number, RoundScore[]>
  setRoundResults: (results: Record<number, RoundScore[]>) => void

  // Last round score for round-transition screen
  lastRoundScores: RoundScore[]
  setLastRoundScores: (scores: RoundScore[]) => void
  lastRoundWinner: RoundScore | null
  setLastRoundWinner: (winner: RoundScore | null) => void

  // Loading progress step (real progress from backend)
  loadingStep: string
  setLoadingStep: (step: string) => void

  // Dynamic progress steps list (grows as backend events arrive)
  progressSteps: { step: string; text: string }[]
  addProgressStep: (step: string, text: string) => void
  resetProgressSteps: () => void

  resetGame: () => void
  restoreState: (state: PersistedState) => void
}

const defaultSettings: GameSettings = {
  gameType: 'قراءة متحررة',
  difficulty: 'متوسط',
  timePerRound: 15,
  numberOfRounds: 3,
  maxPlayers: 10,
}

// Validate rounds rule: 2 players can't play 2 rounds, 3 players can't play 3 rounds
export function isRoundsPlayerCountConflict(players: number, rounds: number): boolean {
  return (players === 2 && rounds === 2) || (players === 3 && rounds === 3)
}

// Helper to get the persistable state from the store
function getPersistableState(state: GameState): PersistedState {
  return {
    screen: state.screen,
    playerName: state.playerName,
    roomCode: state.roomCode,
    roomType: state.roomType,
    roomPassword: state.roomPassword,
    isHost: state.isHost,
    gameSettings: state.gameSettings,
    players: state.players,
    gameContent: state.gameContent,
    currentQuestionIndex: state.currentQuestionIndex,
    answers: state.answers,
    timeLeft: state.timeLeft,
    scores: state.scores,
    currentRound: state.currentRound,
    totalRounds: state.totalRounds,
    roundWinners: state.roundWinners,
    roundResults: state.roundResults,
  }
}

export const useGameStore = create<GameState>((set, get) => ({
  screen: 'home',
  setScreen: (screen) => {
    set({ screen })
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },

  playerName: '',
  setPlayerName: (name) => {
    set({ playerName: name })
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },

  roomCode: '',
  setRoomCode: (code) => {
    set({ roomCode: code })
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },

  roomType: 'عامة',
  setRoomType: (type) => {
    set({ roomType: type })
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },

  roomPassword: '',
  setRoomPassword: (password) => {
    set({ roomPassword: password })
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },

  isHost: false,
  setIsHost: (isHost) => {
    set({ isHost })
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },

  gameSettings: { ...defaultSettings },
  setGameSettings: (settings) => {
    set((state) => ({
      gameSettings: { ...state.gameSettings, ...settings },
    }))
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },

  players: [],
  setPlayers: (players) => {
    set({ players })
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },
  addPlayer: (player) =>
    set((state) => ({
      players: [...state.players, player],
    })),
  removePlayer: (playerId) =>
    set((state) => ({
      players: state.players.filter((p) => p.id !== playerId),
    })),

  gameContent: null,
  setGameContent: (content) => {
    set({ gameContent: content })
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },

  currentQuestionIndex: 0,
  setCurrentQuestionIndex: (index) => {
    set({ currentQuestionIndex: index })
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },
  nextQuestion: () =>
    set((state) => ({
      currentQuestionIndex: state.currentQuestionIndex + 1,
    })),

  answers: {},
  setAnswer: (questionIndex, answerIndex) =>
    set((state) => ({
      answers: { ...state.answers, [questionIndex]: answerIndex },
    })),
  resetAnswers: () => set({ answers: {} }),

  timeLeft: 900, // Default 15 minutes in seconds
  setTimeLeft: (time) => set({ timeLeft: time }),
  decrementTime: () =>
    set((state) => ({
      timeLeft: Math.max(0, state.timeLeft - 1),
    })),

  scores: [],
  setScores: (scores) => {
    set({ scores })
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },

  isConnected: false,
  setIsConnected: (connected) => set({ isConnected: connected }),

  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),

  error: null,
  setError: (error) => set({ error }),

  publicRooms: [],
  setPublicRooms: (rooms) => set({ publicRooms: rooms }),

  isReconnecting: false,
  setIsReconnecting: (reconnecting) => set({ isReconnecting: reconnecting }),

  currentRound: 0,
  setCurrentRound: (round) => {
    set({ currentRound: round })
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },

  totalRounds: 3,
  setTotalRounds: (total) => {
    set({ totalRounds: total })
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },

  roundWinners: {},
  setRoundWinners: (winners) => {
    set({ roundWinners: winners })
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },

  roundResults: {},
  setRoundResults: (results) => {
    set({ roundResults: results })
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },

  lastRoundScores: [],
  setLastRoundScores: (scores) => set({ lastRoundScores: scores }),

  lastRoundWinner: null,
  setLastRoundWinner: (winner) => set({ lastRoundWinner: winner }),

  loadingStep: 'preparing',
  setLoadingStep: (step) => set({ loadingStep: step }),

  progressSteps: [],
  addProgressStep: (step, text) => set((state) => {
    // Avoid duplicates for the same step key
    if (state.progressSteps.some(s => s.step === step)) {
      return { progressSteps: state.progressSteps.map(s => s.step === step ? { step, text } : s) }
    }
    return { progressSteps: [...state.progressSteps, { step, text }] }
  }),
  resetProgressSteps: () => set({ progressSteps: [], loadingStep: 'preparing' }),

  resetGame: () => {
    set({
      screen: 'home',
      roomCode: '',
      roomType: 'عامة',
      roomPassword: '',
      isHost: false,
      gameSettings: { ...defaultSettings },
      players: [],
      gameContent: null,
      currentQuestionIndex: 0,
      answers: {},
      timeLeft: 900,
      scores: [],
      isLoading: false,
      error: null,
      isReconnecting: false,
      currentRound: 0,
      totalRounds: 3,
      roundWinners: {},
      roundResults: {},
      lastRoundScores: [],
      lastRoundWinner: null,
      loadingStep: 'preparing',
      progressSteps: [],
    })
    clearSessionStorage()
  },

  restoreState: (state: PersistedState) => {
    set({
      screen: state.screen,
      playerName: state.playerName,
      roomCode: state.roomCode,
      roomType: state.roomType,
      roomPassword: state.roomPassword,
      isHost: state.isHost,
      gameSettings: state.gameSettings,
      players: state.players,
      gameContent: state.gameContent,
      currentQuestionIndex: state.currentQuestionIndex,
      answers: state.answers,
      timeLeft: state.timeLeft,
      scores: state.scores,
      isLoading: false,
      error: null,
      isReconnecting: true,
      currentRound: state.currentRound || 0,
      totalRounds: state.totalRounds || 3,
      roundWinners: state.roundWinners || {},
      roundResults: state.roundResults || {},
    })
  },
}))
