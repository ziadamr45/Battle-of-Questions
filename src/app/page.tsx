'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { io, Socket } from 'socket.io-client'
import { useGameStore, loadFromSessionStorage, clearSessionStorage, type Screen, type GameType, type Difficulty, type Player, type RoomType, type RoomInfo, type GameContent, type GameSettings, type RoundScore, type PassageType, type AnswerReviewItem, type FullAnswerReviewItem, type ReadyStatus, type FinishedStatus, type BattleMode, type TeamId, type TeamsState, type TeamInfo, type TeamRoundScores, type ApprovalRequestState, type JoinRequestState, type ChatMessage, type ChatMode } from '@/lib/game-store'
import { audioEngine } from '@/lib/audio-engine'
import { useAudioStore } from '@/lib/audio-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen,
  Users,
  Clock,
  Trophy,
  Play,
  Copy,
  Check,
  Loader2,
  ArrowRight,
  Star,
  Crown,
  Zap,
  BookMarked,
  ChevronLeft,
  Sparkles,
  RefreshCw,
  Globe,
  Lock,
  Hash,
  LogOut,
  RotateCcw,
  Swords,
  Shield,
  Target,
  Flame,
  Crosshair,
  Timer,
  Medal,
  Skull,
  Volume2,
  VolumeX,
  Volume1,
  Share2,
  X,
  Microscope,
  PenTool,
  Shuffle,
  ShieldAlert,
  AlertTriangle,
  ScrollText,
  UserX,
  MicOff,
  Settings,
  ChevronDown,
  ChevronUp,
  Eye,
  CheckCircle2,
  XCircle,
  Brain,
  HelpCircle,
  MessageCircle,
  Home as HomeIcon,
  UsersRound,
  ArrowLeftRight,
  ShieldCheck,
  Send,
  Radio,
  Hourglass,
  UserPlus,
  UserCog,
} from 'lucide-react'
import { BattleLogo } from '@/components/battle-logo'
import { VoiceChat, disconnectLiveKit } from '@/components/voice-chat'
import { NameEntryModal, EditNameModal, PlayerNameBadge } from '@/components/guest-identity'
import { useGuestStore } from '@/lib/guest-store'
import { ShareModal } from '@/components/share-modal'
import { parseJoinUrl, cleanJoinParams } from '@/lib/share-utils'
import { BattleHistoryList, BattleDetail } from '@/components/battle-history'
import { AboutPage } from '@/components/about-page'
import { battleToast } from '@/lib/battle-toast-store'
import { usePlayerMuteStore } from '@/lib/player-mute-store'
import { useOnboardingStore, shouldShowCinematicIntro, shouldShowUIHighlights, shouldShowGameplayHints } from '@/lib/onboarding-store'
import { CinematicIntro } from '@/components/onboarding/cinematic-intro'
import { UIHighlights } from '@/components/onboarding/ui-highlights'
import { GameplayHintsProvider, showGameplayHint } from '@/components/onboarding/gameplay-hints'
import { ArenaTips } from '@/components/onboarding/arena-tips'
import { ArenaNarratorProvider, showNarration } from '@/components/onboarding/arena-narrator'

// ============================================
// GLOBAL SOCKET MANAGEMENT
// ============================================
let globalSocket: Socket | null = null
let globalSocketListenersSetup = false
let pendingAction: ((socket: Socket) => void) | null = null

function getOrCreateSocket(setupListeners: (socket: Socket) => void): Socket {
  if (globalSocket?.connected) return globalSocket
  if (globalSocket && !globalSocket.connected) {
    // Socket exists but disconnected - force create a new one if pending action exists
    // or if it's been stuck trying
    globalSocket.disconnect()
    globalSocket = null
    globalSocketListenersSetup = false
    pendingAction = null
  }

  // Game service URL: if NEXT_PUBLIC_GAME_SERVICE_URL is set, connect to the
  // external game service (e.g. Railway).  Otherwise fall back to the same
  // origin (local dev / single-host deployment).
  let gameServiceUrl = process.env.NEXT_PUBLIC_GAME_SERVICE_URL || ''

  // Ensure URL has https:// protocol (common mistake: setting just the hostname)
  if (gameServiceUrl && !gameServiceUrl.startsWith('http://') && !gameServiceUrl.startsWith('https://')) {
    gameServiceUrl = 'https://' + gameServiceUrl
  }

  // Remove trailing slash to avoid double-slash issues
  gameServiceUrl = gameServiceUrl.replace(/\/+$/, '')

  console.log('[Socket] Connecting to game service:', gameServiceUrl || 'same origin (localhost)')

  const socket = io(gameServiceUrl || undefined, {
    path: '/socket.io/',
    transports: ['polling', 'websocket'],
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  })

  globalSocket = socket
  setupListeners(socket)
  return socket
}

function disconnectGlobalSocket() {
  if (globalSocket) {
    globalSocket.disconnect()
    globalSocket = null
    globalSocketListenersSetup = false
    pendingAction = null
  }
}

// Ensure a socket connection exists for browsing (used by Join screen)
// Returns the socket so callers can attach temporary listeners
function ensureSocketConnection(setupListeners: (socket: Socket) => void): Socket {
  return getOrCreateSocket(setupListeners)
}

// ============================================
// GAME SOCKET HOOK
// ============================================
function useGameSocket() {
  const store = useGameStore

  const setupSocketListeners = useCallback((socket: Socket) => {
    if (globalSocketListenersSetup) return
    globalSocketListenersSetup = true

    socket.on('connect', () => {
      store.getState().setIsConnected(true)
      if (pendingAction) { pendingAction(socket); pendingAction = null }
    })

    socket.on('disconnect', () => { store.getState().setIsConnected(false) })

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message)
      const s = store.getState()
      if (s.isReconnecting) {
        // Reconnection failed - reset state so user isn't stuck
        disconnectGlobalSocket()
        s.setIsReconnecting(false)
        s.setIsLoading(false)
        s.setError('فشل الاتصال بالساحة')
        s.setScreen('home')
        clearSessionStorage()
      } else if (s.isLoading) {
        // If we're loading (create/join) and connection fails, stop loading
        s.setIsLoading(false)
        s.setError('فشل الاتصال بالخادم')
        battleToast('connection_error', 'خطأ في الاتصال', 'لم نستطع الاتصال بالخادم. يرجى المحاولة مرة أخرى.')
      }
    })

    socket.on('reconnect_failed', () => {
      console.error('[Socket] Reconnection failed after all attempts')
      const s = store.getState()
      if (s.isReconnecting) {
        disconnectGlobalSocket()
        store.getState().setIsReconnecting(false)
        store.getState().setIsLoading(false)
        store.getState().resetGame()
        clearSessionStorage()
        battleToast('connection_error', 'فشل الاتصال', 'لم نستطع العودة للساحة. يرجى المحاولة مرة أخرى.')
      }
    })

    // Note: game-created and game-joined handlers are defined below (with team data support)

    socket.on('player-joined', (data: { player: Player; players: Player[]; battleMode?: BattleMode; teams?: TeamsState; pendingJoinRequests?: JoinRequestState[] }) => {
      store.getState().setPlayers(data.players)
      if (data.battleMode) store.getState().setBattleMode(data.battleMode)
      if (data.teams) store.getState().setTeams(data.teams)
      if (data.pendingJoinRequests) {
        store.getState().setPendingJoinRequests(data.pendingJoinRequests)
      }
      audioEngine.playerJoined()
      battleToast('player_joined', 'مقاتل جديد!', `${data.player.name} دخل الساحة`, data.player.name)
      showNarration('player_entered')
    })

    socket.on('player-left', (data: { playerId: string; playerName: string; players: Player[] }) => {
      store.getState().setPlayers(data.players)
      audioEngine.playerLeft()
      battleToast('player_left', 'مقاتل انسحب', `${data.playerName} غادر الساحة`, data.playerName)
      // Update team data if in team mode
      if (store.getState().battleMode === 'فرق' && globalSocket) {
        // Re-derive teams from players
        const s = store.getState()
        if (s.teams) {
          const updatedTeams = { ...s.teams }
          updatedTeams.teamA = { ...updatedTeams.teamA, playerIds: data.players.filter(p => p.teamId === 'A').map(p => p.id) }
          updatedTeams.teamB = { ...updatedTeams.teamB, playerIds: data.players.filter(p => p.teamId === 'B').map(p => p.id) }
          // Update captain IDs from players
          const captainA = data.players.find(p => p.teamId === 'A' && p.isCaptain)
          const captainB = data.players.find(p => p.teamId === 'B' && p.isCaptain)
          if (captainA) {
            updatedTeams.teamA = { ...updatedTeams.teamA, captainId: captainA.id, captainName: captainA.name }
          }
          if (captainB) {
            updatedTeams.teamB = { ...updatedTeams.teamB, captainId: captainB.id, captainName: captainB.name }
          }
          s.setTeams(updatedTeams)
        }
      }
    })

    socket.on('player-disconnected', (data: { playerId: string; playerName: string; players: Player[] }) => {
      store.getState().setPlayers(data.players)
      audioEngine.playerLeft()
      battleToast('player_disconnected', 'انقطاع الاتصال', `${data.playerName} انقطع عن الساحة`, data.playerName)
    })

    socket.on('opponent-left-game', (data: { leftPlayerName: string; winnerName: string }) => {
      audioEngine.playerLeft()
      battleToast('opponent_left', 'المنافس غادر!', `${data.leftPlayerName} غادر المعركة`, data.leftPlayerName)
    })

    socket.on('surrender-confirmed', () => {
      audioEngine.surrender()
      store.getState().resetGame()
      clearSessionStorage()
      store.getState().setScreen('home')
      battleToast('surrender', 'انسحبت من المعركة', 'غادرت الساحة بنجاح')
    })

    socket.on('player-reconnected', (data: { playerId: string; playerName: string; players: Player[] }) => {
      store.getState().setPlayers(data.players)
      battleToast('player_reconnected', 'عودة المقاتل!', `${data.playerName} رجع للساحة`, data.playerName)
      showNarration('player_reconnected')
    })

    socket.on('game-starting', () => {
      store.getState().resetProgressSteps()  // Clear stale progress steps when game starts
      store.getState().setScreen('loading')
      showNarration('battle_starting')
    })

    socket.on('content-progress', (data: { step: string; text: string }) => {
      // Store the latest progress step for the loading screen
      store.getState().setLoadingStep(data.step)
      // Append to the dynamic progress steps list
      store.getState().addProgressStep(data.step, data.text)
      audioEngine.progressStep()
    })

    socket.on('round-start', (data: { roundNumber: number; totalRounds: number; content: GameContent; timePerRound: number }) => {
      store.getState().setGameContent(data.content)
      store.getState().setCurrentQuestionIndex(0)
      store.getState().resetAnswers()
      store.getState().setCurrentRound(data.roundNumber)
      store.getState().setTotalRounds(data.totalRounds)
      store.getState().setTimeLeft(data.timePerRound)
      // Reset finished status for new round
      store.getState().setFinishedStatus(null)
      store.getState().setIsPlayerFinished(false)
      store.getState().setScreen('game')
      audioEngine.battleStart()
      showNarration('round_starting')
      // First battle gameplay hints
      if (shouldShowGameplayHints()) {
        setTimeout(() => showGameplayHint('timer'), 1500)
        setTimeout(() => showGameplayHint('readingArea'), 6000)
      }
    })

    socket.on('round-loading', (data: { roundNumber: number; totalRounds: number }) => {
      store.getState().resetProgressSteps()  // Clear stale progress steps for new round loading
      store.getState().setCurrentRound(data.roundNumber)
      store.getState().setTotalRounds(data.totalRounds)
      store.getState().setScreen('loading')
    })

    socket.on('round-end', (data: { roundNumber: number; totalRounds: number; roundScores: RoundScore[]; roundWinner: RoundScore | null; isLastRound: boolean; playerAnswerReviews?: Record<string, AnswerReviewItem[]>; teamRoundScores?: TeamRoundScores | null }) => {
      store.getState().setLastRoundScores(data.roundScores)
      store.getState().setLastRoundWinner(data.roundWinner)
      store.getState().setCurrentRound(data.roundNumber)
      store.getState().setTotalRounds(data.totalRounds)
      // Store team round scores if available
      if (data.teamRoundScores) {
        store.getState().setTeamRoundScores(data.teamRoundScores)
      } else {
        store.getState().setTeamRoundScores(null)
      }
      // Store answer reviews if provided
      if (data.playerAnswerReviews) {
        store.getState().setPlayerAnswerReviews(data.playerAnswerReviews)
      } else {
        store.getState().setPlayerAnswerReviews({})
      }
      // Reset ready status for new round transition
      store.getState().setReadyStatus(null)
      store.getState().setIsPlayerReady(false)
      store.getState().setScreen('round-transition')
      audioEngine.roundEndReveal()
      showNarration('round_ending')
      if (shouldShowGameplayHints()) {
        setTimeout(() => showGameplayHint('roundTransition'), 800)
      }
    })

    socket.on('answer-confirmed', () => {})

    socket.on('game-error', (data: { message: string }) => {
      store.getState().setError(data.message)
      store.getState().setIsLoading(false)
      const s = store.getState()
      if (s.screen === 'loading') store.getState().setScreen('lobby')
      if (s.isReconnecting) { store.getState().setIsReconnecting(false); store.getState().resetGame() }
      audioEngine.error()
      // If password error on join screen, auto-show the password dialog
      if (data.message === 'كلمة السر غلط' && s.screen === 'join') {
        const code = s.roomCode || ''
        if (code) {
          // Trigger password dialog for the room code (using a custom event)
          window.dispatchEvent(new CustomEvent('show-password-dialog', { detail: { roomCode: code } }))
        }
      } else {
        battleToast('error', 'خطأ!', data.message)
      }
    })

    socket.on('game-ended', (data: { scores: Player[]; roundWinners: Record<number, string>; roundResults: Record<number, RoundScore[]>; totalRounds: number; battleData?: any; battleMode?: BattleMode; teams?: TeamsState }) => {
      // Disconnect voice chat when battle ends
      disconnectLiveKit()
      // Sort a COPY to avoid mutating the socket data in-place
      const sortedScores = [...data.scores].sort((a: Player, b: Player) => b.score - a.score)
      store.getState().setScores(sortedScores)
      if (data.roundWinners) store.getState().setRoundWinners(data.roundWinners)
      if (data.roundResults) store.getState().setRoundResults(data.roundResults)
      store.getState().setEarlyEndProcessing(false)
      // Store battleData for answer review in results screen
      if (data.battleData) {
        store.getState().setBattleData(data.battleData)
      }
      // Store team data for results
      if (data.battleMode) store.getState().setBattleMode(data.battleMode)
      if (data.teams) store.getState().setTeams(data.teams)
      store.getState().setScreen('results')
      showNarration('battle_ending')
      // Mark first battle as played after game ends
      useOnboardingStore.getState().markFirstBattlePlayed()
      // Play victory or defeat based on player position
      const myId = globalSocket?.id
      const isWinner = myId && sortedScores[0]?.id === myId
      if (isWinner) {
        audioEngine.victory()
      } else {
        audioEngine.defeat()
      }
      // Podium reveal after a delay
      setTimeout(() => audioEngine.podiumReveal(), 1500)

      // ─── Save battle history in the background ───
      if (data.battleData) {
        const playerName = store.getState().playerName
        if (playerName) {
          fetch('/api/battle-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data.battleData),
          }).catch(err => {
            console.error('[Battle History] Failed to save:', err)
          })
        }
      }
    })

    socket.on('early-end-rejected', (data: { message: string }) => {
      store.getState().setEarlyEndProcessing(false)
      audioEngine.error()
      battleToast('early_end_rejected', 'لا يمكن إنهاء المعركة', data.message)
    })

    socket.on('early-end-confirmed', (data: { completedRounds: number; totalPlannedRounds: number; wasEarlyEnd: boolean }) => {
      store.getState().setWasEarlyEnd(true)
      store.getState().setCompletedRounds(data.completedRounds)
      audioEngine.earlyEndConfirmed()
    })

    socket.on('host-changed', (data: { newHostId: string; newHostName: string; oldHostName: string; players: Player[] }) => {
      store.getState().setPlayers(data.players)
      if (globalSocket && globalSocket.id === data.newHostId) {
        store.getState().setIsHost(true)
        battleToast('host_changed_self', 'أنت القائد الجديد!', `${data.oldHostName} غادر وأنت الأقدم فبقيت القائد`)
      } else {
        battleToast('host_changed_other', 'قائد جديد', `${data.oldHostName} غادر و${data.newHostName} بقى القائد`)
      }
      showNarration('new_host')
    })

    socket.on('public-rooms-update', (data: { rooms: RoomInfo[] }) => { store.getState().setPublicRooms(data.rooms) })

    socket.on('player-name-updated', (data: { playerId: string; oldName: string; newName: string; players: Player[] }) => {
      store.getState().setPlayers(data.players)
      // Only update local name if THIS client is the one who changed their name
      if (data.playerId === socket.id) {
        store.getState().setPlayerName(data.newName)
      }
      battleToast('name_updated', 'اسم جديد', `${data.oldName} غيّر اسمه لـ ${data.newName}`)
    })

    socket.on('settings-updated', (data: { settings: GameSettings; updatedBy: string; changes: string[] }) => {
      store.getState().setGameSettings(data.settings)
    })

    // ─── Host Kick/Mute Events ──────────────────────────────────────
    socket.on('player-kicked', (data: { reason: string; kickedByName: string }) => {
      // This client was kicked by the host
      disconnectGlobalSocket()
      store.getState().resetGame()
      clearSessionStorage()
      usePlayerMuteStore.getState().clearAllMutes()
      battleToast('kicked', 'تم طردك!', data.reason)
    })

    socket.on('player-muted', (data: { mutedBy: string; mutedByName: string }) => {
      // This client was muted by the host — force mute their mic
      battleToast('muted_by_host', 'تم كتمك!', `${data.mutedByName} كتم صوتك`)
      // Dispatch event for voice-chat to force-mute the local mic
      window.dispatchEvent(new CustomEvent('force-local-mic-mute'))
    })

    socket.on('player-audio-muted', (data: { playerId: string; playerName: string }) => {
      // A player was host-muted — mute their audio for everyone
      usePlayerMuteStore.getState().addHostMuted(data.playerId, data.playerName)
      battleToast('player_audio_muted', 'تم كتم اللاعب', `${data.playerName} تم كتم صوته بواسطة القائد`)
    })

    // ─── Ready Status & Answer Explanation Events ──────────────────────
    socket.on('ready-status-update', (data: ReadyStatus) => {
      store.getState().setReadyStatus(data)
    })

    socket.on('host-start-rejected', (data: { unreadyPlayers: string[]; readyCount: number; totalActive: number }) => {
      // Show toast to host with unready player names
      const names = data.unreadyPlayers.join('، ')
      battleToast('warning', 'مش جاهزين بعد!', `${names} لسه مش جاهزين. استنى لما الكل يبقى جاهز.`)
    })

    socket.on('finished-status-update', (data: FinishedStatus) => {
      store.getState().setFinishedStatus(data)
    })

    socket.on('answer-explanation', (data: { roundNumber: number; questionIndex: number; explanation: string }) => {
      store.getState().setAnswerExplanation(data.roundNumber, data.questionIndex, data.explanation)
    })

    socket.on('rejoin-success', (data: {
      roomCode: string; players: Player[]; settings: GameSettings; roomType: RoomType; hasPassword: boolean; isHost: boolean;
      status: 'waiting' | 'playing' | 'finished'; gameContent?: GameContent | null; currentRound?: number; totalRounds?: number;
      answers?: Record<number, number>; scores?: Player[]; timeLeft?: number; roundWinners?: Record<number, string>; roundResults?: Record<number, RoundScore[]>;
      battleMode?: BattleMode; teams?: TeamsState;
    }) => {
      const s = store.getState()
      s.setRoomCode(data.roomCode); s.setPlayers(data.players); s.setGameSettings(data.settings)
      if (data.roomType) s.setRoomType(data.roomType)
      if (data.hasPassword) s.setRoomPassword('•')
      s.setIsHost(data.isHost)
      // Restore team mode data on rejoin (extends solo reconnect system)
      if (data.battleMode) {
        s.setBattleMode(data.battleMode)
        s.setGameSettings({ battleMode: data.battleMode })
      }
      if (data.teams) {
        s.setTeams(data.teams)
        // Derive myTeamId and isCaptain from players list
        const myPlayer = data.players.find((p: Player) => p.id === socket.id)
        if (myPlayer) {
          s.setMyTeamId(myPlayer.teamId || null)
          s.setIsCaptain(!!myPlayer.isCaptain)
        }
      }
      if (data.status === 'waiting') { s.setScreen('lobby') }
      else if (data.status === 'playing' && data.gameContent) {
        s.setGameContent(data.gameContent); s.setCurrentRound(data.currentRound || 0); s.setTotalRounds(data.totalRounds || 1)
        if (data.answers && Object.keys(data.answers).length > 0) {
          const aq = Object.keys(data.answers).map(Number); const next = aq.length; const total = data.gameContent.questions.length
          s.setCurrentQuestionIndex(next >= total ? total : next)
          for (const [q, a] of Object.entries(data.answers)) s.setAnswer(Number(q), Number(a))
        } else { s.setCurrentQuestionIndex(0); s.resetAnswers() }
        s.setTimeLeft(data.timeLeft != null ? data.timeLeft : s.gameSettings.timePerRound * 60); s.setScreen('game')
      } else if (data.status === 'finished') {
        if (data.gameContent) s.setGameContent(data.gameContent)
        if (data.scores) s.setScores(data.scores)
        if (data.roundWinners) s.setRoundWinners(data.roundWinners)
        if (data.roundResults) s.setRoundResults(data.roundResults)
        s.setScreen('results')
      } else { s.setScreen('lobby') }
      if ((data as any).pendingJoinRequests) {
        store.getState().setPendingJoinRequests((data as any).pendingJoinRequests)
      }
      s.setIsReconnecting(false); s.setIsLoading(false)
      battleToast('rejoin_success', 'تمت العودة!', 'رجعت للساحة بنجاح')
    })

    socket.on('rejoin-failed', (data: { message: string }) => {
      disconnectGlobalSocket()
      store.getState().setIsReconnecting(false); store.getState().resetGame(); clearSessionStorage()
      battleToast('rejoin_failed', 'فشل إعادة الاتصال', data.message)
    })

    // ─── Team Mode Events ──────────────────────────────────────────
    socket.on('team-update', (data: { teams: TeamsState; players: Player[]; switchedPlayerId?: string; switchedPlayerName?: string; newTeamId?: TeamId }) => {
      store.getState().setTeams(data.teams)
      store.getState().setPlayers(data.players)
      // Update my team id
      if (data.switchedPlayerId === socket.id && data.newTeamId) {
        store.getState().setMyTeamId(data.newTeamId)
        const isNowCaptain = data.newTeamId === 'A'
          ? data.teams.teamA.captainId === socket.id
          : data.teams.teamB.captainId === socket.id
        store.getState().setIsCaptain(isNowCaptain)
        const targetTeamName = data.newTeamId === 'A' ? (data.teams.teamA.customName || 'الفريق الأحمر') : (data.teams.teamB.customName || 'الفريق الأزرق')
        battleToast('team_switched', 'غيّرت الفريق!', `انتقلت ل${targetTeamName}`)
      } else if (data.switchedPlayerName) {
        const targetTeamName = data.newTeamId === 'A' ? (data.teams.teamA.customName || 'الفريق الأحمر') : (data.teams.teamB.customName || 'الفريق الأزرق')
        battleToast('team_switch', 'تبديل فريق', `${data.switchedPlayerName} انتقل ل${targetTeamName}`)
      }
    })

    socket.on('team-captain-changed', (data: { teamId: TeamId; newCaptainId: string; newCaptainName: string; teams: TeamsState }) => {
      store.getState().setTeams(data.teams)
      const teamName = data.teamId === 'A' ? (data.teams.teamA.customName || 'الفريق الأحمر') : (data.teams.teamB.customName || 'الفريق الأزرق')
      if (data.newCaptainId === socket.id) {
        store.getState().setIsCaptain(true)
        battleToast('captain_promoted', 'أنت القائد الجديد!', `بقيت قائد ${teamName}`)
      } else {
        battleToast('captain_changed', 'قائد جديد', `${data.newCaptainName} بقى قائد ${teamName}`)
      }
    })

    // Join request received by captain
    socket.on('join-request-received', (data: { requestId: string; playerName: string; playerId: string; targetTeamId: TeamId; type: 'join' | 'switch'; currentTeamId: TeamId | null; expiresAt: number }) => {
      store.getState().addJoinRequest({
        id: data.requestId,
        playerId: data.playerId,
        playerName: data.playerName,
        targetTeamId: data.targetTeamId,
        type: data.type,
        currentTeamId: data.currentTeamId,
        expiresAt: data.expiresAt,
      })
      audioEngine.error() // Attention-grabbing notification
      if (data.type === 'join') {
        battleToast('join_request', 'طلب انضمام جديد! 📩', `${data.playerName} يريد الانضمام ل${data.targetTeamId === 'A' ? 'لفريق الأحمر' : 'لفريق الأزرق'}`)
      } else {
        battleToast('switch_request', 'طلب تبديل فريق! 🔄', `${data.playerName} يريد الانتقال ل${data.targetTeamId === 'A' ? 'لفريق الأحمر' : 'لفريق الأزرق'}`)
      }
    })

    // Join request sent confirmation
    socket.on('join-request-sent', (data: { requestId: string; targetTeamId: TeamId; captainName: string }) => {
      store.getState().setMyJoinRequest({
        requestId: data.requestId,
        targetTeamId: data.targetTeamId,
        captainName: data.captainName,
      })
      battleToast('join_request_sent', 'تم إرسال الطلب 📤', `في انتظار موافقة ${data.captainName}...`)
    })

    // Join request approved
    socket.on('join-request-approved', (data: { requestId: string; teamId: TeamId; teamName: string; captainName: string }) => {
      store.getState().setMyJoinRequest(null)
      store.getState().setMyTeamId(data.teamId)
      // Update isCaptain based on teams
      const teams = store.getState().teams
      if (teams) {
        const isNowCaptain = data.teamId === 'A'
          ? teams.teamA.captainId === globalSocket?.id
          : teams.teamB.captainId === globalSocket?.id
        store.getState().setIsCaptain(isNowCaptain)
      }
      audioEngine.progressStep()
      battleToast('join_approved', 'تم قبولك في الفريق! ✅', `${data.captainName} وافق على انضمامك ل${data.teamName}`)
    })

    // Join request rejected
    socket.on('join-request-rejected', (data: { requestId: string; captainName: string }) => {
      store.getState().setMyJoinRequest(null)
      audioEngine.error()
      battleToast('join_rejected', 'تم رفض طلب الانضمام ❌', `${data.captainName} رفض طلب انضمامك`)
    })

    // Join request expired
    socket.on('join-request-expired', (data: { requestId: string }) => {
      store.getState().setMyJoinRequest(null)
      store.getState().removeJoinRequest(data.requestId)
      battleToast('join_expired', 'انتهت صلاحية الطلب ⏰', 'لم يتم الرد على طلبك في الوقت المحدد')
    })

    // Join request resolved (for captain)
    socket.on('join-request-resolved', (data: { requestId: string; playerName: string; approved: boolean }) => {
      store.getState().removeJoinRequest(data.requestId)
      if (data.approved) {
        battleToast('join_resolved', 'تم قبول اللاعب ✅', `${data.playerName} انضم للفريق`)
      } else {
        battleToast('join_resolved', 'تم رفض الطلب ❌', `رفضت طلب انضمام ${data.playerName}`)
      }
    })

    socket.on('approval-requested', (data: ApprovalRequestState) => {
      store.getState().setPendingApproval(data)
      audioEngine.error() // Use error sound as attention-grabbing notification
    })

    socket.on('approval-sent', (data: { approvalId: string; targetCaptainName: string }) => {
      store.getState().setApprovalSent(data)
      battleToast('approval_sent', 'تم إرسال الطلب', `في انتظار موافقة ${data.targetCaptainName}...`)
    })

    socket.on('approval-resolved', (data: { approvalId: string; approved: boolean; approvedByName?: string; rejectedByName?: string; type: string }) => {
      store.getState().setPendingApproval(null)
      store.getState().setApprovalSent(null)
      if (data.approved) {
        battleToast('approval_approved', 'تمت الموافقة! ✅', `${data.approvedByName} وافق على الطلب`)
      } else {
        battleToast('approval_rejected', 'تم الرفض ❌', `${data.rejectedByName} رفض الطلب`)
      }
    })

    socket.on('approval-expired', (data: { approvalId: string }) => {
      store.getState().setPendingApproval(null)
      store.getState().setApprovalSent(null)
      battleToast('approval_expired', 'انتهت المهلة', 'لم يتم الرد على طلب الموافقة في الوقت المحدد')
    })

    socket.on('voice-merge-status', (data: { merged: boolean; requestedByName: string; approvedByName: string }) => {
      store.getState().setVoiceMerged(data.merged)
      if (data.merged) {
        battleToast('voice_merged', 'تم دمج المحادثة الصوتية! 🔊', `${data.approvedByName} وافق على دمج المحادثة بين الفريقين`)
      }
    })

    // ─── Team Ready State (Synchronized Round Progression) ──────────────
    socket.on('team-ready-state', (data: { teamId: TeamId; teamName: string; message: string; allTeamsReady: boolean }) => {
      // Cinematic notification when a whole team finishes the round
      audioEngine.progressStep() // Use a celebratory sound
      if (data.allTeamsReady) {
        battleToast('all_teams_ready', 'كلا الفريقين جاهز!', 'يتم تجهيز نتائج الجولة...')
      } else {
        const myTeamId = store.getState().myTeamId
        const isMyTeam = data.teamId === myTeamId
        if (isMyTeam) {
          battleToast('my_team_ready', `${data.message}`, 'في انتظار الفريق الآخر...')
        } else {
          battleToast('other_team_ready', `${data.message}`, 'فريقك ما زال يقاتل...')
        }
      }
    })

    socket.on('team-renamed', (data: { teamId: TeamId; oldName: string; newName: string; captainName: string }) => {
      audioEngine.progressStep()
      battleToast('team_renamed', 'اسم جديد للفريق!', `${data.captainName} غيّر اسم الفريق إلى "${data.newName}"`)
    })

    socket.on('chat-message', (data: ChatMessage) => {
      store.getState().addChatMessage(data)
    })

    // ─── Update game-created/joined handlers to include team data ───
    // (These replace the existing handlers - the original handlers are above
    //  but we need to add team data handling)
    socket.on('game-created', (data: { roomCode: string; roomType?: RoomType; hasPassword?: boolean; battleMode?: BattleMode; teams?: TeamsState }) => {
      store.getState().setRoomCode(data.roomCode)
      if (data.roomType) store.getState().setRoomType(data.roomType)
      if (data.hasPassword) store.getState().setRoomPassword('•')
      if (data.battleMode) {
        store.getState().setBattleMode(data.battleMode)
        store.getState().setGameSettings({ battleMode: data.battleMode })
      }
      if (data.teams) {
        store.getState().setTeams(data.teams)
        // Creator is always Team A captain
        store.getState().setMyTeamId('A')
        store.getState().setIsCaptain(true)
      }
      store.getState().setIsLoading(false)
      store.getState().setScreen('lobby')
    })

    socket.on('game-joined', (data: { roomCode: string; players: Player[]; settings: any; roomType?: RoomType; hasPassword?: boolean; battleMode?: BattleMode; teams?: TeamsState }) => {
      store.getState().setRoomCode(data.roomCode)
      store.getState().setPlayers(data.players)
      if (data.roomType) store.getState().setRoomType(data.roomType)
      if (data.hasPassword) store.getState().setRoomPassword('•')
      store.getState().setIsLoading(false)
      if (data.settings) store.getState().setGameSettings(data.settings)
      if (data.battleMode) store.getState().setBattleMode(data.battleMode)
      if (data.teams) {
        store.getState().setTeams(data.teams)
        // Find my team from the players list
        const myId = socket.id
        const myPlayer = data.players.find((p: Player) => p.id === myId)
        if (myPlayer) {
          store.getState().setMyTeamId(myPlayer.teamId || null)
          store.getState().setIsCaptain(!!myPlayer.isCaptain)
        }
      }
      if ((data as any).pendingJoinRequests) {
        store.getState().setPendingJoinRequests((data as any).pendingJoinRequests)
      }
      store.getState().setScreen('lobby')
    })
  }, [])

  const connectAndDo = useCallback((action: (socket: Socket) => void) => {
    const socket = getOrCreateSocket(setupSocketListeners)
    if (socket.connected) { action(socket); return }
    pendingAction = action
  }, [setupSocketListeners])

  const leaveAndDisconnect = useCallback(() => {
    // Disconnect LiveKit voice chat
    disconnectLiveKit()
    // Clear per-player mute state
    usePlayerMuteStore.getState().clearAllMutes()
    if (globalSocket) {
      globalSocket.emit('leave-room')
      const sock = globalSocket
      globalSocket = null; globalSocketListenersSetup = false; pendingAction = null
      clearSessionStorage()
      sock.removeAllListeners(); sock.disconnect()
    }
  }, [])

  const createGame = useCallback((playerName: string, settings: any, roomType: RoomType, password?: string) => {
    store.getState().setIsHost(true); store.getState().setPlayerName(playerName); store.getState().setRoomType(roomType); store.getState().setIsLoading(true)
    connectAndDo((socket) => { socket.emit('create-game', { playerName, settings, roomType, password }) })
    // Safety timeout: if create-game doesn't complete in 12s, reset loading
    setTimeout(() => {
      if (store.getState().isLoading && store.getState().screen === 'create') {
        console.log('[createGame] Timed out after 12s, resetting')
        store.getState().setIsLoading(false)
        disconnectGlobalSocket()
        battleToast('timeout', 'انتهت المهلة', 'لم نستطع إنشاء الساحة. يرجى المحاولة مرة أخرى.')
      }
    }, 12000)
  }, [connectAndDo])

  const joinGame = useCallback((roomCode: string, playerName: string, password?: string) => {
    store.getState().setIsHost(false); store.getState().setPlayerName(playerName); store.getState().setRoomCode(roomCode.toUpperCase()); store.getState().setIsLoading(true)
    connectAndDo((socket) => { socket.emit('join-game', { roomCode: roomCode.toUpperCase(), playerName, password }) })
    // Safety timeout: if join-game doesn't complete in 12s, reset loading
    setTimeout(() => {
      if (store.getState().isLoading && store.getState().screen === 'join') {
        console.log('[joinGame] Timed out after 12s, resetting')
        store.getState().setIsLoading(false)
        disconnectGlobalSocket()
        battleToast('timeout', 'انتهت المهلة', 'لم نستطع الانضمام للساحة. يرجى المحاولة مرة أخرى.')
      }
    }, 12000)
  }, [connectAndDo])

  const rejoinRoom = useCallback((roomCode: string, playerName: string) => {
    store.getState().setIsReconnecting(true); store.getState().setIsLoading(true)
    connectAndDo((socket) => { socket.emit('rejoin-room', { roomCode: roomCode.toUpperCase(), playerName }) })
    // Safety timeout: if rejoin doesn't complete in 8s, force reset
    setTimeout(() => {
      if (store.getState().isReconnecting) {
        console.log('[rejoinRoom] Rejoin timed out after 8s, resetting')
        disconnectGlobalSocket()
        store.getState().setIsReconnecting(false)
        store.getState().setIsLoading(false)
        store.getState().resetGame()
        clearSessionStorage()
        battleToast('connection_error', 'فشل الاتصال', 'لم نستطع العودة للساحة. يرجى المحاولة مرة أخرى.')
      }
    }, 8000)
  }, [connectAndDo])

  const startGame = useCallback(() => {
    if (globalSocket) {
      store.getState().setScreen('loading')
      globalSocket.emit('start-game', { roomCode: store.getState().roomCode })
    }
  }, [])

  const submitAnswer = useCallback((questionIndex: number, answerIndex: number) => {
    if (globalSocket) {
      store.getState().setAnswer(questionIndex, answerIndex)
      const s = store.getState()
      globalSocket.emit('submit-answer', { roomCode: s.roomCode, roundNumber: s.currentRound, questionIndex, answerIndex, timeLeft: s.timeLeft })
      // First battle gameplay hints after answering
      if (shouldShowGameplayHints()) {
        if (questionIndex === 0) {
          setTimeout(() => showGameplayHint('answerArea'), 500)
        }
        if (questionIndex >= 2) {
          setTimeout(() => showGameplayHint('noImmediateAnswers'), 1000)
        }
      }
    }
  }, [])

  const surrender = useCallback(() => {
    if (globalSocket) {
      globalSocket.emit('surrender')
    }
  }, [])

  const requestEarlyEnd = useCallback((roomCode: string) => {
    if (globalSocket) {
      store.getState().setEarlyEndProcessing(true)
      audioEngine.earlyEndHorn()
      globalSocket.emit('early-end-game', { roomCode })
    }
  }, [])

  return { leaveAndDisconnect, createGame, joinGame, rejoinRoom, startGame, submitAnswer, surrender, requestEarlyEnd, setupSocketListeners }
}

// ============================================
// ANIMATION VARIANTS
// ============================================
const pageVariants = {
  initial: { opacity: 0, scale: 0.98, filter: 'blur(4px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: 1.02, filter: 'blur(4px)' },
}

const slideVariants = {
  initial: { opacity: 0, x: -30 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 30 },
}

const battleTransition = {
  initial: { opacity: 0, y: 12, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -8, filter: 'blur(4px)' },
}

// ============================================
// TEAM DISPLAY NAME HELPER
// ============================================
function getTeamDisplayName(team: TeamInfo): string {
  return team.customName || team.name
}

// ============================================
// AUDIO CONTROLS (Fixed position)
// ============================================
function AudioControls() {
  const settings = useAudioStore((s) => s.settings)
  const initAudio = useAudioStore((s) => s.initAudio)
  const toggleMute = useAudioStore((s) => s.toggleMute)
  const setMasterVolume = useAudioStore((s) => s.setMasterVolume)
  const [showSlider, setShowSlider] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const VolumeIcon = settings.isMuted || settings.masterVolume === 0 ? VolumeX : settings.masterVolume < 0.5 ? Volume1 : Volume2

  // Close slider when clicking outside
  useEffect(() => {
    if (!showSlider) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSlider(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside as unknown as EventListener)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside as unknown as EventListener)
    }
  }, [showSlider])

  // When volume changes via slider, unmute if muted
  const handleVolumeChange = (v: number[]) => {
    const newVol = v[0] / 100
    setMasterVolume(newVol)
    // Auto-unmute when user adjusts volume
    if (settings.isMuted && newVol > 0) {
      toggleMute()
    }
  }

  // Apply master volume to ALL audio in the site
  // This includes: audio engine (SFX, ambient), voice chat audio elements, and any HTML5 audio
  useEffect(() => {
    const effectiveVolume = settings.isMuted ? 0 : settings.masterVolume

    // 1. Set audio engine master volume (handles SFX, ambient, music)
    audioEngine.setMasterVolume(effectiveVolume)

    // 2. Set voice chat audio elements volume
    const audioElements = document.querySelectorAll('audio')
    audioElements.forEach((el) => {
      el.volume = effectiveVolume
      el.muted = settings.isMuted
    })

    // 3. Set any video elements volume too
    const videoElements = document.querySelectorAll('video')
    videoElements.forEach((el) => {
      el.volume = effectiveVolume
      el.muted = settings.isMuted
    })
  }, [settings.masterVolume, settings.isMuted])

  // Also observe DOM for new audio elements being added (voice chat tracks)
  useEffect(() => {
    const effectiveVolume = settings.isMuted ? 0 : settings.masterVolume

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLAudioElement) {
            node.volume = effectiveVolume
            node.muted = settings.isMuted
          }
          if (node instanceof HTMLVideoElement) {
            node.volume = effectiveVolume
            node.muted = settings.isMuted
          }
          // Check children too
          if (node instanceof HTMLElement) {
            node.querySelectorAll('audio').forEach((el) => {
              el.volume = effectiveVolume
              el.muted = settings.isMuted
            })
            node.querySelectorAll('video').forEach((el) => {
              el.volume = effectiveVolume
              el.muted = settings.isMuted
            })
          }
        }
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [settings.masterVolume, settings.isMuted])

  return (
    <div ref={containerRef} className="fixed bottom-4 left-4 z-50">
      {/* Slider popup - absolutely positioned above the button so it doesn't shift */}
      <AnimatePresence>
        {showSlider && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-14 left-0 bg-black/70 backdrop-blur-xl border border-white/10 rounded-2xl p-3 flex flex-col items-center gap-2 min-w-[140px]"
          >
            <div dir="ltr" className="flex items-center gap-2 w-full">
              <Volume1 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <Slider
                value={[settings.isMuted ? 0 : settings.masterVolume * 100]}
                min={0}
                max={100}
                step={5}
                onValueChange={handleVolumeChange}
                className="flex-1"
                orientation="horizontal"
              />
              <Volume2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </div>
            <span className="text-xs text-slate-400 tabular-nums">
              {settings.isMuted ? 'مكتوم' : `${Math.round(settings.masterVolume * 100)}%`}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Single button - stays fixed in place */}
      <Button
        size="icon"
        variant="ghost"
        onClick={() => { initAudio(); setShowSlider(!showSlider) }}
        className={`w-10 h-10 rounded-full backdrop-blur-xl border transition-all ${
          settings.isMuted
            ? 'bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30 hover:text-red-300'
            : 'bg-black/40 border-white/10 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/20'
        }`}
        title={settings.isMuted ? 'إلغاء كتم الصوت' : 'التحكم في الصوت'}
      >
        <VolumeIcon className="w-4 h-4" />
      </Button>
    </div>
  )
}

// ============================================
// SPLASH SCREEN - EPIC CINEMATIC ANIMATION
// ============================================
function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'leftSword' | 'rightSword' | 'clash' | 'emerge' | 'title' | 'subtitle' | 'done'>('idle')
  const [waitingForTap, setWaitingForTap] = useState(true)
  const initAudio = useAudioStore((s) => s.initAudio)
  const audioPlayedRef = useRef(false)
  const [shaking, setShaking] = useState(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Pre-compute spark positions once (avoids Math.random() recalculation on every render)
  const sparkPositions = useMemo(() => ({
    red: [...Array(12)].map((_, i) => ({
      x: Math.cos((i / 12) * Math.PI * 2) * (80 + Math.random() * 60),
      y: Math.sin((i / 12) * Math.PI * 2) * (80 + Math.random() * 60),
    })),
    amber: [...Array(12)].map((_, i) => ({
      x: Math.cos((i / 12) * Math.PI * 2 + 0.3) * (70 + Math.random() * 70),
      y: Math.sin((i / 12) * Math.PI * 2 + 0.3) * (70 + Math.random() * 70),
    })),
  }), [])

  const startAnimation = useCallback(() => {
    // Initialize audio FIRST — this unlocks AudioContext via user gesture
    initAudio()
    setWaitingForTap(false)

    // Small delay to let AudioContext resume properly
    timersRef.current.push(setTimeout(() => {
      // Phase 1: Left sword flies in (0-800ms)
      timersRef.current.push(setTimeout(() => setPhase('leftSword'), 100))
      // Phase 2: Right sword flies in (500-1300ms)
      timersRef.current.push(setTimeout(() => setPhase('rightSword'), 500))
      // Phase 3: Swords CLASH (1200-1800ms) — play splash sound here
      timersRef.current.push(setTimeout(() => {
        setPhase('clash')
        setShaking(true)
        if (!audioPlayedRef.current) {
          audioPlayedRef.current = true
          // Re-init to ensure context is running
          initAudio()
          // Small delay to ensure AudioContext is fully resumed
          setTimeout(() => audioEngine.splash(), 50)
        }
        timersRef.current.push(setTimeout(() => setShaking(false), 400))
      }, 1200))
      // Phase 4: Shield/Logo EMERGES from clash (1700-2400ms)
      timersRef.current.push(setTimeout(() => setPhase('emerge'), 1700))
      // Phase 5: Title text reveals (2200-3000ms)
      timersRef.current.push(setTimeout(() => setPhase('title'), 2200))
      // Phase 6: Subtitle fades in (2800-3500ms)
      timersRef.current.push(setTimeout(() => setPhase('subtitle'), 2800))
      // Done
      timersRef.current.push(setTimeout(() => { setPhase('done'); onComplete() }, 4000))
    }, 100))
  }, [onComplete, initAudio])

  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => clearTimeout(t))
      timersRef.current = []
    }
  }, [])

  return (
    <motion.div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-[#0A0A12] overflow-hidden ${shaking ? 'animate-shake' : ''}`}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Background particles */}
      <div className="absolute inset-0 particles-bg" />

      {/* ====== TAP TO START OVERLAY ====== */}
      <AnimatePresence>
        {waitingForTap && (
          <motion.div
            className="absolute inset-0 z-40 flex flex-col items-center justify-center cursor-pointer"
            onClick={startAnimation}
            onTouchStart={startAnimation}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.2 }}
            transition={{ duration: 0.3 }}
          >
            {/* Static logo preview */}
            <motion.div
              animate={{
                filter: [
                  'drop-shadow(0 0 15px rgba(220,38,38,0.3)) drop-shadow(0 0 30px rgba(245,158,11,0.15))',
                  'drop-shadow(0 0 25px rgba(220,38,38,0.5)) drop-shadow(0 0 50px rgba(245,158,11,0.3))',
                  'drop-shadow(0 0 15px rgba(220,38,38,0.3)) drop-shadow(0 0 30px rgba(245,158,11,0.15))',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="mb-8"
            >
              <BattleLogo size="2xl" className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44" />
            </motion.div>

            {/* Tap prompt */}
            <motion.div
              animate={{
                opacity: [0.5, 1, 0.5],
                scale: [0.98, 1.02, 0.98],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="flex flex-col items-center gap-3"
            >
              <motion.div
                className="w-16 h-16 rounded-full border-2 border-amber-500/50 flex items-center justify-center"
                style={{ boxShadow: '0 0 20px rgba(245,158,11,0.3), inset 0 0 15px rgba(220,38,38,0.2)' }}
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Play className="w-7 h-7 text-amber-400 mr-[-2px]" />
              </motion.div>
              <span className="text-amber-400/80 text-lg font-bold tracking-wider">اضغط للبدء</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ambient red/amber glow behind everything */}
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.08) 0%, rgba(245,158,11,0.05) 40%, transparent 70%)' }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: phase === 'clash' || phase === 'emerge' ? 1.5 : phase === 'title' || phase === 'subtitle' ? 1.2 : 0.5, opacity: phase === 'clash' ? 0.8 : phase === 'emerge' ? 0.5 : 0.3 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />

      {/* ====== LEFT SWORD - RED ENERGY ====== */}
      <AnimatePresence>
        {(phase === 'leftSword' || phase === 'rightSword' || phase === 'clash') && (
          <motion.div
            initial={{ x: '-120vw', rotate: -30, opacity: 0 }}
            animate={{
              x: phase === 'clash' ? '0%' : '-15%',
              rotate: phase === 'clash' ? 0 : -15,
              opacity: 1,
            }}
            exit={{ x: '-10%', opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="absolute"
            style={{ left: '25%', top: '30%' }}
          >
            {/* Red energy trail — GPU-promoted for smooth animation */}
            <motion.div
              className="absolute -top-4 -left-20 w-40 h-40 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.4) 0%, transparent 70%)', filter: 'blur(20px)', willChange: 'transform, opacity', transform: 'translate3d(0,0,0)' }}
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 0.5, repeat: Infinity }}
            />
            <Swords
              className="w-28 h-28 sm:w-32 sm:h-32 text-red-500"
              style={{ filter: 'drop-shadow(0 0 25px rgba(220,38,38,0.8)) drop-shadow(0 0 50px rgba(220,38,38,0.4))' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====== RIGHT SWORD - AMBER ENERGY ====== */}
      <AnimatePresence>
        {(phase === 'rightSword' || phase === 'clash') && (
          <motion.div
            initial={{ x: '120vw', rotate: 30, opacity: 0, scaleX: -1 }}
            animate={{
              x: phase === 'clash' ? '0%' : '15%',
              rotate: phase === 'clash' ? 0 : 15,
              opacity: 1,
            }}
            exit={{ x: '10%', opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="absolute"
            style={{ right: '25%', top: '30%' }}
          >
            {/* Amber energy trail — GPU-promoted for smooth animation */}
            <motion.div
              className="absolute -top-4 -right-20 w-40 h-40 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.4) 0%, transparent 70%)', filter: 'blur(20px)', willChange: 'transform, opacity', transform: 'translate3d(0,0,0)' }}
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 0.5, repeat: Infinity }}
            />
            <Swords
              className="w-28 h-28 sm:w-32 sm:h-32 text-amber-500"
              style={{ filter: 'drop-shadow(0 0 25px rgba(245,158,11,0.8)) drop-shadow(0 0 50px rgba(245,158,11,0.4))' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====== CLASH BURST EFFECT ====== */}
      <AnimatePresence>
        {phase === 'clash' && (
          <>
            {/* Main burst — GPU-promoted */}
            <motion.div
              initial={{ scale: 0, opacity: 1 }}
              animate={{ scale: 6, opacity: 0 }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="absolute w-12 h-12 rounded-full"
              style={{ background: 'radial-gradient(circle, #FFFFFF 0%, #FBBF24 20%, #DC2626 40%, transparent 70%)', filter: 'blur(2px)', willChange: 'transform, opacity', contain: 'layout paint' }}
            />
            {/* Secondary ring — GPU-promoted */}
            <motion.div
              initial={{ scale: 0, opacity: 0.8 }}
              animate={{ scale: 8, opacity: 0 }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              className="absolute w-8 h-8 rounded-full border-2 border-amber-400/60"
              style={{ willChange: 'transform, opacity', contain: 'layout paint' }}
            />
            {/* Sparks - Red (pre-computed positions for performance) */}
            {sparkPositions.red.map((pos, i) => (
              <motion.div
                key={`red-spark-${i}`}
                initial={{ scale: 1, opacity: 1, x: 0, y: 0 }}
                animate={{
                  scale: [1, 0],
                  opacity: [1, 0],
                  x: pos.x,
                  y: pos.y,
                }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
                className="absolute w-1.5 h-1.5 rounded-full bg-red-500"
                style={{ boxShadow: '0 0 8px rgba(220,38,38,0.9), 0 0 16px rgba(220,38,38,0.5)', willChange: 'transform, opacity', contain: 'layout paint' }}
              />
            ))}
            {/* Sparks - Amber (pre-computed positions for performance) */}
            {sparkPositions.amber.map((pos, i) => (
              <motion.div
                key={`amber-spark-${i}`}
                initial={{ scale: 1, opacity: 1, x: 0, y: 0 }}
                animate={{
                  scale: [1, 0],
                  opacity: [1, 0],
                  x: pos.x,
                  y: pos.y,
                }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="absolute w-1.5 h-1.5 rounded-full bg-amber-400"
                style={{ boxShadow: '0 0 8px rgba(245,158,11,0.9), 0 0 16px rgba(245,158,11,0.5)', willChange: 'transform, opacity', contain: 'layout paint' }}
              />
            ))}
            {/* Flash overlay — GPU-promoted */}
            <motion.div
              initial={{ opacity: 0.8 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 bg-white/20"
              style={{ willChange: 'opacity' }}
            />
          </>
        )}
      </AnimatePresence>

      {/* ====== SHOCKWAVE RING (from clash) ====== */}
      <AnimatePresence>
        {(phase === 'clash' || phase === 'emerge') && (
          <motion.div
            initial={{ scale: 0, opacity: 0.6 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
            className="absolute w-32 h-32 rounded-full border-2"
            style={{ borderColor: 'rgba(251,191,36,0.5)', boxShadow: '0 0 30px rgba(251,191,36,0.3), inset 0 0 20px rgba(220,38,38,0.2)', willChange: 'transform, opacity', contain: 'layout paint' }}
          />
        )}
      </AnimatePresence>

      {/* ====== LOGO + TITLE + SUBTITLE - CENTERED AS A GROUP ====== */}
      <AnimatePresence>
        {(phase === 'emerge' || phase === 'title' || phase === 'subtitle') && (
          <motion.div
            initial={{ scale: 0, opacity: 0, filter: 'blur(20px)' }}
            animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.7, ease: [0.34, 1.56, 0.64, 1] }}
            className="relative z-10 flex flex-col items-center justify-center gap-6"
          >
            {/* Logo with pulsing glow */}
            <motion.div
              animate={{
                filter: [
                  'drop-shadow(0 0 20px rgba(220,38,38,0.4)) drop-shadow(0 0 40px rgba(245,158,11,0.2))',
                  'drop-shadow(0 0 30px rgba(220,38,38,0.6)) drop-shadow(0 0 60px rgba(245,158,11,0.4))',
                  'drop-shadow(0 0 20px rgba(220,38,38,0.4)) drop-shadow(0 0 40px rgba(245,158,11,0.2))',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="mx-auto"
            >
              <BattleLogo size="2xl" className="w-20 h-20 sm:w-28 sm:h-28 md:w-[120px] md:h-[120px]" />
            </motion.div>

            {/* Title text - appears after logo */}
            {(phase === 'title' || phase === 'subtitle') && (
              <motion.h1
                initial={{ opacity: 0, scale: 0.5, y: -20, filter: 'blur(15px)' }}
                animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)', backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
                transition={{ duration: 0.8, ease: [0.34, 1.56, 0.64, 1], backgroundPosition: { duration: 3, repeat: Infinity, ease: 'linear' } }}
                className="text-3xl sm:text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-amber-400 to-red-500 px-4"
                style={{ backgroundSize: '200% auto' }}
              >
                معركة الأسئلة
              </motion.h1>
            )}

            {/* Subtitle - appears after title */}
            {phase === 'subtitle' && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="text-base sm:text-lg md:text-xl text-slate-400 tracking-wide px-6"
              >
                ادخل الساحة ... واتحدى
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====== FLOATING EMBERS (throughout) ====== */}
      {phase !== 'idle' && phase !== 'done' && [...Array(8)].map((_, i) => (
        <motion.div
          key={`ember-${i}`}
          initial={{
            opacity: 0,
            x: (Math.random() - 0.5) * 400,
            y: 300,
            scale: 0,
          }}
          animate={{
            opacity: [0, 0.8, 0.6, 0],
            y: -300,
            x: (Math.random() - 0.5) * 500,
            scale: [0, 1, 0.5],
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            delay: i * 0.4 + Math.random() * 0.5,
            repeat: Infinity,
            ease: 'easeOut',
          }}
          className="absolute bottom-0 w-1.5 h-1.5 rounded-full"
          style={{
            background: i % 2 === 0 ? '#DC2626' : '#F59E0B',
            boxShadow: i % 2 === 0
              ? '0 0 6px rgba(220,38,38,0.8), 0 0 12px rgba(220,38,38,0.4)'
              : '0 0 6px rgba(245,158,11,0.8), 0 0 12px rgba(245,158,11,0.4)',
          }}
        />
      ))}
    </motion.div>
  )
}

// ============================================
// BACKGROUND COMPONENT
// ============================================
function BattleBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {/* Base grid */}
      <div className="absolute inset-0 battle-grid" />
      
      {/* Noise texture */}
      <div className="absolute inset-0 arena-noise opacity-40" />
      
      {/* Depth glow layers */}
      <div className="absolute inset-0 arena-depth-glow-top" />
      <div className="absolute inset-0 arena-depth-glow-bottom" />
      
      {/* Ambient glows */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-red-900/8 rounded-full blur-[150px] arena-ambient-glow" />
      <div className="absolute bottom-0 left-0 w-[700px] h-[700px] bg-amber-900/6 rounded-full blur-[180px] arena-ambient-glow" style={{ animationDelay: '3s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-900/4 rounded-full blur-[120px]" />
      
      {/* Fog layers */}
      <div className="absolute inset-0 arena-fog opacity-30" />
      <div className="absolute inset-0 arena-fog-reverse opacity-25" />
      
      {/* Energy streaks */}
      <div className="absolute top-[20%] left-0 w-full h-[2px] arena-energy-streak" />
      <div className="absolute top-[60%] left-0 w-full h-[1px] arena-energy-streak" style={{ animationDelay: '4s', animationDuration: '12s' }} />
      
      {/* Light sweep */}
      <div className="absolute inset-0 arena-light-sweep" style={{ animationDelay: '5s' }} />
      
      {/* Floating particles */}
      <div className="absolute inset-0 particles-bg opacity-40" />
    </div>
  )
}

// ============================================
// HOME SCREEN
// ============================================
function HomeScreen() {
  const setScreen = useGameStore((s) => s.setScreen)
  
  // Mock live arena data with animated counters
  const [arenaStats, setArenaStats] = useState({
    activeBattles: 12,
    onlineWarriors: 84,
    roomsFighting: 7,
    latestWinner: 'فارس الكلمة',
  })
  
  // Live battle feed - mock data that rotates
  const battleFeedItems = [
    { text: 'ساحة ABC بدأت المعركة', time: 'الآن', type: 'battle' as const },
    { text: 'فارس الكلمة فاز بالجولة 3', time: '12 ثانية', type: 'win' as const },
    { text: 'محارب جديد دخل الساحة', time: '25 ثانية', type: 'join' as const },
    { text: 'ساحة XYZ انتهت المعركة', time: '40 ثانية', type: 'end' as const },
    { text: 'أسد البيان حقق فوز ساحق', time: '55 ثانية', type: 'win' as const },
    { text: '6 مقاتلين يتنافسون الآن', time: '1 دقيقة', type: 'battle' as const },
  ]
  
  // Top warriors - mock data
  const topWarriors = [
    { name: 'فارس الكلمة', wins: 47, streak: 5, color: '#F59E0B' },
    { name: 'أسد البيان', wins: 38, streak: 3, color: '#DC2626' },
    { name: 'نبع الحكمة', wins: 31, streak: 2, color: '#06B6D4' },
  ]
  
  // Animate arena stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setArenaStats(prev => ({
        activeBattles: Math.max(5, prev.activeBattles + (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 3)),
        onlineWarriors: Math.max(40, prev.onlineWarriors + (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 8)),
        roomsFighting: Math.max(3, prev.roomsFighting + (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 2)),
        latestWinner: ['فارس الكلمة', 'أسد البيان', 'نبع الحكمة', 'سيف العقل', 'درع المعرفة'][Math.floor(Math.random() * 5)],
      }))
    }, 4000)
    return () => clearInterval(interval)
  }, [])
  
  // Rotating feed index
  const [feedIndex, setFeedIndex] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => {
      setFeedIndex(prev => (prev + 1) % battleFeedItems.length)
    }, 3500)
    return () => clearInterval(interval)
  }, [battleFeedItems.length])

  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative overflow-hidden">
      <BattleBackground />

      <motion.div
        initial="initial"
        animate="animate"
        variants={pageVariants}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-3xl"
      >
        {/* ═══════════════════════════════════ */}
        {/* HERO SECTION - Logo + Title */}
        {/* ═══════════════════════════════════ */}
        <div className="text-center pt-8 sm:pt-12 mb-6">
          {/* Logo with cinematic aura */}
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
            className="relative inline-block mb-6"
          >
            {/* Aura ring behind logo */}
            <motion.div
              className="absolute inset-0 rounded-full logo-aura-ring"
              style={{ margin: '-15%' }}
            />
            {/* Energy glow behind logo */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                margin: '-20%',
                background: 'radial-gradient(circle, rgba(220,38,38,0.08) 0%, rgba(245,158,11,0.05) 40%, transparent 70%)',
              }}
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div whileHover={{ scale: 1.05 }} className="relative">
              <BattleLogo size="2xl" className="w-20 h-20 sm:w-28 sm:h-28 md:w-[120px] md:h-[120px]" />
            </motion.div>
          </motion.div>

          {/* Title with improved typography */}
          <motion.h1
            className="text-3xl sm:text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-amber-400 to-red-500 mb-3 py-3 px-2"
            animate={{
              backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
            }}
            transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
            style={{ backgroundSize: '200% auto' }}
          >
            معركة الأسئلة
          </motion.h1>
          
          {/* Subtitle - improved contrast and readability */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-lg sm:text-xl text-slate-300 font-semibold tracking-wide"
          >
            ادخل الساحة وتنافس مع أصدقائك في أقوى التحديات
          </motion.p>
        </div>

        {/* ═══════════════════════════════════ */}
        {/* LIVE ARENA STATS - Replaces feature cards */}
        {/* ═══════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-3 gap-3 mb-6"
        >
          {/* Active Battles */}
          <div className="arena-stat-card rounded-xl p-3 sm:p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <div className="w-2 h-2 rounded-full bg-red-500 live-pulse-dot" />
              <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white count-up">
              {arenaStats.activeBattles}
            </div>
            <div className="text-xs sm:text-sm text-slate-400 font-medium">ساحة مشتعلة</div>
          </div>

          {/* Online Warriors */}
          <div className="arena-stat-card rounded-xl p-3 sm:p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <div className="w-2 h-2 rounded-full bg-amber-500 live-pulse-dot" style={{ animationDelay: '0.5s' }} />
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white count-up">
              {arenaStats.onlineWarriors}
            </div>
            <div className="text-xs sm:text-sm text-slate-400 font-medium">مقاتل بالساحة</div>
          </div>

          {/* Rooms Fighting */}
          <div className="arena-stat-card rounded-xl p-3 sm:p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <div className="w-2 h-2 rounded-full bg-cyan-500 live-pulse-dot" style={{ animationDelay: '1s' }} />
              <Swords className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white count-up">
              {arenaStats.roomsFighting}
            </div>
            <div className="text-xs sm:text-sm text-slate-400 font-medium">معركة جارية</div>
          </div>
        </motion.div>

        {/* ═══════════════════════════════════ */}
        {/* ACTION BUTTONS - Keep existing style */}
        {/* ═══════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-4 justify-center mb-6"
        >
          <Button
            size="lg"
            className="text-lg px-8 py-7 btn-battle rounded-xl"
            onClick={() => setScreen('create')}
            data-onboarding="create-room"
          >
            <Swords className="w-5 h-5 ml-2" />
            أنشئ ساحة قتال
          </Button>
          <Button
            size="lg"
            className="text-lg px-8 py-7 btn-secondary-battle rounded-xl"
            onClick={() => setScreen('join')}
            data-onboarding="join-room"
          >
            <Shield className="w-5 h-5 ml-2" />
            انضم لساحة
          </Button>
          <Button
            size="lg"
            className="text-lg px-6 py-7 bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white hover:border-white/20 rounded-xl transition-all"
            onClick={() => setScreen('history')}
            data-onboarding="battle-history"
          >
            <ScrollText className="w-5 h-5 ml-2" />
            سجل المعارك
          </Button>
          <Button
            size="lg"
            className="text-lg px-6 py-7 bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white hover:border-white/20 rounded-xl transition-all"
            onClick={() => setScreen('about')}
          >
            <Sparkles className="w-5 h-5 ml-2" />
            عنّا
          </Button>
        </motion.div>

        {/* ═══════════════════════════════════ */}
        {/* LIVE BATTLE FEED - Scrolling events */}
        {/* ═══════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="mb-6"
        >
          <div className="arena-stat-card rounded-xl p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 live-pulse-dot" />
                <span className="text-sm font-bold text-slate-300">أحداث الساحة</span>
              </div>
              <span className="text-xs text-slate-500">مباشر</span>
            </div>
            <div className="relative h-8 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={feedIndex}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.4 }}
                  className="flex items-center gap-2"
                >
                  {battleFeedItems[feedIndex].type === 'win' && <Trophy className="w-4 h-4 text-amber-400 shrink-0" />}
                  {battleFeedItems[feedIndex].type === 'battle' && <Flame className="w-4 h-4 text-red-400 shrink-0" />}
                  {battleFeedItems[feedIndex].type === 'join' && <Users className="w-4 h-4 text-cyan-400 shrink-0" />}
                  {battleFeedItems[feedIndex].type === 'end' && <Swords className="w-4 h-4 text-slate-400 shrink-0" />}
                  <span className="text-sm text-slate-300 truncate">{battleFeedItems[feedIndex].text}</span>
                  <span className="text-xs text-slate-500 mr-auto whitespace-nowrap">{battleFeedItems[feedIndex].time}</span>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* ═══════════════════════════════════ */}
        {/* TOP WARRIORS - Champions section */}
        {/* ═══════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-3 justify-center">
            <Crown className="w-5 h-5 text-amber-400" />
            <span className="text-sm font-bold text-slate-300">أبطال الساحة</span>
          </div>
          <div className="flex gap-3 justify-center">
            {topWarriors.map((warrior, i) => (
              <motion.div
                key={warrior.name}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.0 + i * 0.1 }}
                className="champion-card rounded-xl p-3 sm:p-4 text-center min-w-[100px] sm:min-w-[120px]"
              >
                <div
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-black text-lg"
                  style={{ backgroundColor: warrior.color + '30', border: `2px solid ${warrior.color}50` }}
                >
                  {warrior.name.charAt(0)}
                </div>
                <div className="text-sm font-bold text-white truncate">{warrior.name}</div>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <Trophy className="w-3 h-3 text-amber-400" />
                  <span className="text-xs text-amber-400 font-semibold">{warrior.wins}</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">سلسلة {warrior.streak} انتصارات</div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ═══════════════════════════════════ */}
        {/* BOTTOM AREA - Quick join hint */}
        {/* ═══════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="text-center pb-4"
        >
          <p className="text-sm text-slate-500">
            أنشئ ساحة أو انضم لمعركة جارية ⚔️
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}

// ============================================
// CREATE GAME SCREEN
// ============================================
function CreateGameScreen() {
  const guest = useGuestStore((s) => s.guest)
  const [name, setName] = useState('')
  const [roomType, setRoomType] = useState<RoomType>('عامة')
  const [password, setPassword] = useState('')
  const gameSettings = useGameStore((s) => s.gameSettings)
  const setGameSettings = useGameStore((s) => s.setGameSettings)
  const setScreen = useGameStore((s) => s.setScreen)
  const isLoading = useGameStore((s) => s.isLoading)
  const { createGame } = useGameSocket()

  // Auto-fill name from guest identity
  const effectiveName = name || guest?.displayName || ''

  const handleCreate = () => {
    if (!effectiveName) return
    createGame(effectiveName, gameSettings, roomType, roomType === 'خاصة' && password.trim() ? password.trim() : undefined)
  }

  const gameTypes: { value: GameType; label: string; icon: typeof BookOpen; desc: string }[] = [
    { value: 'قراءة متحررة', label: 'قراءة متحررة', icon: BookOpen, desc: 'موضوعات متنوعة مع أسئلة فهم واستنتاج تحليلي' },
    { value: 'نصوص', label: 'نصوص', icon: BookMarked, desc: 'نصوص أدبية مع أسئلة بلاغة وتذوق' },
  ]

  const difficulties: { value: Difficulty; label: string; color: string; glow: string }[] = [
    { value: 'سهل', label: 'سهل', color: 'border-green-500/40 bg-green-500/10 text-green-400', glow: 'shadow-green-500/10' },
    { value: 'متوسط', label: 'متوسط', color: 'border-amber-500/40 bg-amber-500/10 text-amber-400', glow: 'shadow-amber-500/10' },
    { value: 'صعب', label: 'صعب', color: 'border-red-500/40 bg-red-500/10 text-red-400', glow: 'shadow-red-500/10' },
  ]

  const timeOptions = [
    { value: 5, label: '5' }, { value: 7, label: '7' }, { value: 10, label: '10' },
    { value: 15, label: '15' }, { value: 20, label: '20' }, { value: 25, label: '25' },
  ]

  const maxPlayers = gameSettings.maxPlayers

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <BattleBackground />

      <motion.div initial="initial" animate="animate" exit="exit" variants={pageVariants} transition={{ duration: 0.5 }} className="w-full max-w-lg relative z-10">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="mb-4 -mr-2 text-slate-400 hover:text-white hover:bg-white/5">
              <ChevronLeft className="w-4 h-4 ml-1" /> رجوع
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="battle-card-glow">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">متأكد؟</AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">هتخرج من صفحة الإنشاء وكل البيانات هتتمسح</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={() => setScreen('home')} className="btn-battle">خروج</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="battle-card-glow rounded-2xl overflow-hidden">
          <div className="p-6 text-center border-b border-white/5">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="mx-auto mb-3 relative"
            >
              <BattleLogo size="lg" />
            </motion.div>
            <h2 className="text-2xl font-black text-white">أنشئ ساحة قتال</h2>
            <p className="text-sm text-slate-400 mt-1">جهّز الساحة وادعو المقاتلين</p>
          </div>

          <div className="p-6 space-y-6">
            {/* Name — pre-filled from guest identity */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-300">اسمك في المعركة</Label>
              <div className="relative">
                <Input value={name || guest?.displayName || ''} onChange={(e) => setName(e.target.value)} placeholder={guest?.displayName || 'اكتب اسمك هنا...'} className="battle-input rounded-xl text-right text-lg h-12 pr-4 pl-12" maxLength={20} />
                <button
                  type="button"
                  onClick={() => useGuestStore.getState().setShowEditModal(true)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-amber-400 hover:border-amber-500/30 transition-all flex items-center justify-center"
                  title="غيّر اسمك"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
              </div>
            </div>

            {/* Room type */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-slate-300">نوع الساحة</Label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'عامة' as RoomType, label: 'ساحة عامة', icon: Globe, desc: 'أي مقاتل يقدر يلاقيها' },
                  { value: 'خاصة' as RoomType, label: 'ساحة خاصة', icon: Lock, desc: 'محتاجة كود وباسوورد' },
                ]).map((type) => (
                  <motion.button key={type.value} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setRoomType(type.value)}
                    className={`p-4 rounded-xl border text-right transition-all ${roomType === type.value ? 'border-red-500/50 bg-red-500/10 shadow-lg shadow-red-500/5' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                    <type.icon className={`w-6 h-6 mb-2 ${roomType === type.value ? 'text-red-400' : 'text-slate-500'}`} />
                    <div className="font-bold text-sm text-white">{type.label}</div>
                    <div className="text-xs text-slate-400 mt-1">{type.desc}</div>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Password */}
            {roomType === 'خاصة' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2">
                <Label className="text-sm font-semibold text-slate-300"><Lock className="w-4 h-4 inline ml-1" /> كلمة السر (اختياري)</Label>
                <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="كلمة السر" className="battle-input rounded-xl text-right" maxLength={30} type="text" />
              </motion.div>
            )}

            {/* Battle Type */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-slate-300">نوع المعركة</Label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'فردي' as BattleMode, label: 'فردي', icon: Swords, desc: 'كل مقاتل لنفسه', color: 'border-amber-500/40 bg-amber-500/10 text-amber-400', glow: 'shadow-amber-500/10' },
                  { value: 'فرق' as BattleMode, label: 'فرق', icon: UsersRound, desc: 'فريق ضد فريق', color: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400', glow: 'shadow-cyan-500/10' },
                ]).map((type) => (
                  <motion.button key={type.value} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setGameSettings({ battleMode: type.value })}
                    className={`p-4 rounded-xl border text-right transition-all ${gameSettings.battleMode === type.value ? type.color + ' shadow-lg ' + type.glow : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                    <type.icon className={`w-6 h-6 mb-2 ${gameSettings.battleMode === type.value ? '' : 'text-slate-500'}`} />
                    <div className="font-bold text-sm text-white">{type.label}</div>
                    <div className="text-xs text-slate-400 mt-1">{type.desc}</div>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Game type */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-slate-300">نوع التحدي</Label>
              <div className="grid grid-cols-2 gap-3">
                {gameTypes.map((type) => (
                  <motion.button key={type.value} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => setGameSettings({ gameType: type.value })}
                    className={`p-4 rounded-xl border text-right transition-all ${gameSettings.gameType === type.value ? 'border-red-500/50 bg-red-500/10 shadow-lg shadow-red-500/5' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                    <type.icon className={`w-6 h-6 mb-2 ${gameSettings.gameType === type.value ? 'text-red-400' : 'text-slate-500'}`} />
                    <div className="font-bold text-sm text-white">{type.label}</div>
                    <div className="text-xs text-slate-400 mt-1">{type.desc}</div>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Passage Type - Only for القراءة المتحررة */}
            <AnimatePresence>
              {gameSettings.gameType === 'قراءة متحررة' && (
                <motion.div
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -10 }}
                  transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="overflow-hidden"
                >
                  <div className="space-y-3 pb-1">
                    <Label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      نوع القطعة
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: 'علمي' as PassageType, label: 'علمي', icon: Microscope, desc: 'اكتشافات وتكنولوجيا', color: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400', glow: 'shadow-cyan-500/10' },
                        { value: 'أدبي' as PassageType, label: 'أدبي', icon: PenTool, desc: 'نصوص تعبيرية', color: 'border-purple-500/40 bg-purple-500/10 text-purple-400', glow: 'shadow-purple-500/10' },
                        { value: 'عشوائي' as PassageType, label: 'عشوائي', icon: Shuffle, desc: 'مزيج متنوع', color: 'border-amber-500/40 bg-amber-500/10 text-amber-400', glow: 'shadow-amber-500/10' },
                      ]).map((pt) => (
                        <motion.button
                          key={pt.value}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setGameSettings({ passageType: pt.value })}
                          className={`p-3 rounded-xl border text-center transition-all ${gameSettings.passageType === pt.value ? pt.color + ' shadow-lg ' + pt.glow : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                        >
                          <pt.icon className={`w-5 h-5 mx-auto mb-1.5 ${gameSettings.passageType === pt.value ? '' : 'text-slate-500'}`} />
                          <div className="font-bold text-xs">{pt.label}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{pt.desc}</div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Difficulty */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-slate-300">مستوى الصعوبة</Label>
              <div className="flex gap-3">
                {difficulties.map((diff) => (
                  <motion.button key={diff.value} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setGameSettings({ difficulty: diff.value })}
                    className={`flex-1 py-3 px-2 rounded-xl border text-center font-bold text-sm transition-all ${gameSettings.difficulty === diff.value ? diff.color + ' shadow-lg ' + diff.glow : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'}`}>
                    {diff.label}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Time */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-slate-300"><Timer className="w-4 h-4 inline ml-1 text-cyan-400" /> وقت الجولة: <span className="text-cyan-400">{gameSettings.timePerRound}</span> دقيقة</Label>
              <div className="flex flex-wrap gap-2">
                {timeOptions.map((opt) => (
                  <Button key={opt.value} size="sm"
                    className={gameSettings.timePerRound === opt.value ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20 rounded-lg' : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white rounded-lg'}
                    onClick={() => setGameSettings({ timePerRound: opt.value })}>
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Rounds */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-slate-300"><RotateCcw className="w-4 h-4 inline ml-1 text-amber-400" /> عدد الجولات: <span className="text-amber-400">{gameSettings.numberOfRounds}</span></Label>
              <Slider value={[gameSettings.numberOfRounds]} min={1} max={20} step={1}
                onValueChange={(v) => {
                  const val = v[0]
                  if ((maxPlayers === 2 && val === 2) || (maxPlayers === 3 && val === 3)) {
                    const next = val < 20 ? val + 1 : val - 1
                    setGameSettings({ numberOfRounds: next })
                  } else { setGameSettings({ numberOfRounds: val }) }
                }} className="w-full" />
              <div className="flex justify-between text-xs text-slate-500">
                <span>1</span>
                <span className="text-amber-400/80">
                  {gameSettings.playerMode === 'open' 
                    ? 'التحقق بعدد اللاعبين هيحصل وقت البداية'
                    : maxPlayers === 2 ? 'لاعبين ما يلعبوش جولتين' : maxPlayers === 3 ? 'ثلاث لاعبين ما يلعبوش ثلاث جولات' : 'كل الأعداد متاحة'}
                </span>
                <span>20</span>
              </div>
            </div>

            {/* Max players / Open mode */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold text-slate-300"><Users className="w-4 h-4 inline ml-1 text-red-400" /> عدد المقاتلين: <span className="text-red-400">{gameSettings.playerMode === 'open' ? 'مفتوح' : gameSettings.maxPlayers}</span></Label>
              
              {/* Player mode toggle */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className={`flex-1 rounded-lg ${gameSettings.playerMode === 'fixed' ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20' : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'}`}
                  onClick={() => setGameSettings({ playerMode: 'fixed', maxPlayers: gameSettings.maxPlayers || 10 })}
                >
                  <Users className="w-3.5 h-3.5 ml-1" /> عدد محدد
                </Button>
                <Button
                  size="sm"
                  className={`flex-1 rounded-lg ${gameSettings.playerMode === 'open' ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-500/20' : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'}`}
                  onClick={() => setGameSettings({ playerMode: 'open', maxPlayers: 0 })}
                >
                  <Globe className="w-3.5 h-3.5 ml-1" /> مفتوح
                </Button>
              </div>

              {/* Fixed mode slider */}
              {gameSettings.playerMode === 'fixed' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <Slider value={[gameSettings.maxPlayers]} min={2} max={20} step={1}
                    onValueChange={(v) => {
                      const newMax = v[0]
                      const roundsConflict = (newMax === 2 && gameSettings.numberOfRounds === 2) || (newMax === 3 && gameSettings.numberOfRounds === 3)
                      if (roundsConflict) {
                        const newRounds = gameSettings.numberOfRounds < 20 ? gameSettings.numberOfRounds + 1 : gameSettings.numberOfRounds - 1
                        setGameSettings({ maxPlayers: newMax, numberOfRounds: newRounds })
                      } else { setGameSettings({ maxPlayers: newMax }) }
                    }} className="w-full" />
                  <div className="flex justify-between text-xs text-slate-500"><span>2</span><span>20</span></div>
                </motion.div>
              )}

              {/* Open mode info */}
              {gameSettings.playerMode === 'open' && (
                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <p className="text-sm text-amber-300 font-medium">🌍 الساحة مفتوحة</p>
                  <p className="text-xs text-slate-400 mt-1">أي عدد ممكن يدخل وانت اللي بتحدد امتى تبدأ المعركة</p>
                </motion.div>
              )}
            </div>

            <div className="border-t border-white/5 pt-4">
              <Button size="lg" className="w-full text-lg py-7 btn-battle rounded-xl"
                onClick={handleCreate} disabled={!effectiveName || isLoading}>
                {isLoading ? (<><Loader2 className="w-5 h-5 ml-2 animate-spin" />جاري تجهيز الساحة...</>) : (<><Swords className="w-5 h-5 ml-2" />أنشئ الساحة<ArrowRight className="w-5 h-5 mr-2" /></>)}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ============================================
// JOIN GAME SCREEN
// ============================================
function JoinGameScreen() {
  const guest = useGuestStore((s) => s.guest)
  const storedRoomCode = useGameStore((s) => s.roomCode)
  const [name, setName] = useState('')
  const [code, setCode] = useState(storedRoomCode || '')
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState<RoomInfo | null>(null)
  const [dialogPassword, setDialogPassword] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const setScreen = useGameStore((s) => s.setScreen)
  const isLoading = useGameStore((s) => s.isLoading)
  const publicRooms = useGameStore((s) => s.publicRooms)
  const { joinGame, setupSocketListeners } = useGameSocket()

  // Connect to socket and request public rooms when this screen opens
  useEffect(() => {
    // Always ensure we have a connected socket for browsing
    ensureSocketConnection(setupSocketListeners)

    // Request rooms immediately if connected
    const requestRooms = () => {
      if (globalSocket?.connected) {
        globalSocket.emit('get-public-rooms')
      }
    }

    // Small delay to let socket connect if needed
    const initialTimeout = setTimeout(requestRooms, 500)
    requestRooms()

    // Poll every 3 seconds while on this screen for fresh data
    const interval = setInterval(requestRooms, 3000)

    // Request rooms once socket connects (if it wasn't connected yet)
    const onConnect = () => { requestRooms() }
    if (globalSocket) {
      globalSocket.on('connect', onConnect)
    }

    // Listen for password error auto-show dialog event
    const onShowPasswordDialog = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.roomCode) {
        setSelectedRoom({ roomCode: detail.roomCode, roomType: 'خاصة', hasPassword: true, hostName: '', playerCount: 0, maxPlayers: 0, settings: { gameType: 'قراءة متحررة', difficulty: 'متوسط', timePerRound: 15, numberOfRounds: 3, maxPlayers: 10, playerMode: 'fixed', passageType: 'عشوائي', battleMode: 'فردي' }, status: 'waiting' })
        setDialogPassword('')
        setShowPasswordDialog(true)
      }
    }
    window.addEventListener('show-password-dialog', onShowPasswordDialog)

    return () => {
      clearTimeout(initialTimeout)
      clearInterval(interval)
      if (globalSocket) {
        globalSocket.off('connect', onConnect)
      }
      window.removeEventListener('show-password-dialog', onShowPasswordDialog)
    }
  }, [setupSocketListeners])

  // Auto-fill name from guest identity
  const effectiveJoinName = name || guest?.displayName || ''

  const handleJoinByCode = () => {
    if (!effectiveJoinName.trim() || !code.trim()) return
    joinGame(code.trim(), effectiveJoinName.trim())
  }

  const handleJoinFromList = (room: RoomInfo) => {
    if (!effectiveJoinName.trim()) return
    if (room.hasPassword) {
      setSelectedRoom(room)
      setDialogPassword('')
      setShowPasswordDialog(true)
    } else {
      joinGame(room.roomCode, effectiveJoinName.trim())
    }
  }

  const handleDialogJoin = () => {
    if (selectedRoom) {
      joinGame(selectedRoom.roomCode, effectiveJoinName.trim(), dialogPassword.trim() || undefined)
      setShowPasswordDialog(false)
      setSelectedRoom(null)
      setDialogPassword('')
    }
  }

  const handleRefresh = () => {
    setIsRefreshing(true)
    if (globalSocket?.connected) {
      globalSocket.emit('get-public-rooms')
    }
    setTimeout(() => setIsRefreshing(false), 1000)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <BattleBackground />

      <motion.div initial="initial" animate="animate" exit="exit" variants={pageVariants} transition={{ duration: 0.5 }} className="w-full max-w-lg relative z-10">
        <Button variant="ghost" className="mb-4 -mr-2 text-slate-400 hover:text-white hover:bg-white/5" onClick={() => setScreen('home')}>
          <ChevronLeft className="w-4 h-4 ml-1" /> رجوع
        </Button>

        <div className="battle-card-glow rounded-2xl overflow-hidden">
          <div className="p-6 text-center border-b border-white/5">
            <div className="w-16 h-16 mx-auto mb-3 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center glow-gold">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-black text-white">انضم لساحة</h2>
            <p className="text-sm text-slate-400 mt-1">اختار ساحة عامة أو انضم بكود</p>
          </div>

          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-300">اسمك في المعركة</Label>
              <div className="relative">
                <Input value={name || guest?.displayName || ''} onChange={(e) => setName(e.target.value)} placeholder={guest?.displayName || 'اكتب اسمك هنا...'} className="battle-input rounded-xl text-right text-lg h-12 pr-4 pl-12" maxLength={20} />
                <button
                  type="button"
                  onClick={() => useGuestStore.getState().setShowEditModal(true)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-amber-400 hover:border-amber-500/30 transition-all flex items-center justify-center"
                  title="غيّر اسمك"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
              </div>
            </div>

            <Tabs defaultValue="public">
              <TabsList className="w-full bg-white/5 border border-white/10 rounded-xl h-12">
                <TabsTrigger value="public" className="flex-1 rounded-lg data-[state=active]:bg-red-600/20 data-[state=active]:text-red-400 text-slate-400 h-10">
                  <Globe className="w-4 h-4 ml-1" /> الساحات العامة
                </TabsTrigger>
                <TabsTrigger value="code" className="flex-1 rounded-lg data-[state=active]:bg-red-600/20 data-[state=active]:text-red-400 text-slate-400 h-10">
                  <Hash className="w-4 h-4 ml-1" /> انضم بكود
                </TabsTrigger>
              </TabsList>

              <TabsContent value="public" className="mt-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-500">{publicRooms.length} ساحة متاحة</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-400 hover:text-white" onClick={handleRefresh}>
                    <RefreshCw className={`w-3.5 h-3.5 ml-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                    تحديث
                  </Button>
                </div>
                {publicRooms.length === 0 ? (
                  <div className="text-center py-10">
                    <Globe className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                    <p className="text-slate-400">مفيش ساحات عامة متاحة حالياً</p>
                    <p className="text-xs text-slate-500 mt-1">أنشئ ساحة جديدة أو انضم بكود</p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-80">
                    <div className="space-y-3">
                      {publicRooms.map((room, i) => (
                        <motion.div key={room.roomCode} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                          className="p-4 rounded-xl border border-white/10 bg-white/5 hover:border-red-500/30 hover:bg-red-500/5 transition-all cursor-pointer"
                          onClick={() => handleJoinFromList(room)}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-red-400 text-lg">{room.roomCode}</span>
                              {room.hasPassword && <Lock className="w-4 h-4 text-amber-400" />}
                            </div>
                            <Button size="sm" className="btn-battle rounded-lg text-xs px-4"
                              disabled={!effectiveJoinName.trim() || isLoading}>ادخل</Button>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                            <span className="flex items-center gap-1"><Swords className="w-3 h-3" />{room.hostName}</span>
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{room.maxPlayers === 0 ? `${room.playerCount} مفتوح` : `${room.playerCount}/${room.maxPlayers}`}</span>
                            <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{room.settings?.gameType}{room.settings?.gameType === 'قراءة متحررة' && room.settings?.passageType ? ` • ${room.settings.passageType}` : ''}</span>
                            <span className="flex items-center gap-1"><Star className="w-3 h-3" />{room.settings?.difficulty}</span>
                            <span className="flex items-center gap-1"><RotateCcw className="w-3 h-3" />{room.settings?.numberOfRounds} جولات</span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>

              <TabsContent value="code" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-300">كود الساحة</Label>
                  <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="مثال: ABC123" className="battle-input rounded-xl text-center text-2xl font-mono tracking-widest h-14" maxLength={6} />
                </div>

                <Button size="lg" className="w-full text-lg py-7 btn-battle rounded-xl"
                  onClick={handleJoinByCode} disabled={!effectiveJoinName.trim() || !code.trim() || isLoading}>
                  {isLoading ? (<><Loader2 className="w-5 h-5 ml-2 animate-spin" />جاري الدخول...</>) : (<><Shield className="w-5 h-5 ml-2" />ادخل الساحة<ArrowRight className="w-5 h-5 mr-2" /></>)}
                </Button>

                <p className="text-xs text-slate-500 text-center">
                  لو الساحة عليها كلمة سر، هتظهرلك نافذة تدخلها
                </p>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Password dialog - single unified entry point for passwords */}
        <AlertDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
          <AlertDialogContent className="battle-card-glow">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-400" />
                الساحة محمية بكلمة سر
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-400">
                الساحة دي محمية. ادخل كلمة السر عشان تنضم.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={dialogPassword}
              onChange={(e) => setDialogPassword(e.target.value)}
              placeholder="كلمة السر"
              className="battle-input rounded-xl text-right"
              type="text"
              maxLength={30}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleDialogJoin() }}
            />
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10" onClick={() => { setSelectedRoom(null); setDialogPassword('') }}>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={handleDialogJoin} className="btn-battle" disabled={!dialogPassword.trim()}>ادخل</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </motion.div>
    </div>
  )
}

// ============================================
// EDIT SETTINGS MODAL
// Host can edit room settings in lobby & between rounds
// ============================================
function EditSettingsModal({
  open,
  onClose,
  settings,
  onSave,
  currentPlayers,
  isOpen,
  isMidGame = false,
}: {
  open: boolean
  onClose: () => void
  settings: GameSettings
  onSave: (settings: Partial<GameSettings>) => void
  currentPlayers: number
  isOpen: boolean
  isMidGame?: boolean
}) {
  const [localSettings, setLocalSettings] = useState({ ...settings })

  useEffect(() => {
    if (open) queueMicrotask(() => setLocalSettings({ ...settings }))
  }, [open, settings])

  const difficulties: { value: Difficulty; label: string; color: string }[] = [
    { value: 'سهل', label: 'سهل', color: 'border-green-500/40 bg-green-500/10 text-green-400' },
    { value: 'متوسط', label: 'متوسط', color: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
    { value: 'صعب', label: 'صعب', color: 'border-red-500/40 bg-red-500/10 text-red-400' },
  ]

  const timeOptions = [
    { value: 5, label: '5 د' }, { value: 7, label: '7 د' }, { value: 10, label: '10 د' },
    { value: 15, label: '15 د' }, { value: 20, label: '20 د' }, { value: 25, label: '25 د' },
  ]

  const handleSave = () => {
    const changes: Partial<GameSettings> = {}
    let hasChanges = false

    for (const [key, value] of Object.entries(localSettings)) {
      if (settings[key as keyof GameSettings] !== value) {
        ;(changes as any)[key] = value
        hasChanges = true
      }
    }

    if (hasChanges) onSave(changes)
    onClose()
  }

  const effectivePlayers = isOpen ? currentPlayers : localSettings.maxPlayers
  const roundsConflict = (effectivePlayers === 2 && localSettings.numberOfRounds === 2) ||
    (effectivePlayers === 3 && localSettings.numberOfRounds === 3)

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md max-h-[90vh] overflow-y-auto mx-4 p-6 rounded-2xl bg-[#12121E] border border-white/10 shadow-2xl custom-scrollbar"
          style={{ boxShadow: '0 0 40px rgba(220,38,38,0.15), 0 0 80px rgba(245,158,11,0.08)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-black text-white">تعديل الإعدادات</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>

          {isMidGame && (
            <div className="mb-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300">
              التغييرات هتأثر على الجولات الجاية بس
            </div>
          )}

          <div className="space-y-5">
            {/* Difficulty */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-300">الصعوبة</Label>
              <div className="flex gap-2">
                {difficulties.map((diff) => (
                  <Button key={diff.value} size="sm"
                    className={`flex-1 rounded-lg ${localSettings.difficulty === diff.value ? diff.color + ' shadow-lg' : 'bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10'}`}
                    onClick={() => setLocalSettings({ ...localSettings, difficulty: diff.value })}>
                    {diff.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Passage Type - Only for القراءة المتحررة */}
            <AnimatePresence>
              {localSettings.gameType === 'قراءة متحررة' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 pb-1">
                    <Label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      نوع القطعة
                    </Label>
                    <div className="flex gap-2">
                      {([
                        { value: 'علمي' as PassageType, label: 'علمي', icon: Microscope, color: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400' },
                        { value: 'أدبي' as PassageType, label: 'أدبي', icon: PenTool, color: 'border-purple-500/40 bg-purple-500/10 text-purple-400' },
                        { value: 'عشوائي' as PassageType, label: 'عشوائي', icon: Shuffle, color: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
                      ]).map((pt) => (
                        <Button key={pt.value} size="sm"
                          className={`flex-1 rounded-lg ${localSettings.passageType === pt.value ? pt.color + ' shadow-lg' : 'bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10'}`}
                          onClick={() => setLocalSettings({ ...localSettings, passageType: pt.value })}>
                          <pt.icon className="w-3.5 h-3.5 ml-1" />{pt.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Time per round */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-300">وقت الجولة: <span className="text-cyan-400">{localSettings.timePerRound}</span> دقيقة</Label>
              <div className="flex flex-wrap gap-2">
                {timeOptions.map((opt) => (
                  <Button key={opt.value} size="sm"
                    className={`rounded-lg ${localSettings.timePerRound === opt.value ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20' : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'}`}
                    onClick={() => setLocalSettings({ ...localSettings, timePerRound: opt.value })}>
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Number of rounds */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-300">عدد الجولات: <span className="text-amber-400">{localSettings.numberOfRounds}</span></Label>
              <Slider value={[localSettings.numberOfRounds]} min={1} max={20} step={1}
                onValueChange={(v) => {
                  const val = v[0]
                  const effectiveP = isOpen ? currentPlayers : localSettings.maxPlayers
                  if ((effectiveP === 2 && val === 2) || (effectiveP === 3 && val === 3)) {
                    const next = val < 20 ? val + 1 : val - 1
                    setLocalSettings({ ...localSettings, numberOfRounds: next })
                  } else {
                    setLocalSettings({ ...localSettings, numberOfRounds: val })
                  }
                }} className="w-full" />
              <div className="flex justify-between text-xs text-slate-500">
                <span>1</span>
                <span className={roundsConflict ? 'text-red-400' : 'text-amber-400/80'}>
                  {roundsConflict ? 'العدد ده مش مسموح!' : 'كل الأعداد متاحة'}
                </span>
                <span>20</span>
              </div>
            </div>

            {/* Player mode - only in lobby (not mid-game) */}
            {!isMidGame && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-300">نوع الساحة</Label>
                <div className="flex gap-2">
                  <Button size="sm"
                    className={`flex-1 rounded-lg ${localSettings.playerMode === 'fixed' ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20' : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'}`}
                    onClick={() => setLocalSettings({ ...localSettings, playerMode: 'fixed', maxPlayers: localSettings.maxPlayers || 10 })}>
                    <Users className="w-3.5 h-3.5 ml-1" /> عدد محدد
                  </Button>
                  <Button size="sm"
                    className={`flex-1 rounded-lg ${localSettings.playerMode === 'open' ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-500/20' : 'bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10'}`}
                    onClick={() => setLocalSettings({ ...localSettings, playerMode: 'open', maxPlayers: 0 })}>
                    <Globe className="w-3.5 h-3.5 ml-1" /> مفتوح
                  </Button>
                </div>

                {localSettings.playerMode === 'fixed' && (
                  <div className="space-y-1">
                    <Slider value={[localSettings.maxPlayers]} min={2} max={20} step={1}
                      onValueChange={(v) => {
                        const newMax = v[0]
                        const conflict = (newMax === 2 && localSettings.numberOfRounds === 2) || (newMax === 3 && localSettings.numberOfRounds === 3)
                        if (conflict) {
                          const newRounds = localSettings.numberOfRounds < 20 ? localSettings.numberOfRounds + 1 : localSettings.numberOfRounds - 1
                          setLocalSettings({ ...localSettings, maxPlayers: newMax, numberOfRounds: newRounds })
                        } else { setLocalSettings({ ...localSettings, maxPlayers: newMax }) }
                      }} className="w-full" />
                    <div className="flex justify-between text-xs text-slate-500"><span>2</span><span>{localSettings.maxPlayers}</span><span>20</span></div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-6">
            <Button onClick={handleSave} disabled={roundsConflict}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold border-0 disabled:opacity-50">
              حفظ التعديلات
            </Button>
            <Button variant="ghost" onClick={onClose}
              className="px-6 py-3 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5">
              إلغاء
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ============================================
// EARLY END GAME CONFIRMATION MODAL
// Cinematic, dramatic, competitive gaming UI
// ============================================
function EarlyEndConfirmModal({
  open,
  onClose,
  onConfirm,
  currentRound,
  totalRounds,
  isProcessing,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  currentRound: number
  totalRounds: number
  isProcessing: boolean
}) {
  const [phase, setPhase] = useState<'idle' | 'warning' | 'ready'>('idle')
  const [shakeCount, setShakeCount] = useState(0)

  useEffect(() => {
    if (open) {
      setPhase('idle')
      setShakeCount(0)
      // Staggered reveal phases
      const t1 = setTimeout(() => setPhase('warning'), 300)
      const t2 = setTimeout(() => setPhase('ready'), 800)
      // Subtle screen shake effect
      const shakeInterval = setInterval(() => {
        setShakeCount(prev => prev + 1)
      }, 600)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
        clearInterval(shakeInterval)
      }
    }
  }, [open])

  if (!open) return null

  const completedRounds = currentRound + 1
  const remainingRounds = totalRounds - completedRounds

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md"
        onClick={onClose}
      >
        {/* Background dramatic glow */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{
            background: [
              'radial-gradient(circle at center, rgba(220,38,38,0.08) 0%, transparent 50%)',
              'radial-gradient(circle at center, rgba(220,38,38,0.15) 0%, transparent 50%)',
              'radial-gradient(circle at center, rgba(220,38,38,0.08) 0%, transparent 50%)',
            ],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Floating embers */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={`ember-${i}`}
            className="absolute w-1 h-1 rounded-full bg-red-500"
            style={{
              boxShadow: '0 0 6px rgba(220,38,38,0.8), 0 0 12px rgba(220,38,38,0.4)',
              left: `${20 + Math.random() * 60}%`,
              top: `${20 + Math.random() * 60}%`,
            }}
            animate={{
              y: [0, -40, -80],
              opacity: [0, 0.8, 0],
              scale: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 2 + Math.random(),
              delay: i * 0.3,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          />
        ))}

        <motion.div
          initial={{ opacity: 0, scale: 0.7, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{ type: 'spring', stiffness: 250, damping: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md mx-4 rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #1A0A0A 0%, #120818 50%, #0A0A12 100%)',
            boxShadow: '0 0 60px rgba(220,38,38,0.3), 0 0 120px rgba(220,38,38,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
            border: '1px solid rgba(220,38,38,0.3)',
          }}
        >
          {/* Top accent line */}
          <div className="h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent" />

          <div className="p-6 sm:p-8 text-center">
            {/* Dramatic icon */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: phase === 'warning' || phase === 'ready' ? 1 : 0, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
              className="mx-auto mb-6 w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                background: 'radial-gradient(circle, rgba(220,38,38,0.2) 0%, rgba(220,38,38,0.05) 70%)',
                border: '2px solid rgba(220,38,38,0.4)',
                boxShadow: '0 0 30px rgba(220,38,38,0.3), inset 0 0 20px rgba(220,38,38,0.1)',
              }}
            >
              <ShieldAlert className="w-10 h-10 text-red-400" />
            </motion.div>

            {/* Title */}
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: phase === 'warning' || phase === 'ready' ? 1 : 0, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-2xl sm:text-3xl font-black text-white mb-2"
              style={{ textShadow: '0 0 20px rgba(220,38,38,0.4)' }}
            >
              إنهاء المعركة؟
            </motion.h2>

            {/* Warning message */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: phase === 'ready' ? 1 : 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mb-6"
            >
              <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 mb-4">
                <p className="text-red-300 text-sm leading-relaxed font-medium">
                  هل تريد إنهاء المعركة الآن؟
                </p>
                <p className="text-red-400/80 text-xs mt-2">
                  سيتم اعتماد النتائج الحالية بشكل نهائي
                </p>
              </div>

              {/* Round info */}
              <div className="flex items-center justify-center gap-3 mb-3">
                <Badge className="bg-red-500/10 text-red-400 border border-red-500/30 text-xs">
                  <Swords className="w-3 h-3 ml-1" />
                  اتعملت {completedRounds} جولات
                </Badge>
                <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs">
                  <RotateCcw className="w-3 h-3 ml-1" />
                  متبقي {remainingRounds} جولات
                </Badge>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-amber-400/70">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="text-xs">الإجراء ده نهائي ومش هيترجع</span>
              </div>
            </motion.div>

            {/* Action buttons */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: phase === 'ready' ? 1 : 0, y: 0 }}
              transition={{ duration: 0.4 }}
              className="flex gap-3"
            >
              <Button
                variant="ghost"
                onClick={onClose}
                disabled={isProcessing}
                className="flex-1 py-3 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white transition-all"
              >
                إلغاء
              </Button>
              <Button
                onClick={onConfirm}
                disabled={isProcessing}
                className="flex-1 py-3 rounded-xl font-bold border-0 transition-all relative overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
                  boxShadow: '0 0 20px rgba(220,38,38,0.3), 0 4px 15px rgba(220,38,38,0.2)',
                }}
              >
                {isProcessing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جاري الإنهاء...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4" />
                    إنهاء المعركة
                  </span>
                )}
              </Button>
            </motion.div>
          </div>

          {/* Bottom accent line */}
          <div className="h-0.5 bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ============================================
// APPROVAL TIMER COMPONENT
// ============================================
function ApprovalTimer({ expiresAt }: { expiresAt: number }) {
  const [timeLeft, setTimeLeft] = useState(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)))
  
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining <= 0) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])
  
  const percentage = Math.max(0, (timeLeft / 40) * 100)
  const isUrgent = timeLeft <= 10
  
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className={isUrgent ? 'text-red-400 font-bold animate-pulse' : 'text-slate-500'}>
          {isUrgent ? '⚠️' : ''} {timeLeft} ثانية
        </span>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? 'bg-red-500' : 'bg-amber-500'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

// ============================================
// JOIN REQUEST CARD COMPONENT
// ============================================
function JoinRequestCard({ request, onApprove, onReject }: { request: JoinRequestState; onApprove: () => void; onReject: () => void }) {
  const teams = useGameStore((s) => s.teams)
  const [timeLeft, setTimeLeft] = useState(Math.max(0, Math.floor((request.expiresAt - Date.now()) / 1000)))

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((request.expiresAt - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining <= 0) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [request.expiresAt])

  const percentage = Math.max(0, (timeLeft / 40) * 100)
  const isUrgent = timeLeft <= 10
  const isRedTeam = request.targetTeamId === 'A'

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-2.5 rounded-lg bg-white/5 border border-white/10"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${isRedTeam ? 'bg-red-500' : 'bg-sky-500'}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-white truncate font-medium">{request.playerName}</span>
              <span className="text-[10px] text-slate-500">
                {request.type === 'join' ? '📩 انضمام' : '🔄 تبديل'}
              </span>
            </div>
            <span className={`text-[10px] ${isRedTeam ? 'text-red-400' : 'text-sky-400'}`}>
              → {isRedTeam ? (teams?.teamA.customName || 'الفريق الأحمر') : (teams?.teamB.customName || 'الفريق الأزرق')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="icon"
            className="w-7 h-7 bg-green-600 hover:bg-green-700 text-white rounded-lg"
            onClick={onApprove}
            title="قبول"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            className="w-7 h-7 bg-red-600 hover:bg-red-700 text-white rounded-lg"
            onClick={onReject}
            title="رفض"
          >
            <XCircle className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {/* Countdown timer bar */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className={isUrgent ? 'text-red-400 font-bold animate-pulse' : 'text-slate-500'}>
            {isUrgent ? '⚠️' : ''} {timeLeft} ثانية
          </span>
        </div>
        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${isUrgent ? 'bg-red-500' : 'bg-amber-500'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </motion.div>
  )
}

// ============================================
// LOBBY SCREEN (ARENA)
// ============================================
function LobbyScreen() {
  const players = useGameStore((s) => s.players)
  const roomCode = useGameStore((s) => s.roomCode)
  const roomType = useGameStore((s) => s.roomType)
  const roomPassword = useGameStore((s) => s.roomPassword)
  const isHost = useGameStore((s) => s.isHost)
  const gameSettings = useGameStore((s) => s.gameSettings)
  const maxPlayers = useGameStore((s) => s.gameSettings.maxPlayers)
  const playerMode = useGameStore((s) => s.gameSettings.playerMode)
  const playerName = useGameStore((s) => s.playerName)
  const setGameSettings = useGameStore((s) => s.setGameSettings)
  const [copied, setCopied] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showEditSettings, setShowEditSettings] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [speakingParticipants, setSpeakingParticipants] = useState<string[]>([])
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [teamChatInput, setTeamChatInput] = useState('')
  const battleMode = useGameStore((s) => s.battleMode)
  const teams = useGameStore((s) => s.teams)
  const myTeamId = useGameStore((s) => s.myTeamId)
  const isCaptain = useGameStore((s) => s.isCaptain)
  const voiceMerged = useGameStore((s) => s.voiceMerged)
  const pendingApproval = useGameStore((s) => s.pendingApproval)
  const setPendingApproval = useGameStore((s) => s.setPendingApproval)
  const chatMessages = useGameStore((s) => s.chatMessages)
  const chatMode = useGameStore((s) => s.chatMode)
  const setChatMode = useGameStore((s) => s.setChatMode)
  const pendingJoinRequests = useGameStore((s) => s.pendingJoinRequests)
  const myJoinRequest = useGameStore((s) => s.myJoinRequest)
  const { startGame, leaveAndDisconnect } = useGameSocket()
  const resetGame = useGameStore((s) => s.resetGame)
  const [renamingTeam, setRenamingTeam] = useState<TeamId | null>(null)
  const [renameInput, setRenameInput] = useState('')

  const handleRenameTeam = useCallback((teamId: TeamId) => {
    if (!globalSocket || !renameInput.trim()) return
    globalSocket.emit('rename-team', { teamId, newName: renameInput.trim() })
    setRenamingTeam(null)
    setRenameInput('')
  }, [renameInput])

  // Force unassigned players to global chat mode
  useEffect(() => {
    if (battleMode === 'فرق' && myTeamId === null && chatMode === 'team') {
      setChatMode('global')
    }
  }, [battleMode, myTeamId, chatMode, setChatMode])

  const isOpen = playerMode === 'open' || maxPlayers === 0

  // Validation for start button (round-player conflict)
  const activePlayers = players.length

  // Dynamic invite system: can invite if room is not full
  // Open rooms: always can invite (no capacity limit)
  // Fixed rooms: can invite only when current players < maxPlayers
  const canInvite = isOpen || activePlayers < maxPlayers

  // Notify when room becomes full (toast, no interruption)
  const prevCanInviteRef = useRef(true)
  useEffect(() => {
    if (prevCanInviteRef.current && !canInvite) {
      // Room just became full
      battleToast('room_full', 'الساحة اكتملت', 'تم إيقاف الدعوات مؤقتًا')
    }
    if (!prevCanInviteRef.current && canInvite) {
      // Room is no longer full (player left/disconnected)
      battleToast('room_open', 'باب الساحة فتح!', 'يمكنك دعوة مقاتلين جدد')
    }
    prevCanInviteRef.current = canInvite
  }, [canInvite])

  // Team mode: need at least 1 player per team
  const teamStartError = battleMode === 'فرق' && teams 
    ? ((teams.unassignedPlayerIds || []).length > 0
      ? `يوجد ${(teams.unassignedPlayerIds || []).length} لاعب غير مصنف. يجب أن ينضموا لفريق أولاً.`
      : teams.teamA.playerIds.length === 0 
      ? `${teams.teamA.customName || 'الفريق الأحمر'} لازم يكون فيه مقاتل واحد على الأقل`
      : teams.teamB.playerIds.length === 0 
      ? `${teams.teamB.customName || 'الفريق الأزرق'} لازم يكون فيه مقاتل واحد على الأقل`
      : '')
    : ''

  const startDisabled = activePlayers < 2 ||
    (activePlayers === 2 && gameSettings.numberOfRounds === 2) ||
    (activePlayers === 3 && gameSettings.numberOfRounds === 3) ||
    !!teamStartError
  const startValidationError = teamStartError
    || (activePlayers < 2
    ? 'لازم يكون لاعبين على الأقل'
    : activePlayers === 2 && gameSettings.numberOfRounds === 2
      ? 'لاعبين ما يلعبوش جولتين'
      : activePlayers === 3 && gameSettings.numberOfRounds === 3
        ? 'ثلاث لاعبين ما يلعبوش ثلاث جولات'
        : '')

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(roomCode); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* */ }
  }

  const handleLeave = () => { leaveAndDisconnect(); resetGame() }

  const handleSwitchTeam = useCallback((teamId: TeamId) => {
    if (!globalSocket) return
    globalSocket.emit('switch-team', { teamId })
  }, [])

  // Request to join a team (for unassigned players)
  const handleRequestJoinTeam = useCallback((targetTeamId: TeamId) => {
    if (!globalSocket) return
    globalSocket.emit('request-join-team', { targetTeamId })
  }, [])

  // Respond to a join request (for captains)
  const handleJoinRequestResponse = useCallback((requestId: string, approved: boolean) => {
    if (!globalSocket) return
    globalSocket.emit('join-team-response', { requestId, approved })
  }, [])

  const handleApprovalResponse = useCallback((approvalId: string, approved: boolean) => {
    if (!globalSocket) return
    globalSocket.emit('captain-approval-response', { approvalId, approved })
    setPendingApproval(null)
  }, [setPendingApproval])

  const handleStartWithCountdown = () => {
    setCountdown(3)
  }

  // Send settings update to server (host/captain only)
  const handleUpdateSettings = useCallback((newSettings: Partial<typeof gameSettings>) => {
    if (!globalSocket) return
    
    // In team mode, captains need approval for settings changes
    if (battleMode === 'فرق' && isCaptain) {
      const changeLabels: Record<string, string> = {
        gameType: 'نوع اللعبة',
        difficulty: 'الصعوبة',
        timePerRound: 'وقت الجولة',
        numberOfRounds: 'عدد الجولات',
        maxPlayers: 'عدد اللاعبين',
        playerMode: 'نوع الساحة',
        passageType: 'نوع القطعة',
      }
      const changesDesc = Object.keys(newSettings).map(k => changeLabels[k] || k).join('، ')
      
      globalSocket.emit('captain-approval-request', {
        type: 'settings',
        description: `طلب تعديل: ${changesDesc}`,
        data: newSettings,
      })
      return
    }
    
    // Solo mode - host can change directly
    if (!isHost) return
    globalSocket.emit('update-settings', { settings: newSettings, roomCode })
  }, [isHost, isCaptain, battleMode, roomCode])

  // Listen for settings-updated from server
  useEffect(() => {
    if (!globalSocket) return
    const handler = (data: { settings: typeof gameSettings; updatedBy: string; changes: string[] }) => {
      setGameSettings(data.settings)
      if (data.changes.length > 0) {
        const changeLabels: Record<string, string> = {
          gameType: 'نوع اللعبة',
          difficulty: 'الصعوبة',
          timePerRound: 'وقت الجولة',
          numberOfRounds: 'عدد الجولات',
          maxPlayers: 'عدد اللاعبين',
          playerMode: 'نوع الساحة',
          passageType: 'نوع القطعة',
        }
        const labels = data.changes.map(c => changeLabels[c] || c).join('، ')
        battleToast('settings_updated', 'تم تحديث الإعدادات', `${data.updatedBy} غيّر: ${labels}`)
      }
    }
    globalSocket.on('settings-updated', handler)
    return () => { globalSocket?.off('settings-updated', handler) }
  }, [setGameSettings])

  // Listen for LiveKit speaking state changes
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.identities) {
        setSpeakingParticipants(detail.identities)
      }
    }
    window.addEventListener('livekit-speaking-change', handler)
    return () => window.removeEventListener('livekit-speaking-change', handler)
  }, [])

  // Listen for LiveKit unread chat count
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.count !== undefined) {
        setUnreadChatCount(detail.count)
      }
    }
    window.addEventListener('livekit-unread-chat', handler)
    return () => window.removeEventListener('livekit-unread-chat', handler)
  }, [])

  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      audioEngine.battleStart()
      startGame()
      setTimeout(() => setCountdown(null), 0)
      return
    }
    audioEngine.countdownBeep(countdown)
    const t = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown, startGame])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-2 sm:p-4 relative overflow-hidden safe-bottom">
      <BattleBackground />

      {/* Countdown overlay */}
      <AnimatePresence>
        {countdown !== null && countdown > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              key={countdown}
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 2, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="text-7xl sm:text-9xl font-black text-red-500 count-bounce"
              style={{ textShadow: '0 0 40px rgba(220,38,38,0.6), 0 0 80px rgba(220,38,38,0.3)' }}
            >
              {countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div initial="initial" animate="animate" exit="exit" variants={pageVariants} transition={{ duration: 0.5 }} className="w-full max-w-lg relative z-10">
        <div className="battle-card-glow rounded-2xl overflow-hidden">
          {/* Arena header */}
          <div className="p-4 sm:p-6 text-center border-b border-white/5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-red-900/10 to-transparent" />
            <div className="relative">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="mx-auto mb-2 sm:mb-3 relative"
              >
                <BattleLogo size="md" />
              </motion.div>
              <h2 className="text-xl sm:text-2xl font-black text-white mb-1.5 sm:mb-2">ساحة الانتظار</h2>

              <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                <Badge className={`${roomType === 'عامة' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'} border text-[11px] sm:text-xs`}>
                  {roomType === 'عامة' ? <Globe className="w-3 h-3 ml-1" /> : <Lock className="w-3 h-3 ml-1" />}{roomType}
                </Badge>
                {roomPassword && <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 border text-[11px] sm:text-xs"><Lock className="w-3 h-3 ml-1" />محمية</Badge>}
              </div>

              {/* Room code + invite actions — responsive redesign */}
              <div className="space-y-2.5">
                {/* Room code — full width, centered */}
                <div className="px-4 sm:px-8 py-2.5 sm:py-3 rounded-xl bg-black/40 border border-red-500/20 inline-block">
                  <span className="font-mono text-xl sm:text-3xl tracking-[0.2em] sm:tracking-[0.3em] font-black text-red-400 text-glow-red">{roomCode}</span>
                </div>

                {/* Invite action buttons — grouped row below code */}
                {canInvite && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="flex items-center justify-center gap-2"
                  >
                    <Button size="sm" variant="outline" onClick={copyCode} className="rounded-xl border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 h-10 px-4 gap-2">
                      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                      <span className="text-xs">{copied ? 'تم النسخ' : 'نسخ الكود'}</span>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowShareModal(true)} className="rounded-xl border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 h-10 px-4 gap-2">
                      <Share2 className="w-4 h-4" />
                      <span className="text-xs">مشاركة</span>
                    </Button>
                  </motion.div>
                )}
              </div>

              {/* Dynamic invite status message */}
              <AnimatePresence mode="wait">
                {canInvite ? (
                  <motion.p
                    key="invite-open"
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="text-xs sm:text-sm text-slate-500 mt-2"
                  >
                    شارك الكود أو الرابط مع المقاتلين
                  </motion.p>
                ) : (
                  <motion.div
                    key="invite-closed"
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="mt-2 flex items-center justify-center gap-2"
                  >
                    <Badge className="bg-green-500/10 text-green-400 border border-green-500/30 text-xs">
                      <Users className="w-3 h-3 ml-1" />
                      الساحة اكتملت
                    </Badge>
                    <span className="text-[11px] sm:text-xs text-slate-500">تم إيقاف الدعوات مؤقتًا</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Settings badges */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center">
              {[
                { icon: BookOpen, text: gameSettings.gameType },
                ...(gameSettings.gameType === 'قراءة متحررة' && gameSettings.passageType ? [{ icon: gameSettings.passageType === 'علمي' ? Microscope : gameSettings.passageType === 'أدبي' ? PenTool : Shuffle, text: gameSettings.passageType }] : []),
                { icon: Star, text: gameSettings.difficulty },
                { icon: Clock, text: `${gameSettings.timePerRound} دقيقة` },
                { icon: RotateCcw, text: `${gameSettings.numberOfRounds} جولات` },
                { icon: isOpen ? Globe : Users, text: isOpen ? `${players.length} مفتوح` : `${players.length}/${maxPlayers}` },
              ].map((badge, i) => (
                <Badge key={i} className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 text-[11px] sm:text-xs">
                  <badge.icon className="w-3 h-3 ml-1" />{badge.text}
                </Badge>
              ))}
            </div>

            {/* Team Mode Lobby */}
            {battleMode === 'فرق' && teams ? (
              <div className="space-y-3 sm:space-y-4">
                {/* Team columns — single column on mobile, 2 cols on sm+ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Team A - Red */}
                  <div className="rounded-xl border-2 border-red-500/30 bg-red-500/5 overflow-hidden">
                    <div className="p-2.5 sm:p-3 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500 shadow-lg shadow-red-500/50" />
                        {renamingTeam === 'A' ? (
                          <div className="flex items-center gap-1 min-w-0 flex-1">
                            <Input
                              value={renameInput}
                              onChange={(e) => setRenameInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameTeam('A')
                                if (e.key === 'Escape') { setRenamingTeam(null); setRenameInput('') }
                              }}
                              placeholder={teams.teamA.customName || 'الفريق الأحمر'}
                              className="h-6 w-full min-w-0 text-xs bg-red-500/10 border-red-500/30 text-red-400 placeholder:text-red-400/40"
                              dir="rtl"
                              autoFocus
                              maxLength={20}
                            />
                            <button onClick={() => handleRenameTeam('A')} className="text-green-400 hover:text-green-300 text-xs shrink-0">✓</button>
                            <button onClick={() => { setRenamingTeam(null); setRenameInput('') }} className="text-red-400/60 hover:text-red-400 text-xs shrink-0">✕</button>
                          </div>
                        ) : (
                          <>
                            <span className="font-bold text-red-400 text-xs sm:text-sm truncate">{teams.teamA.customName || 'الفريق الأحمر'}</span>
                            {isCaptain && myTeamId === 'A' && (
                              <button
                                onClick={() => { setRenamingTeam('A'); setRenameInput(teams.teamA.customName || '') }}
                                className="w-6 h-6 rounded flex items-center justify-center text-red-400/40 hover:text-red-400 hover:bg-red-500/20 transition-all shrink-0"
                                title="غيّر اسم الفريق"
                              >
                                <PenTool className="w-3 h-3" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      <Badge variant="outline" className="border-red-500/30 text-red-400 text-[10px] shrink-0">
                        {teams.teamA.playerIds.length} مقاتل
                      </Badge>
                    </div>
                    <div className="p-1.5 sm:p-2 space-y-1 sm:space-y-1.5 max-h-36 sm:max-h-48 overflow-y-auto custom-scrollbar">
                      {teams.teamA.playerIds.map(playerId => {
                        const p = players.find(pl => pl.id === playerId)
                        if (!p) return null
                        const isTeamCaptain = teams.teamA.captainId === p.id
                        const isMe = p.id === globalSocket?.id
                        return (
                          <div key={p.id} className={`flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg ${isMe ? 'bg-red-500/10 border border-red-500/20' : 'bg-white/5'}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 sm:gap-1.5">
                                {isTeamCaptain && <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 shrink-0" />}
                                <span className="text-xs sm:text-sm text-white truncate">{p.name}</span>
                                {isMe && <span className="text-[9px] sm:text-[10px] text-red-400">(أنت)</span>}
                              </div>
                              {isTeamCaptain && <span className="text-[9px] sm:text-[10px] text-amber-400/80">قائد الفريق</span>}
                            </div>
                            {p.isReady && <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-400 shrink-0" />}
                          </div>
                        )
                      })}
                      {teams.teamA.playerIds.length === 0 && (
                        <div className="text-center text-[11px] sm:text-xs text-slate-500 py-3 sm:py-4">لا يوجد مقاتلين</div>
                      )}
                    </div>
                    {/* Request to join/switch to Team A */}
                    {myTeamId !== 'A' && myTeamId !== null && (
                      <div className="p-2 border-t border-red-500/10">
                        {myJoinRequest && myJoinRequest.targetTeamId === 'A' ? (
                          <div className="text-center py-1.5 text-[11px] text-amber-400/80 animate-pulse">
                            <Hourglass className="w-3 h-3 inline ml-1" />
                            طلبك قيد المراجعة...
                          </div>
                        ) : myJoinRequest ? (
                          <Button size="sm" variant="ghost" className="w-full text-red-400/40 hover:text-red-400/40 hover:bg-transparent text-xs cursor-not-allowed" disabled>
                            <ArrowLeftRight className="w-3 h-3 ml-1" /> طلب الانتقال
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs"
                            onClick={() => handleSwitchTeam('A')}>
                            <ArrowLeftRight className="w-3 h-3 ml-1" /> طلب الانتقال
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Team B - Blue */}
                  <div className="rounded-xl border-2 border-sky-500/30 bg-sky-500/5 overflow-hidden">
                    <div className="p-2.5 sm:p-3 bg-sky-500/10 border-b border-sky-500/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-sky-500 shadow-lg shadow-sky-500/50" />
                        {renamingTeam === 'B' ? (
                          <div className="flex items-center gap-1 min-w-0 flex-1">
                            <Input
                              value={renameInput}
                              onChange={(e) => setRenameInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameTeam('B')
                                if (e.key === 'Escape') { setRenamingTeam(null); setRenameInput('') }
                              }}
                              placeholder={teams.teamB.customName || 'الفريق الأزرق'}
                              className="h-6 w-full min-w-0 text-xs bg-sky-500/10 border-sky-500/30 text-sky-400 placeholder:text-sky-400/40"
                              dir="rtl"
                              autoFocus
                              maxLength={20}
                            />
                            <button onClick={() => handleRenameTeam('B')} className="text-green-400 hover:text-green-300 text-xs shrink-0">✓</button>
                            <button onClick={() => { setRenamingTeam(null); setRenameInput('') }} className="text-red-400/60 hover:text-red-400 text-xs shrink-0">✕</button>
                          </div>
                        ) : (
                          <>
                            <span className="font-bold text-sky-400 text-xs sm:text-sm truncate">{teams.teamB.customName || 'الفريق الأزرق'}</span>
                            {isCaptain && myTeamId === 'B' && (
                              <button
                                onClick={() => { setRenamingTeam('B'); setRenameInput(teams.teamB.customName || '') }}
                                className="w-6 h-6 rounded flex items-center justify-center text-sky-400/40 hover:text-sky-400 hover:bg-sky-500/20 transition-all shrink-0"
                                title="غيّر اسم الفريق"
                              >
                                <PenTool className="w-3 h-3" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      <Badge variant="outline" className="border-sky-500/30 text-sky-400 text-[10px] shrink-0">
                        {teams.teamB.playerIds.length} مقاتل
                      </Badge>
                    </div>
                    <div className="p-1.5 sm:p-2 space-y-1 sm:space-y-1.5 max-h-36 sm:max-h-48 overflow-y-auto custom-scrollbar">
                      {teams.teamB.playerIds.map(playerId => {
                        const p = players.find(pl => pl.id === playerId)
                        if (!p) return null
                        const isTeamCaptain = teams.teamB.captainId === p.id
                        const isMe = p.id === globalSocket?.id
                        return (
                          <div key={p.id} className={`flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg ${isMe ? 'bg-sky-500/10 border border-sky-500/20' : 'bg-white/5'}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 sm:gap-1.5">
                                {isTeamCaptain && <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 shrink-0" />}
                                <span className="text-xs sm:text-sm text-white truncate">{p.name}</span>
                                {isMe && <span className="text-[9px] sm:text-[10px] text-sky-400">(أنت)</span>}
                              </div>
                              {isTeamCaptain && <span className="text-[9px] sm:text-[10px] text-amber-400/80">قائد الفريق</span>}
                            </div>
                            {p.isReady && <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-400 shrink-0" />}
                          </div>
                        )
                      })}
                      {teams.teamB.playerIds.length === 0 && (
                        <div className="text-center text-[11px] sm:text-xs text-slate-500 py-3 sm:py-4">لا يوجد مقاتلين</div>
                      )}
                    </div>
                    {/* Request to join/switch to Team B */}
                    {myTeamId !== 'B' && myTeamId !== null && (
                      <div className="p-2 border-t border-sky-500/10">
                        {myJoinRequest && myJoinRequest.targetTeamId === 'B' ? (
                          <div className="text-center py-1.5 text-[11px] text-amber-400/80 animate-pulse">
                            <Hourglass className="w-3 h-3 inline ml-1" />
                            طلبك قيد المراجعة...
                          </div>
                        ) : myJoinRequest ? (
                          <Button size="sm" variant="ghost" className="w-full text-sky-400/40 hover:text-sky-400/40 hover:bg-transparent text-xs cursor-not-allowed" disabled>
                            <ArrowLeftRight className="w-3 h-3 ml-1" /> طلب الانتقال
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="w-full text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 text-xs"
                            onClick={() => handleSwitchTeam('B')}>
                            <ArrowLeftRight className="w-3 h-3 ml-1" /> طلب الانتقال
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Unassigned Players Section - always show if there are unassigned players OR if current player is unassigned */}
                {((teams.unassignedPlayerIds && teams.unassignedPlayerIds.length > 0) || myTeamId === null) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border-2 border-slate-500/30 bg-slate-500/5 overflow-hidden"
                  >
                    <div className="p-2.5 sm:p-3 bg-slate-500/10 border-b border-slate-500/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-slate-400 shadow-lg shadow-slate-400/50 animate-pulse" />
                        <span className="font-bold text-slate-400 text-xs sm:text-sm">الغير مصنف</span>
                      </div>
                      <Badge variant="outline" className="border-slate-500/30 text-slate-400 text-[10px]">
                        {(teams.unassignedPlayerIds || []).length} لاعب
                      </Badge>
                    </div>
                    <div className="p-1.5 sm:p-2 space-y-1 sm:space-y-1.5 max-h-28 sm:max-h-32 overflow-y-auto custom-scrollbar">
                      {(teams.unassignedPlayerIds || []).map(playerId => {
                        const p = players.find(pl => pl.id === playerId)
                        if (!p) return null
                        const isMe = p.id === globalSocket?.id
                        return (
                          <div key={p.id} className={`flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg ${isMe ? 'bg-slate-500/10 border border-slate-500/20' : 'bg-white/5'}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 sm:gap-1.5">
                                <UserCog className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 shrink-0" />
                                <span className="text-xs sm:text-sm text-white truncate">{p.name}</span>
                                {isMe && <span className="text-[9px] sm:text-[10px] text-slate-400">(أنت)</span>}
                              </div>
                            </div>
                            {p.isReady && <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-green-400 shrink-0" />}
                          </div>
                        )
                      })}
                      {(teams.unassignedPlayerIds || []).length === 0 && (
                        <div className="text-center text-[11px] sm:text-xs text-slate-500 py-2">لا يوجد لاعبين غير مصنفين</div>
                      )}
                    </div>
                    {/* Join request buttons for unassigned current player */}
                    {myTeamId === null && (
                      <div className="p-2 border-t border-slate-500/10">
                        {myJoinRequest ? (
                          <div className="text-center py-2 text-[11px] sm:text-xs text-amber-400/80 animate-pulse">
                            <Hourglass className="w-3 h-3 sm:w-3.5 sm:h-3.5 inline ml-1" />
                            طلبك قيد المراجعة... (في انتظار موافقة {myJoinRequest.captainName})
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" variant="ghost" className="flex-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 text-[11px] sm:text-xs h-9"
                              onClick={() => handleRequestJoinTeam('A')}>
                              <UserPlus className="w-3 h-3 sm:w-3.5 sm:h-3.5 ml-1" /> {teams.teamA.customName || 'الأحمر'}
                            </Button>
                            <Button size="sm" variant="ghost" className="flex-1 text-sky-400 hover:text-sky-300 hover:bg-sky-500/10 text-[11px] sm:text-xs h-9"
                              onClick={() => handleRequestJoinTeam('B')}>
                              <UserPlus className="w-3 h-3 sm:w-3.5 sm:h-3.5 ml-1" /> {teams.teamB.customName || 'الأزرق'}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Captain Join Requests Panel */}
                {isCaptain && pendingJoinRequests.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border-2 border-amber-500/30 bg-amber-500/5 overflow-hidden"
                  >
                    <div className="p-2.5 sm:p-3 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                        <span className="font-bold text-amber-400 text-xs sm:text-sm">طلبات الانضمام</span>
                      </div>
                      <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px] shrink-0">
                        {pendingJoinRequests.length} طلب
                      </Badge>
                    </div>
                    <div className="p-1.5 sm:p-2 space-y-2 max-h-36 sm:max-h-48 overflow-y-auto custom-scrollbar">
                      {pendingJoinRequests.map(req => (
                        <JoinRequestCard
                          key={req.id}
                          request={req}
                          onApprove={() => handleJoinRequestResponse(req.id, true)}
                          onReject={() => handleJoinRequestResponse(req.id, false)}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Voice merge button (captains only) */}
                {isCaptain && !voiceMerged && (
                  <Button size="sm" variant="outline" className="w-full border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10"
                    onClick={() => { if (globalSocket) globalSocket.emit('voice-merge-request') }}>
                    <Radio className="w-4 h-4 ml-2" /> طلب دمج المحادثة الصوتية
                  </Button>
                )}

                {/* Voice merge status indicator */}
                {voiceMerged && (
                  <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-center">
                    <p className="text-sm text-cyan-400 font-medium">🔊 المحادثة الصوتية مدمجة بين الفريقين</p>
                  </div>
                )}

                {/* Team Chat Section */}
                <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                  <div className="p-2.5 sm:p-3 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-slate-900/50 to-slate-800/30">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                      <span className="text-xs sm:text-sm font-bold text-white">محادثة الفريق</span>
                      {myTeamId === null && (
                        <Badge className="bg-slate-500/20 text-slate-400 border border-slate-500/30 text-[8px] sm:text-[9px]">عالمي فقط</Badge>
                      )}
                    </div>
                    {/* Chat mode selector - unassigned players can only use global */}
                    <div className="flex gap-1">
                      {([
                        ...(myTeamId !== null ? [{ value: 'team' as ChatMode, label: 'فريقي' }] : []),
                        { value: 'global' as ChatMode, label: 'الكل' },
                      ]).map(mode => (
                        <button
                          key={mode.value}
                          onClick={() => setChatMode(mode.value)}
                          className={`px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold transition-all ${
                            chatMode === mode.value
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Chat messages */}
                  <div className="h-28 sm:h-32 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                    {chatMessages
                      .filter(m => chatMode === 'global' ? m.mode === 'global' : m.mode === 'team' && m.teamId === myTeamId)
                      .length === 0 && (
                      <p className="text-center text-slate-500 text-xs py-4">لا توجد رسائل بعد...</p>
                    )}
                    {chatMessages
                      .filter(m => chatMode === 'global' ? m.mode === 'global' : m.mode === 'team' && m.teamId === myTeamId)
                      .map(msg => {
                        const isMe = msg.senderId === globalSocket?.id
                        return (
                          <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <span className="text-[10px] text-slate-500 px-1">
                              {msg.mode === 'global' && <span className="text-cyan-400">🌍 </span>}
                              {msg.senderName}
                            </span>
                            <div className={`max-w-[80%] px-2.5 py-1.5 rounded-lg text-xs ${
                              isMe
                                ? 'bg-amber-500/15 text-amber-100 border border-amber-500/15 rounded-bl-sm'
                                : 'bg-white/10 text-slate-200 border border-white/5 rounded-br-sm'
                            }`}>
                              {msg.content}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                  {/* Chat input */}
                  <div className="p-1.5 sm:p-2 border-t border-white/10 flex gap-1.5">
                    <Input
                      value={teamChatInput}
                      onChange={(e) => setTeamChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && teamChatInput.trim()) {
                          e.preventDefault()
                          if (globalSocket) {
                            if (chatMode === 'team') {
                              globalSocket.emit('team-chat-message', { content: teamChatInput.trim() })
                            } else {
                              globalSocket.emit('global-chat-message', { content: teamChatInput.trim() })
                            }
                          }
                          setTeamChatInput('')
                        }
                      }}
                      placeholder={myTeamId === null ? 'اكتب للجميع...' : chatMode === 'team' ? 'اكتب لفريقك...' : 'اكتب للجميع...'}
                      className="flex-1 h-8 sm:h-9 text-[11px] sm:text-xs bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-500/30"
                      dir="rtl"
                    />
                    <Button
                      size="icon"
                      className="w-8 h-8 sm:w-9 sm:h-9 bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                      disabled={!teamChatInput.trim()}
                      onClick={() => {
                        if (globalSocket && teamChatInput.trim()) {
                          if (chatMode === 'team') {
                            globalSocket.emit('team-chat-message', { content: teamChatInput.trim() })
                          } else {
                            globalSocket.emit('global-chat-message', { content: teamChatInput.trim() })
                          }
                          setTeamChatInput('')
                        }
                      }}
                    >
                      <Send className="w-3 h-3 rotate-180" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
            /* Original solo player list */
            <div className="space-y-2">
              <Label className="text-xs sm:text-sm font-semibold text-slate-300 flex items-center gap-2">
                <Flame className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-400" />
                المقاتلون ({players.length})
              </Label>
              <ScrollArea className="max-h-48 sm:max-h-64">
                <div className="space-y-1.5 sm:space-y-2">
                  {players.map((player, i) => {
                    const playerIdentity = player.name.replace(/\s+/g, '_')
                    const isSpeaking = speakingParticipants.includes(playerIdentity) || speakingParticipants.includes(player.name)
                    const isMuted = usePlayerMuteStore.getState().isPlayerMuted(player.id)
                    const mySocketId = globalSocket?.id
                    const isMe = player.id === mySocketId
                    return (
                    <motion.div
                      key={player.id}
                      initial={{ opacity: 0, x: 30, scale: 0.9 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      transition={{ delay: i * 0.08, type: 'spring', stiffness: 200 }}
                      className={`arena-player flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl ${isSpeaking ? 'ring-1 ring-green-400/30 bg-green-500/5' : ''}`}
                    >
                      {/* Speaking indicator */}
                      {isSpeaking && !isMuted && (
                        <motion.div
                          className="flex items-center gap-0.5"
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 0.8, repeat: Infinity }}
                        >
                          <div className="w-1 h-3 bg-green-400 rounded-full" />
                          <div className="w-1 h-5 bg-green-400 rounded-full" />
                          <div className="w-1 h-4 bg-green-400 rounded-full" />
                          <div className="w-1 h-3 bg-green-400 rounded-full" />
                        </motion.div>
                      )}
                      {isMuted && (
                        <MicOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-400/60 shrink-0" />
                      )}
                      <span className={`font-bold flex-1 text-xs sm:text-sm min-w-0 truncate ${isMuted ? 'text-slate-500' : 'text-white'}`}>{player.name}</span>
                      {player.isHost && (
                        <Badge className="host-badge text-white border-0 text-[10px] sm:text-xs shrink-0">
                          <Crown className="w-3 h-3 ml-1 crown-float" />قائد
                        </Badge>
                      )}
                      {/* Action buttons — not for self */}
                      {!isMe && (
                        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                          {/* Local mute button — available to ALL players */}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full text-slate-500 hover:text-amber-400 hover:bg-amber-400/10 transition-all"
                            onClick={() => usePlayerMuteStore.getState().toggleLocalMute(player.id, player.name)}
                            title={isMuted ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
                          >
                            {isMuted ? <Volume1 className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                          </Button>
                          {/* Host-only: Kick button */}
                          {isHost && !player.isHost && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-all"
                                  title="طرد اللاعب"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-[#12121F] border-white/10 text-white max-w-[calc(100vw-2rem)]" dir="rtl">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-white">طرد {player.name}؟</AlertDialogTitle>
                                  <AlertDialogDescription className="text-slate-400">
                                    هتطرد {player.name} من الساحة. اللاعب المش هيقدر يرجع غير لو دخل من أول وجديد.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter className="flex gap-2">
                                  <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">إلغاء</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-red-600 text-white hover:bg-red-700"
                                    onClick={() => {
                                      if (globalSocket) {
                                        globalSocket.emit('kick-player', { playerId: player.id })
                                        battleToast('kick_sent', 'تم الطرد', `${player.name} تم طرده من الساحة`)
                                      }
                                    }}
                                  >
                                    طرد
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          {/* Host-only: Mute for everyone button */}
                          {isHost && !player.isHost && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full text-slate-500 hover:text-orange-400 hover:bg-orange-400/10 transition-all"
                              onClick={() => {
                                if (globalSocket) {
                                  globalSocket.emit('mute-player', { playerId: player.id })
                                }
                              }}
                              title="كتم الصوت للجميع"
                            >
                              <VolumeX className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </motion.div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
            )}

            {/* Player status */}
            {isOpen ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-2 sm:py-3">
                <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                  <span className="text-amber-300 font-bold text-xs sm:text-sm">الساحة مفتوحة</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 mt-1.5 sm:mt-2">
                  {activePlayers === 0 ? 'لسه محدش دخل...' : activePlayers === 1 ? 'محارب واحد مستني...' : `${activePlayers} لاعبين داخل المعركة`}
                </p>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-1">المضيف يحدد وقت البداية</p>
              </motion.div>
            ) : (
              <>
                {players.length < 2 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-3 sm:py-4">
                    <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-2 animate-spin text-red-500" />
                    <p className="text-xs sm:text-sm text-slate-400">بانتظار مقاتلين آخرين...</p>
                  </motion.div>
                )}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] sm:text-xs text-slate-500">
                    <span>المقاتلون</span>
                    <span>{players.length}/{maxPlayers}</span>
                  </div>
                  <div className="h-1.5 sm:h-2 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(players.length / maxPlayers) * 100}%` }}
                      className="h-full rounded-full battle-progress"
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="border-t border-white/5 pt-3 sm:pt-4 space-y-3">
              {/* Primary actions — Start Battle (host only) or waiting message */}
              {isHost ? (
                <div className="space-y-2">
                  <Button className="w-full btn-battle rounded-xl h-12 sm:h-14 text-base"
                    onClick={handleStartWithCountdown} disabled={startDisabled}
                    title={startValidationError}>
                    <Flame className="w-5 h-5 ml-2" />ابدأ المعركة!
                  </Button>
                  {/* Secondary actions row */}
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/15 hover:text-amber-300 rounded-xl h-10 sm:h-11 text-xs sm:text-sm"
                      onClick={() => setShowEditSettings(true)}>
                      <Zap className="w-4 h-4 ml-1.5" />تعديل الإعدادات
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" className="flex-1 border-white/10 bg-white/5 text-slate-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 rounded-xl h-10 sm:h-11 text-xs sm:text-sm">
                          <LogOut className="w-4 h-4 ml-1.5" />انسحب
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="battle-card-glow max-w-[calc(100vw-2rem)]">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-white">متأكد إنك عايز تنسحب؟</AlertDialogTitle>
                          <AlertDialogDescription className="text-slate-400">لو خرجت مش هتقدر ترجع للساحة دي تاني</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">إلغاء</AlertDialogCancel>
                          <AlertDialogAction onClick={handleLeave} className="btn-battle">انسحب</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-center">
                    <p className="text-xs sm:text-sm text-slate-500">في انتظار القائد يبدأ المعركة...</p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="border-white/10 bg-white/5 text-slate-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 rounded-xl h-10 px-3 text-xs sm:text-sm shrink-0">
                        <LogOut className="w-4 h-4 sm:ml-1.5" /><span className="hidden sm:inline">انسحب</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="battle-card-glow max-w-[calc(100vw-2rem)]">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">متأكد إنك عايز تنسحب؟</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">لو خرجت مش هتقدر ترجع للساحة دي تاني</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">إلغاء</AlertDialogCancel>
                        <AlertDialogAction onClick={handleLeave} className="btn-battle">انسحب</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
      {isHost && startValidationError && activePlayers >= 2 && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-[11px] sm:text-xs text-red-400">{startValidationError}</motion.p>
      )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Share Modal */}
      <ShareModal open={showShareModal} onClose={() => setShowShareModal(false)} />

      {/* Edit Settings Modal */}
      <EditSettingsModal
        open={showEditSettings}
        onClose={() => setShowEditSettings(false)}
        settings={gameSettings}
        onSave={handleUpdateSettings}
        currentPlayers={activePlayers}
        isOpen={isOpen}
      />

      {/* Captain Approval Popup */}
      <AnimatePresence>
      {pendingApproval && (
        <motion.div
          initial={{ opacity: 0, y: 50, x: -20 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: 50, x: -20 }}
          className="fixed bottom-4 left-4 right-4 sm:left-4 sm:right-auto z-50 sm:max-w-sm"
        >
          <div className="battle-card-glow rounded-xl p-3 sm:p-4 border-2 border-amber-500/30 bg-slate-900/95 backdrop-blur-sm">
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-white text-xs sm:text-sm">طلب موافقة</h4>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">{pendingApproval.requestedByName} ({pendingApproval.requestedByTeam === 'A' ? (teams?.teamA.customName || 'الفريق الأحمر') : (teams?.teamB.customName || 'الفريق الأزرق')})</p>
                <p className="text-xs sm:text-sm text-amber-300 mt-1.5 sm:mt-2">{pendingApproval.description}</p>
                {/* Countdown timer */}
                <ApprovalTimer expiresAt={pendingApproval.expiresAt} />
              </div>
            </div>
            <div className="flex gap-2 mt-2.5 sm:mt-3">
              <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 text-white h-9 sm:h-10"
                onClick={() => handleApprovalResponse(pendingApproval.approvalId, true)}>
                ✅ موافقة
              </Button>
              <Button size="sm" variant="outline" className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 h-9 sm:h-10"
                onClick={() => handleApprovalResponse(pendingApproval.approvalId, false)}>
                ❌ رفض
              </Button>
            </div>
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}

// ============================================
// LOADING SCREEN
// ============================================
function LoadingScreen() {
  const currentRound = useGameStore((s) => s.currentRound)
  const totalRounds = useGameStore((s) => s.totalRounds)
  const progressSteps = useGameStore((s) => s.progressSteps)
  const resetProgressSteps = useGameStore((s) => s.resetProgressSteps)
  const setScreen = useGameStore((s) => s.setScreen)
  const setError = useGameStore((s) => s.setError)

  // Reset progress steps when entering the loading screen
  useEffect(() => {
    resetProgressSteps()
  }, [resetProgressSteps])

  // Loading screen timeout: 120 seconds max - matches backend timeout
  useEffect(() => {
    const timeout = setTimeout(() => {
      console.log('[LoadingScreen] Loading timed out after 120s, returning to lobby')
      setError('انتهت مهلة تحميل المحتوى. يرجى المحاولة مرة أخرى.')
      setScreen('lobby')
    }, 120000)
    return () => clearTimeout(timeout)
  }, [setScreen, setError])

  // The last step is always "active" (in progress), previous steps are "completed"
  const activeStepIndex = progressSteps.length - 1

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <BattleBackground />

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 text-center"
      >
        {/* Animated icon */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          className="w-24 h-24 mx-auto mb-8 relative"
        >
          <div className="absolute inset-0 rounded-full border-2 border-red-500/30" />
          <div className="absolute inset-2 rounded-full border-2 border-amber-500/20 border-dashed" />
          <div className="absolute inset-4 rounded-full border-2 border-cyan-500/10" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Swords className="w-10 h-10 text-red-500" />
          </div>
        </motion.div>

        {/* Round info */}
        {totalRounds > 1 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Badge className="bg-red-500/10 text-red-400 border border-red-500/30 text-sm px-4 py-1">
              الجولة {currentRound + 1} من {totalRounds}
            </Badge>
          </motion.div>
        )}

        {/* Dynamic progress steps - grows as backend events arrive */}
        <div className="space-y-3 min-w-[280px]">
          {progressSteps.length === 0 ? (
            // Show a waiting indicator when no steps have arrived yet
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 border border-white/5"
            >
              <Loader2 className="w-5 h-5 text-red-400 animate-spin" />
              <span className="text-sm text-slate-400">جاري التحضير...</span>
            </motion.div>
          ) : (
            progressSteps.map((s, i) => {
              const isReady = s.step === 'ready' || s.step === 'validating'
              const isCompleted = i < activeStepIndex || isReady
              const isActive = i === activeStepIndex && !isReady
              return (
                <motion.div
                  key={`${s.step}-${i}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 }}
                  className={`flex items-center gap-3 px-4 py-2 rounded-xl ${
                    isActive ? 'bg-red-500/10 border border-red-500/20' :
                    isCompleted ? 'bg-green-500/5 border border-green-500/10' :
                    'bg-white/5 border border-white/5'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5 text-green-400" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 text-red-400 animate-spin" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-white/20" />
                  )}
                  <span className={`text-sm ${isCompleted || isActive ? 'text-white' : 'text-slate-500'}`}>{s.text}</span>
                </motion.div>
              )
            })
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ============================================
// ANSWER REVIEW COMPONENT (shared between Round Transition & Results)
// ============================================
const ARABIC_OPTION_LETTERS = ['أ', 'ب', 'ج', 'د']

function AnswerReviewQuestionCard({
  review,
  roundNumber,
  roomCode,
  showAiExplanation = true,
}: {
  review: AnswerReviewItem | FullAnswerReviewItem
  roundNumber: number
  roomCode: string
  showAiExplanation?: boolean
}) {
  const answerExplanations = useGameStore((s) => s.answerExplanations)
  const [showExplanation, setShowExplanation] = useState(false)
  const [requestedExplanation, setRequestedExplanation] = useState(false)

  const explanationKey = `${roundNumber}-${review.questionIndex}`
  const cachedExplanation = answerExplanations[explanationKey]
  const isLoadingExplanation = requestedExplanation && !cachedExplanation

  // Show explanation if user toggled it on, OR if they requested it and it just arrived
  const isExplanationVisible = showExplanation || (requestedExplanation && !!cachedExplanation)

  const handleRequestExplanation = useCallback(() => {
    if (!globalSocket) return
    if (cachedExplanation) {
      setShowExplanation(prev => !prev)
      return
    }
    setRequestedExplanation(true)
    globalSocket.emit('explain-answer', { roomCode, roundNumber, questionIndex: review.questionIndex })
  }, [roomCode, roundNumber, review.questionIndex, cachedExplanation])

  return (
    <div
      className={`rounded-lg p-3 border ${
        review.isCorrect
          ? 'bg-emerald-500/5 border-emerald-500/20'
          : 'bg-red-500/5 border-red-500/20'
      }`}
    >
      <div className="flex items-start gap-2">
        {review.isCorrect ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
        ) : (
          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-slate-300 mb-2 leading-relaxed">
            {review.question}
          </div>

          {/* Options with color coding */}
          <div className="space-y-1 mb-2">
            {review.options.map((option, idx) => {
              const isPlayerAnswer = idx === review.playerAnswer
              const isCorrectAnswer = idx === review.correctAnswer
              const letter = ARABIC_OPTION_LETTERS[idx] || `${idx + 1}`

              let optionClass = 'bg-white/[0.03] border-white/5 text-slate-400'
              if (isCorrectAnswer) {
                optionClass = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              } else if (isPlayerAnswer && !review.isCorrect) {
                optionClass = 'bg-red-500/10 border-red-500/30 text-red-300'
              }

              return (
                <div
                  key={idx}
                  className={`flex items-center gap-2 text-[11px] px-2.5 py-1.5 rounded-md border ${optionClass} transition-colors`}
                >
                  <span className="font-bold shrink-0">{letter}</span>
                  <span className="flex-1">{option}</span>
                  {isCorrectAnswer && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
                  {isPlayerAnswer && !review.isCorrect && <X className="w-3 h-3 text-red-400 shrink-0" />}
                </div>
              )
            })}
          </div>

          {/* Player answer summary */}
          <div className="flex items-center gap-2 text-[10px] mb-1">
            <span className="text-slate-500">
              إجابتك: <span className={review.isCorrect ? 'text-emerald-400' : 'text-red-400'}>
                {review.playerAnswer >= 0 ? `${ARABIC_OPTION_LETTERS[review.playerAnswer] || (review.playerAnswer + 1)} - ${review.options[review.playerAnswer] || `خيار ${review.playerAnswer + 1}`}` : 'لم تجب'}
              </span>
            </span>
            {!review.isCorrect && (
              <span className="text-slate-500">
                الصحيح: <span className="text-emerald-400">
                  {`${ARABIC_OPTION_LETTERS[review.correctAnswer] || (review.correctAnswer + 1)} - ${review.options[review.correctAnswer] || `خيار ${review.correctAnswer + 1}`}`}
                </span>
              </span>
            )}
            {'timeTaken' in review && (review as FullAnswerReviewItem).timeTaken != null && (review as FullAnswerReviewItem).timeTaken! > 0 && (
              <span className="text-slate-600">
                <Timer className="w-2.5 h-2.5 inline ml-0.5" />
                {Math.round((review as FullAnswerReviewItem).timeTaken!)}ث
              </span>
            )}
          </div>

          {/* Built-in explanation (shown for wrong answers) */}
          {review.explanation && !review.isCorrect && (
            <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
              {review.explanation}
            </div>
          )}

          {/* AI Explanation button */}
          {showAiExplanation && (
            <div className="mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRequestExplanation}
                disabled={isLoadingExplanation}
                className="h-6 px-2 text-[10px] rounded-md bg-purple-500/5 border border-purple-500/20 text-purple-400 hover:bg-purple-500/15 hover:text-purple-300 gap-1"
              >
                {isLoadingExplanation ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  <Brain className="w-2.5 h-2.5" />
                )}
                لماذا؟
              </Button>
              <AnimatePresence>
                {isExplanationVisible && cachedExplanation && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 p-2 rounded-md bg-purple-500/5 border border-purple-500/10 text-[10px] text-slate-300 leading-relaxed">
                      <div className="flex items-center gap-1 mb-1 text-purple-400 font-bold">
                        <Sparkles className="w-2.5 h-2.5" />
                        شرح الذكاء الاصطناعي
                      </div>
                      {cachedExplanation}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// ROUND TRANSITION SCREEN
// ============================================
function RoundTransitionScreen() {
  const lastRoundScores = useGameStore((s) => s.lastRoundScores)
  const lastRoundWinner = useGameStore((s) => s.lastRoundWinner)
  const currentRound = useGameStore((s) => s.currentRound)
  const totalRounds = useGameStore((s) => s.totalRounds)
  const isLastRound = currentRound + 1 >= totalRounds
  const isHost = useGameStore((s) => s.isHost)
  const gameSettings = useGameStore((s) => s.gameSettings)
  const setGameSettings = useGameStore((s) => s.setGameSettings)
  const players = useGameStore((s) => s.players)
  const roomCode = useGameStore((s) => s.roomCode)
  const earlyEndProcessing = useGameStore((s) => s.earlyEndProcessing)
  const playerAnswerReviews = useGameStore((s) => s.playerAnswerReviews)
  const readyStatus = useGameStore((s) => s.readyStatus)
  const isPlayerReady = useGameStore((s) => s.isPlayerReady)
  const setIsPlayerReady = useGameStore((s) => s.setIsPlayerReady)
  const teamRoundScores = useGameStore((s) => s.teamRoundScores)
  const battleMode = useGameStore((s) => s.battleMode)
  const isCaptain = useGameStore((s) => s.isCaptain)
  const myTeamId = useGameStore((s) => s.myTeamId)
  const teams = useGameStore((s) => s.teams)
  const pendingApproval = useGameStore((s) => s.pendingApproval)
  const setPendingApproval = useGameStore((s) => s.setPendingApproval)
  const [showEditSettings, setShowEditSettings] = useState(false)
  const [showEarlyEndModal, setShowEarlyEndModal] = useState(false)
  const [showAnswerReview, setShowAnswerReview] = useState(false)
  const { requestEarlyEnd } = useGameSocket()
  const isOpen = gameSettings.playerMode === 'open' || gameSettings.maxPlayers === 0

  // Get current player's answer reviews
  const mySocketId = globalSocket?.id
  const myReviews = mySocketId ? playerAnswerReviews[mySocketId] || [] : []
  const hasReviews = myReviews.length > 0

  // Ready status display
  const readyCount = readyStatus?.readyCount ?? 0
  const totalActive = readyStatus?.totalActive ?? players.length

  const handleReady = useCallback(() => {
    if (!globalSocket || isPlayerReady) return
    globalSocket.emit('player-ready')
    setIsPlayerReady(true)
  }, [isPlayerReady, setIsPlayerReady])

  const handleApprovalResponse = useCallback((approvalId: string, approved: boolean) => {
    if (!globalSocket) return
    globalSocket.emit('captain-approval-response', { approvalId, approved })
    setPendingApproval(null)
  }, [setPendingApproval])

  // Send settings update to server (host/captain)
  const handleUpdateSettings = useCallback((newSettings: Partial<typeof gameSettings>) => {
    if (!globalSocket) return

    // Team mode: captains need approval from other captain
    if (battleMode === 'فرق' && isCaptain) {
      const changeLabels: Record<string, string> = {
        gameType: 'نوع اللعبة',
        difficulty: 'الصعوبة',
        timePerRound: 'وقت الجولة',
        numberOfRounds: 'عدد الجولات',
        maxPlayers: 'عدد اللاعبين',
        playerMode: 'نوع الساحة',
        passageType: 'نوع القطعة',
      }
      const changesDesc = Object.keys(newSettings).map(k => changeLabels[k] || k).join('، ')

      globalSocket.emit('captain-approval-request', {
        type: 'settings',
        description: `طلب تعديل: ${changesDesc}`,
        data: newSettings,
      })
      return
    }

    // Solo mode - host can change directly
    if (!isHost) return
    globalSocket.emit('update-settings', { settings: newSettings, roomCode })
  }, [isHost, isCaptain, battleMode, roomCode])

  // Listen for settings-updated from server
  useEffect(() => {
    if (!globalSocket) return
    const handler = (data: { settings: typeof gameSettings; updatedBy: string; changes: string[] }) => {
      setGameSettings(data.settings)
      if (data.changes.length > 0) {
        const changeLabels: Record<string, string> = {
          difficulty: 'الصعوبة', timePerRound: 'وقت الجولة', numberOfRounds: 'عدد الجولات', passageType: 'نوع القطعة',
        }
        const labels = data.changes.map(c => changeLabels[c] || c).join('، ')
        battleToast('settings_updated', 'تم تحديث الإعدادات', `${data.updatedBy} غيّر: ${labels}`)
      }
    }
    globalSocket.on('settings-updated', handler)
    return () => { globalSocket?.off('settings-updated', handler) }
  }, [setGameSettings])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <BattleBackground />

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="relative z-10 w-full max-w-lg text-center"
      >
        {/* Round announcement */}
        <motion.div
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Badge className="bg-red-500/10 text-red-400 border border-red-500/30 text-sm px-4 py-1 mb-4">
            الجولة {currentRound + 1} من {totalRounds}
          </Badge>
        </motion.div>

        {/* Winner announcement */}
        {lastRoundWinner && (
          <motion.div
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.3 }}
            className="mb-8"
          >
            <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center glow-gold">
              <Crown className="w-12 h-12 text-white crown-float" />
            </div>
            <motion.h2
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-3xl font-black text-white mb-1"
            >
              {lastRoundWinner.playerName}
            </motion.h2>
            <p className="text-amber-400 text-glow-gold text-lg font-bold">فاز بالجولة!</p>
            <p className="text-slate-400 text-sm mt-1">
              {lastRoundWinner.correctAnswers} إجابة صحيحة من {lastRoundWinner.totalQuestions} — {lastRoundWinner.score} نقطة
            </p>
          </motion.div>
        )}

        {/* Scores list */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="battle-card-glow rounded-2xl p-4"
        >
          <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2 justify-center">
            <Medal className="w-4 h-4 text-amber-400" />ترتيب الجولة
          </h3>
          <div className="space-y-2">
            {lastRoundScores.sort((a, b) => b.score - a.score).map((score, i) => (
              <motion.div
                key={score.playerId}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 + i * 0.1 }}
                className={`flex items-center gap-3 p-3 rounded-xl ${i === 0 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-white/5 border border-white/5'}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${i === 0 ? 'bg-amber-500/20 text-amber-400' : i === 1 ? 'bg-slate-400/20 text-slate-300' : i === 2 ? 'bg-amber-700/20 text-amber-600' : 'bg-white/5 text-slate-500'}`}>
                  {i + 1}
                </div>
                <span className="flex-1 text-right font-semibold text-white text-sm">{score.playerName}</span>
                <div className="text-left">
                  <span className={`font-bold text-sm ${i === 0 ? 'text-amber-400' : 'text-slate-300'}`}>{score.score}</span>
                  <span className="text-xs text-slate-500 mr-1">نقطة</span>
                </div>
                <span className="text-xs text-slate-500">{score.correctAnswers}/{score.totalQuestions}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Team Round Scores */}
        {teamRoundScores && battleMode === 'فرق' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-4 p-4 rounded-xl bg-white/5 border border-white/10"
          >
            <h3 className="text-center text-sm font-bold text-white mb-3">نتيجة الفرق هذه الجولة</h3>
            <div className="grid grid-cols-2 gap-4">
              {/* Team A */}
              <div className={`p-3 rounded-xl text-center ${teamRoundScores.winningTeam === 'A' ? 'bg-red-500/15 border border-red-500/30' : 'bg-red-500/5 border border-red-500/10'}`}>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <span className="text-xs font-bold text-red-400">{teams?.teamA.customName || 'الفريق الأحمر'}</span>
                  {teamRoundScores.winningTeam === 'A' && <Trophy className="w-3.5 h-3.5 text-amber-400" />}
                </div>
                <div className="text-2xl font-black text-white">{Math.round(teamRoundScores.A.score)}</div>
                <div className="text-[10px] text-slate-400">{teamRoundScores.A.correctAnswers} إجابة صحيحة</div>
                {/* Speed bonus indicator */}
                {teamRoundScores.A.speedBonus && teamRoundScores.A.speedBonus > 0 && (
                  <div className="mt-1.5 flex items-center justify-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span className="text-[10px] text-amber-400 font-bold">+{teamRoundScores.A.speedBonus} سرعة!</span>
                  </div>
                )}
                {teamRoundScores.A.finishedFirst && (
                  <div className="mt-1 text-[9px] text-green-400/80">⚡ أنهوا أولاً</div>
                )}
              </div>
              {/* Team B */}
              <div className={`p-3 rounded-xl text-center ${teamRoundScores.winningTeam === 'B' ? 'bg-sky-500/15 border border-sky-500/30' : 'bg-sky-500/5 border border-sky-500/10'}`}>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                  <span className="text-xs font-bold text-sky-400">{teams?.teamB.customName || 'الفريق الأزرق'}</span>
                  {teamRoundScores.winningTeam === 'B' && <Trophy className="w-3.5 h-3.5 text-amber-400" />}
                </div>
                <div className="text-2xl font-black text-white">{Math.round(teamRoundScores.B.score)}</div>
                <div className="text-[10px] text-slate-400">{teamRoundScores.B.correctAnswers} إجابة صحيحة</div>
                {/* Speed bonus indicator */}
                {teamRoundScores.B.speedBonus && teamRoundScores.B.speedBonus > 0 && (
                  <div className="mt-1.5 flex items-center justify-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span className="text-[10px] text-amber-400 font-bold">+{teamRoundScores.B.speedBonus} سرعة!</span>
                  </div>
                )}
                {teamRoundScores.B.finishedFirst && (
                  <div className="mt-1 text-[9px] text-green-400/80">⚡ أنهوا أولاً</div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Answer Review Button */}
        {hasReviews && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 }}
            className="mt-4"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAnswerReview(true)}
              className="border-cyan-500/30 bg-cyan-500/5 text-cyan-400 hover:bg-cyan-500/15 hover:text-cyan-300 rounded-xl gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" /> إظهار الإجابات وتصحيحها
              <Badge className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] px-1.5 py-0">
                {myReviews.filter(r => r.isCorrect).length}/{myReviews.length}
              </Badge>
            </Button>
          </motion.div>
        )}

        {/* Next round controls */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="mt-6"
        >
          {/* Ready Button / Status */}
          {!isLastRound ? (
            <div className="flex flex-col items-center gap-3">
              {isPlayerReady ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Check className="w-4 h-4" />
                    <span className="text-sm font-bold">أنت جاهز</span>
                    <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs px-2 py-0.5">
                      {readyCount}/{totalActive} جاهزين
                    </Badge>
                  </div>
                  {/* Host/Captain: Show start battle button after ready */}
                  {((isHost && battleMode !== 'فرق') || (isCaptain && battleMode === 'فرق')) && (
                    <Button
                      onClick={() => globalSocket?.emit('host-start-round')}
                      className="btn-battle rounded-xl gap-2 px-8 py-5 text-base mt-2"
                    >
                      <Swords className="w-4 h-4" /> ابدأ المعركة
                    </Button>
                  )}
                </div>
              ) : (
                <Button
                  onClick={handleReady}
                  className="btn-battle rounded-xl gap-2 px-8 py-5 text-base"
                >
                  <Target className="w-4 h-4" /> جاهز للجولة القادمة
                </Button>
              )}
              {!isPlayerReady && readyCount > 0 && (
                <span className="text-xs text-slate-500">
                  {readyCount}/{totalActive} جاهزين
                </span>
              )}
              {/* Show unready players list to everyone */}
              {isPlayerReady && readyStatus?.unreadyPlayerNames && readyStatus.unreadyPlayerNames.length > 0 && (
                <div className="text-center mt-1">
                  <span className="text-xs text-slate-500">
                    في انتظار: {readyStatus.unreadyPlayerNames.join('، ')}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">جاري إعلان النتائج النهائية...</span>
            </div>
          )}

          {/* Host/Captain controls between rounds */}
          {((isHost && battleMode !== 'فرق') || (isCaptain && battleMode === 'فرق')) && !isLastRound && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2 }}
              className="mt-4 flex flex-col items-center gap-2"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEditSettings(true)}
                className="border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/15 hover:text-amber-300 rounded-xl gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" /> تعديل إعدادات الجولة القادمة
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (battleMode === 'فرق' && isCaptain) {
                    // Team mode: request captain approval for early end
                    if (globalSocket) {
                      globalSocket.emit('captain-approval-request', {
                        type: 'early-end',
                        description: 'طلب إنهاء المعركة مبكراً',
                        data: {},
                      })
                    }
                  } else if (isHost) {
                    // Solo mode: show confirmation dialog
                    setShowEarlyEndModal(true)
                  }
                }}
                disabled={earlyEndProcessing}
                className="border-red-500/30 bg-red-500/5 text-red-400 hover:bg-red-500/15 hover:text-red-300 rounded-xl gap-1.5"
              >
                <ShieldAlert className="w-3.5 h-3.5" /> إنهاء المعركة
              </Button>
            </motion.div>
          )}
        </motion.div>
      </motion.div>

      {/* Answer Review Dialog */}
      <Dialog open={showAnswerReview} onOpenChange={setShowAnswerReview}>
        <DialogContent className="bg-[#12121F] border-white/10 text-white max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2 text-base">
              <Eye className="w-4 h-4 text-cyan-400" />
              مراجعة إجابات الجولة {currentRound + 1}
            </DialogTitle>
            <DialogDescription className="text-right text-xs text-slate-500">
              {myReviews.filter(r => r.isCorrect).length} إجابة صحيحة من {myReviews.length}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {myReviews.map((review, idx) => (
              <AnswerReviewQuestionCard
                key={idx}
                review={review}
                roundNumber={currentRound}
                roomCode={roomCode}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Settings Modal for between rounds */}
      <EditSettingsModal
        open={showEditSettings}
        onClose={() => setShowEditSettings(false)}
        settings={gameSettings}
        onSave={handleUpdateSettings}
        currentPlayers={players.length}
        isOpen={isOpen}
        isMidGame={true}
      />

      {/* Early End Game Confirmation Modal */}
      <EarlyEndConfirmModal
        open={showEarlyEndModal}
        onClose={() => setShowEarlyEndModal(false)}
        onConfirm={() => {
          requestEarlyEnd(roomCode)
          setShowEarlyEndModal(false)
        }}
        currentRound={currentRound}
        totalRounds={totalRounds}
        isProcessing={earlyEndProcessing}
      />

      {/* Captain Approval Popup (team mode) */}
      <AnimatePresence>
        {battleMode === 'فرق' && pendingApproval && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto"
          >
            <div className="battle-card-glow rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-white text-sm">طلب موافقة</h4>
                  <p className="text-xs text-slate-400 mt-0.5">{pendingApproval.requestedByName} ({pendingApproval.requestedByTeam === 'A' ? (teams?.teamA.customName || 'الفريق الأحمر') : (teams?.teamB.customName || 'الفريق الأزرق')})</p>
                  <p className="text-sm text-amber-300 mt-2">{pendingApproval.description}</p>
                  <ApprovalTimer expiresAt={pendingApproval.expiresAt} />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleApprovalResponse(pendingApproval.approvalId, true)}>
                  ✅ موافقة
                </Button>
                <Button size="sm" variant="outline" className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                  onClick={() => handleApprovalResponse(pendingApproval.approvalId, false)}>
                  ❌ رفض
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ============================================
// GAME SCREEN
// ============================================
function GameScreen() {
  const gameContent = useGameStore((s) => s.gameContent)
  const currentQuestionIndex = useGameStore((s) => s.currentQuestionIndex)
  const answers = useGameStore((s) => s.answers)
  const timeLeft = useGameStore((s) => s.timeLeft)
  const decrementTime = useGameStore((s) => s.decrementTime)
  const currentRound = useGameStore((s) => s.currentRound)
  const totalRounds = useGameStore((s) => s.totalRounds)
  const gameSettings = useGameStore((s) => s.gameSettings)
  const roomCode = useGameStore((s) => s.roomCode)
  const finishedStatus = useGameStore((s) => s.finishedStatus)
  const isPlayerFinished = useGameStore((s) => s.isPlayerFinished)
  const setIsPlayerFinished = useGameStore((s) => s.setIsPlayerFinished)
  const battleMode = useGameStore((s) => s.battleMode)
  const myTeamId = useGameStore((s) => s.myTeamId)
  const teams = useGameStore((s) => s.teams)
  const [showText, setShowText] = useState(true)
  const [showScrollHint, setShowScrollHint] = useState(true)
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<number>>(new Set())

  // Track round elapsed time for showing the "خلصت؟" button after 3 minutes
  const roundStartTimeRef = useRef<number>(Date.now())
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const MINUTES_BEFORE_FINISH_BUTTON = 3 // Show "خلصت؟" after 3 minutes

  // Reset scroll hint when new content arrives
  useEffect(() => {
    queueMicrotask(() => {
      setShowScrollHint(true)
      setShowText(true)
      roundStartTimeRef.current = Date.now()
      setElapsedSeconds(0)
    })
  }, [gameContent])

  // Track elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - roundStartTimeRef.current) / 1000)
      setElapsedSeconds(elapsed)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const canShowFinishButton = elapsedSeconds >= MINUTES_BEFORE_FINISH_BUTTON * 60

  const [showSurrenderDialog, setShowSurrenderDialog] = useState(false)
  const { submitAnswer, surrender } = useGameSocket()
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Timer
  useEffect(() => {
    // Don't start interval if time is already up
    if (timeLeft <= 0) return
    timerRef.current = setInterval(() => { decrementTime() }, 1000)
    // Start ambient tension on game screen
    audioEngine.startAmbient()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      audioEngine.stopAmbient()
      audioEngine.stopHeartbeat()
    }
  }, [decrementTime])

  // Auto time-up
  useEffect(() => {
    if (timeLeft <= 0 && timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
      audioEngine.timeUp()
      // Notify server so the round can end
      if (globalSocket?.connected && roomCode) {
        globalSocket.emit('round-time-up', { roomCode, roundNumber: currentRound })
      }
    }
  }, [timeLeft, roomCode, currentRound])

  // Heartbeat when time is running low
  useEffect(() => {
    if (timeLeft <= 30 && timeLeft > 0) {
      // Faster heartbeat as time decreases
      const bpm = timeLeft <= 10 ? 140 : timeLeft <= 20 ? 110 : 80
      audioEngine.startHeartbeat(bpm)
    } else {
      audioEngine.stopHeartbeat()
    }
    // Time warning at 60 seconds
    if (timeLeft === 60) {
      audioEngine.timeWarning()
    }
    // Time warnings at 30, 20, 10, 5, 4, 3, 2, 1
    if ([30, 20, 10, 5, 4, 3, 2, 1].includes(timeLeft)) {
      audioEngine.timeWarning()
    }
  }, [timeLeft])

  // Reset answered questions when content changes
  useEffect(() => { setTimeout(() => { setAnsweredQuestions(new Set()); setShowScrollHint(true) }, 0) }, [gameContent])

  if (!gameContent) return null

  const questions = gameContent.questions
  const currentQuestion = questions[currentQuestionIndex]
  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const isUrgent = timeLeft <= 60
  const isLastQuestion = currentQuestionIndex === questions.length - 1

  const handleAnswer = (questionIndex: number, answerIndex: number) => {
    if (answeredQuestions.has(questionIndex)) return
    setAnsweredQuestions(prev => new Set(prev).add(questionIndex))
    audioEngine.answerSelect() // Subtle click - NOT revealing correctness
    submitAnswer(questionIndex, answerIndex)
  }

  const handleSurrender = () => {
    surrender()
    setShowSurrenderDialog(false)
  }

  const handleTextScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    if (atBottom) setShowScrollHint(false)
  }

  // Split text into paragraphs for better rendering
  const textParagraphs = gameContent.text.split(/\n\n|\n/).filter(p => p.trim())

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <BattleBackground />

      {/* HUD Bar - Timer at TOP, prominent for mobile */}
      <div className="relative z-10 border-b border-white/10 bg-black/40 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-3 py-2 sm:px-4 sm:py-3">
          {/* Timer - Full width, always prominent */}
          <div className="flex items-center justify-center mb-1.5">
            <div className={`flex items-center justify-center gap-2 px-6 py-2 sm:px-8 sm:py-3 rounded-xl ${isUrgent ? 'bg-red-500/15 border border-red-500/30 animate-pulse' : 'bg-white/5 border border-white/10'}`}>
              <Timer className={`w-5 h-5 sm:w-7 sm:h-7 ${isUrgent ? 'text-red-400' : 'text-cyan-400'}`} />
              <span className={`font-mono text-2xl sm:text-4xl font-black ${isUrgent ? 'text-red-400 timer-urgent' : 'text-white'}`}>
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </span>
            </div>
          </div>
          {/* Secondary info bar */}
          <div className="flex items-center justify-between gap-2">
            {/* Left: Round + Question progress + Team indicator */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <Badge className="bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] sm:text-xs px-1.5 sm:px-2.5">
                <Swords className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5" />
                الجولة {currentRound + 1}/{totalRounds}
              </Badge>
              <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] sm:text-xs px-1.5 sm:px-2.5">
                <Crosshair className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-0.5" />
                السؤال {currentQuestionIndex + 1}/{questions.length}
              </Badge>
              {/* Team indicator badge */}
              {battleMode === 'فرق' && myTeamId && (
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${myTeamId === 'A' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'}`}>
                  <div className={`w-2 h-2 rounded-full ${myTeamId === 'A' ? 'bg-red-500' : 'bg-sky-500'}`} />
                  {myTeamId === 'A' ? (teams?.teamA.customName || 'الفريق الأحمر') : (teams?.teamB.customName || 'الفريق الأزرق')}
                </div>
              )}
            </div>

            {/* Right: Surrender */}
            <div className="shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="text-red-400/60 hover:text-red-400 hover:bg-red-500/10 text-[10px] sm:text-xs h-7 px-1.5 sm:px-2"
                onClick={() => setShowSurrenderDialog(true)}
              >
                <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5 ml-0.5" />
                <span className="hidden sm:inline">انسحاب</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Surrender Confirmation Dialog */}
      <AlertDialog open={showSurrenderDialog} onOpenChange={setShowSurrenderDialog}>
        <AlertDialogContent className="battle-card-glow">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <Skull className="w-5 h-5 text-red-400" />
              الانسحاب من المعركة
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              متأكد إنك عايز تنسحب؟ الانسحاب مش هيترجع، وهتخسر المعركة دي.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleSurrender} className="bg-red-600 hover:bg-red-700 text-white">
              <Skull className="w-4 h-4 ml-1" />
              أنسحب
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Main content */}
      <div className="flex-1 relative z-10 max-w-4xl mx-auto w-full p-4">
        {/* Text/Question toggle */}
        <div className="flex gap-2 mb-4 justify-center">
          <Button size="sm" onClick={() => setShowText(true)}
            className={`rounded-lg ${showText ? 'bg-red-600 text-white shadow-lg shadow-red-500/20' : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'}`}>
            <BookOpen className="w-4 h-4 ml-1" />{gameSettings.gameType === 'قراءة متحررة' ? 'القطعة' : 'النص'}
          </Button>
          <Button size="sm" onClick={() => setShowText(false)}
            className={`rounded-lg ${!showText ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/20' : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'}`}>
            <Crosshair className="w-4 h-4 ml-1" />الأسئلة
          </Button>
        </div>

        <AnimatePresence mode="wait">
          {showText ? (
            <motion.div
              key="text"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="battle-card-glow rounded-2xl p-4 sm:p-6 max-h-[65vh] overflow-y-auto reading-scroll relative"
              onScroll={handleTextScroll}
            >
              <h3 className="text-xl sm:text-2xl font-bold mb-4 flex items-center gap-2 bg-gradient-to-l from-red-400 via-amber-300 to-red-400 bg-clip-text text-transparent">
                <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-red-400 shrink-0" />
                <span className="bg-gradient-to-l from-red-300 via-amber-200 to-red-300 bg-clip-text text-transparent">{gameContent.title}</span>
              </h3>
              <div className="space-y-5">
                {textParagraphs.map((paragraph, idx) => (
                  <p key={idx} className="text-slate-200 leading-[2.1] text-[15px] sm:text-[17px] tracking-wide text-justify">
                    {paragraph.trim()}
                  </p>
                ))}
              </div>
              {gameContent.source && (
                <p className="text-xs text-slate-500 mt-4 pt-2 border-t border-white/5">المصدر: {gameContent.source}</p>
              )}

              {/* Prompt to go to questions */}
              <div className="mt-4 pt-4 border-t border-white/5 text-center">
                <Button
                  onClick={() => setShowText(false)}
                  className="bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-600/30 rounded-xl"
                >
                  <Crosshair className="w-4 h-4 ml-2" />
                  انتقل للأسئلة
                </Button>
              </div>

              {/* Scroll hint */}
              {showScrollHint && (
                <motion.div
                  className="sticky bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#12121F] to-transparent flex items-end justify-center pb-1 pointer-events-none"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <span className="text-xs text-amber-400/50">↕ اسحب للقراءة</span>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="question"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              {/* Current question */}
              {currentQuestion && (
                <div className="battle-card-glow rounded-2xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                      <span className="text-red-400 font-bold text-sm">{currentQuestionIndex + 1}</span>
                    </div>
                    <h3 className="text-white font-bold">{currentQuestion.text}</h3>
                  </div>

                  <div className="space-y-2">
                    {currentQuestion.options.map((option, i) => {
                      const isSelected = answers[currentQuestionIndex] === i
                      const isAnswered = answeredQuestions.has(currentQuestionIndex)
                      return (
                        <motion.button
                          key={i}
                          whileHover={!isAnswered ? { scale: 1.01, x: -4 } : {}}
                          whileTap={!isAnswered ? { scale: 0.99 } : {}}
                          onClick={() => handleAnswer(currentQuestionIndex, i)}
                          disabled={isAnswered}
                          className={`answer-option w-full p-4 rounded-xl text-right flex items-center gap-3 ${isSelected ? 'selected' : ''} ${isAnswered && !isSelected ? 'opacity-50' : ''}`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isSelected ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-white/5 text-slate-400 border border-white/10'}`}>
                            {['أ', 'ب', 'ج', 'د', 'ه', 'و'][i] || String(i + 1)}
                          </div>
                          <span className={`text-sm ${isSelected ? 'text-white font-semibold' : 'text-slate-300'}`}>{option}</span>
                          {isSelected && <Check className="w-4 h-4 text-cyan-400 mr-auto" />}
                        </motion.button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Questions navigation */}
              <div className="flex flex-wrap gap-2 justify-center">
                {questions.map((_, i) => (
                  <motion.button
                    key={i}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => useGameStore.getState().setCurrentQuestionIndex(i)}
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                      i === currentQuestionIndex ? 'bg-red-600 text-white shadow-lg shadow-red-500/20' :
                      answers[i] !== undefined ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                      'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {i + 1}
                  </motion.button>
                ))}
              </div>

              {/* Next question / Back to text buttons / Completion state */}
              <div className="flex gap-3 justify-center mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowText(true)}
                  className="text-slate-400 hover:text-white hover:bg-white/5"
                >
                  <BookOpen className="w-4 h-4 ml-1" />
                  ارجع لل{gameSettings.gameType === 'قراءة متحررة' ? 'قطعة' : 'نص'}
                </Button>
                {!isLastQuestion && (
                  <Button
                    size="sm"
                    onClick={() => useGameStore.getState().setCurrentQuestionIndex(currentQuestionIndex + 1)}
                    className="bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10"
                  >
                    السؤال التالي
                    <ArrowRight className="w-4 h-4 mr-1" />
                  </Button>
                )}
              </div>

              {/* Completion message when all questions answered - REMOVED: now using "خلصت؟" button */}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* "خلصت؟" floating button - appears after 3 minutes, hidden if player already finished */}
      {canShowFinishButton && !isPlayerFinished && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2"
        >
          {/* Team indicator near finish button */}
          {battleMode === 'فرق' && myTeamId && (
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-xl ${myTeamId === 'A' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'}`}>
              <div className={`w-2 h-2 rounded-full ${myTeamId === 'A' ? 'bg-red-500' : 'bg-sky-500'}`} />
              {myTeamId === 'A' ? (teams?.teamA.customName || 'الفريق الأحمر') : (teams?.teamB.customName || 'الفريق الأزرق')}
            </div>
          )}
          <Button
            onClick={() => {
              if (globalSocket) {
                globalSocket.emit('player-finished')
                setIsPlayerFinished(true)
              }
            }}
            className="btn-battle rounded-2xl gap-2 px-8 py-6 text-lg shadow-2xl shadow-red-500/30"
          >
            <CheckCircle2 className="w-5 h-5" />
            خلصت؟
          </Button>
        </motion.div>
      )}

      {/* Waiting overlay - shown when player clicked "خلصت" but others haven't finished */}
      <AnimatePresence>
        {isPlayerFinished && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="battle-card-glow rounded-2xl p-6 sm:p-8 max-w-md w-full text-center"
            >
              {/* ── Team Mode: Cinematic Synchronized Arena State ── */}
              {battleMode === 'فرق' && myTeamId && finishedStatus ? (
                <div className="space-y-5">
                  {/* Team readiness status - the key cinematic element */}
                  {(() => {
                    const myTeamReady = myTeamId === 'A' ? finishedStatus.teamAReady : finishedStatus.teamBReady
                    const otherTeamReady = myTeamId === 'A' ? finishedStatus.teamBReady : finishedStatus.teamAReady
                    const otherTeamName = myTeamId === 'A' ? (teams?.teamB.customName || 'الفريق الأزرق') : (teams?.teamA.customName || 'الفريق الأحمر')
                    const otherTeamUnfinished = myTeamId === 'A'
                      ? (finishedStatus.teamBUnfinishedNames || [])
                      : (finishedStatus.teamAUnfinishedNames || [])
                    const myTeamUnfinished = myTeamId === 'A'
                      ? (finishedStatus.teamAUnfinishedNames || [])
                      : (finishedStatus.teamBUnfinishedNames || [])

                    return (
                      <>
                        {/* Main status icon with animation */}
                        <motion.div
                          initial={{ scale: 0, rotate: -20 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                          className="relative mx-auto w-20 h-20 mb-2"
                        >
                          {myTeamReady ? (
                            // Team ready - show shield with glow
                            <>
                              <motion.div
                                className="absolute inset-0 rounded-full"
                                style={{
                                  background: `radial-gradient(circle, ${myTeamId === 'A' ? 'rgba(239,68,68,0.3)' : 'rgba(56,189,248,0.3)'} 0%, transparent 70%)`,
                                }}
                                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                              />
                              <div className={`w-20 h-20 rounded-full flex items-center justify-center ${myTeamId === 'A' ? 'bg-red-500/20 border-2 border-red-500/40' : 'bg-sky-500/20 border-2 border-sky-500/40'}`}>
                                <Shield className={`w-10 h-10 ${myTeamId === 'A' ? 'text-red-400' : 'text-sky-400'}`} />
                              </div>
                            </>
                          ) : (
                            // Team not ready yet - show spinner
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                              className="w-20 h-20 rounded-full border-2 border-cyan-400 border-t-transparent"
                            />
                          )}
                        </motion.div>

                        {/* Cinematic status messages */}
                        <div className="space-y-2">
                          {myTeamReady && !otherTeamReady ? (
                            <>
                              <motion.h3
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className={`text-xl font-black ${myTeamId === 'A' ? 'text-red-400' : 'text-sky-400'}`}
                              >
                                فريقك جاهز للجولة التالية ⚔️
                              </motion.h3>
                              <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.6 }}
                                className="text-slate-400 text-sm"
                              >
                                {otherTeamName} ما زال يقاتل...
                              </motion.p>
                            </>
                          ) : !myTeamReady ? (
                            <>
                              <h3 className="text-white font-bold text-lg">
                                في انتظار فريقك
                              </h3>
                              <p className="text-slate-400 text-sm">
                                زملائك ما زالوا يقاتلون في الساحة
                              </p>
                            </>
                          ) : (
                            <>
                              <h3 className="text-white font-bold text-lg">
                                كلا الفريقين جاهز!
                              </h3>
                              <p className="text-slate-400 text-sm">
                                يتم تجهيز نتائج الجولة...
                              </p>
                            </>
                          )}
                        </div>

                        {/* Live team completion indicators */}
                        <div className="grid grid-cols-2 gap-3">
                          {/* Team A indicator */}
                          <div className={`p-3 rounded-xl ${finishedStatus.teamAReady ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/5 border border-red-500/15'}`}>
                            <div className="flex items-center justify-center gap-1.5 mb-2">
                              <div className={`w-2.5 h-2.5 rounded-full ${finishedStatus.teamAReady ? 'bg-green-500' : 'bg-red-500'} ${finishedStatus.teamAReady ? '' : 'animate-pulse'}`} />
                              <span className="text-xs font-bold text-red-400">{teams?.teamA.customName || 'الفريق الأحمر'}</span>
                            </div>
                            <div className="text-lg font-black text-white">
                              {finishedStatus.teamAFinishedCount || 0}/{finishedStatus.teamATotal || 0}
                            </div>
                            {finishedStatus.teamAReady ? (
                              <span className="text-[10px] text-green-400 font-bold">✅ جاهز</span>
                            ) : (
                              <span className="text-[10px] text-red-400/80">بيحاربوا...</span>
                            )}
                          </div>

                          {/* Team B indicator */}
                          <div className={`p-3 rounded-xl ${finishedStatus.teamBReady ? 'bg-green-500/10 border border-green-500/30' : 'bg-sky-500/5 border border-sky-500/15'}`}>
                            <div className="flex items-center justify-center gap-1.5 mb-2">
                              <div className={`w-2.5 h-2.5 rounded-full ${finishedStatus.teamBReady ? 'bg-green-500' : 'bg-sky-500'} ${finishedStatus.teamBReady ? '' : 'animate-pulse'}`} />
                              <span className="text-xs font-bold text-sky-400">{teams?.teamB.customName || 'الفريق الأزرق'}</span>
                            </div>
                            <div className="text-lg font-black text-white">
                              {finishedStatus.teamBFinishedCount || 0}/{finishedStatus.teamBTotal || 0}
                            </div>
                            {finishedStatus.teamBReady ? (
                              <span className="text-[10px] text-green-400 font-bold">✅ جاهز</span>
                            ) : (
                              <span className="text-[10px] text-sky-400/80">بيحاربوا...</span>
                            )}
                          </div>
                        </div>

                        {/* Unfinished player names */}
                        {otherTeamUnfinished.length > 0 && myTeamReady && (
                          <motion.div
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.8 }}
                            className="p-3 rounded-xl bg-white/5 border border-white/10"
                          >
                            <p className="text-xs text-slate-500 mb-1">
                              {otherTeamUnfinished.length === 1
                                ? 'متبقّي مقاتل واحد في المعركة'
                                : `متبقّي ${otherTeamUnfinished.length} لاعبين في المعركة`}
                            </p>
                            <p className="text-sm text-slate-300">{otherTeamUnfinished.join('، ')}</p>
                          </motion.div>
                        )}

                        {/* My team unfinished players */}
                        {myTeamUnfinished.length > 0 && !myTeamReady && (
                          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                            <p className="text-xs text-slate-500 mb-1">زملائك في الفريق لسه بيحاربوا:</p>
                            <p className="text-sm text-slate-300">{myTeamUnfinished.join('، ')}</p>
                          </div>
                        )}

                        {/* Tension ambience - subtle animated text */}
                        {myTeamReady && !otherTeamReady && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0.3, 0.7, 0.3] }}
                            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                            className="text-xs text-slate-500 italic"
                          >
                            ⏳ الساحة تنتظر اكتمال الفريق الآخر...
                          </motion.div>
                        )}
                      </>
                    )
                  })()}
                </div>
              ) : (
                /* ── Solo Mode: Original Waiting State ── */
                <div>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-cyan-400 border-t-transparent"
                  />
                  <h3 className="text-white font-bold text-lg mb-2">في انتظار باقي المقاتلين</h3>
                  <p className="text-slate-400 text-sm mb-4">
                    في انتظار انتهاء جميع اللاعبين من الإجابة أو انتهاء الوقت
                  </p>

                  {/* Show who hasn't finished */}
                  {finishedStatus?.unfinishedPlayerNames && finishedStatus.unfinishedPlayerNames.length > 0 && (
                    <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-xs text-slate-500 mb-1">لسه بيحاربوا:</p>
                      <p className="text-sm text-slate-300">{finishedStatus.unfinishedPlayerNames.join('، ')}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Go back button - available in both modes */}
              <Button
                variant="outline"
                onClick={() => {
                  if (globalSocket) {
                    globalSocket.emit('player-unfinish')
                    setIsPlayerFinished(false)
                  }
                }}
                className="border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/15 hover:text-amber-300 rounded-xl gap-2 mt-4"
              >
                <ArrowRight className="w-4 h-4 rotate-180" />
                لا أنا عايز أراجع إجاباتي
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ============================================
// RESULTS SCREEN
// ============================================
function ResultsScreen() {
  const scores = useGameStore((s) => s.scores)
  const roundWinners = useGameStore((s) => s.roundWinners)
  const roundResults = useGameStore((s) => s.roundResults)
  const totalRounds = useGameStore((s) => s.totalRounds)
  const wasEarlyEnd = useGameStore((s) => s.wasEarlyEnd)
  const completedRounds = useGameStore((s) => s.completedRounds)
  const resetGame = useGameStore((s) => s.resetGame)
  const battleData = useGameStore((s) => s.battleData)
  const roomCode = useGameStore((s) => s.roomCode)
  const playerName = useGameStore((s) => s.playerName)
  const { leaveAndDisconnect } = useGameSocket()
  const [showAnswerReview, setShowAnswerReview] = useState(false)
  const [showRematchPrompt, setShowRematchPrompt] = useState(false)
  const [rematchProcessing, setRematchProcessing] = useState(false)
  const isHost = useGameStore((s) => s.isHost)
  const battleMode = useGameStore((s) => s.battleMode)
  const teams = useGameStore((s) => s.teams)
  const myTeamId = useGameStore((s) => s.myTeamId)
  const players = useGameStore((s) => s.players)

  const handlePlayAgain = () => { leaveAndDisconnect(); resetGame() }

  // Show rematch prompt after a delay
  useEffect(() => {
    const timer = setTimeout(() => setShowRematchPrompt(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  const handleRematchYes = useCallback(() => {
    if (rematchProcessing || !globalSocket) return
    setRematchProcessing(true)
    // Disconnect voice chat first
    disconnectLiveKit()
    // Request rematch with the old room's settings
    globalSocket.emit('request-rematch', { oldRoomCode: roomCode, playerName })
  }, [rematchProcessing, roomCode, playerName])

  const handleGoHome = useCallback(() => {
    disconnectLiveKit()
    leaveAndDisconnect()
    resetGame()
  }, [leaveAndDisconnect, resetGame])

  // Get current player's full answer review from battleData
  const myAnswerReview: FullAnswerReviewItem[] = useMemo(() => {
    if (!battleData?.participants) return []
    const mySocketId = globalSocket?.id
    // Try to find by socket ID first, then by name
    let myParticipant = battleData.participants.find((p: any) => p.playerId === mySocketId || p.id === mySocketId)
    if (!myParticipant) {
      myParticipant = battleData.participants.find((p: any) => p.playerName === playerName || p.name === playerName)
    }
    if (!myParticipant?.answerReview) return []
    return myParticipant.answerReview as FullAnswerReviewItem[]
  }, [battleData, playerName])

  // Group answer reviews by round
  const reviewsByRound = useMemo(() => {
    if (myAnswerReview.length === 0) return {}
    return myAnswerReview.reduce((acc: Record<number, FullAnswerReviewItem[]>, review) => {
      const round = review.roundNumber
      if (!acc[round]) acc[round] = []
      acc[round].push(review)
      return acc
    }, {})
  }, [myAnswerReview])

  const totalCorrect = myAnswerReview.filter(a => a.isCorrect).length
  const totalQuestions = myAnswerReview.length

  const getMedalColor = (i: number) => {
    if (i === 0) return 'from-amber-400 to-amber-600'
    if (i === 1) return 'from-slate-300 to-slate-500'
    if (i === 2) return 'from-amber-700 to-amber-900'
    return 'from-slate-600 to-slate-700'
  }

  const getMedalClass = (i: number) => {
    if (i === 0) return 'podium-first'
    if (i === 1) return 'podium-second'
    if (i === 2) return 'podium-third'
    return 'bg-white/5 border border-white/10'
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4 relative overflow-hidden">
      <BattleBackground />

      <div className="relative z-10 w-full max-w-2xl py-8">
        {/* Victory Header */}
        <motion.div
          initial={{ scale: 0, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="text-center mb-8"
        >
          <motion.div
            animate={{
              textShadow: [
                '0 0 20px rgba(245,158,11,0.6), 0 0 40px rgba(245,158,11,0.2)',
                '0 0 40px rgba(245,158,11,0.8), 0 0 80px rgba(245,158,11,0.4)',
                '0 0 20px rgba(245,158,11,0.6), 0 0 40px rgba(245,158,11,0.2)',
              ],
            }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 mb-2"
          >
            {wasEarlyEnd ? 'تم إنهاء المعركة' : 'انتهت المعركة!'}
          </motion.div>
          <p className="text-slate-400">{wasEarlyEnd ? 'اعتماد النتائج النهائية' : 'النتائج النهائية للساحة'}</p>
          
          {/* Early end indicator */}
          {wasEarlyEnd && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-3"
            >
              <Badge className="bg-red-500/10 text-red-400 border border-red-500/30 text-xs px-3 py-1">
                <ShieldAlert className="w-3 h-3 ml-1" />
                أنهى القائد المعركة مبكراً — اتعملت {completedRounds} من {totalRounds} جولات
              </Badge>
            </motion.div>
          )}
        </motion.div>

        {/* Team Battle Results */}
        {battleMode === 'فرق' && teams && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="mb-6"
          >
            {/* Calculate team totals from scores */}
            {(() => {
              const teamATotal = scores.filter((s: Player) => {
                const p = players.find(pl => pl.id === s.id)
                return p?.teamId === 'A'
              }).reduce((sum: number, s: Player) => sum + (s.score || 0), 0)
              
              const teamBTotal = scores.filter((s: Player) => {
                const p = players.find(pl => pl.id === s.id)
                return p?.teamId === 'B'
              }).reduce((sum: number, s: Player) => sum + (s.score || 0), 0)
              
              const winningTeam: TeamId | null = teamATotal > teamBTotal ? 'A' : teamBTotal > teamATotal ? 'B' : null
              const myTeamWon = winningTeam === myTeamId
              
              return (
                <div className="battle-card-glow rounded-2xl overflow-hidden">
                  <div className="p-4 text-center border-b border-white/5">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.3 }}
                    >
                      {winningTeam ? (
                        <div>
                          <Trophy className={`w-10 h-10 mx-auto mb-2 ${winningTeam === 'A' ? 'text-red-400' : 'text-sky-400'}`} />
                          <h3 className={`text-xl font-black ${winningTeam === 'A' ? 'text-red-400' : 'text-sky-400'}`}>
                            {winningTeam === 'A' ? `${teams?.teamA.customName || 'الفريق الأحمر'} فاز! 🔥` : `${teams?.teamB.customName || 'الفريق الأزرق'} فاز! 🌊`}
                          </h3>
                          <p className="text-sm text-slate-400 mt-1">
                            {myTeamWon ? '🎉 فريقك كسب المعركة!' : '💪 حاول تاني الجاية!'}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <Shield className="w-10 h-10 mx-auto mb-2 text-amber-400" />
                          <h3 className="text-xl font-black text-amber-400">تعادل! ⚖️</h3>
                          <p className="text-sm text-slate-400 mt-1">الفريقين متساويين</p>
                        </div>
                      )}
                    </motion.div>
                  </div>
                  
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-4">
                      {/* Team A Score */}
                      <div className={`p-4 rounded-xl text-center ${winningTeam === 'A' ? 'bg-red-500/15 border-2 border-red-500/30' : 'bg-red-500/5 border border-red-500/10'}`}>
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <div className="w-3 h-3 rounded-full bg-red-500 shadow-lg shadow-red-500/50" />
                          <span className="font-bold text-red-400">{teams?.teamA.customName || 'الفريق الأحمر'}</span>
                        </div>
                        <div className="text-3xl font-black text-white">{teamATotal}</div>
                        <div className="text-xs text-slate-400 mt-1">انتصارات</div>
                        {/* Team A players */}
                        <div className="mt-3 space-y-1">
                          {teams.teamA.playerIds.map(pid => {
                            const p = players.find(pl => pl.id === pid)
                            const score = scores.find((s: Player) => s.id === pid)
                            if (!p) return null
                            return (
                              <div key={pid} className="flex items-center justify-between text-xs">
                                <span className="text-slate-300 truncate">{teams.teamA.captainId === pid && <Crown className="w-3 h-3 inline text-amber-400 ml-1" />}{p.name}</span>
                                <span className="text-red-400 font-bold">{score?.score || 0}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      
                      {/* Team B Score */}
                      <div className={`p-4 rounded-xl text-center ${winningTeam === 'B' ? 'bg-sky-500/15 border-2 border-sky-500/30' : 'bg-sky-500/5 border border-sky-500/10'}`}>
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <div className="w-3 h-3 rounded-full bg-sky-500 shadow-lg shadow-sky-500/50" />
                          <span className="font-bold text-sky-400">{teams?.teamB.customName || 'الفريق الأزرق'}</span>
                        </div>
                        <div className="text-3xl font-black text-white">{teamBTotal}</div>
                        <div className="text-xs text-slate-400 mt-1">انتصارات</div>
                        {/* Team B players */}
                        <div className="mt-3 space-y-1">
                          {teams.teamB.playerIds.map(pid => {
                            const p = players.find(pl => pl.id === pid)
                            const score = scores.find((s: Player) => s.id === pid)
                            if (!p) return null
                            return (
                              <div key={pid} className="flex items-center justify-between text-xs">
                                <span className="text-slate-300 truncate">{teams.teamB.captainId === pid && <Crown className="w-3 h-3 inline text-amber-400 ml-1" />}{p.name}</span>
                                <span className="text-sky-400 font-bold">{score?.score || 0}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                    
                    {/* MVP */}
                    {(() => {
                      const allPlayers = scores.map((s: Player) => ({
                        name: s.name,
                        score: s.score || 0,
                        teamId: players.find((p: Player) => p.id === s.id)?.teamId,
                      })).sort((a: any, b: any) => b.score - a.score)
                      
                      const mvp = allPlayers[0]
                      if (mvp && mvp.score > 0) {
                        return (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                            className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center"
                          >
                            <div className="flex items-center justify-center gap-2">
                              <Star className="w-4 h-4 text-amber-400" />
                              <span className="text-sm font-bold text-amber-400">أفضل مقاتل</span>
                              <Star className="w-4 h-4 text-amber-400" />
                            </div>
                            <p className="text-white font-bold mt-1">{mvp.name}</p>
                            <p className="text-xs text-slate-400">
                              {mvp.teamId === 'A' ? (teams?.teamA.customName || 'الفريق الأحمر') : (teams?.teamB.customName || 'الفريق الأزرق')} — {mvp.score} انتصار
                            </p>
                          </motion.div>
                        )
                      }
                      return null
                    })()}
                  </div>
                </div>
              )
            })()}
          </motion.div>
        )}

        {/* Podium - Top 3 */}
        {scores.length >= 3 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-end justify-center gap-3 mb-8 px-4"
          >
            {/* 2nd place */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className={`text-center p-4 rounded-2xl ${getMedalClass(1)} w-1/3`}
            >
              <div className={`w-14 h-14 mx-auto rounded-full bg-gradient-to-br ${getMedalColor(1)} flex items-center justify-center text-white font-bold text-lg mb-2`}>
                {scores[1].name.charAt(0)}
              </div>
              <p className="font-bold text-white text-sm truncate">{scores[1].name}</p>
              <p className="text-xs text-slate-400">{scores[1].roundWins || 0} جولات</p>
              <p className="text-lg font-black text-slate-300">{scores[1].score}</p>
              <div className="mt-1 text-xs text-slate-500">المركز الثاني</div>
            </motion.div>

            {/* 1st place */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className={`text-center p-5 rounded-2xl ${getMedalClass(0)} w-1/3 -mt-4`}
            >
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Crown className="w-8 h-8 mx-auto mb-2 text-amber-400" />
              </motion.div>
              <div className={`w-16 h-16 mx-auto rounded-full bg-gradient-to-br ${getMedalColor(0)} flex items-center justify-center text-white font-bold text-xl mb-2 glow-gold`}>
                {scores[0].name.charAt(0)}
              </div>
              <p className="font-bold text-white truncate">{scores[0].name}</p>
              <p className="text-xs text-amber-400">{scores[0].roundWins || 0} جولات</p>
              <p className="text-2xl font-black text-amber-400 text-glow-gold">{scores[0].score}</p>
              <div className="mt-1 text-xs text-amber-400/80">بطل المعركة!</div>
            </motion.div>

            {/* 3rd place */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className={`text-center p-4 rounded-2xl ${getMedalClass(2)} w-1/3`}
            >
              <div className={`w-14 h-14 mx-auto rounded-full bg-gradient-to-br ${getMedalColor(2)} flex items-center justify-center text-white font-bold text-lg mb-2`}>
                {scores[2].name.charAt(0)}
              </div>
              <p className="font-bold text-white text-sm truncate">{scores[2].name}</p>
              <p className="text-xs text-slate-400">{scores[2].roundWins || 0} جولات</p>
              <p className="text-lg font-black text-slate-300">{scores[2].score}</p>
              <div className="mt-1 text-xs text-slate-500">المركز الثالث</div>
            </motion.div>
          </motion.div>
        )}

        {/* Full leaderboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="battle-card-glow rounded-2xl p-4 mb-6"
        >
          <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />لوحة المتصدرين
          </h3>
          <div className="space-y-2">
            {scores.map((player, i) => {
              const isMuted = usePlayerMuteStore.getState().isPlayerMuted(player.id)
              const mySocketId = globalSocket?.id
              const isMe = player.id === mySocketId
              const isHostPlayer = useGameStore.getState().isHost
              return (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 + i * 0.08 }}
                className={`flex items-center gap-3 p-3 rounded-xl ${i < 3 ? getMedalClass(i) : 'bg-white/5 border border-white/5'}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-gradient-to-br ${getMedalColor(i)} text-white`}>
                  {i + 1}
                </div>
                {isMuted && <MicOff className="w-3 h-3 text-red-400/60 shrink-0" />}
                <span className={`flex-1 text-right font-semibold text-sm ${isMuted ? 'text-slate-500' : 'text-white'}`}>{player.name}</span>
                <div className="flex items-center gap-2">
                  {/* Mute button for other players — all players can local mute */}
                  {!isMe && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-6 h-6 rounded-full text-slate-500 hover:text-amber-400 hover:bg-amber-400/10 transition-all"
                      onClick={() => usePlayerMuteStore.getState().toggleLocalMute(player.id, player.name)}
                      title={isMuted ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
                    >
                      {isMuted ? <Volume1 className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                    </Button>
                  )}
                  {/* Host-only: Kick & mute-for-all buttons during game */}
                  {!isMe && isHostPlayer && !player.isHost && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-6 h-6 rounded-full text-slate-500 hover:text-orange-400 hover:bg-orange-400/10 transition-all"
                        onClick={() => {
                          if (globalSocket) {
                            globalSocket.emit('mute-player', { playerId: player.id })
                          }
                        }}
                        title="كتم الصوت للجميع"
                      >
                        <VolumeX className="w-3 h-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-6 h-6 rounded-full text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-all"
                            title="طرد اللاعب"
                          >
                            <UserX className="w-3 h-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-[#12121F] border-white/10 text-white" dir="rtl">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-white">طرد {player.name} من المعركة؟</AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-400">
                              هتطرد {player.name} من المعركة. النقاط بتاعته هتتحسب لحد ما اتحسبت.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="flex gap-2">
                            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">إلغاء</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 text-white hover:bg-red-700"
                              onClick={() => {
                                if (globalSocket) {
                                  globalSocket.emit('kick-player', { playerId: player.id })
                                }
                              }}
                            >
                              طرد
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                  <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs">
                    <Trophy className="w-3 h-3 ml-1" />{player.roundWins || 0}
                  </Badge>
                  <span className="font-bold text-sm text-white">{player.score}</span>
                  <span className="text-xs text-slate-500">نقطة</span>
                </div>
              </motion.div>
              )
            })}
          </div>
        </motion.div>

        {/* Round details */}
        {Object.keys(roundResults).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 }}
            className="battle-card rounded-2xl p-4 mb-6"
          >
            <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-cyan-400" />تفاصيل الجولات
            </h3>
            <ScrollArea className="max-h-64">
              <div className="space-y-3">
                {Object.entries(roundResults).map(([roundNum, roundScores]) => {
                  const winner = roundWinners[Number(roundNum)]
                  const sortedScores = [...(roundScores as RoundScore[])].sort((a, b) => b.score - a.score)
                  return (
                    <div key={roundNum} className="p-3 rounded-xl bg-white/5 border border-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-white">الجولة {Number(roundNum) + 1}</span>
                        {winner && (
                          <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs">
                            <Crown className="w-3 h-3 ml-1" />{winner}
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-1">
                        {sortedScores.map((s) => (
                          <div key={s.playerId} className="flex items-center justify-between text-xs">
                            <span className="text-slate-300">{s.playerName}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400">{s.correctAnswers}/{s.totalQuestions}</span>
                              <span className="text-white font-bold">{s.score}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </motion.div>
        )}

        {/* Full Answer Review Button */}
        {myAnswerReview.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.3 }}
            className="mb-6"
          >
            <Button
              variant="outline"
              onClick={() => setShowAnswerReview(true)}
              className="w-full border-cyan-500/30 bg-cyan-500/5 text-cyan-400 hover:bg-cyan-500/15 hover:text-cyan-300 rounded-xl gap-2 py-4"
            >
              <Eye className="w-4 h-4" /> تفاصيل الإجابات وتصحيحها
              <Badge className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs px-2 py-0.5">
                {totalCorrect}/{totalQuestions}
              </Badge>
            </Button>
          </motion.div>
        )}

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5 }}
          className="flex gap-3"
        >
          <Button className="flex-1 btn-battle rounded-xl py-6 text-lg" onClick={handleGoHome}>
            <HomeIcon className="w-5 h-5 ml-2" />ارجع للصفحة الرئيسية
          </Button>
        </motion.div>
      </div>

      {/* Rematch Prompt Overlay */}
      <AnimatePresence>
        {showRematchPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 30 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="battle-card-glow rounded-2xl p-8 max-w-sm w-full text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center"
              >
                <Swords className="w-8 h-8 text-white" />
              </motion.div>
              <h3 className="text-white font-bold text-xl mb-2">عايز تلعب معركة مشابهه؟</h3>
              <p className="text-slate-400 text-sm mb-6">
                نفس الإعدادات، غرفة جديدة، وأول واحد يدوس نعم هيبقى هو القائد
              </p>
              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleRematchYes}
                  disabled={rematchProcessing}
                  className="btn-battle rounded-xl py-5 text-base gap-2"
                >
                  {rematchProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  نعم
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setShowRematchPrompt(false); handleGoHome() }}
                  className="border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white rounded-xl py-4"
                >
                  ارجع للصفحة الرئيسية
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full Answer Review Dialog */}
      <Dialog open={showAnswerReview} onOpenChange={setShowAnswerReview}>
        <DialogContent className="bg-[#12121F] border-white/10 text-white max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2 text-base">
              <Brain className="w-4 h-4 text-purple-400" />
              تفاصيل الإجابات وتصحيحها
            </DialogTitle>
            <DialogDescription className="text-right text-xs text-slate-500">
              {totalCorrect} إجابة صحيحة من {totalQuestions} — {totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0}% دقة
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {Object.entries(reviewsByRound)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([roundNum, reviews]) => (
                <div key={roundNum}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-red-500/10 text-red-400 border border-red-500/30 text-xs px-2 py-0.5">
                      الجولة {Number(roundNum) + 1}
                    </Badge>
                    <span className="text-[10px] text-slate-500">
                      {reviews.filter(r => r.isCorrect).length}/{reviews.length} صحيح
                    </span>
                  </div>
                  <div className="space-y-2">
                    {reviews.map((review, idx) => (
                      <AnswerReviewQuestionCard
                        key={idx}
                        review={review}
                        roundNumber={Number(roundNum)}
                        roomCode={roomCode}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================
// RECONNECTING SCREEN
// ============================================
function ReconnectingScreen() {
  const resetGame = useGameStore((s) => s.resetGame)

  useEffect(() => {
    // If reconnection doesn't succeed within 10 seconds, reset to home
    const timeout = setTimeout(() => {
      console.log('[ReconnectingScreen] Reconnection timed out after 10s, resetting to home')
      disconnectGlobalSocket()
      clearSessionStorage()
      resetGame()
    }, 10000)
    return () => clearTimeout(timeout)
  }, [resetGame])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <BattleBackground />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 text-center"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-16 h-16 mx-auto mb-6 border-4 border-red-500/30 border-t-red-500 rounded-full"
        />
        <h2 className="text-2xl font-black text-white mb-2">إعادة الاتصال</h2>
        <p className="text-slate-400 mb-6">جاري محاولة العودة للساحة...</p>
        <Button
          variant="ghost"
          className="text-slate-400 hover:text-white hover:bg-white/10"
          onClick={() => {
            disconnectGlobalSocket()
            clearSessionStorage()
            resetGame()
          }}
        >
          <LogOut className="w-4 h-4 ml-2" />
          العودة للرئيسية
        </Button>
      </motion.div>
    </div>
  )
}

// ============================================
// HISTORY SCREEN WRAPPER - Handles list/detail navigation
// ============================================
function HistoryScreenWrapper() {
  const playerName = useGameStore((s) => s.playerName)
  const setScreen = useGameStore((s) => s.setScreen)
  const [selectedBattle, setSelectedBattle] = useState<any>(null)

  if (!playerName) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-4">يجب إدخال اسمك أولاً لعرض سجل المعارك</p>
          <Button onClick={() => setScreen('home')} className="btn-battle">
            العودة للرئيسية
          </Button>
        </div>
      </div>
    )
  }

  if (selectedBattle) {
    return (
      <BattleDetail
        battle={selectedBattle}
        playerName={playerName}
        onBack={() => setSelectedBattle(null)}
      />
    )
  }

  return (
    <BattleHistoryList
      playerName={playerName}
      onBattleSelect={(battle) => setSelectedBattle(battle)}
      onBack={() => setScreen('home')}
    />
  )
}

// ============================================
// MAIN HOME COMPONENT
// ============================================
export default function Home() {
  const screen = useGameStore((s) => s.screen)
  const isReconnecting = useGameStore((s) => s.isReconnecting)
  const roomCode = useGameStore((s) => s.roomCode)
  const playerName = useGameStore((s) => s.playerName)
  const gameContent = useGameStore((s) => s.gameContent)
  const restoreState = useGameStore((s) => s.restoreState)
  const currentRound = useGameStore((s) => s.currentRound)
  const { rejoinRoom } = useGameSocket()
  const [showSplash, setShowSplash] = useState(true)
  const [splashComplete, setSplashComplete] = useState(false)
  const prevScreenRef = useRef<Screen>('home')

  // Onboarding state
  const [showCinematicIntro, setShowCinematicIntro] = useState(false)
  const [showUIHighlights, setShowUIHighlights] = useState(false)
  const onboardingCompleted = useOnboardingStore((s) => s.onboardingCompleted)
  const cinematicIntroCompleted = useOnboardingStore((s) => s.cinematicIntroCompleted)
  const uiHighlightCompleted = useOnboardingStore((s) => s.uiHighlightCompleted)

  // Guest identity state
  const guest = useGuestStore((s) => s.guest)
  const guestIsLoading = useGuestStore((s) => s.isLoading)
  const showNameModal = useGuestStore((s) => s.showNameModal)
  const setGuest = useGuestStore((s) => s.setGuest)
  const saveGuestId = useGuestStore((s) => s.saveGuestId)
  const loadGuestId = useGuestStore((s) => s.loadGuestId)
  const loadGuestProfile = useGuestStore((s) => s.loadGuestProfile)
  const hasVisitedBefore = useGuestStore((s) => s.hasVisitedBefore)
  const setIsLoading = useGuestStore((s) => s.setIsLoading)
  const setShowNameModal = useGuestStore((s) => s.setShowNameModal)

  // Restore guest identity on mount
  // Priority: localStorage profile → cookie ID + API → first visit
  useEffect(() => {
    // Step 1: Check localStorage for cached guest profile (fast, no API needed)
    const cachedProfile = loadGuestProfile()
    if (cachedProfile) {
      // We have a cached profile — use it immediately so the user never sees the name modal again
      // Use setGuest which also handles isLoading and re-saves to localStorage
      setGuest(cachedProfile)

      // Try to refresh from API in the background (to get any updated data)
      const guestId = cachedProfile.id
      if (!guestId.startsWith('local-')) {
        fetch(`/api/guest?id=${encodeURIComponent(guestId)}`)
          .then(res => {
            if (res.ok) return res.json()
            throw new Error('Guest not found')
          })
          .then(data => {
            // Update with fresh data from API (this also re-saves to localStorage via setGuest)
            setGuest({ id: data.id, displayName: data.displayName, avatarColor: data.avatarColor })
          })
          .catch(() => {
            // API refresh failed — that's fine, we already have the cached profile
          })
      }
      return
    }

    // Step 2: No localStorage cache — check cookie for guest ID (backward compat)
    const guestId = loadGuestId()
    if (guestId) {
      // Try to restore from database
      fetch(`/api/guest?id=${encodeURIComponent(guestId)}`)
        .then(res => {
          if (res.ok) return res.json()
          throw new Error('Guest not found')
        })
        .then(data => {
          setGuest({ id: data.id, displayName: data.displayName, avatarColor: data.avatarColor })
        })
        .catch(() => {
          // API failed or guest not found — no local cache either
          // This means we lost the identity, treat as first visit
          setIsLoading(false)
        })
    } else {
      // Step 3: No cookie, no localStorage — truly first visit
      setIsLoading(false)
    }
  }, [loadGuestId, loadGuestProfile, setGuest, saveGuestId, setIsLoading, setShowNameModal])

  // Show name entry modal after splash completes (ONLY for first-time visitors)
  useEffect(() => {
    if (splashComplete && !guest && !guestIsLoading) {
      // Only show the cinematic NameEntryModal if the user has never visited before
      // If they have a cached profile (even if API restore failed), don't show it
      if (!hasVisitedBefore()) {
        setShowNameModal(true)
      }
    }
  }, [splashComplete, guest, guestIsLoading, hasVisitedBefore, setShowNameModal])

  // ─── Onboarding Flow ───────────────────────────────────────────────────────
  // After name modal closes (identity created) → show cinematic intro (first-time only)
  // After cinematic intro → show UI highlights
  // After UI highlights → onboarding complete
  useEffect(() => {
    // When name modal just closed and user is new → start cinematic intro
    if (splashComplete && !showNameModal && guest && !guestIsLoading) {
      if (shouldShowCinematicIntro()) {
        // Small delay after name entry for smooth transition
        const timer = setTimeout(() => {
          setShowCinematicIntro(true)
        }, 600)
        return () => clearTimeout(timer)
      } else if (shouldShowUIHighlights() && screen === 'home') {
        // If cinematic already done but UI highlights not → start highlights
        const timer = setTimeout(() => {
          setShowUIHighlights(true)
        }, 500)
        return () => clearTimeout(timer)
      }
    }
  }, [splashComplete, showNameModal, guest, guestIsLoading, screen])

  // Handle cinematic intro completion
  const handleCinematicIntroComplete = useCallback(() => {
    setShowCinematicIntro(false)
    // Mark onboarding as completed in the store (cinematic intro done)
    useOnboardingStore.getState().completeOnboarding()
    // Start UI highlights after a short delay
    if (!uiHighlightCompleted) {
      setTimeout(() => {
        setShowUIHighlights(true)
      }, 800)
    }
  }, [uiHighlightCompleted])

  // Handle UI highlights completion
  const handleUIHighlightsComplete = useCallback(() => {
    setShowUIHighlights(false)
  }, [])

  // ═══════════════════════════════════════════════════════════════
  // SCROLL RESET + TRANSITION SOUND ON SCREEN CHANGE
  // Every screen change resets scroll to top instantly — no stale
  // scroll position carries over. Uses requestAnimationFrame to
  // avoid conflicting with AnimatePresence exit animations.
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (prevScreenRef.current !== screen && !showSplash) {
      const from = prevScreenRef.current
      const to = screen

      // ── Reset scroll position instantly ──
      // Use RAF to ensure it runs after React's render commit,
      // preventing any visual conflict with exit animations.
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
        // Also reset any scrollable containers that might hold stale position
        document.documentElement.scrollTop = 0
        document.body.scrollTop = 0
      })

      // ── Play appropriate transition sound ──
      if (to === 'loading') {
        audioEngine.transition('metallic')
      } else if (to === 'game') {
        // battleStart is already played in the socket handler
      } else if (to === 'results' || to === 'round-transition') {
        // roundEndReveal/victory/defeat handled in socket handlers
      } else if (from === 'home' && (to === 'create' || to === 'join')) {
        audioEngine.transition('whoosh')
      } else if (to === 'home') {
        audioEngine.transition('impact')
      } else if (to === 'lobby') {
        audioEngine.transition('metallic')
      } else {
        audioEngine.transition('slash')
      }
    }
    prevScreenRef.current = screen
  }, [screen, showSplash])

  // Rejoin on mount if session exists
  useEffect(() => {
    if (splashComplete) {
      const saved = loadFromSessionStorage()
      if (saved && saved.roomCode && saved.playerName) {
        restoreState(saved)
        rejoinRoom(saved.roomCode, saved.playerName)
      }
    }
  }, [splashComplete, restoreState, rejoinRoom])

  // Handle deep link invites (?join=ROOMCODE)
  const setRoomCode = useGameStore((s) => s.setRoomCode)
  const setScreen = useGameStore((s) => s.setScreen)
  useEffect(() => {
    if (splashComplete && guest) {
      const invite = parseJoinUrl()
      if (invite && invite.autoJoin) {
        // Pre-fill room code and navigate to join screen
        setRoomCode(invite.roomCode)
        setScreen('join')
        // Clean URL params to avoid re-processing on refresh
        cleanJoinParams()
      }
    }
  }, [splashComplete, guest, setRoomCode, setScreen])

  // Sync game store playerName with guest identity
  const setPlayerName = useGameStore((s) => s.setPlayerName)
  useEffect(() => {
    if (guest?.displayName && playerName !== guest.displayName) {
      setPlayerName(guest.displayName)
    }
  }, [guest?.displayName, playerName, setPlayerName])

  // Listen for name change events from EditNameModal and forward to game server
  useEffect(() => {
    const onNameChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.newName && globalSocket?.connected) {
        globalSocket.emit('update-name', { newName: detail.newName })
      }
    }
    window.addEventListener('player-name-changed', onNameChanged)
    return () => window.removeEventListener('player-name-changed', onNameChanged)
  }, [])

  const handleSplashComplete = useCallback(() => {
    setSplashComplete(true)
    // Small delay before hiding splash for smooth transition
    setTimeout(() => setShowSplash(false), 300)
  }, [])

  // Show reconnecting screen
  if (isReconnecting && splashComplete) {
    return <ReconnectingScreen />
  }

  return (
    <ArenaNarratorProvider>
      <GameplayHintsProvider>
        <main className="min-h-screen flex flex-col">
          {/* Audio Controls - always visible */}
          <AudioControls />

          {/* Guest Identity Modals */}
          <AnimatePresence>
            {showNameModal && <NameEntryModal />}
          </AnimatePresence>
          <EditNameModal />

          {/* Cinematic Onboarding Intro - after identity creation, first-time only */}
          <AnimatePresence>
            {showCinematicIntro && guest && (
              <CinematicIntro
                onComplete={handleCinematicIntroComplete}
                playerName={guest.displayName}
              />
            )}
          </AnimatePresence>

          {/* UI Highlights Tour - after cinematic intro, first-time only */}
          <UIHighlights
            isActive={showUIHighlights && screen === 'home'}
            onComplete={handleUIHighlightsComplete}
          />

          {/* Splash Screen */}
          <AnimatePresence>
            {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
          </AnimatePresence>

          {/* Main content */}
          {!showSplash && (
            <AnimatePresence mode="wait">
              <motion.div
                key={screen}
                initial="initial"
                animate="animate"
                exit="exit"
                variants={battleTransition}
                transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="flex-1 flex flex-col"
                data-screen-transition=""
              >
                {screen === 'home' && <HomeScreen />}
                {screen === 'create' && <CreateGameScreen />}
                {screen === 'join' && <JoinGameScreen />}
                {screen === 'lobby' && <LobbyScreen />}
                {screen === 'loading' && <LoadingScreen />}
                {screen === 'game' && <GameScreen key={`round-${currentRound}`} />}
                {screen === 'round-transition' && <RoundTransitionScreen />}
                {screen === 'history' && <HistoryScreenWrapper />}
                {screen === 'about' && <AboutPage onBack={() => setScreen('home')} />}
                {screen === 'results' && <ResultsScreen />}
              </motion.div>
            </AnimatePresence>
          )}

          {/* Arena Tips - context-aware rotating tips */}
          {!showSplash && screen === 'loading' && <div className="py-4"><ArenaTips context="loading" /></div>}
          {!showSplash && screen === 'lobby' && <div className="py-2"><ArenaTips context="lobby" /></div>}
          {!showSplash && screen === 'results' && <div className="py-4"><ArenaTips context="results" /></div>}
          {!showSplash && screen === 'round-transition' && <div className="py-4"><ArenaTips context="round-transition" /></div>}

          {/* Voice Chat - persists across screens, chat only in lobby */}
          {!showSplash && (screen === 'lobby' || screen === 'game' || screen === 'loading' || screen === 'round-transition') && roomCode && playerName && (
            <VoiceChat
              roomCode={roomCode}
              playerName={playerName}
              showChat={screen === 'lobby'}
            />
          )}
        </main>
      </GameplayHintsProvider>
    </ArenaNarratorProvider>
  )
}
