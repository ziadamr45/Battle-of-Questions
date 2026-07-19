import { create } from 'zustand'

export type GameType = 'قراءة متحررة' | 'نصوص'
export type Difficulty = 'سهل' | 'متوسط' | 'صعب'
export type RoomType = 'عامة' | 'خاصة'
export type PlayerMode = 'fixed' | 'open'
export type PassageType = 'علمي' | 'أدبي' | 'عشوائي'
export type BattleMode = 'فردي' | 'فرق'
export type TeamId = 'A' | 'B'
export type Screen = 'home' | 'create' | 'join' | 'lobby' | 'loading' | 'game' | 'results' | 'round-transition' | 'history' | 'about'

// Map screen names to URL paths
const screenToPath: Record<Screen, string> = {
  home: '/',
  create: '/create',
  join: '/join',
  lobby: '/lobby',
  loading: '/loading',
  game: '/game',
  results: '/results',
  'round-transition': '/round-transition',
  history: '/history',
  about: '/about',
}

// Map URL paths to screen names
const pathToScreen: Record<string, Screen> = {
  '/': 'home',
  '/create': 'create',
  '/join': 'join',
  '/lobby': 'lobby',
  '/loading': 'loading',
  '/game': 'game',
  '/results': 'results',
  '/round-transition': 'round-transition',
  '/history': 'history',
  '/about': 'about',
}

// Screens that should not update the URL (transient/game-flow screens)
const noUrlScreens: Screen[] = ['lobby', 'loading', 'game', 'results', 'round-transition']

// Get the initial screen from the current URL path
export function getScreenFromUrl(): Screen {
  if (typeof window === 'undefined') return 'home'
  const path = window.location.pathname
  return pathToScreen[path] || 'home'
}

export interface Player {
  id: string
  name: string
  score: number
  isHost: boolean
  isReady: boolean
  joinOrder: number
  roundWins?: number
  teamId?: TeamId | null
  isCaptain?: boolean
  isDisconnected?: boolean
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
  maxPlayers: number        // 0 means "open" (unlimited)
  playerMode: PlayerMode    // 'fixed' = specific count, 'open' = host decides when to start
  passageType: PassageType  // Only relevant when gameType === 'قراءة متحررة'
  battleMode: BattleMode    // 'فردي' = solo, 'فرق' = team
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
  battleMode?: BattleMode
}

export interface RoundScore {
  playerId: string
  playerName: string
  score: number
  correctAnswers: number
  totalQuestions: number
}

export interface AnswerReviewItem {
  questionIndex: number
  question: string
  options: string[]
  playerAnswer: number
  correctAnswer: number
  isCorrect: boolean
  explanation: string
}

export interface FullAnswerReviewItem extends AnswerReviewItem {
  roundNumber: number
  timeTaken?: number
}

export interface ReadyStatus {
  readyPlayers: string[]
  readyCount: number
  totalActive: number
  totalFighters: number       // non-leader fighters (excludes captains/hosts)
  unreadyPlayerNames?: string[]
  readyPlayerNames?: string[]
  allFightersReady?: boolean  // true when all non-leader fighters are ready
}

export interface FinishedStatus {
  finishedPlayers: string[]
  finishedCount: number
  totalActive: number
  unfinishedPlayerNames: string[]
  // Team-aware synchronized round progression fields
  teamAFinishedCount?: number
  teamATotal?: number
  teamBFinishedCount?: number
  teamBTotal?: number
  teamAReady?: boolean  // true when ALL team A players have finished
  teamBReady?: boolean  // true when ALL team B players have finished
  teamAFinishedNames?: string[]
  teamBFinishedNames?: string[]
  teamAUnfinishedNames?: string[]
  teamBUnfinishedNames?: string[]
}

// ─── Team Types ──────────────────────────────────────────────────────────────

export interface TeamInfo {
  id: TeamId
  name: string
  customName: string | null  // captain-chosen name, null = use default
  color: string
  captainId: string | null
  captainName: string | null
  playerIds: string[]
}

export interface TeamsState {
  teamA: TeamInfo
  teamB: TeamInfo
  unassignedPlayerIds: string[]
}

export interface TeamRoundScores {
  A: { score: number; correctAnswers: number; speedBonus?: number; finishedFirst?: boolean }
  B: { score: number; correctAnswers: number; speedBonus?: number; finishedFirst?: boolean }
  winningTeam: TeamId | null
}

export interface JoinRequestState {
  id: string
  playerId: string
  playerName: string
  targetTeamId: TeamId
  type: 'join' | 'switch'
  currentTeamId: TeamId | null
  expiresAt: number
}

export interface ApprovalRequestState {
  approvalId: string
  type: 'settings' | 'early-end' | 'voice-merge' | 'round-start' | 'join-team' | 'switch-team'
  description: string
  requestedByName: string
  requestedByTeam: TeamId | null
  expiresAt: number
}

export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  content: string
  mode: 'team' | 'global' | 'private'
  teamId?: TeamId | null
  targetId?: string
  targetName?: string
  timestamp: number
}

export type ChatMode = 'team' | 'global' | 'private'

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

export function saveToSessionStorage(state: PersistedState) {
  try {
    // Only save if the user is in an active session (not home/join/create/about)
    if (state.screen === 'home' || state.screen === 'join' || state.screen === 'create' || state.screen === 'about') {
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
    if (parsed.screen === 'home' || parsed.screen === 'join' || parsed.screen === 'create' || parsed.screen === 'about') {
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

  // Early end game state
  wasEarlyEnd: boolean
  setWasEarlyEnd: (was: boolean) => void
  completedRounds: number
  setCompletedRounds: (rounds: number) => void
  earlyEndProcessing: boolean
  setEarlyEndProcessing: (processing: boolean) => void

  // Answer reviews (per-round, from round-end event)
  playerAnswerReviews: Record<string, AnswerReviewItem[]>
  setPlayerAnswerReviews: (reviews: Record<string, AnswerReviewItem[]>) => void

  // Ready status for next round
  readyStatus: ReadyStatus | null
  setReadyStatus: (status: ReadyStatus | null) => void
  isPlayerReady: boolean
  setIsPlayerReady: (ready: boolean) => void

  // Finished status during round (player clicked "خلصت")
  finishedStatus: FinishedStatus | null
  setFinishedStatus: (status: FinishedStatus | null) => void
  isPlayerFinished: boolean
  setIsPlayerFinished: (finished: boolean) => void

  // AI answer explanations (keyed by "round-questionIndex")
  answerExplanations: Record<string, string>
  setAnswerExplanation: (roundNumber: number, questionIndex: number, explanation: string) => void

  // Battle data from game-ended (for full answer review in results)
  battleData: any
  setBattleData: (data: any) => void

  // ─── Team Mode State ───────────────────────────────────────────────────
  battleMode: BattleMode
  setBattleMode: (mode: BattleMode) => void

  teams: TeamsState | null
  setTeams: (teams: TeamsState | null) => void

  myTeamId: TeamId | null
  setMyTeamId: (teamId: TeamId | null) => void

  isCaptain: boolean
  setIsCaptain: (captain: boolean) => void

  voiceMerged: boolean
  setVoiceMerged: (merged: boolean) => void

  pendingApproval: ApprovalRequestState | null
  setPendingApproval: (request: ApprovalRequestState | null) => void

  approvalSent: { approvalId: string; targetCaptainName: string } | null
  setApprovalSent: (data: { approvalId: string; targetCaptainName: string } | null) => void

  teamRoundScores: TeamRoundScores | null
  setTeamRoundScores: (scores: TeamRoundScores | null) => void

  // Join requests visible to captain (incoming requests)
  pendingJoinRequests: JoinRequestState[]
  setPendingJoinRequests: (requests: JoinRequestState[]) => void
  addJoinRequest: (request: JoinRequestState) => void
  removeJoinRequest: (requestId: string) => void

  // Player's own pending join/switch request
  myJoinRequest: { requestId: string; targetTeamId: TeamId; captainName: string } | null
  setMyJoinRequest: (request: { requestId: string; targetTeamId: TeamId; captainName: string } | null) => void

  // Chat state
  chatMessages: ChatMessage[]
  addChatMessage: (message: ChatMessage) => void
  clearChatMessages: () => void
  chatMode: ChatMode
  setChatMode: (mode: ChatMode) => void

  resetGame: () => void
  restoreState: (state: PersistedState) => void
}

const defaultSettings: GameSettings = {
  gameType: 'قراءة متحررة',
  difficulty: 'متوسط',
  timePerRound: 15,
  numberOfRounds: 3,
  maxPlayers: 10,
  playerMode: 'fixed',
  passageType: 'عشوائي',
  battleMode: 'فردي',
}

// Validate rounds rule: 2 players can't play 2 rounds, 3 players can't play 3 rounds
export function isRoundsPlayerCountConflict(players: number, rounds: number): boolean {
  return (players === 2 && rounds === 2) || (players === 3 && rounds === 3)
}

// Helper to get the persistable state from the store
export function getPersistableState(state: GameState): PersistedState {
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
    // Update browser URL to match the screen
    if (typeof window !== 'undefined') {
      const targetPath = screenToPath[screen]
      const currentPath = window.location.pathname
      // Only update URL for screens that should be bookmarkable/refreshable
      // Game-flow screens (lobby, loading, game, etc.) keep their previous URL
      if (!noUrlScreens.includes(screen) && targetPath !== currentPath) {
        window.history.pushState(null, '', targetPath)
      }
    }
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
  addPlayer: (player) => {
    set((state) => ({
      players: [...state.players, player],
    }))
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },
  removePlayer: (playerId) => {
    set((state) => ({
      players: state.players.filter((p) => p.id !== playerId),
    }))
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },

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
  nextQuestion: () => {
    set((state) => ({
      currentQuestionIndex: state.currentQuestionIndex + 1,
    }))
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },

  answers: {},
  setAnswer: (questionIndex, answerIndex) => {
    set((state) => ({
      answers: { ...state.answers, [questionIndex]: answerIndex },
    }))
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },
  resetAnswers: () => {
    set({ answers: {} })
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },

  timeLeft: 900, // Default 15 minutes in seconds
  setTimeLeft: (time) => set({ timeLeft: time }),
  decrementTime: () =>
    set((state) => ({
      timeLeft: state.timeLeft > 0 ? state.timeLeft - 1 : 0,
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

  wasEarlyEnd: false,
  setWasEarlyEnd: (was) => set({ wasEarlyEnd: was }),
  completedRounds: 0,
  setCompletedRounds: (rounds) => set({ completedRounds: rounds }),
  earlyEndProcessing: false,
  setEarlyEndProcessing: (processing) => set({ earlyEndProcessing: processing }),

  playerAnswerReviews: {},
  setPlayerAnswerReviews: (reviews) => set({ playerAnswerReviews: reviews }),

  readyStatus: null,
  setReadyStatus: (status) => set({ readyStatus: status }),
  isPlayerReady: false,
  setIsPlayerReady: (ready) => set({ isPlayerReady: ready }),

  finishedStatus: null,
  setFinishedStatus: (status) => set({ finishedStatus: status }),
  isPlayerFinished: false,
  setIsPlayerFinished: (finished) => set({ isPlayerFinished: finished }),

  answerExplanations: {},
  setAnswerExplanation: (roundNumber, questionIndex, explanation) => set((state) => ({
    answerExplanations: { ...state.answerExplanations, [`${roundNumber}-${questionIndex}`]: explanation },
  })),

  battleData: null,
  setBattleData: (data) => set({ battleData: data }),

  // ─── Team Mode State ───────────────────────────────────────────────────
  battleMode: 'فردي',
  setBattleMode: (mode) => {
    set({ battleMode: mode })
    setTimeout(() => saveToSessionStorage(getPersistableState(get())), 0)
  },

  teams: null,
  setTeams: (teams) => set({ teams }),

  myTeamId: null,
  setMyTeamId: (teamId) => set({ myTeamId: teamId }),

  isCaptain: false,
  setIsCaptain: (captain) => set({ isCaptain: captain }),

  voiceMerged: false,
  setVoiceMerged: (merged) => set({ voiceMerged: merged }),

  pendingApproval: null,
  setPendingApproval: (request) => set({ pendingApproval: request }),

  approvalSent: null,
  setApprovalSent: (data) => set({ approvalSent: data }),

  teamRoundScores: null,
  setTeamRoundScores: (scores) => set({ teamRoundScores: scores }),

  pendingJoinRequests: [],
  setPendingJoinRequests: (requests) => set({ pendingJoinRequests: requests }),
  addJoinRequest: (request) => set((state) => ({
    pendingJoinRequests: [...state.pendingJoinRequests, request],
  })),
  removeJoinRequest: (requestId) => set((state) => ({
    pendingJoinRequests: state.pendingJoinRequests.filter(r => r.id !== requestId),
  })),

  myJoinRequest: null,
  setMyJoinRequest: (request) => set({ myJoinRequest: request }),

  // Chat state
  chatMessages: [],
  addChatMessage: (message) => set((state) => ({
    chatMessages: [...state.chatMessages.slice(-99), message], // Keep last 100
  })),
  clearChatMessages: () => set({ chatMessages: [] }),
  chatMode: 'team',
  setChatMode: (mode) => set({ chatMode: mode }),

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
      wasEarlyEnd: false,
      completedRounds: 0,
      earlyEndProcessing: false,
      playerAnswerReviews: {},
      readyStatus: null,
      isPlayerReady: false,
      finishedStatus: null,
      isPlayerFinished: false,
      answerExplanations: {},
      battleData: null,
      battleMode: 'فردي',
      teams: null,
      myTeamId: null,
      isCaptain: false,
      voiceMerged: false,
      pendingApproval: null,
      approvalSent: null,
      teamRoundScores: null,
      pendingJoinRequests: [],
      myJoinRequest: null,
      chatMessages: [],
      chatMode: 'team',
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
