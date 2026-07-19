import { createServer, IncomingMessage, ServerResponse } from 'http'
import { Server, Socket } from 'socket.io'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ─── Load .env file ─────────────────────────────────────────────────────────
try {
  const envPath = resolve(import.meta.dirname || __dirname, '.env')
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim()
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  }
  console.log('[env] Loaded .env file')
} catch (err: any) {
  console.log('[env] No .env file found, using environment variables')
}

// ═══════════════════════════════════════════════════════════════════════════
// LLM PROVIDERS: NVIDIA (Primary) → OpenRouter (Fallback)
// OpenRouter ONLY activates when NVIDIA completely fails
// ═══════════════════════════════════════════════════════════════════════════

// ─── NVIDIA (Primary) ────────────────────────────────────────────────────
const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || ''
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || 'deepseek-ai/deepseek-v4-flash'

// ─── OpenRouter (Fallback - ONLY used if NVIDIA fails completely) ────────
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ''
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash'

// ─── Other config ────────────────────────────────────────────────────────
const NEXT_APP_URL = process.env.NEXT_APP_URL || ''
const DATABASE_URL = process.env.DATABASE_URL || ''
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || ''
const SELF_PING_URL = process.env.SELF_PING_URL || RENDER_EXTERNAL_URL

// ─── NVIDIA failure tracking ─────────────────────────────────────────────
// If NVIDIA fails N consecutive times, we switch to fallback temporarily
let nvidiaConsecutiveFailures = 0
const NVIDIA_MAX_FAILURES_BEFORE_FALLBACK = 3
let nvidiaFallbackActive = false
let nvidiaFallbackActivatedAt = 0
const NVIDIA_FALLBACK_COOLDOWN_MS = 10 * 60 * 1000 // 10 minutes before retrying NVIDIA

console.log(`[NVIDIA] API Key: ${NVIDIA_API_KEY ? NVIDIA_API_KEY.substring(0, 10) + '...' : 'NOT SET!'}`)
console.log(`[NVIDIA] Model: ${NVIDIA_MODEL}`)
console.log(`[OpenRouter] API Key: ${OPENROUTER_API_KEY ? OPENROUTER_API_KEY.substring(0, 10) + '...' : 'NOT SET!'}`)
console.log(`[OpenRouter] Model: ${OPENROUTER_MODEL} (fallback only)`)
console.log(`[Config] NEXT_APP_URL: ${NEXT_APP_URL || '(not set)'}`)
console.log(`[Config] DATABASE_URL: ${DATABASE_URL ? DATABASE_URL.substring(0, 30) + '...' : '(not set)'}`)
console.log(`[Config] RENDER_EXTERNAL_URL: ${RENDER_EXTERNAL_URL || '(not set)'}`)
console.log(`[Config] SELF_PING_URL: ${SELF_PING_URL || '(not set)'}`)

interface ChatMessage {
  role: 'system' | 'assistant' | 'user'
  content: string
}

// ─── NVIDIA LLM call (Primary) ─────────────────────────────────────────
async function callNvidiaLLM(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; timeoutMs?: number }
): Promise<string | null> {
  if (!NVIDIA_API_KEY) {
    console.error('[NVIDIA] ❌ NVIDIA_API_KEY is not set!')
    return null
  }
  const timeoutMs = options?.timeoutMs || 90000  // 90 seconds default (game content is large)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(NVIDIA_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages,
        temperature: options?.temperature ?? 0.8,
        max_tokens: options?.maxTokens ?? 8192,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[NVIDIA] API error ${response.status}: ${errorBody}`)
      return null
    }

    const data = await response.json() as any
    const content = data.choices?.[0]?.message?.content || null
    if (content) {
      console.log(`[NVIDIA] ✅ LLM response received (${content.length} chars, model: ${NVIDIA_MODEL})`)
    }
    return content
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error('[NVIDIA] LLM request timed out')
    } else {
      console.error('[NVIDIA] LLM request failed:', err.message)
    }
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// ─── OpenRouter LLM call (Fallback) ─────────────────────────────────────
async function callOpenRouterLLM(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; timeoutMs?: number }
): Promise<string | null> {
  if (!OPENROUTER_API_KEY) {
    console.error('[OpenRouter] ❌ OPENROUTER_API_KEY is not set! Fallback unavailable.')
    return null
  }
  const timeoutMs = options?.timeoutMs || 90000
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://battle-of-questions.app',
        'X-Title': 'Battle of Questions',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages,
        temperature: options?.temperature ?? 0.8,
        max_tokens: options?.maxTokens ?? 8192,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[OpenRouter] API error ${response.status}: ${errorBody}`)
      return null
    }

    const data = await response.json() as any
    const content = data.choices?.[0]?.message?.content || null
    if (content) {
      console.log(`[OpenRouter] ✅ Fallback response received (${content.length} chars, model: ${OPENROUTER_MODEL})`)
    }
    return content
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error('[OpenRouter] Fallback request timed out')
    } else {
      console.error('[OpenRouter] Fallback request failed:', err.message)
    }
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// ─── Unified LLM call: NVIDIA first, OpenRouter ONLY if NVIDIA fails ────
async function callLLM(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; timeoutMs?: number }
): Promise<string | null> {
  // Check if NVIDIA fallback is active and cooldown hasn't expired
  if (nvidiaFallbackActive) {
    const elapsed = Date.now() - nvidiaFallbackActivatedAt
    if (elapsed < NVIDIA_FALLBACK_COOLDOWN_MS) {
      console.log(`[LLM] ⚠️ NVIDIA in cooldown (${Math.round(elapsed / 1000)}s / ${NVIDIA_FALLBACK_COOLDOWN_MS / 1000}s), using OpenRouter fallback`)
      const result = await callOpenRouterLLM(messages, options)
      if (result) return result
      // If even fallback fails, try NVIDIA anyway as last resort
      console.log('[LLM] ⚠️ Fallback also failed! Trying NVIDIA as last resort...')
      return await callNvidiaLLM(messages, options)
    } else {
      // Cooldown expired, try NVIDIA again
      console.log('[LLM] 🔄 NVIDIA cooldown expired, retrying...')
      nvidiaFallbackActive = false
      nvidiaConsecutiveFailures = 0
    }
  }

  // ─── Step 1: Try NVIDIA (primary) ────────────────────────────────────
  if (NVIDIA_API_KEY) {
    const result = await callNvidiaLLM(messages, options)
    if (result) {
      // NVIDIA succeeded → reset failure counter
      if (nvidiaConsecutiveFailures > 0) {
        console.log(`[LLM] ✅ NVIDIA recovered! Resetting failure counter (was ${nvidiaConsecutiveFailures})`)
      }
      nvidiaConsecutiveFailures = 0
      return result
    }

    // NVIDIA failed → increment counter
    nvidiaConsecutiveFailures++
    console.log(`[LLM] ❌ NVIDIA failed (${nvidiaConsecutiveFailures}/${NVIDIA_MAX_FAILURES_BEFORE_FALLBACK})`)

    // If not enough failures yet, still try fallback for THIS request
    if (nvidiaConsecutiveFailures < NVIDIA_MAX_FAILURES_BEFORE_FALLBACK) {
      console.log(`[LLM] 🔄 Trying OpenRouter fallback for this request...`)
      const fallbackResult = await callOpenRouterLLM(messages, options)
      if (fallbackResult) return fallbackResult
      return null
    }

    // NVIDIA failed too many times → activate fallback mode
    console.log(`[LLM] 🚨 NVIDIA failed ${nvidiaConsecutiveFailures} times! Activating OpenRouter fallback for ${NVIDIA_FALLBACK_COOLDOWN_MS / 1000}s`)
    nvidiaFallbackActive = true
    nvidiaFallbackActivatedAt = Date.now()

    // Try fallback now
    console.log('[LLM] 🔄 Switching to OpenRouter fallback...')
    const fallbackResult = await callOpenRouterLLM(messages, options)
    if (fallbackResult) return fallbackResult
    return null
  }

  // ─── No NVIDIA key at all → use OpenRouter if available ──────────────
  if (OPENROUTER_API_KEY) {
    console.log('[LLM] ⚠️ No NVIDIA_API_KEY set, using OpenRouter')
    return await callOpenRouterLLM(messages, options)
  }

  console.error('[LLM] ❌ No API keys configured! Neither NVIDIA nor OpenRouter can be used.')
  return null
}

async function duckDuckGoSearch(
  query: string,
  options?: { timeoutMs?: number }
): Promise<Array<{ name: string; snippet: string }>> {
  const timeoutMs = options?.timeoutMs || 4000
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!response.ok) return []
    const html = await response.text()
    const results: Array<{ name: string; snippet: string }> = []
    const resultRegex = /<a[^>]*class="result__a"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gi
    let match
    while ((match = resultRegex.exec(html)) !== null && results.length < 5) {
      const name = match[1].replace(/<[^>]*>/g, '').trim()
      const snippet = match[2].replace(/<[^>]*>/g, '').trim()
      if (name && snippet && snippet.length > 30) {
        results.push({ name, snippet })
      }
    }
    console.log(`[WebSearch] Found ${results.length} results for "${query}"`)
    return results
  } catch (err: any) {
    console.error('[WebSearch] Search failed:', err.message)
    return []
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type GameType = 'قراءة متحررة' | 'نصوص'
type Difficulty = 'سهل' | 'متوسط' | 'صعب'
type RoomType = 'عامة' | 'خاصة'
type PassageType = 'علمي' | 'أدبي' | 'عشوائي'
type BattleMode = 'فردي' | 'فرق'
type TeamId = 'A' | 'B'

interface GameSettings {
  gameType: GameType
  difficulty: Difficulty
  timePerRound: number       // minutes per round (5, 7, 10, 15, 20, 25)
  numberOfRounds: number     // total rounds to play (max 20)
  maxPlayers: number         // max players (max 20, 0 = open/unlimited)
  playerMode: 'fixed' | 'open'
  passageType: PassageType   // Only relevant when gameType === 'قراءة متحررة'
  battleMode: BattleMode
}

interface Player {
  id: string
  name: string
  score: number
  isHost: boolean
  isReady: boolean
  joinOrder: number
  roundWins: number          // number of rounds this player has won
  isDisconnected: boolean   // true if player disconnected but can still rejoin
  disconnectedAt: number | null  // timestamp when player disconnected
  oldSocketIds: string[]    // previous socket IDs for reconnection matching
  teamId: TeamId | null
  isCaptain: boolean
}

interface Question {
  id: number
  text: string
  options: string[]
  correctAnswer: number
  explanation: string
}

interface GameContent {
  title: string
  text: string
  source: string
  questions: Question[]
}

interface RoundContent {
  roundNumber: number
  content: GameContent
}

interface RoundScore {
  playerId: string
  playerName: string
  score: number
  correctAnswers: number
  totalQuestions: number
}

interface GameRoom {
  roomCode: string
  roomType: RoomType
  password: string | null
  hostId: string
  hostName: string
  settings: GameSettings
  players: Map<string, Player>
  rounds: RoundContent[]
  status: 'waiting' | 'playing' | 'finished'
  currentRound: number            // 0-indexed current round
  playerAnswers: Map<string, Map<number, Map<number, { answerIndex: number; timeTaken: number }>>>  // playerId -> roundIndex -> questionIndex -> answer
  roundStartTime: number | null   // timestamp when current round started
  roundTimerSeconds: number       // seconds for the round timer
  roundResults: Map<number, RoundScore[]>  // roundIndex -> scores for that round
  roundWinners: Map<number, string>  // roundIndex -> playerId of winner
  roundEnding: boolean            // true if round-end processing has started (prevents double calls)
  roundTimer: NodeJS.Timeout | null  // server-side round timer as authoritative backup
  earlyEnding: boolean            // true if early-end-game processing has started (prevents duplicate requests)
  gameStartTime: number | null    // timestamp when the game first started (for accurate duration)
  readyPlayers: Set<string>       // player IDs who marked ready for next round
  finishedPlayers: Set<string>    // player IDs who clicked "خلصت" in current round
  battleMode: BattleMode
  voiceMerged: boolean
  pendingApproval: ApprovalRequest | null
  joinRequests: Map<string, JoinRequest>  // requestId -> JoinRequest
  teamNames: Record<TeamId, string | null>  // custom team names set by captains
  _prefetchInProgress: number  // -1 = idle, else = round index being prefetched
}

// Info sent to clients about public rooms
interface RoomInfo {
  roomCode: string
  roomType: RoomType
  hasPassword: boolean
  hostName: string
  playerCount: number
  maxPlayers: number
  playerMode: 'fixed' | 'open'
  settings: GameSettings
  status: 'waiting' | 'playing' | 'finished'
  battleMode: BattleMode
}

interface ApprovalRequest {
  id: string
  type: 'settings' | 'early-end' | 'voice-merge' | 'round-start'
  description: string
  requestedBy: string
  requestedByName: string
  targetCaptainId: string
  targetCaptainName: string
  createdAt: number
  expiresAt: number
  data: any
  status: 'pending' | 'approved' | 'rejected' | 'expired'
}

interface JoinRequest {
  id: string
  playerId: string
  playerName: string
  targetTeamId: TeamId
  type: 'join' | 'switch'  // 'join' = from unassigned, 'switch' = from another team
  currentTeamId: TeamId | null  // null for unassigned players
  createdAt: number
  expiresAt: number
  status: 'pending' | 'approved' | 'rejected' | 'expired'
}

interface TeamInfo {
  id: TeamId
  name: string        // default name: "الفريق الأحمر" or "الفريق الأزرق"
  customName: string | null  // captain-chosen name, null = use default
  color: string
  captainId: string | null
  captainName: string | null
  playerIds: string[]
}

// ─── In-Memory State (declared BEFORE createServer so health-check can read them) ──

const rooms = new Map<string, GameRoom>()

// Map socket.id → roomCode so we can clean up on disconnect
const socketRoomMap = new Map<string, string>()

// Global counter for join order tracking
let globalJoinCounter = 0

// Grace period for disconnected players (milliseconds) - they can rejoin within this time
const DISCONNECT_GRACE_PERIOD = 60000 // 60 seconds

// ─── Rematch Data ─────────────────────────────────────────────────────────
interface RematchData {
  players: Map<string, { name: string; oldSocketId: string }>
  settings: GameSettings
  roomType: string
  password: string | null
  newRoomCode: string | null
  matchedPlayers: Set<string> // Old socket IDs who already rematched
}
const rematchData = new Map<string, RematchData>()

// ─── HTTP Server + Health Check ───────────────────────────────────────────────
// Railway (and other cloud providers) need a working HTTP endpoint to confirm
// the container is alive.  Socket.IO responds with 400 on GET / which makes
// Railway think the service is unhealthy and restarts it in a loop.
// We add a simple /health endpoint that returns 200.
const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health' || req.url === '/keepalive') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ 
      status: 'ok', 
      uptime: process.uptime(), 
      rooms: rooms.size, 
      players: socketRoomMap.size,
      llm: {
        nvidia: {
          keySet: !!NVIDIA_API_KEY,
          model: NVIDIA_MODEL,
          consecutiveFailures: nvidiaConsecutiveFailures,
          fallbackActive: nvidiaFallbackActive,
        },
        openrouter: {
          keySet: !!OPENROUTER_API_KEY,
          model: OPENROUTER_MODEL,
        }
      }
    }))
    return
  }
  // For any other path, let Socket.IO handle it
})

const io = new Server(httpServer, {
  path: '/socket.io/',
  cors: {
    origin: [
      'https://ma3raka.vercel.app',
      'http://localhost:3000',
      'https://ma3raka.vercel.app',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 10000,
  pingInterval: 5000,
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Characters that are not easily confused (exclude O, 0, I, 1, L)
const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
  }
  // Ensure uniqueness
  while (rooms.has(code)) {
    code = ''
    for (let i = 0; i < 6; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
    }
  }
  return code
}

function playersToArray(players: Map<string, Player>): Player[] {
  return Array.from(players.values())
    .filter(p => !p.isDisconnected)  // Don't show disconnected players in the visible list
    .sort((a, b) => a.joinOrder - b.joinOrder)
}

// Get ALL players including disconnected ones (for internal use)
function playersToArrayAll(players: Map<string, Player>): Player[] {
  return Array.from(players.values())
    .sort((a, b) => a.joinOrder - b.joinOrder)
}

// Clean up expired disconnected players (called periodically)
function cleanupExpiredDisconnects() {
  const now = Date.now()
  for (const room of rooms.values()) {
    const toRemove: string[] = []
    for (const [playerId, player] of room.players.entries()) {
      if (player.isDisconnected && player.disconnectedAt && (now - player.disconnectedAt > DISCONNECT_GRACE_PERIOD)) {
        toRemove.push(playerId)
      }
    }
    for (const playerId of toRemove) {
      const player = room.players.get(playerId)!
      room.players.delete(playerId)
      room.playerAnswers.delete(playerId)
      // Clean up socketRoomMap for old IDs
      for (const oldId of player.oldSocketIds) {
        socketRoomMap.delete(oldId)
      }
      socketRoomMap.delete(playerId)

      // If the removed player was the host, transfer host
      if (room.hostId === playerId) {
        const newHost = findNextHost(room.players)
        if (newHost) {
          room.hostId = newHost.id
          room.hostName = newHost.name
          newHost.isHost = true
          io.to(room.roomCode).emit('host-changed', {
            newHostId: newHost.id,
            newHostName: newHost.name,
            oldHostName: player.name,
            players: playersToArray(room.players),
          })
        }
      }

      console.log(`[cleanup] Grace period expired for ${player.name} in room ${room.roomCode}. Removed permanently.`)

      // If room is now empty (no active players), delete it
      const activePlayers = Array.from(room.players.values()).filter(p => !p.isDisconnected)
      if (activePlayers.length === 0) {
        deleteRoom(room.roomCode)
      } else if (room.status === 'playing' && activePlayers.length === 1) {
        // Only one active player left during game - they win
        const remainingPlayer = activePlayers[0]
        io.to(room.roomCode).emit('opponent-left-game', {
          leftPlayerName: player.name,
          winnerName: remainingPlayer.name,
        })
        handleGameEnd(room.roomCode)
      }
    }
  }
}

// Run cleanup every 15 seconds
setInterval(cleanupExpiredDisconnects, 15000)

function findNextHost(players: Map<string, Player>, excludeId?: string): Player | undefined {
  let earliest: Player | undefined
  for (const player of players.values()) {
    if (excludeId && player.id === excludeId) continue
    if (player.isDisconnected) continue  // Skip disconnected players
    if (!earliest || player.joinOrder < earliest.joinOrder) {
      earliest = player
    }
  }
  return earliest
}

function getTeamPlayers(room: GameRoom, teamId: TeamId): Player[] {
  return Array.from(room.players.values())
    .filter(p => !p.isDisconnected && p.teamId === teamId)
    .sort((a, b) => a.joinOrder - b.joinOrder)
}

function getUnassignedPlayers(room: GameRoom): Player[] {
  return Array.from(room.players.values())
    .filter(p => !p.isDisconnected && p.teamId === null)
    .sort((a, b) => a.joinOrder - b.joinOrder)
}

function getTeamsInfo(room: GameRoom): { teamA: TeamInfo; teamB: TeamInfo; unassignedPlayerIds: string[] } {
  const teamAPlayers = getTeamPlayers(room, 'A')
  const teamBPlayers = getTeamPlayers(room, 'B')
  const teamACaptain = teamAPlayers.find(p => p.isCaptain)
  const teamBCaptain = teamBPlayers.find(p => p.isCaptain)
  const unassignedPlayers = getUnassignedPlayers(room)
  
  return {
    teamA: {
      id: 'A',
      name: 'الفريق الأحمر',
      customName: room.teamNames?.A || null,
      color: '#EF4444',
      captainId: teamACaptain?.id || null,
      captainName: teamACaptain?.name || null,
      playerIds: teamAPlayers.map(p => p.id),
    },
    teamB: {
      id: 'B',
      name: 'الفريق الأزرق',
      customName: room.teamNames?.B || null,
      color: '#3B82F6',
      captainId: teamBCaptain?.id || null,
      captainName: teamBCaptain?.name || null,
      playerIds: teamBPlayers.map(p => p.id),
    },
    unassignedPlayerIds: unassignedPlayers.map(p => p.id),
  }
}

function getTeamDisplayName(room: GameRoom, teamId: TeamId): string {
  const customName = room.teamNames?.[teamId]
  return customName || (teamId === 'A' ? 'الفريق الأحمر' : 'الفريق الأزرق')
}

function findNextTeamCaptain(room: GameRoom, teamId: TeamId, excludeId?: string): Player | undefined {
  const teamPlayers = getTeamPlayers(room, teamId)
  let earliest: Player | undefined
  for (const player of teamPlayers) {
    if (excludeId && player.id === excludeId) continue
    if (!earliest || player.joinOrder < earliest.joinOrder) {
      earliest = player
    }
  }
  return earliest
}

function transferTeamCaptain(room: GameRoom, teamId: TeamId, excludeId?: string): void {
  const newCaptain = findNextTeamCaptain(room, teamId, excludeId)
  if (!newCaptain) return
  
  // Remove captain from all players in this team
  for (const player of room.players.values()) {
    if (player.teamId === teamId) {
      player.isCaptain = false
    }
  }
  
  // Set new captain
  newCaptain.isCaptain = true
  
  const teamsInfo = getTeamsInfo(room)
  io.to(room.roomCode).emit('team-captain-changed', {
    teamId,
    newCaptainId: newCaptain.id,
    newCaptainName: newCaptain.name,
    teams: teamsInfo,
  })
}

function getPublicRoomsList(): RoomInfo[] {
  const list: RoomInfo[] = []
  for (const room of rooms.values()) {
    // Only show public rooms that are waiting AND have at least 1 active player
    const activePlayerCount = Array.from(room.players.values()).filter(p => !p.isDisconnected).length
    if (room.roomType === 'عامة' && room.status === 'waiting' && activePlayerCount > 0) {
      list.push({
        roomCode: room.roomCode,
        roomType: room.roomType,
        hasPassword: !!room.password,
        hostName: room.hostName,
        playerCount: activePlayerCount,
        maxPlayers: room.settings.maxPlayers,
        playerMode: room.settings.playerMode,
        settings: room.settings,
        status: room.status,
        battleMode: room.battleMode,
      })
    }
  }
  return list
}

function calculateScore(
  isCorrect: boolean,
  timeTaken: number,
  roundTimeSeconds: number
): number {
  if (!isCorrect) return 0
  const base = 10
  const speedBonus = Math.max(0, 5 * (1 - timeTaken / roundTimeSeconds))
  return Math.round((base + speedBonus) * 10) / 10
}

// ============================================
// NO FALLBACK CONTENT - Everything is dynamically generated by AI
// If AI generation fails, we retry up to 3 times with increasing delays
// Content is now generated DIRECTLY in the game service using OpenRouter API
// This avoids the need to call back to the Vercel frontend API
// ============================================

const MAX_CONTENT_RETRIES = 3
const CONTENT_TIMEOUT_MS = 180000 // 3 minutes max (enough for primary + fallback retries)

// ─── Content Generation Helpers ──────────────────────────────────────────────────

// Search queries pool for diverse topic selection
// For قراءة متحررة, we split by passageType
const searchQueriesPoolScientific: string[] = [
  // ─── ذكاء اصطناعي وتكنولوجيا ───
  'الذكاء الاصطناعي وتأثيره على مستقبل التعليم',
  'استكشاف الفضاء والبعثات إلى المريخ',
  'تكنولوجيا النانو وثورة المواد الذكية',
  'البلوك تشين والعملات الرقمية مستقبل المال',
  'فيزياء الكم ومستقبل الحوسبة الكمية',
  'روبوتات المستقبل والذكاء الاصطناعي التوليدي',
  'الطباعة ثلاثية الأبعاد ثورة التصنيع',
  'السيارات ذاتية القيادة وتحديات السلامة',
  'الأقمار الصناعية وثورة الاتصالات الفضائية',
  'الواقع الافتراضي والمعزز ثورة التعليم والترفيه',
  'الحوسبة السحابية وكيف غيرت عالم التكنولوجيا',
  'إنترنت الأشياء وتحول المدن الذكية',
  // ─── طاقة وبيئة ───
  'الطاقة المتجددة الشمسية والرياح ومستقبل الكوكب',
  'التغير المناخي أسبابه وآثاره على الوطن العربي',
  'أزمة المياه في الشرق الأوسط وحلول مبتكرة',
  'التنوع البيولوجي والانقراض السادس',
  'التصحر في العالم العربي ومشاريع التشجير',
  'الطاقة النووية فوائد ومخاطر ومستقبل',
  'تلوث الهواء في المدن العربية وحلول علمية',
  'تحلية المياه تكنولوجيا الأمل في الصحراء',
  // ─── طب وصحة ───
  'التطور الطبي ثورة اللقاحات والعلاج الجيني',
  'علم الوراثة ثورة CRISPR وتعديل الجينات',
  'الطب الشخصي والجينوم البشري',
  'النوم وأثره على الصحة الجسدية والنفسية',
  'الطب الرياضي كيف تحمي جسمك أثناء التمارين',
  'التغذية السليمة والطب الوقائي',
  'إدمان الهواتف الذكية تأثيره على الدماغ والسلوك',
  'الصحة النفسية للمراهقين في عصر السوشيال ميديا',
  'العلاج بالخلايا الجذعية آفاق المستقبل',
  'المضادات الحيوية أزمة المقومة وكيف نواجهها',
  // ─── جيولوجيا وجغرافيا طبيعية ───
  'البراكين كيف تتكون ولماذا تثور',
  'ظاهرة النينو وتأثيرها على مناخ العالم',
  'الشعاب المرجانية عوالم مغمورة مهددة بالزوال',
  'الغابات الاستوائية رئة الكوكب',
  'استكشاف أعماق المحيطات وتكنولوجيا الغوص',
  'جغرافيا أيسلندا أرض الجليد والنار',
  'غابات الأمازون أكبر غابة مطيرة في العالم',
  'القطب الشمالي والجنوبي عوالم جليدية مذهلة',
  'وادي الموت أشد الأماكن حرارة على الأرض',
  'الزلازل كيف تحدث وكيف نتنبأ بها',
  // ─── فلك وكون ───
  'الثقوب السوداء ألغاز الكون العظيمة',
  'النجوم النيوترونية أعجوبة الفيزياء الكونية',
  'البحث عن حياة في الكواكب الأخرى',
  'انفجار البيغ بنغ كيف بدأ الكون',
  'المجرات كيف تتكون وكيف تتصادم',
  'الكواكب الخارجية اكتشافات حديثة',
  'النيازك والمذنبات زوار من الفضاء البعيد',
  'الشمس نجم الحياة وأسرارها',
  // ─── حيوانات وعلم حشرات ───
  'الهجرة العظيمة للحيوانات في أفريقيا',
  'الأخطبوط أعجوبة الطبيعة وذكاؤه الخارق',
  'النحل كيف يبني حضارته ولماذا يختفي',
  'أسماك القرش أساطير المحيطات وحقيقتها',
  'الطيور المهاجرة رحلات عبر القارات',
  'الدلافين الذكاء الاجتماعي في عالم البحار',
  'الحيوانات المنقرضة التي قد تعود بالاستنساخ',
  'عالم النمل حضارة مصغرة تحت الأرض',
  // ─── فيزياء وكيمياء ───
  'الجاذبية من نيوتن إلى أينشتاين وما بعدها',
  'الضوء سرعته وخواصه العجيبة',
  'كيمياء الطبخ كيف تتفاعل المكونات',
  'المادة المظلمة والطاقة المظلمة ألغاز الكون',
  'البلاستيك مشكلة عالمية وحلول علمية',
]

const searchQueriesPoolLiterary: string[] = [
  // ─── تاريخ وحضارات ───
  'الحضارة الإسلامية الأندلسية إنجازات علمية وفكرية',
  'تاريخ الحروب الصليبية وتأثيرها على العالم العربي',
  'الحضارة المصرية القديمة أهرامات وفراعنة',
  'تاريخ الدولة العثمانية وعلاقتها بالعالم العربي',
  'طريق الحرير التجارة بين الشرق والغرب',
  'الحضارة السومرية والبابلية في بلاد الرافدين',
  'حضارة المايا والأزتك في أمريكا الوسطى',
  'الإمبراطورية الرومانية صعودها وسقوطها',
  'الحضارة الفارسية إنجازات وعلم',
  'تاريخ الساموراي في اليابان',
  'حضارة قرطاج وعظمتها البحرية',
  'تاريخ الفايكنج غزوات واستكشافات',
  'رحلة ابن بطوطة عبر العالم الإسلامي',
  'اكتشافات أثرية حديثة في العالم العربي',
  'رحلة ماغلان حول العالم أول طواف بحري',
  'الحضارة الصينية القديمة اختراعات وفلسفة',
  'تاريخ الحضارة الهندية من السند إلى اليوم',
  // ─── فلسفة وعقل ───
  'فلسفة التفكير النقدي وأهميته في العصر الرقمي',
  'نظرية الذكاءات المتعددة لهوارد غاردنر',
  'فلسفة الأخلاق والذكاء الاصطناعي تحديات جديدة',
  'علم النفس الإيجابي والسعادة البشرية',
  'قوة العادات وكيف تتشكل في الدماغ',
  'فلسفة الوجودية من سارتر إلى كامو',
  'العقل الباطن وكيف يتحكم بقراراتنا',
  'فلسفة الجمال والتذوق الفني',
  'المدرسة الفلسفية البراغماتية وتأثيرها',
  'نظرية العدالة عند جون رولز',
  // ─── فنون وإبداع ───
  'الفن التشكيلي العربي معاصرة وهوية',
  'فن الخط العربي جمال الحروف وتجديدها',
  'التصوير الفوتوغرافي من الهواية إلى الفن',
  'الرسوم المتحركة اليابانية الأنمي ثقافة عالمية',
  'فن المسرح من اليونان إلى برودواي',
  'فن الباتيك في إندونيسيا وماليزيا',
  'السينما العربية نشأة وتطور وتحديات',
  'الموسيقى العربية تراث وتجديد من فيروز إلى اليوم',
  'فن النحت عبر العصور من الفراعنة إلى اليوم',
  'الخط العربي فن وتصميم في العصر الرقمي',
  // ─── عمارة وتصميم ───
  'عمارة المساجد من الأندلس إلى إسطنبول',
  'ناطحات السحاب من شيكاغو إلى دبي',
  'المدن المائية من البندقية إلى أومسا',
  'العمارة الرومانية القناطر والسدود والطرق',
  'العمارة الإسلامية قصور وجوامع وتأثيرها العالمي',
  // ─── رياضة ومنافسات ───
  'تاريخ كأس العالم من الأحلام إلى الحقيقة',
  'الألعاب الأولمبية من اليونان القديمة إلى طوكيو',
  'رياضة الفورمولا واحد هندسة وسرعة واستراتيجية',
  'فنون القتال أنواعها وفلسفتها من الكاراتيه إلى التايكوندو',
  'تسلق الجبال تحدي الطبيعة وقوة الإرادة',
  'رياضة الغوص استكشاف أعماق البحار',
  // ─── ثقافة الشعوب ───
  'ثقافة الطعام في العالم العربي تاريخ ووصفات',
  'الشاي في الثقافات العالمية من المغرب إلى اليابان',
  'البهارات وتجارتها كيف غيرت وجه التاريخ',
  'فن الطبخ الفرسي من الكباب إلى الزعفران',
  'الشوكولاتة من حضارة المايا إلى عالم اليوم',
  'ثقافة البدو في الصحراء العربية حكمة وتقليد',
  'القبائل الأمازيغية في شمال أفريقيا تاريخ وثقافة',
  'ثقافة الساموراي في اليابان شرف وانضباط',
  'الأعياد والمناسبات في الثقافات العربية',
  'التراث الشعبي العربي أغان وأمثال وحكايات',
  // ─── أساطير وخرافات ───
  'أساطير الإغريق آلهة وأبطال ومغامرات',
  'الأساطير العربية الجن والعفاريت والسحر',
  'أسطورة أتلانتس المدينة المفقودة تحت الماء',
  'أساطير الشرق الأقصى التنين والفينق والين واليانغ',
  'الفراعنة والأساطير المصرية القديمة',
  'حكايات ألف ليلة وليلة من الخيال إلى الواقع',
  'الأساطير الإسكندنافية ثور وأودين وراغناروك',
  // ─── اقتصاد وتنمية ───
  'الاقتصاد الأخضر فرص الاستدامة في الوطن العربي',
  'ريادة الأعمال الشبابية في المنطقة العربية',
  'رؤية 2030 التنمية المستدامة في السعودية',
  'السياحة الثقافية والتراثية في العالم العربي',
  'اقتصاد المعرفة كيف أصبحت الأفكار أغلى من النفط',
  'التجارة الإلكترونية ثورة التسوق في القرن 21',
  // ─── اجتماع وثقافة ───
  'ظاهرة الهجرة الدماغية من الدول العربية',
  'التعليم عن بعد ثورة كوفيد وتحولات المستقبل',
  'هوية الشباب العربي بين الأصالة والعولمة',
  'المرأة العربية إنجازات وتحديات معاصرة',
  'الأسرة العربية في مواجهة التحديات المعاصرة',
  'الطب النبوي بين العلم والإيمان',
  // ─── أدب ولغات ───
  'الأدب العربي الحديث رواد التجديد والتحول',
  'تطور اللغة العربية عبر العصور',
  'لغات العالم المهددة بالانقراض',
  'فن الخطابة في التراث العربي',
  'فن الخطابة والإقناع مهارة العصر',
  // ─── تعليم وتنمية بشرية ───
  'التعلم مدى الحياة لماذا لم تعد الشهادات كافية',
  'ذكاء الطفل كيف ينمو وكيف ننميه',
]

const searchQueriesPool: Record<GameType, string[]> = {
  'قراءة متحررة': [
    ...searchQueriesPoolScientific,
    ...searchQueriesPoolLiterary,
  ],
  'نصوص': [
    // ─── Classical Poetry ───
    'شعر المتنبي حكمة وفخر وصور بيانية',
    'شعر أبو تمام البديع والصنعة اللفظية',
    'شعر البحتري وصف وجلال الطبيعة',
    'رثاء الخنساء وعاطفة الأمومة الصادقة',
    'شعر عمر بن أبي ربيعة الغزل الصريح',
    'معلقة امرئ القيس وصف الليل والفرس',
    'الحماسة والفخر في شعر عنترة بن شداد',
    'الحكمة في شعر زهير بن أبي سلمى',
    'الغزل العذري عند جميل بثينة وقيس ليلى',
    'وصف الصحراء في الشعر العربي الجاهلي',
    'وصف البحر في الشعر العربي رومانسية وجلال',
    'أمثال العرب وبلاغتها في النثر القديم',
    // ─── Classical Prose ───
    'أسلوب الجاحظ السخرية والفكاهة في البيان والتبيين',
    'مقامات الهمذاني والحريري فن السجع والتضمين',
    'فن الخطابة العربية قديما وحديثا أساليب الإقناع',
    'فن المقالة الأدبية العربية تحليل ونقد',
    'السجع والطباق في النثر العربي القديم',
    // ─── مدرسة الإحياء والبعث ───
    'محمود سامي البارودي رائد الإحياء وقوة البيان',
    'أحمد شوقي أمير الشعراء بين التقليد والتجديد',
    'حافظ إبراهيم شاعر النيل والوطنية',
    'شعر أحمد شوقي في المدح والرثاء والاستعارات',
    // ─── مدرسة الديوان ───
    'عباس محمود العقاد نقد وشعر ومواقف أدبية',
    'إبراهيم المازني الشعر العاطفي والنقد الأدبي',
    'عبد الرحمن شكري الشعر الوجداني والتجديد',
    // ─── مدرسة أبوللو ───
    'إبراهيم ناجي شعر الرومانسية والألم العذب',
    'أبو القاسم الشابي إرادة الحياة والشعر الثوري',
    'علي محمود طه الشعر الرومانسي والتصوير الفني',
    // ─── أدب المهجر ───
    'جبران خليل جبران الفلسفة والتصوف الأدبي',
    'ميخائيل نعيمة الحكمة والروحانية في النثر',
    'إيليا أبو ماضي الشعر الفلسفي والتفاؤل',
    'الرابطة القلمية وأدب المهجر الشمالي',
    'العصبة الأندلسية وأدب المهجر الجنوبي',
    // ─── الرومانسية ───
    'خليل مطران رائد الرومانسية العربية',
    'شعر مطران الوصفي والعاطفي والرمزي',
    // ─── الواقعية ───
    'أدب نجيب محفوظ الواقعية المصرية والرمز',
    'يوسف إدريس القصة القصيرة والواقعية الاجتماعية',
    // ─── الشعر الحر ───
    'بدر شاكر السياب أنشودة المطر والشعر الحر',
    'نازك الملائكة رائدة الشعر الحر وقصيدة التفعيلة',
    'عبد الوهاب البياتي الشعر والالتزام والتجديد',
    // ─── الأدب الحديث ───
    'شعر نزار قباني الحرية والمرأة والتحدي',
    'شعر محمود درويش الهوية والأرض والمنفى',
    'أدب الطيب صالح موسم الهجرة إلى الشمال والرمزية',
    'الشعر العربي المعاصر تجريب وتحطيم الأشكال',
    // ─── بلاغة عربية ───
    'الاستعارة التصريحية والمكنية في الشعر العربي',
    'التشبيه بأنواعه في الأدب العربي المجمل والمفصل والتمثيلي',
    'المجاز المرسل وعلاقته في النصوص الأدبية',
    'الكناية وأنواعها في الشعر والنثر العربي',
    'الطباق والمقابلة في البلاغة العربية',
    'الجناس بأنواعه في القرآن والشعر',
    'التورية والسجع وفنون البديع',
    // ─── محسنات بديعية ───
    'التورية في شعر المتنبي وأبي تمام',
    'الجناس التام والناقص في النثر العربي',
    'السجع والازدواج في الخطابة والمقامات',
    // ─── أساليب إنشائية ───
    'النداء وأغراضه البلاغية في الشعر العربي',
    'الاستفهام وغرضه البلاغي في النصوص الأدبية',
    'التعجب والأسلوب الإنشائي في النقد الأدبي',
    'الأمر والنهي وأغراضهما البلاغية',
    // ─── نقد أدبي ───
    'نقد الشعر عند قدامة بن جعفر وابن قتيبة',
    'النقد الأدبي الحديث مناقب واتجاهات',
    // ─── موسيقى شعرية ───
    'الوزن العروضي والإيقاع في الشعر العربي',
    'القافية وأنواعها ودورها في الموسيقى الشعرية',
    'الإيقاع الداخلي والتكرار في القصيدة الحديثة',
    // ─── وصف وأدب مكاني ───
    'وصف القدس في الأدب العربي صور وحروف',
    'وصف الليل في الشعر العربي رمزية وتأمل',
    // ─── بلاغة قرآنية ───
    'البلاغة القرآنية في سورة الرحمن التكرار والجمال',
    'القصص القرآني في سورة يوسف دروس بلاغية',
    'الحوار القرآني في سورة الكهف أساليب وإيقاع',
    'الاستعارات القرآنية في وصف الجنة والنار',
    // ─── فلسفة وتأمل ───
    'فلسفة الوجود في الشعر العربي المعاصر',
    'الموت والحياة في الشعر العربي رموز وإيحاءات',
    'الحرية والقيد في الأدب العربي الحديث',
  ],
}

// Topic seeds for قراءة متحررة split by passageType
const topicSeedsScientific: string[] = [
  // ─── علوم وتكنولوجيا ───
  'اكتب عن اكتشاف علمي حديث غيّر فهمنا للكون',
  'اكتب عن تقنية مستقبلية وكيف ستغير حياتنا',
  'اكتب عن ثورة في الطب وكيف ستنقذ حياة الملايين',
  'اكتب عن رحلة استكشاف فضائي وما اكتُشف فيه',
  'اكتب عن طاقة متجددة وحلول مبتكرة للمناخ',
  'اكتب عن الذكاء الاصطناعي وتأثيره على المستقبل',
  'اكتب عن تحدّ بيئي يواجه منطقة عربية محددة وحلولاً مبتكرة',
  'اكتب عن اختراع إسلامي غير معروف غيّر مجرى التاريخ',
  'اكتب عن ظاهرة طبيعية فريدة في العالم العربي',
  'اكتب عن تقاطع العلم والإيمان في حضارة إسلامية',
  'اكتب عن تجربة علمية غيرت نظرتنا للواقع',
  'اكتب عن تحول في عالم الطب بفضل التكنولوجيا',
  // ─── علوم طبيعية ───
  'اكتب عن حيوان مهدد بالانقراض وقصة جهود إنقاذه',
  'اكتب عن ظاهرة فلكية مذهلة وكيف فسرها العلماء',
  'اكتب عن بركان نشط وتأثيره على حياة الناس من حوله',
  'اكتب عن الغابة المطيرة وكائناتها الغريبة',
  'اكتب عن رحلة استكشافية تحت البحر وما اكتُشف فيها',
  'اكتب عن كائن بحري غريب لم يكتشفه العلم إلا حديثاً',
  'اكتب عن ظاهرة جيولوجية نادرة وكيف تتشكل',
]

const topicSeedsLiterary: string[] = [
  // ─── ثقافة وتاريخ ───
  'اكتب عن شخصية عربية نسائية رائدة لم تحظ بشهرة كافية',
  'اكتب عن مدينة عربية منسية كانت مركز حضارة',
  'اكتب عن عادات اجتماعية عربية تتغير مع العولمة',
  'اكتب عن مشروع تنموي عربي ملهم يصلح نموذجاً',
  'اكتب عن تأثير لغة الضاد على طريقة تفكير أهلها',
  'اكتب عن رحالة عربي استكشف عوالم مجهولة',
  'اكتب عن اكتشاف أثري حديث في وطن عربي',
  'اكتب عن أزمة تعليمية وحلاً إبداعياً مقترحاً',
  'اكتب عن فن عربي تقليدي يواجه الانقراض',
  'اكتب عن تجربة تعايش بين ثقافات في مدينة عربية',
  'اكتب عن حكاية شعبية عربية ودلالاتها العميقة',
  'اكتب عن شاعر عربي أثر في ثقافة بلده',
  // ─── مواضيع عالمية أدبية ───
  'اكتب عن رياضة شعبية في بلد غير عربي ولماذا تحظى بشعبية هناك',
  'اكتب عن طبق تقليدي من ثقافة مختلفة وقصته',
  'اكتب عن أسطورة من ثقافة غير عربية ودلالاتها',
  'اكتب عن عمارة معروفة عالمياً وقصة بنائها',
  'اكتب عن اختراع غيّر حياة البشرية بالكامل',
  'اكتب عن جزيرة نائية وحياة سكانها الفريدة',
  'اكتب عن لغة قديمة على وشك الانقراض',
  'اكتب عن حدث رياضي تاريخي غيّر قواعد اللعبة',
  'اكتب عن ثقافة الشاي في بلد آسيوي وطقوسها',
  'اكتب عن فن قتالي شرقي وفلسفته العميقة',
  'اكتب عن مهرجان ثقافي عالمي وكيف يحتفل به الناس',
  'اكتب عن تقليد اجتماعي غريب في ثقافة مختلفة',
]

const topicSeeds: Record<GameType, string[]> = {
  'قراءة متحررة': [
    ...topicSeedsScientific,
    ...topicSeedsLiterary,
  ],
  'نصوص': [
    // ─── شعر (Poetry prompts) ───
    'اكتب قصيدة عن ذاكرة المكان وأثره في النفس بصور بيانية مبدعة',
    'اكتب قصيدة عن صمت الليل وما يبوح به الوجدان باستعارات مكنية',
    'اكتب قصيدة عن حوار بين النور والظلام بتشبيهات مركبة',
    'اكتب قصيدة عن الأمل الذي ينبت من ركام الألم بأسلوب رمزي',
    'اكتب قصيدة عن الوداع ولقاء لا يكتمل بعاطفة حزينة وصور إيحائية',
    'اكتب قصيدة عن الشوق بأسلوب يستخدم الاستعارة المكنية والطباق',
    'اكتب قصيدة عن الكبرياء والضعف البشري بصور بيانية ومحسنات بديعية',
    'اكتب قصيدة عن الفقدان كتجربة إنسانية جامعة بتشبيهات تمثيلية',
    'اكتب قصيدة عن القمر كشاهد على أحلام البشر بكنايات واستعارات',
    'اكتب قصيدة عن الحرية بين القيد والتحليق بمجاز مرسل وتورية',
    'اكتب قصيدة عن الغربة والحنين بصور بيانية من مدرسة المهجر',
    'اكتب قصيدة عن الجمال في الطبيعة بأسلوب مدرسة أبوللو',
    // ─── نثر أدبي (Literary prose prompts) ───
    'اكتب نثراً أدبياً عن لقاء بين شاعرين من عصرين مختلفين بأسلوب حواري بلاغي',
    'اكتب نثراً أدبياً عن جمال الكلمة حين تصبح سلاحاً بمحسنات بديعية',
    'اكتب نثراً أدبياً عن علاقة الإنسان بالبحر كرمز للحرية بصور استعارية',
    'اكتب نثراً أدبياً عن القدس كمدينة تتحدث عن نفسها بكنايات وأساليب إنشائية',
    'اكتب نثراً أدبياً عن رحلة البحث عن الهوية في الغربة بأسلوب رومنسي',
    'اكتب رسالة أدبية من أديب إلى صديقه عن معنى الإبداع بأسلوب السجع',
    'اكتب مونولوجاً أدبياً درامياً عن الصراع بين العقل والقلب بصور بلاغية',
    // ─── مقاطع بلاغية (Rhetorical passages) ───
    'اكتب مقطعاً بلاغياً غنياً بالاستعارات عن تجربة الحب والفقد',
    'اكتب مقطعاً بلاغياً يستخدم الطباق والمقابلة في وصف الحياة والموت',
    'اكتب مقطعاً بلاغياً يعج بالجناس والتورية عن الكلام والصمت',
    'اكتب مقطعاً بلاغياً يستخدم أساليب النداء والاستفهام عن الوطن',
    // ─── نصوص بمدرسة أدبية محددة ───
    'اكتب نصاً أدبياً بأسلوب مدرسة الإحياء عن الفخر والعتز بالنفس',
    'اكتب نصاً أدبياً بأسلوب مدرسة الديوان عن الطبيعة والوجدان',
    'اكتب نصاً شعرياً حراً بأسلوب السياب عن المطر والحنين',
    'اكتب نصاً أدبياً بأسلوب الواقعية عن الحياة اليومية في مدينة عربية',
    'اكتب نصاً أدبياً بأسلوب الرومانسية عن الحب المستحيل والشوق',
    // ─── تأملات فلسفية أدبية ───
    'اكتب تأملة شعرية فلسفية عن الزمن وكيف يغيّرنا بصور رمزية',
    'اكتب نصاً أدبياً تأملياً عن الموت والحياة كوجهين لعملة واحدة',
    'اكتب نصاً أدبياً عن الخيال وكيف يصنع عوالم من لا شيء بصور بيانية مركبة',
    'اكتب نصاً أدبياً عن الصوت والصدى كرمز للذاكرة والحنين',
    'اكتب نصاً أدبياً رمزياً عن الشجرة كرمز للتجذر والتحول',
  ],
}

function extractJSON(raw: string): string {
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '')
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/\n?```\s*$/i, '')
  }
  return cleaned.trim()
}

function isValidGameContent(obj: unknown): obj is GameContent {
  if (!obj || typeof obj !== 'object') return false
  const content = obj as Record<string, unknown>
  if (typeof content.title !== 'string') return false
  if (typeof content.text !== 'string') return false
  if (typeof content.source !== 'string') return false
  if (!Array.isArray(content.questions)) return false
  if (content.questions.length === 0) return false
  for (const q of content.questions as unknown[]) {
    if (!q || typeof q !== 'object') return false
    const question = q as Record<string, unknown>
    // id can be number or string (LLM might return either) - will be normalized later
    if (question.id !== undefined && typeof question.id !== 'number' && typeof question.id !== 'string') return false
    if (typeof question.text !== 'string') return false
    if (!Array.isArray(question.options) || question.options.length < 2) return false
    // correctAnswer can be number or string - will be normalized later
    if (question.correctAnswer !== undefined && typeof question.correctAnswer !== 'number' && typeof question.correctAnswer !== 'string') return false
    if (typeof question.explanation !== 'string') return false
  }
  return true
}

// ============================================
// CONTENT PRE-CACHE
// Generate content in background so it's ready instantly
// ============================================
interface CacheEntry {
  content: GameContent
  gameType: GameType
  difficulty: Difficulty
  passageType?: PassageType
  createdAt: number
}

const contentCache: CacheEntry[] = []
const MAX_CACHE_SIZE = 12 // 2 types × 3 difficulties × 2 per combo
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

function cleanCache() {
  const now = Date.now()
  // Remove expired entries
  while (contentCache.length > 0 && now - contentCache[0].createdAt > CACHE_TTL) {
    contentCache.shift()
  }
  // Remove oldest if over size
  while (contentCache.length > MAX_CACHE_SIZE) {
    contentCache.shift()
  }
}

function getFromCache(gameType: GameType, difficulty: Difficulty, seenTitles?: string[]): GameContent | null {
  cleanCache()
  // Find entries that match type+difficulty AND haven't been seen by any player
  const idx = contentCache.findIndex(e => {
    if (e.gameType !== gameType || e.difficulty !== difficulty) return false
    // If we have seenTitles, skip cached content that any player has already seen
    if (seenTitles && seenTitles.length > 0 && seenTitles.includes(e.content.title)) return false
    return true
  })
  if (idx !== -1) {
    const entry = contentCache.splice(idx, 1)[0]
    return entry.content
  }
  return null
}

function addToCache(content: GameContent, gameType: GameType, difficulty: Difficulty, passageType?: PassageType) {
  cleanCache()
  contentCache.push({ content, gameType, difficulty, passageType, createdAt: Date.now() })
}

// ─── النصوص-specific constants ────────────────────────────────────────────

const literaryTypes = [
  'قصيدة شعرية كلاسيكية (أبيات بوزن وقافية)',
  'قصيدة شعر حر (تفعيلة)',
  'نص نثري أدبي وجداني',
  'مقطع بلاغي غني بالصور البيانية',
  'نص شعري حديث (قصيدة نثر)',
  'مقطوعة أدبية رمزية',
  'نص أدبي تأملي فلسفي',
  'رسالة أدبية عاطفية',
  'مونولوج أدبي درامي',
  'تأملة شعرية في الطبيعة',
]

const literarySchools = [
  'مدرسة الإحياء والبعث',
  'الكلاسيكية العربية',
  'مدرسة الديوان',
  'مدرسة أبوللو',
  'أدب المهجر',
  'الرومانسية (مطران وأتباعه)',
  'الواقعية الأدبية',
  'الاتجاه الوجداني',
  'الشعر الحر (السياب والملائكة)',
  'الأدب الحديث والتجريبي',
]

const nosousWordCounts: Record<Difficulty, string> = {
  سهل: '350-550 كلمة على الأقل - نص أدبي عميق بصور بيانية وطبقات معنوية',
  متوسط: '550-800 كلمة على الأقل - نص أدبي مركّب كثيف الصور والرموز والإيحاءات متعدد الطبقات',
  صعب: '750-1100 كلمة على الأقل - نص أدبي شديد التركيب كثيف الرموز والإيحاءات بتراكب بلاغي مزدوج',
}

const nosousQuestionFocus = `ركّز حصرياً على أسئلة البلاغة والتحليل الأدبي:
- التفسير والتأويل (ما المقصود بـ... في النص؟)
- الصور البيانية (التشبيه بأنواعه، الاستعارة التصريحية والمكنية، المجاز المرسل، الكناية)
- المحسنات البديعية (الطباق، المقابلة، الجناس، السجع، التورية، الربط)
- الأساليب الإنشائية (النداء، التعجب، الاستفهام، الأمر، النهي) والأساليب الخبرية
- التذوق الأدبي (ما أجمل صورة في النص؟ لماذا؟)
- العاطفة والوجدان (ما العاطفة المسيطرة؟ كيف تجلت؟)
- الموسيقى الشعرية (الوزن، القافية، الإيقاع الداخلي)
- الألفاظ والتراكيب (اختيار الكلمات، دلالاتها، إيحاءاتها)
- الرمزية (ما يرمز إليه... في النص)
- الأسلوب (ما السمة الأسلوبية البارزة؟)
- النقد الأدبي (نقد صورة أو تركيب من النص)`

const nosousDifficultyInstructions: Record<Difficulty, string> = {
  سهل: `مستوى سهل:
- نص أدبي مركّب كثيف الرموز والإيحاءات، متعدد الطبقات
- أسئلة قدرات نقدية عليا: تحليل بلاغي عميق، نقد أدبي، مقارنة بين صور
- الخيارات متقاربة جداً جداً: كلها تبدو صحيحة لمن لم يتذوق النص بعمق
- مثال: "أي القولين أبلغ في التعبير عن... ولماذا؟" أو "ما الموقف النقدي الأكثر وجاهة؟"
- النص يجب أن يكون معركة أدبية حقيقية: رموز متداخلة، صور مركبة، إيحاءات خفية
- استخدم أسلوباً أدبياً رفيعاً يجعل القارئ يشعر بأنه في حلبة نقد أدبي`,

  متوسط: `مستوى متوسط:
- نص أدبي شديد التركيب: طبقات بلاغية متداخلة، رموز فوق رموز، كل صورة تحمل أكثر من تأويل
- أسئلة نقدية وتحليلية عميقة جداً: تتطلب تفكيك النص بالكامل وربط أجزائه البعيدة
- الخيارات متطابقة تقريباً في الظاهر: الفرق بينها دقيق للغاية ويحتاج تذوقاً بلاغياً حاداً
- مثال: "أي التأويلات أقرب لروح النص مع التعليل؟" أو "ما العلاقة الخفية بين الصورة الافتتاحية والختامية؟"
- النص يجب أن يكون متاهة أدبية: رموز مركبة مزدوجة الدلالة، إيحاءات متضادة، صور تُقرأ على أكثر من مستوى
- استخدم التورية المركبة والاستعارة التضمينية والترميز الدائري حيث يعود المعنى لبدايته بأسلوب جديد
- كل فقرة يجب أن تضيف بُعداً جديداً للنص بحيث لا يمكن فهم الفقرة الأخيرة بدون فهم الأولى
- النص يجب أن يضع القارئ في معركة فكرية حقيقية: لا يكفي أن يقرأ بل يجب أن يُعيد قراءة كل جملة مرتين`,

  صعب: `مستوى صعب جداً:
- نص أدبي شديد التركيب والتعقيد: طبقات بلاغية متداخلة مزدوجة، رموز فوق رموز فوق رموز، كل صورة تحمل أكثر من تأويلين متضاربين، كل عبارة تُقرأ على ثلاثة مستويات على الأقل
- أسئلة نقدية وتحليلية عميقة جداً متعددة الأبعاد: تتطلب تفكيك النص بالكامل وربط أجزائه البعيدة عبر طبقات متعددة والتساؤل عن مسلمات النص نفسه ونقضها
- الخيارات متطابقة تقريباً في الظاهر وبينها علاقات تناقضية خفية: الفرق بينها شديد الدقة ويحتاج تذوقاً بلاغياً حاداً وتحليلاً تركيبياً عميقاً
- مثال: "ما المسلمة البلاغية المخفية التي بنى عليها الشاعر صورته وكيف يتحول المعنى لو قرأناها بتأويل مضاد؟" أو "ما العلاقة التناصية الخفية بين الاستهلال والختام وكيف يعيد كل منهه تأويل الآخر؟"
- النص يجب أن يكون متاهة أدبية مركبة مزدوجة: رموز مركبة مزدوجة الدلالة متناقضة ظاهرياً متكاملة باطناً، إيحاءات متضادة تكمل بعضها، صور تُقرأ على أكثر من مستوى وكل مستوى يضيف بُعداً جديداً
- استخدم التورية المركبة المزدوجة والاستعارة التضمينية المتداخلة والترميز الدائري المزدوج حيث يعود المعنى لبدايته بأسلوب جديد يكشف طبقة لم تكن ظاهرة
- كل فقرة يجب أن تضيف بُعداً جديداً للنص يعيد تأويل ما سبقه بحيث لا يمكن فهم الفقرة الأخيرة بدون إعادة قراءة الأولى بوعي جديد
- أضف طبقة من التناص الخفي: إشارات بلاغية وأدبية خفية لنصوص أو شعراء أو تراث أدبي تثري المعنى لمن يلتقطها
- النص يجب أن يضع القارئ في معركة فكرية وأدبية حقيقية: لا يكفي أن يقرأ بل يجب أن يُعيد قراءة كل جملة مرتين ويكتشف في كل مرة طبقة جديدة`,
}

// ─── buildPrompt function ──────────────────────────────────────────────────

function buildPrompt(
  gameType: GameType,
  difficulty: Difficulty,
  searchTitle?: string,
  searchSnippet?: string,
  previousTopics?: string[],
  seenTitles?: string[],
  topicSeed?: string,
  passageType?: PassageType
): string {
  // ─── Shared variables ──────────────────────────────────────────────────
  const passageTypeInstruction =
    passageType
      ? passageType === 'علمي'
        ? '\n\n⚠️ نوع القطعة: علمي - يجب أن يكون النص ذا طابع علمي وتحليلي. اكتب عن مواضيع علمية كالاكتشافات والتكنولوجيا والطب والفيزياء والفلك والطبيعة والبحوث العلمية. استخدم لغة علمية دقيقة وأسلوباً تحليلياً موضوعياً.'
        : passageType === 'أدبي'
          ? '\n\n⚠️ نوع القطعة: أدبي - يجب أن يكون النص ذا طابع أدبي وتعبيري. اكتب نصاً بلغة أدبية غنية بالصور البيانية والمشاعر والتأملات. استخدم أسلوباً سردياً تعبوياً يمزج بين الخيال والواقع بلغة عربية فصحى جزلة.'
          : '\n\n⚠️ نوع القطعة: عشوائي - يمكنك الكتابة بأي أسلوب سواء علمي أو أدبي أو مزيج بينهما. فاجئنا بموضوع وأسلوب غير متوقعين.'
      : ''

  const searchInspiration =
    searchTitle || searchSnippet
      ? `بناءً على نتيجة البحث التالية كإلهام فقط:
العنوان: ${searchTitle || 'غير متوفر'}
المقتطف: ${searchSnippet || 'غير متوفر'}`
      : ''

  const seedInstruction = topicSeed
    ? `\n\nتوجيه الموضوع: ${topicSeed} - استخدم هذا التوجيه كمحور أساسي لنصك.`
    : ''

  let varietyConstraint = ''
  if (previousTopics && previousTopics.length > 0) {
    varietyConstraint += `\n\nمهم جداً: الموضوعات التالية تم استخدامها ويجب تجنبها:\n${previousTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
  }

  if (seenTitles && seenTitles.length > 0) {
    varietyConstraint += `\n\nمهم جداً: العناوين التالية تم استخدامها ويجب تجنبها:\n${seenTitles.map((t, i) => `${i + 1}. "${t}"`).join('\n')}`
  }

  // ═══════════════════════════════════════════════════════════════════════
  // النصوص MODE — COMPLETELY DIFFERENT PROMPT
  // ═══════════════════════════════════════════════════════════════════════
  if (gameType === 'نصوص') {
    const questionCounts: Record<Difficulty, string> = {
      سهل: '7 أسئلة',
      متوسط: '10 أسئلة',
      صعب: '15 أسئلة',
    }

    const randomLiteraryType = literaryTypes[Math.floor(Math.random() * literaryTypes.length)]
    const randomLiterarySchool = literarySchools[Math.floor(Math.random() * literarySchools.length)]

    return `أنت أديب وناقد عربي متمكن، متخصص في الأدب العربي وبلاغته ونقده. تكتب نصوصاً أدبية أصيلة — شعراً ونثراً — تحمل روح الأدب العربي الحقيقية. التزامك بقواعد اللغة العربية نحواً وصرفاً وبلاغة تام ومطلق.

⚠️ طبيعة النص: هذا ليس تمرين قراءة متحررة. هذا نص أدبي — شعر أو نثر أدبي أو مقطع بلاغي — يُقرأ كعمل فني وليس كمقال تحليلي. النص يجب أن يشعر القارئ بأنه في حضرة عمل أدبي حقيقي: عاطفة جياشة، صور بيانية مبدعة، إيقاع موسيقي، رموز وإيحاءات.

⚠️ قاعدة ذهبية: كل نص تنتجه يجب أن يكون فريداً ومختلفاً تماماً عن أي نص آخر — في الموضوع والأسلوب والصور والعاطفة.

${searchInspiration}${seedInstruction}${varietyConstraint}

نوع المعركة: نصوص (أدب وبلاغة)
مستوى الصعوبة: ${difficulty}

القواعد:
1. اكتب نصاً أدبياً عربياً أصيلاً. يجب أن يكون النص: ${nosousWordCounts[difficulty]}

   🎨 نوع النص المطلوب: ${randomLiteraryType}
   🏛️ المدرسة الأدبية: ${randomLiterarySchool}

   ⚠️ النص يجب أن يكون عملاً أدبياً فنياً وليس مقالاً تحليلياً أو قطعة معلوماتية.
   - إذا كان شعراً: اكتب أبياتاً شعرية حقيقية بأوزان وقوافٍ، مع إضافة نثر وصفي يحيط بالسياق
   - إذا كان نثراً أدبياً: اكتب نثراً فنياً غنياً بالصور البيانية والاستعارات والمشاعر
   - إذا كان مقطعاً بلاغياً: اكتب نصاً يعج بالمحسنات البديعية والصور البيانية

2. ${nosousQuestionFocus}

3. عدد الأسئلة: ${questionCounts[difficulty]}

4. كل سؤال يحتوي على 4 خيارات بالضبط مع إجابة صحيحة واحدة فقط

5. ⚠️ مهم جداً: correctAnswer لازم يكون رقم فقط (0 أو 1 أو 2 أو 3) يمثل فهرس الإجابة الصحيحة في مصفوفة options. ممنوع كتابة نص في correctAnswer. مثال: لو الخيار الثاني في options هو الصحيح، اكتب "correctAnswer": 1

5. ⚠️ قاعدة حيادية طول الخيارات: ممنوع تماماً أن تكون الإجابة الصحيحة هي الخيار الأطول دائماً. يجب أن تتساوى الخيارات في الطول تقريباً أو تتفاوت بشكل عشوائي طبيعي. الإجابة الصحيحة يجب أن تكون أحياناً أقصر خيار وأحياناً أطول خيار وأحياناً متوسطة — بدون أي نمط يمكن اكتشافه. توزيع طول الإجابة الصحيحة يجب أن يكون عشوائياً بالكامل عبر كل الأسئلة.

6. ${nosousDifficultyInstructions[difficulty]}

7. أضف شرحاً بلاغياً لماذا الإجابة الصحيحة هي الصحيحة — اشرح الصورة البيانية أو المحسن البديعي أو الأسلوب

8. التزام تام بقواعد اللغة العربية والبلاغة

9. جودة النص الأدبي أولوية قصوى:
   - يجب أن يبدو النص كأنه كتبه أديب محترف وليس ذكاء اصطناعي
   - الصور البيانية يجب أن تكون مبدعة وطبيعية وليس مصطنعة
   - العاطفة يجب أن تكون حقيقية ومؤثرة وليس متكلفة
   - الإيقاع الموسيقي يجب أن يكون طبيعياً (في الشعر والنثر)
   - لا تكرر نفس الصور أو الاستعارات
   - كل بيت أو فقرة يجب أن تضيف جمالاً أدبياً جديداً

9. هيكلة النص الأدبي:
   - قسم النص إلى أجزاء واضحة
   - إذا كان شعراً: اكتب الأبيات في سطور منفصلة مع ترقيم
   - إذا كان نثراً: قسم إلى فقرات ذات إيقاع أدبي
   - اجعل لكل جزء وظيفة جمالية ومعنوية

أجب بصيغة JSON فقط:
{
  "title": "عنوان النص الأدبي",
  "text": "النص الكامل هنا...",
  "source": "المدرسة الأدبية أو الشاعر المستلهم منه",
  "questions": [
    {
      "id": 1,
      "text": "نص السؤال البلاغي أو الأدبي",
      "options": ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"],
      "correctAnswer": 0,
      "explanation": "شرح بلاغي"
    }
  ]
}`
  }

  // ═══════════════════════════════════════════════════════════════════════
  // القراءة المتحررة MODE — ORIGINAL PROMPT (unchanged)
  // ═══════════════════════════════════════════════════════════════════════
  const wordCounts: Record<Difficulty, string> = {
    سهل: '400-600 كلمة على الأقل - نص عميق متعدد الأفكار والزوايا مع حجج وتفاصيل ممتعة',
    متوسط: '550-800 كلمة على الأقل - نص مركّب كثيف الأفكار متعدد الطبقات والاستنتاجات مع تراكب المفاهيم',
    صعب: '750-1100 كلمة على الأقل - نص شديد التركيب كثيف المفاهيم متعدد الطبقات العميقة والاستنتاجات المترابطة بتراكب فكري مزدوج',
  }

  const questionCounts: Record<Difficulty, string> = {
    سهل: '7 أسئلة',
    متوسط: '10 أسئلة',
    صعب: '15 أسئلة',
  }

  const difficultyInstructions: Record<Difficulty, string> = {
    سهل: `مستوى سهل:
- أسئلة قدرات عليا (تحليل - تركيب - استنتاج بعيد): الإجابة مش مباشرة خالص واحتياج تفكير عميق
- الخيارات متقاربة جداً: كل الخيارات تبدو صحيحة ومانعرفش الفرق بينها إلا لو فاهم النص كويس ومركز على التفاصيل الدقيقة
- ممنوع تماماً أي سؤال مباشر من النص
- النص لازم يكون مكتوب بأسلوب أدبي فكري مركّب وكثيف — استخدم تراكب المفاهيم والتناقضات الظاهرية والعمق الفلسفي
- اكتب كأنك تكتب مقالاً فكرياً مرموقاً: حبكة فكرية معقدة، مفاهيم متداخلة، مفارقات، تساؤلات مفتوحة
- مثال: "ما الموقف الفلسفي الضمني الذي يتبناه الكاتب دون التصريح به؟" - لازم تحلل النص كله وتستنتج الموقف من بين السطور`,

    متوسط: `مستوى متوسط:
- أسئلة قدرات عليا متقدمة (تركيب مركب - تقويم نقدي - استنتاج بعيد متعدد المراحل): الإجابة تتطلب تفكيك النص كله وربط أجزائه البعيدة
- الأسئلة مركبة ومتداخلة: كل سؤال يحتاج فهم أكثر من فقرة وربطها ببعض واستنتاج مخفي
- الخيارات متطابقة تقريباً في الظاهر: الفرق بينها دقيق للغاية ويحتاج تحليلاً عميقاً ودقيقاً
- ممنوع تماماً أي سؤال مباشر أو شبه مباشر — كل الأسئلة يجب أن تكون غير متوقعة
- النص لازم يكون مكتوب بأسلوب فكري فلسفي شديد التعقيد: مفاهيم متداخلة مزدوجة، مفارقات ظاهرية تخفي حقيقة مختلفة
- اكتب كأنك تكتب رسالة دكتوراه في الفلسفة: حبكة فكرية شديدة التعقيد، مفاهيم متراكبة، كل فقرة تضيف بُعداً جديداً
- استخدم الرمز المركب (رمز داخل رمز) والتضاد المتعدد والمفارقة العميقة والتمثيل الفلسفي
- مثال: "ما العلاقة الخفية بين الفكرة التي بدأ بها الكاتب والنتيجة التي انتهى إليها؟" - لازم تتبع خيط النص كله وتربط البداية بالنهاية`,

    صعب: `مستوى صعب جداً:
- أسئلة قدرات عليا متقدمة جداً (تفكيك مركب - تقويم نقدي مزدوج - استنتاج بيني متعدد المراحل - تواصل نصي): الإجابة تتطلب تفكيك النص بالكامل وربط أجزائه البعيدة عبر طبقات متعددة والتساؤل عن مسلمات النص نفسه
- الأسئلة مركبة ومتداخلة ومتعددة الأبعاد: كل سؤال يحتاج فهم النص ككل وربط فقرات متباعدة واستنتاج مخفي بين السطور والتساؤل عن بنية النص نفسه
- الخيارات متطابقة تقريباً في الظاهر وبينها علاقات تناقضية خفية: الفرق بينها شديد الدقة ويحتاج تحليلاً تركيبياً حاداً
- ممنوع تماماً أي سؤال مباشر أو شبه مباشر — كل الأسئلة يجب أن تكون غير متوقعة وتهز مسلمات القارئ
- النص لازم يكون مكتوب بأسلوب فكري فلسفي شديد التعقيد: مفاهيم متداخلة مزدوجة ومتضادة، مفارقات ظاهرية تخفي حقيقة مختلفة، كل فقرة تعيد تعريف ما سبقها
- اكتب كأنك تكتب أطروحة فلسفية شديدة التعقيد: حبكة فكرية مركبة مزدوجة المسار، مفاهيم متراكبة متناقضة ظاهرياً متكاملة باطناً، كل فقرة تضيف بُعداً جديداً يعيد تأويل ما قبلها
- النص لازم يكون متاهة فكرية: القارئ لازم يرجع يقرأه أكتر من مرة عشان يكتشف كل طبقة وكل طبقة تكشف طبقة جديدة
- استخدم الرمز المركب المزدوج (رمز داخل رمز يحمل دلالتين متناقضتين) والتضاد المتعدد والمفارقة العميقة والتمثيل الفلسفي والتناص الخفي
- كل فقرة يجب أن تكون مرتبطة بالفقرة اللي قبلها بعلاقة غير مباشرة والقارئ لازم يكتشفها بنفسه
- أضف طبقة من التواصل النصي: إشارات خفية لنصوص أو أفكار أو أحداث خارج النص تثري المعنى لمن يلتقطها
- مثال: "ما المسلمة المخفية التي بنى عليها الكاتب حجته وكيف ينهار الموقف لو نقضناها؟" - لازم تفكك بنية النص وتكتشف ما لم يصرح به وتنقده`,
  }

  const typeFocus = 'ركّز على أسئلة الفهم والاستنتاج واستيعاب المقروء والتحليل الفكري'

  // Random style variation to force different outputs each time
  const styleVariations = [
    'أسلوب سردي قصصي يجعل القارئ يعيش التجربة',
    'أسلوب حواري يجعل الأفكار تتبادل بين أصوات مختلفة',
    'أسلوب وصفي يعتمد على الصور الحسية والمشاعر',
    'أسلوب تحليلي يفكك الظاهرة إلى أجزاء ويعيد تركيبها',
    'أسلوب مقارن يعرض وجهات نظر متعددة ثم يخلص لرؤية',
    'أسلوب تاريخي يربط الماضي بالحاضر والمستقبل',
    'أسلوب فلسفي يتأمل الظاهرة من زوايا عميقة',
  ]
  const randomStyle = styleVariations[Math.floor(Math.random() * styleVariations.length)]

  return `أنت كاتب ومفكر عربي متمكن يكتب نصوصاً أصيلة بأسلوب أدبي رفيع ومشوّق. تنتج محتوى عربياً يشبه مقالات الكبار — نصوصاً حيّة وعميقة تُقرأ بشغف وليس مجرد نصوص اختبارية. التزامك بقواعد اللغة العربية نحواً وصرفاً وإملاءً تام ومطلق.

⚠️ قاعدة ذهبية: النص لازم يُقرأ كأنه مقال حقيقي كتبه كبار الكتّاب — مش كمجرد نص اختبار. اكتب بأسلوب سردي مشوّق يحمل القارئ من فكرة لفكرة بسلاسة وعمق. استخدم لغة عربية فصحى معاصرة جميلة، بعيدة عن التكلف والصنعة المبالغ فيها.

⚠️ قاعدة تنوع: كل نص تنتجه يجب أن يكون فريداً ومختلفاً تماماً عن أي نص آخر. لا تكرر أبداً نفس الموضوع أو نفس الأفكار أو نفس الأمثلة. كن مبدعاً في اختيار الزوايا والأمثلة.

⚠️ جودة الكتابة: النص لازم يكون متماسكاً — كل فقرة تربط بسابقتها بفكرة أو استنتاج أو مثال. لا تكتفي بسرد المعلومات بل اعرضها في سياق حيوي مشوّق. استخدم الأمثلة الواقعية والصور البيانية الطبيعية والاستعارات التي تُضحي المعنى. النص لازم يحسّس القارئ إنه يقرأ شيئاً يستحق القراءة.

${searchInspiration}${seedInstruction}${varietyConstraint}${passageTypeInstruction}

أنشئ تمرين قراءة متحررة كامل بالمتطلبات التالية:

نوع المعركة: ${gameType}
مستوى الصعوبة: ${difficulty}

القواعد:
1. اكتب نصاً عربياً أصلياً طويلاً وغنياً بالمعلومات والتفاصيل (غير منسوخ من أي مكان). يجب أن يكون النص:
   - مستوى "سهل": 400-600 كلمة على الأقل - نص عميق متعدد الأفكار والزوايا مع حجج وتفاصيل ممتعة
   - مستوى "متوسط": 550-800 كلمة على الأقل - نص مركّب كثيف الأفكار متعدد الطبقات والاستنتاجات مع تراكب المفاهيم
   - مستوى "صعب": 750-1100 كلمة على الأقل - نص شديد التركيب كثيف المفاهيم متعدد الطبقات العميقة والاستنتاجات المترابطة بتراكب فكري مزدوج
   
   النص المطلوب: ${wordCounts[difficulty]}
   
   ⚠️ مهم جداً: اكتب النص كاملاً بدون اختصار أو تقليم. النص لازم يكون غني بالأفكار والتفاصيل عشان يكفي للأسئلة. لا تختصر أبداً — اكتب كل فقرة كاملة ومفصّلة.
   
   🎨 أسلوب الكتابة المطلوب: ${randomStyle}

2. ${typeFocus}

3. عدد الأسئلة المطلوبة: ${questionCounts[difficulty]}

4. كل سؤال يجب أن يحتوي على 4 خيارات بالضبط (أ، ب، ج، د) مع إجابة صحيحة واحدة فقط

5. ⚠️ مهم جداً: correctAnswer لازم يكون رقم فقط (0 أو 1 أو 2 أو 3) يمثل فهرس الإجابة الصحيحة في مصفوفة options. ممنوع كتابة نص في correctAnswer. مثال: لو الخيار الثاني في options هو الصحيح، اكتب "correctAnswer": 1

5. ⚠️ قاعدة حيادية طول الخيارات: ممنوع تماماً أن تكون الإجابة الصحيحة هي الخيار الأطول دائماً. يجب أن تتساوى الخيارات في الطول تقريباً أو تتفاوت بشكل عشوائي طبيعي. الإجابة الصحيحة يجب أن تكون أحياناً أقصر خيار وأحياناً أطول خيار وأحياناً متوسطة — بدون أي نمط يمكن اكتشافه. توزيع طول الإجابة الصحيحة يجب أن يكون عشوائياً بالكامل عبر كل الأسئلة.

6. ${difficultyInstructions[difficulty]}

6. أضف شرحاً تفصيلياً لماذا الإجابة الصحيحة هي الصحيحة ولماذا الخيارات الأخرى خاطئة

7. ⚠️ التزام تام بقواعد اللغة العربية:
   - تأكد من صحة النحو والصرف في كل جملة
   - تأكد من صحة الهمزات والتاء المربوطة والمفتوحة
   - تأكد من صحة علامات الترقيم العربية
   - لا تستخدم أي كلمة أو تركيب غير عربي صحيح
   - راجع النص كله قبل الإرسال وتأكد من خلوه من أي أخطاء لغوية

أجب بصيغة JSON فقط بدون أي نص إضافي أو markdown أو code blocks:
{
  "title": "عنوان النص",
  "text": "النص الكامل هنا...",
  "source": "مصدر الإلهام",
  "questions": [
    {
      "id": 1,
      "text": "نص السؤال",
      "options": ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"],
      "correctAnswer": 0,
      "explanation": "شرح لماذا الإجابة صحيحة"
    }
  ]
}`
}

// OpenRouter is used directly via fetch - no SDK initialization needed

async function fetchGameContent(
  gameType: GameType,
  difficulty: Difficulty,
  roomCode: string,
  playerNames?: string[],
  previousTopics?: string[],
  passageType?: PassageType
): Promise<GameContent> {
  // Enforce overall timeout so content generation doesn't hang forever
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('انتهت مهلة توليد المحتوى')), CONTENT_TIMEOUT_MS)
  )

  const generatePromise = async (): Promise<GameContent> => {
  // Step 0: Check cache first for instant delivery
  const cachedContent = getFromCache(gameType, difficulty)
  if (cachedContent) {
    console.log(`[Cache] HIT: ${gameType} / ${difficulty} - "${cachedContent.title}"`)
    io.to(roomCode).emit('content-progress', { step: 'checking', text: 'تم العثور على محتوى جاهز!' })
    await new Promise(r => setTimeout(r, 200))
    io.to(roomCode).emit('content-progress', { step: 'ready', text: 'المحتوى جاهز! استعد للقتال!' })
    return cachedContent
  }

  console.log(`[Cache] MISS: ${gameType} / ${difficulty} — generating fresh`)

  // Step 1: Emit "checking"
  io.to(roomCode).emit('content-progress', { step: 'checking', text: 'جاري فحص المحتوى السابق للمقاتلين...' })
  await new Promise(r => setTimeout(r, 300))

  // Step 2: Emit "searching"
  io.to(roomCode).emit('content-progress', { step: 'searching', text: 'جاري البحث عن مصادر إلهام متنوعة...' })

  const usedQueries = new Set<string>()

  for (let attempt = 1; attempt <= MAX_CONTENT_RETRIES; attempt++) {
    try {
      io.to(roomCode).emit('content-progress', {
        step: 'generating',
        text: attempt === 1
          ? 'جاري توليد المحتوى بالذكاء الاصطناعي...'
          : `محاولة ${attempt} من ${MAX_CONTENT_RETRIES} - جاري إعادة توليد المحتوى...`
      })

      // Step 1: Web search for inspiration
      let searchTitle: string | undefined
      let searchSnippet: string | undefined
      let topicSeed: string | undefined

      try {
        // Select search query pool based on passageType when gameType is قراءة متحررة
        let queryPool = searchQueriesPool[gameType]
        if (gameType === 'قراءة متحررة' && passageType && passageType !== 'عشوائي') {
          queryPool = passageType === 'علمي' ? searchQueriesPoolScientific : searchQueriesPoolLiterary
        }
        let availableQueries = queryPool.filter(q => !usedQueries.has(q))
        if (availableQueries.length === 0) {
          usedQueries.clear()
          availableQueries = queryPool
        }
        const randomQuery = availableQueries[Math.floor(Math.random() * availableQueries.length)]
        usedQueries.add(randomQuery)

        // Select topic seed based on passageType when gameType is قراءة متحررة
        let seeds = topicSeeds[gameType]
        if (gameType === 'قراءة متحررة' && passageType && passageType !== 'عشوائي') {
          seeds = passageType === 'علمي' ? topicSeedsScientific : topicSeedsLiterary
        }
        topicSeed = seeds[Math.floor(Math.random() * seeds.length)]

        // Use DuckDuckGo search instead of z-ai-web-dev-sdk
        const searchResults = await duckDuckGoSearch(randomQuery)

        if (searchResults.length > 0) {
          const chosenResult = searchResults[Math.floor(Math.random() * Math.min(searchResults.length, 5))]
          searchTitle = chosenResult.name
          searchSnippet = chosenResult.snippet
        }
      } catch (searchError) {
        console.error('[fetchGameContent] Web search failed:', searchError)
      }

      if (!topicSeed) {
        let seeds = topicSeeds[gameType]
        if (gameType === 'قراءة متحررة' && passageType && passageType !== 'عشوائي') {
          seeds = passageType === 'علمي' ? topicSeedsScientific : topicSeedsLiterary
        }
        topicSeed = seeds[Math.floor(Math.random() * seeds.length)]
      }

      // Step 2: Generate with LLM via OpenRouter
      const prompt = buildPrompt(gameType, difficulty, searchTitle, searchSnippet, previousTopics, undefined, topicSeed, passageType)

      // Use different system messages for different game types
      const systemMessage = gameType === 'نصوص'
        ? 'أنت أديب وناقد عربي متمكن، متخصص في الأدب العربي وبلاغته ونقده. تكتب نصوصاً أدبية أصيلة وتُعدّ أسئلة بلاغية وتذوق أدبي. تُجيب دائماً بصيغة JSON صالحة فقط بدون أي نص إضافي. ⚠️ حقل correctAnswer في كل سؤال لازم يكون رقم (0-3) فقط وليس نصاً.'
        : 'أنت كاتب ومفكر عربي متمكن يكتب نصوصاً أصيلة بأسلوب أدبي رفيع ومشوّق. تنتج محتوى عربياً يشبه مقالات الكبار — نصوصاً حيّة وعميقة تُقرأ بشغف. التزامك بقواعد اللغة العربية النحوية والصرفية والإملائية تام ومطلق. كل نص تنتجه يجب أن يكون فريداً ومختلفاً ومكتوباً بأسلوب إنساني طبيعي مش ماشيني. تُجيب دائماً بصيغة JSON صالحة فقط بدون أي نص إضافي. ⚠️ حقل correctAnswer في كل سؤال لازم يكون رقم (0-3) فقط وليس نصاً.'

      const responseText = await callLLM(
        [
          {
            role: 'system',
            content: systemMessage,
          },
          { role: 'user', content: prompt },
        ],
        { timeoutMs: 90000 }
      )

      if (!responseText) {
        console.error(`[fetchGameContent] Attempt ${attempt}: LLM failed or timed out`)
        continue
      }

      // Step 3: Parse and validate
      const cleanedJSON = extractJSON(responseText)
      let parsed: unknown

      try {
        parsed = JSON.parse(cleanedJSON)
      } catch {
        const jsonMatch = cleanedJSON.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0])
          } catch {
            console.error(`[fetchGameContent] Attempt ${attempt}: Could not parse JSON`)
            continue
          }
        } else {
          console.error(`[fetchGameContent] Attempt ${attempt}: No JSON found in response`)
          continue
        }
      }

      if (isValidGameContent(parsed)) {
        io.to(roomCode).emit('content-progress', { step: 'validating', text: 'جاري التحقق من جودة المحتوى...' })
        await new Promise(r => setTimeout(r, 200))

        io.to(roomCode).emit('content-progress', { step: 'ready', text: 'المحتوى جاهز! استعد للقتال!' })

        const validatedQuestions = parsed.questions.map((q: any, index: number) => {
          // ─── Normalize correctAnswer ────────────────────────────────
          // LLM might return: number (0-3), string number ("1"), or text of answer ("الهيدروجين")
          let correctAnswer: number
          if (typeof q.correctAnswer === 'number') {
            correctAnswer = q.correctAnswer
          } else if (typeof q.correctAnswer === 'string') {
            // Try parsing as number first
            const parsed = parseInt(q.correctAnswer, 10)
            if (!isNaN(parsed) && parsed >= 0 && parsed <= 3) {
              correctAnswer = parsed
            } else {
              // It's a text answer - find its index in the options
              const answerText = q.correctAnswer.trim()
              const options = q.options || []
              const matchIndex = options.findIndex((opt: string) => 
                typeof opt === 'string' && opt.trim() === answerText
              )
              // Also try partial match (in case of slight formatting differences)
              correctAnswer = matchIndex !== -1 
                ? matchIndex 
                : options.findIndex((opt: string) => 
                    typeof opt === 'string' && opt.trim().includes(answerText)
                  )
              if (correctAnswer === -1) correctAnswer = 0  // Fallback to first option
            }
          } else {
            correctAnswer = 0
          }
          correctAnswer = Math.max(0, Math.min(3, correctAnswer))
          
          // ─── Pad options to exactly 4 if needed ────────────────────
          let options = [...(q.options || [])]
          while (options.length < 4) options.push(`خيار ${options.length + 1}`)
          options = options.slice(0, 4)
          
          return {
            ...q,
            id: index + 1,
            correctAnswer,
            options,
          }
        })

        const content: GameContent = {
          title: parsed.title,
          text: parsed.text,
          source: parsed.source,
          questions: validatedQuestions,
        }

        // Add to cache for future use
        addToCache(content, gameType, difficulty, passageType)

        return content
      } else {
        console.error(`[fetchGameContent] Attempt ${attempt}: Invalid content structure`)
        continue
      }
    } catch (err: any) {
      console.error(`[fetchGameContent] Attempt ${attempt} failed for room ${roomCode}:`, err.message)

      if (attempt < MAX_CONTENT_RETRIES) {
        io.to(roomCode).emit('content-progress', {
          step: 'retrying',
          text: `فشل المحاولة ${attempt}... جاري إعادة المحاولة...`
        })
        await new Promise(r => setTimeout(r, 1000 * attempt))
      }
    }
  }

  console.error(`[fetchGameContent] All ${MAX_CONTENT_RETRIES} attempts failed for room ${roomCode}`)
  if (!NVIDIA_API_KEY && !OPENROUTER_API_KEY) {
    throw new Error('لا يوجد مفتاح API! يرجى إضافة NVIDIA_API_KEY أو OPENROUTER_API_KEY في متغيرات البيئة.')
  }
  throw new Error('فشل في توليد المحتوى بعد محاولات متعددة. يرجى المحاولة مرة أخرى.')
  }

  return Promise.race([generatePromise(), timeoutPromise])
}

// Broadcast updated public rooms list to all connected sockets
function broadcastPublicRooms() {
  const list = getPublicRoomsList()
  io.emit('public-rooms-update', { rooms: list })
}

// Delete a room and clean up all references
function deleteRoom(roomCode: string) {
  const room = rooms.get(roomCode)
  if (!room) return

  // Clear the server-side round timer
  if (room.roundTimer) {
    clearTimeout(room.roundTimer)
    room.roundTimer = null
  }

  // Clean up socketRoomMap entries pointing to this room
  for (const [socketId, code] of socketRoomMap.entries()) {
    if (code === roomCode) {
      socketRoomMap.delete(socketId)
    }
  }

  rooms.delete(roomCode)
  console.log(`[delete-room] Room ${roomCode} deleted`)
  broadcastPublicRooms()
}

// Calculate round scores for all players
function calculateRoundScores(room: GameRoom, roundIndex: number): RoundScore[] {
  const scores: RoundScore[] = []

  for (const [playerId, player] of room.players.entries()) {
    if (player.isDisconnected) continue  // Skip disconnected players in scoring
    const playerRoundsAnswers = room.playerAnswers.get(playerId)
    const roundAnswers = playerRoundsAnswers?.get(roundIndex)
    const roundContent = room.rounds[roundIndex]

    let roundScore = 0
    let correctAnswers = 0
    const totalQuestions = roundContent?.content.questions.length || 0

    if (roundAnswers && roundContent) {
      for (const [qIndex, answer] of roundAnswers.entries()) {
        const question = roundContent.content.questions[qIndex]
        if (question) {
          const isCorrect = question.correctAnswer === answer.answerIndex
          const points = calculateScore(isCorrect, answer.timeTaken, room.roundTimerSeconds)
          roundScore += points
          if (isCorrect) correctAnswers++
        }
      }
    }

    scores.push({
      playerId,
      playerName: player.name,
      score: roundScore,
      correctAnswers,
      totalQuestions,
    })
  }

  return scores.sort((a, b) => b.score - a.score)
}

// Remove a player from a room (voluntary leave) or mark as disconnected (for reconnection)
function removePlayerFromRoom(socketId: string, reason: 'leave' | 'disconnect') {
  const roomCode = socketRoomMap.get(socketId)
  if (!roomCode) return

  const room = rooms.get(roomCode)
  if (!room) {
    socketRoomMap.delete(socketId)
    return
  }

  const player = room.players.get(socketId)
  const playerName = player?.name || socketId

  if (reason === 'leave') {
    // Voluntary leave - remove entirely
    room.players.delete(socketId)
    room.playerAnswers.delete(socketId)
    socketRoomMap.delete(socketId)

    // If room has no active players, delete it
    const activePlayers = Array.from(room.players.values()).filter(p => !p.isDisconnected)
    if (activePlayers.length === 0 && room.players.size === 0) {
      deleteRoom(roomCode)
      console.log(`[removePlayer] ${playerName} left room ${roomCode}. Room deleted (empty).`)
      return
    }

    // If the removed player was the host, transfer host
    if (room.hostId === socketId) {
      const newHost = findNextHost(room.players)
      if (newHost) {
        room.hostId = newHost.id
        room.hostName = newHost.name
        newHost.isHost = true
        io.to(roomCode).emit('host-changed', {
          newHostId: newHost.id,
          newHostName: newHost.name,
          oldHostName: playerName,
          players: playersToArray(room.players),
        })
      }
    }

    // In team mode, transfer team captain if needed
    if (room.battleMode === 'فرق' && player?.teamId) {
      const oldTeamId = player.teamId
      if (player.isCaptain) {
        transferTeamCaptain(room, oldTeamId, socketId)
      }
    }

    // Clean up pending join requests for leaving player
    if (room.battleMode === 'فرق') {
      const toDelete: string[] = []
      for (const [reqId, req] of room.joinRequests.entries()) {
        if (req.playerId === socketId) {
          req.status = 'expired'
          const captain = req.targetTeamId === 'A'
            ? getTeamPlayers(room, 'A').find(p => p.isCaptain)
            : getTeamPlayers(room, 'B').find(p => p.isCaptain)
          if (captain) io.to(captain.id).emit('join-request-expired', { requestId: reqId })
          toDelete.push(reqId)
        }
      }
      for (const id of toDelete) room.joinRequests.delete(id)
    }

    io.to(roomCode).emit('player-left', {
      playerId: socketId,
      playerName,
      players: playersToArray(room.players),
    })

    // If game is playing and only 1 active player left, auto-end
    if (room.status === 'playing' && activePlayers.length === 1) {
      const remainingPlayer = activePlayers[0]
      io.to(roomCode).emit('opponent-left-game', {
        leftPlayerName: playerName,
        winnerName: remainingPlayer?.name,
      })
      handleGameEnd(roomCode)
    } else if (room.status === 'playing' && room.battleMode === 'فرق' && activePlayers.length > 1) {
      // Team mode: check if all players from one team left during gameplay
      const teamAActive = activePlayers.filter(p => p.teamId === 'A')
      const teamBActive = activePlayers.filter(p => p.teamId === 'B')
      
      if (teamAActive.length === 0 && teamBActive.length > 0) {
        const teamBName = getTeamDisplayName(room, 'B')
        const teamAName = getTeamDisplayName(room, 'A')
        io.to(roomCode).emit('team-ready-state', {
          teamId: 'B',
          teamName: teamBName,
          message: `${teamAName} غادر الساحة! ${teamBName} يفوز! 🌊`,
          allTeamsReady: true,
        })
        handleRoundEnd(roomCode)
      } else if (teamBActive.length === 0 && teamAActive.length > 0) {
        const teamAName = getTeamDisplayName(room, 'A')
        const teamBName = getTeamDisplayName(room, 'B')
        io.to(roomCode).emit('team-ready-state', {
          teamId: 'A',
          teamName: teamAName,
          message: `${teamBName} غادر الساحة! ${teamAName} يفوز! 🔥`,
          allTeamsReady: true,
        })
        handleRoundEnd(roomCode)
      }
    } else if (activePlayers.length === 0) {
      deleteRoom(roomCode)
    }

    console.log(`[removePlayer] ${playerName} left room ${roomCode}. Remaining active: ${activePlayers.length}`)
  } else {
    // Disconnect - mark as disconnected for grace period reconnection
    if (player) {
      player.isDisconnected = true
      player.disconnectedAt = Date.now()
      player.oldSocketIds.push(socketId)
    }
    socketRoomMap.delete(socketId)

    // In team mode, transfer team captain if needed
    if (room.battleMode === 'فرق' && player?.teamId && player.isCaptain) {
      transferTeamCaptain(room, player.teamId, socketId)
    }

    // Clean up pending join requests for disconnected player
    if (room.battleMode === 'فرق') {
      const toDelete: string[] = []
      for (const [reqId, req] of room.joinRequests.entries()) {
        if (req.playerId === socketId) {
          req.status = 'expired'
          const captain = req.targetTeamId === 'A'
            ? getTeamPlayers(room, 'A').find(p => p.isCaptain)
            : getTeamPlayers(room, 'B').find(p => p.isCaptain)
          if (captain) io.to(captain.id).emit('join-request-expired', { requestId: reqId })
          toDelete.push(reqId)
        }
      }
      for (const id of toDelete) room.joinRequests.delete(id)
    }

    // Notify others that this player is temporarily disconnected
    io.to(roomCode).emit('player-disconnected', {
      playerId: socketId,
      playerName,
      players: playersToArray(room.players),
    })

    // If game is playing and only 1 active player left, start a timer
    // If the disconnected player doesn't rejoin within grace period, end the game
    const activePlayers = Array.from(room.players.values()).filter(p => !p.isDisconnected)
    if (room.status === 'playing' && activePlayers.length === 1) {
      console.log(`[disconnect] Only 1 active player left in room ${roomCode}. Waiting ${DISCONNECT_GRACE_PERIOD / 1000}s for reconnection...`)
      // The cleanup interval will handle ending the game if the player doesn't rejoin
    }

    // Team mode: check if all players from one team disconnected during gameplay
    // Instead of ending the round immediately, start a 30-second grace period
    const TEAM_DISCONNECT_GRACE_PERIOD = 30000 // 30 seconds
    if (room.status === 'playing' && room.battleMode === 'فرق') {
      const teamAActive = activePlayers.filter(p => p.teamId === 'A')
      const teamBActive = activePlayers.filter(p => p.teamId === 'B')
      
      if (teamAActive.length === 0 && teamBActive.length > 0) {
        // Team A has no active players - start grace period
        const teamBName = getTeamDisplayName(room, 'B')
        const teamAName = getTeamDisplayName(room, 'A')
        io.to(roomCode).emit('team-ready-state', {
          teamId: 'B',
          teamName: teamBName,
          message: `${teamAName} انقطعوا! انتظار ${TEAM_DISCONNECT_GRACE_PERIOD / 1000} ثانية للعودة... ⏳`,
          allTeamsReady: false,
        })
        console.log(`[disconnect] Team A all disconnected in room ${roomCode}. Starting ${TEAM_DISCONNECT_GRACE_PERIOD / 1000}s grace period...`)
        // Grace period timer: if no one from Team A reconnects, end the round
        setTimeout(() => {
          const currentActive = Array.from(room.players.values()).filter(p => !p.isDisconnected)
          const currentTeamA = currentActive.filter(p => p.teamId === 'A')
          if (room.status === 'playing' && currentTeamA.length === 0) {
            io.to(roomCode).emit('team-ready-state', {
              teamId: 'B',
              teamName: teamBName,
              message: `${teamAName} غادر الساحة! ${teamBName} يفوز! 🌊`,
              allTeamsReady: true,
            })
            handleRoundEnd(roomCode)
          }
        }, TEAM_DISCONNECT_GRACE_PERIOD)
      } else if (teamBActive.length === 0 && teamAActive.length > 0) {
        // Team B has no active players - start grace period
        const teamAName = getTeamDisplayName(room, 'A')
        const teamBName = getTeamDisplayName(room, 'B')
        io.to(roomCode).emit('team-ready-state', {
          teamId: 'A',
          teamName: teamAName,
          message: `${teamBName} انقطعوا! انتظار ${TEAM_DISCONNECT_GRACE_PERIOD / 1000} ثانية للعودة... ⏳`,
          allTeamsReady: false,
        })
        console.log(`[disconnect] Team B all disconnected in room ${roomCode}. Starting ${TEAM_DISCONNECT_GRACE_PERIOD / 1000}s grace period...`)
        // Grace period timer: if no one from Team B reconnects, end the round
        setTimeout(() => {
          const currentActive = Array.from(room.players.values()).filter(p => !p.isDisconnected)
          const currentTeamB = currentActive.filter(p => p.teamId === 'B')
          if (room.status === 'playing' && currentTeamB.length === 0) {
            io.to(roomCode).emit('team-ready-state', {
              teamId: 'A',
              teamName: teamAName,
              message: `${teamBName} غادر الساحة! ${teamAName} يفوز! 🔥`,
              allTeamsReady: true,
            })
            handleRoundEnd(roomCode)
          }
        }, TEAM_DISCONNECT_GRACE_PERIOD)
      }
    }

    console.log(`[disconnect] ${playerName} disconnected from room ${roomCode}. Marked for reconnection (grace: ${DISCONNECT_GRACE_PERIOD / 1000}s). Active: ${activePlayers.length}`)
  }

  broadcastPublicRooms()
}

// ─── Team-Aware Finished Status Builder ──────────────────────────────────────
// Builds the finished-status-update payload with team-specific info for
// synchronized round progression. In team mode, includes per-team finish
// counts, readiness flags, and player name lists for cinematic waiting UI.

function buildFinishedStatus(room: GameRoom) {
  const activePlayers = [...room.players.entries()].filter(([, p]) => !p.isDisconnected)
  const activePlayerCount = activePlayers.length
  const finishedCount = [...room.finishedPlayers].filter(id => {
    const p = room.players.get(id)
    return p && !p.isDisconnected
  }).length

  const unfinishedPlayerNames = activePlayers
    .filter(([id]) => !room.finishedPlayers.has(id))
    .map(([, p]) => p.name)

  const result: any = {
    finishedPlayers: [...room.finishedPlayers],
    finishedCount,
    totalActive: activePlayerCount,
    unfinishedPlayerNames,
  }

  // Add team-aware fields for team mode synchronized progression
  if (room.battleMode === 'فرق') {
    const teamAPlayers = activePlayers.filter(([, p]) => p.teamId === 'A')
    const teamBPlayers = activePlayers.filter(([, p]) => p.teamId === 'B')

    const teamAFinished = teamAPlayers.filter(([id]) => room.finishedPlayers.has(id))
    const teamBFinished = teamBPlayers.filter(([id]) => room.finishedPlayers.has(id))

    const teamATotal = teamAPlayers.length
    const teamBTotal = teamBPlayers.length
    const teamAFinishedCount = teamAFinished.length
    const teamBFinishedCount = teamBFinished.length

    result.teamAFinishedCount = teamAFinishedCount
    result.teamATotal = teamATotal
    result.teamBFinishedCount = teamBFinishedCount
    result.teamBTotal = teamBTotal
    result.teamAReady = teamATotal > 0 && teamAFinishedCount >= teamATotal
    result.teamBReady = teamBTotal > 0 && teamBFinishedCount >= teamBTotal
    result.teamAFinishedNames = teamAFinished.map(([, p]) => p.name)
    result.teamBFinishedNames = teamBFinished.map(([, p]) => p.name)
    result.teamAUnfinishedNames = teamAPlayers
      .filter(([id]) => !room.finishedPlayers.has(id))
      .map(([, p]) => p.name)
    result.teamBUnfinishedNames = teamBPlayers
      .filter(([id]) => !room.finishedPlayers.has(id))
      .map(([, p]) => p.name)
  }

  return result
}

// ─── Socket.IO Connection Handler ────────────────────────────────────────────

io.on('connection', (socket: Socket) => {
  console.log(`[connected] ${socket.id}`)

  // Send current public rooms list on connect
  socket.emit('public-rooms-update', { rooms: getPublicRoomsList() })

  // ── get-public-rooms ───────────────────────────────────────────────────
  socket.on('get-public-rooms', () => {
    socket.emit('public-rooms-update', { rooms: getPublicRoomsList() })
  })

  // ── rejoin-room ────────────────────────────────────────────────────────
  // Called when a player refreshes the page and wants to rejoin their room
  socket.on(
    'rejoin-room',
    (data: { roomCode: string; playerName: string }) => {
      const { roomCode, playerName } = data

      if (!roomCode || !playerName) {
        socket.emit('rejoin-failed', { message: 'بيانات النظام غير كاملة' })
        return
      }

      const room = rooms.get(roomCode.toUpperCase())
      if (!room) {
        socket.emit('rejoin-failed', { message: 'الساحة لم تعد موجودة' })
        return
      }

      // Find the player by name in the room (including disconnected players)
      let existingPlayer: Player | undefined
      let existingPlayerId: string | undefined
      for (const [id, player] of room.players.entries()) {
        if (player.name === playerName.trim()) {
          existingPlayer = player
          existingPlayerId = id
          break
        }
      }

      if (!existingPlayer || !existingPlayerId) {
        socket.emit('rejoin-failed', { message: 'أنت مش في الساحة دي' })
        return
      }

      // Check if the player's grace period has expired
      if (existingPlayer.isDisconnected && existingPlayer.disconnectedAt) {
        if (Date.now() - existingPlayer.disconnectedAt > DISCONNECT_GRACE_PERIOD) {
          // Grace period expired - can't rejoin
          socket.emit('rejoin-failed', { message: 'انتهت مهلة إعادة الاتصال' })
          return
        }
      }

      // Update the player's ID to the new socket ID and mark as reconnected
      const oldId = existingPlayerId
      existingPlayer.id = socket.id
      existingPlayer.isDisconnected = false
      existingPlayer.disconnectedAt = null

      // Move from old key to new key in players map
      room.players.delete(oldId)
      room.players.set(socket.id, existingPlayer)

      // Move answers too
      const oldAnswers = room.playerAnswers.get(oldId)
      if (oldAnswers) {
        room.playerAnswers.delete(oldId)
        room.playerAnswers.set(socket.id, oldAnswers)
      }

      // Migrate readyPlayers and finishedPlayers from old ID to new ID
      if (room.readyPlayers.has(oldId)) {
        room.readyPlayers.delete(oldId)
        room.readyPlayers.add(socket.id)
      }
      if (room.finishedPlayers.has(oldId)) {
        room.finishedPlayers.delete(oldId)
        room.finishedPlayers.add(socket.id)
      }

      // Update host ID if needed
      if (room.hostId === oldId) {
        room.hostId = socket.id
      }

      // Set up new socket mapping
      socketRoomMap.set(socket.id, roomCode)
      socket.join(roomCode)

      // Send the full room/game state to the rejoining player
      const rejoinData: any = {
        roomCode,
        players: playersToArray(room.players),
        settings: room.settings,
        roomType: room.roomType,
        hasPassword: !!room.password,
        isHost: existingPlayer.isHost,
        status: room.status,
        currentRound: room.currentRound,
        battleMode: room.battleMode,
        teams: room.battleMode === 'فرق' ? getTeamsInfo(room) : null,
        pendingJoinRequests: room.battleMode === 'فرق' ? Array.from(room.joinRequests.values())
          .filter(r => r.status === 'pending')
          .map(r => ({ id: r.id, playerName: r.playerName, playerId: r.playerId, targetTeamId: r.targetTeamId, type: r.type, currentTeamId: r.currentTeamId, expiresAt: r.expiresAt })) : [],
      }

      // If game is in progress, send current round content and progress
      if (room.status === 'playing' && room.rounds.length > 0) {
        const currentRoundContent = room.rounds[room.currentRound]
        if (currentRoundContent) {
          rejoinData.gameContent = currentRoundContent.content
          rejoinData.currentRound = room.currentRound
          rejoinData.totalRounds = room.settings.numberOfRounds
          rejoinData.answers = {}
          const playerAnswersForRounds = room.playerAnswers.get(socket.id)
          if (playerAnswersForRounds) {
            const roundAnswers = playerAnswersForRounds.get(room.currentRound)
            if (roundAnswers) {
              for (const [qIndex, answer] of roundAnswers.entries()) {
                rejoinData.answers[qIndex] = answer.answerIndex
              }
            }
          }
          // Calculate remaining time
          if (room.roundStartTime) {
            const elapsed = Math.floor((Date.now() - room.roundStartTime) / 1000)
            rejoinData.timeLeft = Math.max(0, room.roundTimerSeconds - elapsed)
          }
        }
      }

      // If game is finished, send final results
      if (room.status === 'finished') {
        const finalScores = playersToArrayAll(room.players).sort((a, b) => b.score - a.score)
        rejoinData.scores = finalScores
        rejoinData.totalRounds = room.settings.numberOfRounds
        rejoinData.roundWinners = Object.fromEntries(room.roundWinners)
        rejoinData.roundResults = Object.fromEntries(
          Array.from(room.roundResults.entries()).map(([k, v]) => [k, v])
        )
        // Include early end info if applicable
        if (room.earlyEnding) {
          rejoinData.wasEarlyEnd = true
          rejoinData.completedRounds = room.roundResults.size
        }
      }

      socket.emit('rejoin-success', rejoinData)

      // Notify other players that this player reconnected
      socket.to(roomCode).emit('player-reconnected', {
        playerId: socket.id,
        playerName: existingPlayer.name,
        players: playersToArray(room.players),
      })

      broadcastPublicRooms()

      console.log(
        `[rejoin-room] ${playerName} (${socket.id}) rejoined room ${roomCode} (was ${oldId})`
      )
    }
  )

  // ── leave-room ─────────────────────────────────────────────────────────
  socket.on('leave-room', () => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return

    // Leave the Socket.io room FIRST so they don't receive any more events
    socket.leave(roomCode)
    removePlayerFromRoom(socket.id, 'leave')
  })

  // ── update-name ──────────────────────────────────────────────────────────
  // Player changed their display name — update in room and broadcast to others
  socket.on('update-name', (data: { newName: string }) => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode || !data.newName?.trim()) return

    const room = rooms.get(roomCode)
    if (!room) return

    const player = room.players.get(socket.id)
    if (!player) return

    const oldName = player.name
    player.name = data.newName.trim()

    // Broadcast updated player list to everyone in the room
    io.to(roomCode).emit('player-name-updated', {
      playerId: socket.id,
      oldName,
      newName: player.name,
      players: playersToArray(room.players),
    })
  })

  // ── early-end-game ─────────────────────────────────────────────────────
  // Host can end the game early, subject to round-player restriction rules
  socket.on(
    'early-end-game',
    (data: { roomCode: string }) => {
      const { roomCode } = data

      // Validate room exists
      const room = rooms.get(roomCode?.toUpperCase())
      if (!room) {
        socket.emit('early-end-rejected', { message: 'الساحة مش موجودة' })
        return
      }

      // Validate sender is the host
      if (room.hostId !== socket.id) {
        socket.emit('early-end-rejected', { message: 'فقط القائد يقدر ينهي المعركة' })
        return
      }

      // In team mode, early end should go through captain-approval-request instead
      if (room.battleMode === 'فرق') {
        socket.emit('game-error', { message: 'في وضع الفرق، يجب طلب الموافقة من قائد الفريق الآخر' })
        return
      }

      // Validate game is in progress
      if (room.status !== 'playing') {
        socket.emit('early-end-rejected', { message: 'المعركة مش شغالة حالياً' })
        return
      }

      // Prevent duplicate processing
      if (room.earlyEnding) {
        socket.emit('early-end-rejected', { message: 'جاري معالجة إنهاء المعركة بالفعل' })
        return
      }

      // Count active (non-disconnected) players
      const activePlayers = Array.from(room.players.values()).filter(p => !p.isDisconnected)
      const activePlayerCount = activePlayers.length

      // Count completed rounds (rounds that have scores calculated)
      const completedRoundsCount = room.roundResults.size

      // Round-player restriction rule:
      // 2 active players CANNOT end game if exactly 2 rounds completed
      // 3 active players CANNOT end game if exactly 3 rounds completed
      if (activePlayerCount === 2 && completedRoundsCount === 2) {
        socket.emit('early-end-rejected', { message: 'مقاتلين ما يلعبوش جولتين — القاعدة بتمنع إنهاء المعركة دلوقتي' })
        return
      }
      if (activePlayerCount === 3 && completedRoundsCount === 3) {
        socket.emit('early-end-rejected', { message: 'ثلاث مقاتلين ما يلعبوش ثلاث جولات — القاعدة بتمنع إنهاء المعركة دلوقتي' })
        return
      }

      // All validations passed - set earlyEnding flag
      room.earlyEnding = true

      console.log(`[early-end-game] Host ${socket.id} ending game early in room ${room.roomCode}. Completed rounds: ${completedRoundsCount}, Active players: ${activePlayerCount}`)

      // If a round is currently in progress (roundStartTime is set and round is not already ending),
      // finalize the current round's scores first
      if (room.roundStartTime && !room.roundEnding) {
        const currentRound = room.currentRound

        // Calculate and store current round scores
        const roundScores = calculateRoundScores(room, currentRound)
        room.roundResults.set(currentRound, roundScores)

        // Determine round winner and update roundWins
        if (roundScores.length > 0) {
          const winnerId = roundScores[0].playerId
          room.roundWinners.set(currentRound, winnerId)

          const winnerPlayer = room.players.get(winnerId)
          if (winnerPlayer) {
            winnerPlayer.roundWins++
          }
        }

        // Reset player scores for consistency
        for (const player of room.players.values()) {
          player.score = 0
        }

        // Emit round-end for the current (interrupted) round
        io.to(room.roomCode).emit('round-end', {
          roundNumber: currentRound,
          totalRounds: room.settings.numberOfRounds,
          roundScores,
          roundWinner: roundScores[0] || null,
          isLastRound: true,
        })
      }

      // Now end the game with early end flag
      // Small delay to let clients process the round-end event first
      setTimeout(() => {
        handleGameEnd(room.roomCode, true)
      }, 1500)
    }
  )

  // ── create-game ────────────────────────────────────────────────────────
  socket.on(
    'create-game',
    (data: {
      playerName: string
      settings: GameSettings
      roomType: RoomType
      password?: string
    }) => {
      const { playerName, settings, roomType, password } = data

      if (!playerName || playerName.trim().length === 0) {
        socket.emit('game-error', { message: 'اسم المقاتل مطلوب' })
        return
      }

      // Validate rounds rule: 2 players can't play 2 rounds, 3 players can't play 3 rounds
      // Only validate for fixed mode (open mode will be validated at start time with actual player count)
      if (settings.playerMode !== 'open' && settings.maxPlayers !== 0) {
        if ((settings.maxPlayers === 2 && settings.numberOfRounds === 2) || (settings.maxPlayers === 3 && settings.numberOfRounds === 3)) {
          socket.emit('game-error', { message: 'عدد الجولات لا يمكن أن يساوي عدد المقاتلين عند 2 أو 3 مقاتلين' })
          return
        }
      }

      // Cap rounds at 20
      if (settings.numberOfRounds > 20) {
        settings.numberOfRounds = 20
      }

      const roomCode = generateRoomCode()

      const player: Player = {
        id: socket.id,
        name: playerName.trim(),
        score: 0,
        isHost: true,
        isReady: true,
        joinOrder: globalJoinCounter++,
        roundWins: 0,
        isDisconnected: false,
        disconnectedAt: null,
        oldSocketIds: [],
        teamId: settings.battleMode === 'فرق' ? 'A' : null,
        isCaptain: settings.battleMode === 'فرق' ? true : false,
      }

      const playersMap = new Map<string, Player>()
      playersMap.set(socket.id, player)

      const room: GameRoom = {
        roomCode,
        roomType: roomType || 'عامة',
        password: (roomType === 'خاصة' && password?.trim()) ? password.trim() : null,
        hostId: socket.id,
        hostName: playerName.trim(),
        settings,
        players: playersMap,
        rounds: [],
        status: 'waiting',
        currentRound: 0,
        playerAnswers: new Map(),
        roundStartTime: null,
        roundTimerSeconds: settings.timePerRound * 60,
        roundResults: new Map(),
        roundWinners: new Map(),
        roundEnding: false,
        roundTimer: null,
        earlyEnding: false,
        gameStartTime: null,
        readyPlayers: new Set(),
        finishedPlayers: new Set(),
        battleMode: settings.battleMode || 'فردي',
        voiceMerged: false,
        pendingApproval: null,
        joinRequests: new Map(),
        teamNames: { A: null, B: null },
        _prefetchInProgress: -1,
      }

      rooms.set(roomCode, room)
      socketRoomMap.set(socket.id, roomCode)
      socket.join(roomCode)

      socket.emit('game-created', {
        roomCode,
        roomType: room.roomType,
        hasPassword: !!room.password,
        battleMode: room.battleMode,
        teams: getTeamsInfo(room),
      })

      if (room.roomType === 'عامة') {
        broadcastPublicRooms()
      }

      console.log(
        `[create-game] Room ${roomCode} (${roomType}${room.password ? ' +password' : ''}) created by ${playerName} (${socket.id})`
      )
    }
  )

  // ── join-game ──────────────────────────────────────────────────────────
  socket.on(
    'join-game',
    (data: { roomCode: string; playerName: string; password?: string }) => {
      const { roomCode, playerName, password } = data

      if (!roomCode || !playerName || playerName.trim().length === 0) {
        socket.emit('game-error', { message: 'رمز الساحة واسم المقاتل مطلوبان' })
        return
      }

      const room = rooms.get(roomCode.toUpperCase())
      if (!room) {
        socket.emit('game-error', { message: 'الساحة غير موجودة أو تم حذفها' })
        return
      }

      if (room.players.size === 0) {
        socket.emit('game-error', { message: 'الساحة غير موجودة أو تم حذفها' })
        broadcastPublicRooms()
        return
      }

      if (room.status !== 'waiting') {
        socket.emit('game-error', { message: 'المعركة بدأت بالفعل' })
        return
      }

      if (room.settings.maxPlayers !== 0) {
        const activePlayers = [...room.players.values()].filter(p => !p.isDisconnected).length
        if (activePlayers >= room.settings.maxPlayers) {
          socket.emit('game-error', { message: 'الساحة ممتلئة' })
          return
        }
      }

      // Check password for private rooms
      if (room.password && room.password !== password) {
        socket.emit('game-error', { message: 'كلمة السر غلط' })
        return
      }

      // Check if player name is already taken
      const nameTaken = Array.from(room.players.values()).some(
        (p) => p.name === playerName.trim()
      )
      if (nameTaken) {
        socket.emit('game-error', { message: 'اسم المقاتل مستخدم بالفعل في الساحة دي' })
        return
      }

      const player: Player = {
        id: socket.id,
        name: playerName.trim(),
        score: 0,
        isHost: false,
        isReady: false,
        joinOrder: globalJoinCounter++,
        roundWins: 0,
        isDisconnected: false,
        disconnectedAt: null,
        oldSocketIds: [],
        teamId: null,
        isCaptain: false,
      }

      // Auto-assign team in team mode
      if (room.battleMode === 'فرق') {
        const teamAPlayers = getTeamPlayers(room, 'A')
        const teamBPlayers = getTeamPlayers(room, 'B')
        const teamACaptain = teamAPlayers.find(p => p.isCaptain)
        const teamBCaptain = teamBPlayers.find(p => p.isCaptain)

        if (teamAPlayers.length <= teamBPlayers.length) {
          player.teamId = 'A'
          player.isCaptain = !teamACaptain // Captain only if no captain exists
        } else {
          player.teamId = 'B'
          player.isCaptain = !teamBCaptain // Captain only if no captain exists
        }
      }

      room.players.set(socket.id, player)
      socketRoomMap.set(socket.id, roomCode)
      socket.join(roomCode)

      // Send game info to the joiner
      socket.emit('game-joined', {
        roomCode,
        players: playersToArray(room.players),
        settings: room.settings,
        roomType: room.roomType,
        hasPassword: !!room.password,
        battleMode: room.battleMode,
        teams: getTeamsInfo(room),
        pendingJoinRequests: Array.from(room.joinRequests.values())
          .filter(r => r.status === 'pending')
          .map(r => ({ id: r.id, playerName: r.playerName, playerId: r.playerId, targetTeamId: r.targetTeamId, type: r.type, currentTeamId: r.currentTeamId, expiresAt: r.expiresAt })),
      })

      // Notify others in the room
      socket.to(roomCode).emit('player-joined', {
        player,
        players: playersToArray(room.players),
        battleMode: room.battleMode,
        teams: getTeamsInfo(room),
        pendingJoinRequests: Array.from(room.joinRequests.values())
          .filter(r => r.status === 'pending')
          .map(r => ({ id: r.id, playerName: r.playerName, playerId: r.playerId, targetTeamId: r.targetTeamId, type: r.type, currentTeamId: r.currentTeamId, expiresAt: r.expiresAt })),
      })

      // If auto-assigned to a team, emit events so the UI updates
      if (player.teamId !== null) {
        const teamsInfo = getTeamsInfo(room)
        io.to(roomCode).emit('team-update', {
          teams: teamsInfo,
          players: playersToArray(room.players),
          switchedPlayerId: player.id,
          switchedPlayerName: player.name,
          newTeamId: player.teamId,
        })

        // Notify the player they were auto-assigned as captain
        socket.emit('join-request-approved', {
          requestId: 'auto',
          teamId: player.teamId,
          teamName: getTeamDisplayName(room, player.teamId),
          captainName: player.name,
        })

        // Broadcast captain change
        io.to(roomCode).emit('team-captain-changed', {
          teamId: player.teamId,
          newCaptainId: player.id,
          newCaptainName: player.name,
          teams: teamsInfo,
        })
      }

      broadcastPublicRooms()

      console.log(
        `[join-game] ${playerName} (${socket.id}) joined room ${roomCode}${player.teamId ? ` → auto-assigned to Team ${player.teamId} as captain` : ''}`
      )
    }
  )

  // ── start-game ─────────────────────────────────────────────────────────
  socket.on(
    'start-game',
    async (data: { roomCode: string }) => {
      const { roomCode } = data
      const room = rooms.get(roomCode?.toUpperCase())

      console.log(`[start-game] Request from ${socket.id}, roomCode: ${roomCode}, room found: ${!!room}`)

      if (!room) {
        socket.emit('game-error', { message: 'الساحة غير موجودة' })
        return
      }

      if (room.hostId !== socket.id) {
        socket.emit('game-error', { message: 'فقط القائد يقدر يبدأ المعركة' })
        return
      }

      // Count only active (non-disconnected) players
      const activePlayerCount = Array.from(room.players.values()).filter(p => !p.isDisconnected).length
      if (activePlayerCount < 2) {
        socket.emit('game-error', { message: 'يجب أن يكون هناك مقاتلان نشطان على الأقل' })
        return
      }

      if (room.status !== 'waiting') {
        socket.emit('game-error', { message: 'المعركة بدأت بالفعل' })
        return
      }

      // In team mode, check that there are no unassigned players
      if (room.battleMode === 'فرق') {
        const unassigned = getUnassignedPlayers(room)
        if (unassigned.length > 0) {
          const names = unassigned.map(p => p.name).join('، ')
          socket.emit('game-error', { message: `المقاتلون التالية أسماؤهم غير مصنفين: ${names}. يجب أن ينضموا لفريق أولاً.` })
          return
        }
      }

      // Validate round/player conflict rules with current player count
      const currentActivePlayers = Array.from(room.players.values()).filter(p => !p.isDisconnected).length
      if (currentActivePlayers === 2 && room.settings.numberOfRounds === 2) {
        socket.emit('game-error', { message: 'مقاتلين ما يلعبوش جولتين' })
        return
      }
      if (currentActivePlayers === 3 && room.settings.numberOfRounds === 3) {
        socket.emit('game-error', { message: 'ثلاث مقاتلين ما يلعبوش ثلاث جولات' })
        return
      }

      // Update room status
      room.status = 'playing'
      room.currentRound = 0
      room.roundEnding = false
      room.gameStartTime = Date.now()
      room.finishedPlayers = new Set()

      // Reset all player scores and round wins for the new game
      // Also remove any lingering disconnected players
      const disconnectedIds: string[] = []
      for (const [id, player] of room.players.entries()) {
        if (player.isDisconnected) {
          disconnectedIds.push(id)
        } else {
          player.score = 0
          player.roundWins = 0
        }
      }
      // Remove disconnected players before starting
      for (const id of disconnectedIds) {
        room.players.delete(id)
        room.playerAnswers.delete(id)
      }

      room.roundResults.clear()
      room.roundWinners.clear()

      // Notify all players that game is starting
      io.to(roomCode).emit('game-starting', {})

      // Update public rooms (game started, no longer in waiting)
      broadcastPublicRooms()

      // Get player names for content tracking (to avoid showing repeated content)
      const playerNames = playersToArray(room.players).map(p => p.name)

      // Generate content for all rounds
      try {
        // Generate first round content
        // fetchGameContent will emit real progress steps internally:
        // checking → searching → generating → validating → ready
        console.log(`[start-game] Generating first round content for room ${roomCode}...`)

        const firstRoundContent = await fetchGameContent(
          room.settings.gameType,
          room.settings.difficulty,
          roomCode,
          playerNames,
          [], // No previous topics for first round
          room.settings.passageType
        )
        room.rounds.push({
          roundNumber: 0,
          content: firstRoundContent,
        })

        // Initialize answer maps for all players
        for (const playerId of room.players.keys()) {
          if (!room.playerAnswers.has(playerId)) {
            room.playerAnswers.set(playerId, new Map())
          }
        }

        // Set round timer
        room.roundTimerSeconds = room.settings.timePerRound * 60
        room.roundStartTime = Date.now()

        // Send first round content to all players
        io.to(roomCode).emit('round-start', {
          roundNumber: 0,
          totalRounds: room.settings.numberOfRounds,
          content: firstRoundContent,
          timePerRound: room.roundTimerSeconds,
        })

        // Server-side round timer as authoritative backup
        if (room.roundTimer) clearTimeout(room.roundTimer)
        room.roundTimer = setTimeout(() => {
          const rr = rooms.get(roomCode)
          if (rr && rr.status === 'playing' && !rr.roundEnding) {
            console.log(`[timer] Server-side timer expired for room ${roomCode}`)
            handleRoundEnd(roomCode)
          }
        }, room.roundTimerSeconds * 1000 + 2000) // 2s grace for network

        console.log(`[start-game] Round 1 content sent to room ${roomCode}. Timer: ${room.roundTimerSeconds}s`)

        // Pre-generate ONLY the next round in the background (not all rounds)
        // This is much faster than generating all rounds sequentially
        prefetchNextRound(roomCode)
      } catch (err: any) {
        console.error(`[start-game] Failed to generate content for room ${roomCode}:`, err)
        room.status = 'waiting'
        room.rounds = []
        const errDetail = err?.message || String(err)
        console.error(`[start-game] Error detail: ${errDetail}`)
        console.error(`[start-game] NVIDIA key: ${NVIDIA_API_KEY ? 'SET' : 'MISSING'}, OpenRouter key: ${OPENROUTER_API_KEY ? 'SET' : 'MISSING'}`)
        console.error(`[start-game] NVIDIA failures: ${nvidiaConsecutiveFailures}, Fallback active: ${nvidiaFallbackActive}`)
        io.to(roomCode).emit('game-error', {
          message: 'فشل في توليد محتوى المعركة. يرجى المحاولة مرة أخرى.',
        })
        broadcastPublicRooms()
      }
    }
  )

  // ── update-settings ──────────────────────────────────────────────────────
  socket.on(
    'update-settings',
    (data: {
      settings: Partial<GameSettings>
      roomCode: string
    }) => {
      const { settings: newSettings, roomCode } = data
      const room = rooms.get(roomCode?.toUpperCase())

      if (!room) {
        socket.emit('game-error', { message: 'الساحة غير موجودة' })
        return
      }

      // 1. Only host can update settings
      if (room.hostId !== socket.id) {
        socket.emit('game-error', { message: 'فقط القائد يقدر يعدّل الإعدادات' })
        return
      }

      // 2. Room must be in 'waiting' or 'playing' status
      if (room.status !== 'waiting' && room.status !== 'playing') {
        socket.emit('game-error', { message: 'لا يمكن تعديل الإعدادات في هذه الحالة' })
        return
      }

      // In team mode, settings changes require captain approval
      const player = room.players.get(socket.id)
      if (room.battleMode === 'فرق' && player?.isCaptain) {
        // Build description of changes
        const changeLabels: Record<string, string> = {
          gameType: 'نوع المعركة',
          difficulty: 'الصعوبة',
          timePerRound: 'وقت الجولة',
          numberOfRounds: 'عدد الجولات',
          maxPlayers: 'عدد المقاتلين',
          playerMode: 'نوع الساحة',
          passageType: 'نوع القطعة',
        }
        const changesDesc = Object.keys(newSettings).map(k => changeLabels[k] || k).join('، ')
        
        // Send approval request
        const otherTeamId: TeamId = player.teamId === 'A' ? 'B' : 'A'
        const otherCaptain = getTeamPlayers(room, otherTeamId).find(p => p.isCaptain)
        
        if (otherCaptain) {
          if (room.pendingApproval && room.pendingApproval.status === 'pending') {
            socket.emit('game-error', { message: 'يوجد طلب موافقة معلق بالفعل' })
            return
          }
          
          const approvalId = `approval-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
          
          room.pendingApproval = {
            id: approvalId,
            type: 'settings',
            description: `طلب تعديل: ${changesDesc}`,
            requestedBy: socket.id,
            requestedByName: player.name,
            targetCaptainId: otherCaptain.id,
            targetCaptainName: otherCaptain.name,
            createdAt: Date.now(),
            expiresAt: Date.now() + 40000,
            data: newSettings,
            status: 'pending',
          }
          
          io.to(otherCaptain.id).emit('approval-requested', {
            approvalId,
            type: 'settings',
            description: `طلب تعديل: ${changesDesc}`,
            requestedByName: player.name,
            requestedByTeam: player.teamId,
            expiresAt: room.pendingApproval.expiresAt,
          })
          
          socket.emit('approval-sent', {
            approvalId,
            targetCaptainName: otherCaptain.name,
          })
          
          setTimeout(() => {
            if (room.pendingApproval && room.pendingApproval.id === approvalId && room.pendingApproval.status === 'pending') {
              room.pendingApproval.status = 'expired'
              io.to(roomCode).emit('approval-expired', { approvalId })
              room.pendingApproval = null
            }
          }, 41000)
          
          return // Don't apply settings directly - wait for approval
        }
      }

      const changes: string[] = []
      const isPlaying = room.status === 'playing'

      // 3. If room is 'playing', only allow changes to: difficulty, timePerRound, numberOfRounds
      if (isPlaying) {
        const forbiddenMidGame = ['gameType', 'maxPlayers', 'playerMode'] as const
        for (const key of forbiddenMidGame) {
          if (key in newSettings) {
            socket.emit('game-error', { message: `لا يمكن تغيير ${key === 'gameType' ? 'نوع المعركة' : key === 'maxPlayers' ? 'عدد المقاتلين' : 'وضع المقاتلين'} أثناء اللعب` })
            return
          }
        }
      }

      // 5/6. Validate rounds vs players before applying
      const effectiveMaxPlayers = newSettings.maxPlayers !== undefined ? newSettings.maxPlayers : room.settings.maxPlayers
      const effectivePlayerMode = newSettings.playerMode !== undefined ? newSettings.playerMode : room.settings.playerMode
      const effectiveNumberOfRounds = newSettings.numberOfRounds !== undefined ? newSettings.numberOfRounds : room.settings.numberOfRounds

      if (newSettings.numberOfRounds !== undefined) {
        if (effectivePlayerMode === 'open' || effectiveMaxPlayers === 0) {
          // Open mode: validate rounds vs current player count
          const currentActivePlayers = Array.from(room.players.values()).filter(p => !p.isDisconnected).length
          if (currentActivePlayers === 2 && effectiveNumberOfRounds === 2) {
            socket.emit('game-error', { message: 'مقاتلين ما يلعبوش جولتين' })
            return
          }
          if (currentActivePlayers === 3 && effectiveNumberOfRounds === 3) {
            socket.emit('game-error', { message: 'ثلاث مقاتلين ما يلعبوش ثلاث جولات' })
            return
          }
        } else {
          // Fixed mode: validate rounds vs maxPlayers
          if ((effectiveMaxPlayers === 2 && effectiveNumberOfRounds === 2) || (effectiveMaxPlayers === 3 && effectiveNumberOfRounds === 3)) {
            socket.emit('game-error', { message: 'عدد الجولات لا يمكن أن يساوي عدد المقاتلين عند 2 أو 3 مقاتلين' })
            return
          }
        }
      }

      // If changing playerMode to open, also validate existing rounds vs current players
      if (newSettings.playerMode === 'open' || (newSettings.maxPlayers === 0 && effectivePlayerMode === 'open')) {
        const currentActivePlayers = Array.from(room.players.values()).filter(p => !p.isDisconnected).length
        if (currentActivePlayers === 2 && effectiveNumberOfRounds === 2) {
          socket.emit('game-error', { message: 'مقاتلين ما يلعبوش جولتين' })
          return
        }
        if (currentActivePlayers === 3 && effectiveNumberOfRounds === 3) {
          socket.emit('game-error', { message: 'ثلاث مقاتلين ما يلعبوش ثلاث جولات' })
          return
        }
      }

      // 7. Apply changes to room.settings
      if (newSettings.gameType !== undefined && newSettings.gameType !== room.settings.gameType) {
        room.settings.gameType = newSettings.gameType
        changes.push('gameType')
      }
      if (newSettings.difficulty !== undefined && newSettings.difficulty !== room.settings.difficulty) {
        room.settings.difficulty = newSettings.difficulty
        changes.push('difficulty')
      }
      if (newSettings.timePerRound !== undefined && newSettings.timePerRound !== room.settings.timePerRound) {
        room.settings.timePerRound = newSettings.timePerRound
        changes.push('timePerRound')
      }
      if (newSettings.numberOfRounds !== undefined && newSettings.numberOfRounds !== room.settings.numberOfRounds) {
        room.settings.numberOfRounds = newSettings.numberOfRounds
        changes.push('numberOfRounds')
      }
      if (newSettings.maxPlayers !== undefined && newSettings.maxPlayers !== room.settings.maxPlayers) {
        room.settings.maxPlayers = newSettings.maxPlayers
        changes.push('maxPlayers')
      }
      if (newSettings.playerMode !== undefined && newSettings.playerMode !== room.settings.playerMode) {
        room.settings.playerMode = newSettings.playerMode
        changes.push('playerMode')
      }
      if (newSettings.passageType !== undefined && newSettings.passageType !== room.settings.passageType) {
        room.settings.passageType = newSettings.passageType
        changes.push('passageType')
      }

      if (changes.length === 0) {
        socket.emit('game-error', { message: 'لا توجد تغييرات لتطبيقها' })
        return
      }

      // 8. If timePerRound changed during a game, store pending change for next round
      // (Don't update roundTimerSeconds mid-round — that would break score calculations)
      if (isPlaying && changes.includes('timePerRound')) {
        // roundTimerSeconds will be refreshed at the start of the next round
      }

      // 9. If numberOfRounds reduced during a game, ensure currentRound < new numberOfRounds
      if (isPlaying && changes.includes('numberOfRounds')) {
        if (room.currentRound >= room.settings.numberOfRounds) {
          // Auto-end the game since current round exceeds new total rounds
          console.log(`[update-settings] numberOfRounds reduced below currentRound+1 in room ${room.roomCode}. Auto-ending game.`)
          // Finish the current round and end the game
          room.settings.numberOfRounds = room.currentRound + 1 // Set to current+1 so handleRoundEnd detects it as last round
        }
      }

      // When switching to open mode, set maxPlayers to 0
      if (changes.includes('playerMode') && room.settings.playerMode === 'open') {
        room.settings.maxPlayers = 0
      }
      // When switching from open to fixed, set maxPlayers to current player count or 2 (whichever is greater)
      if (changes.includes('playerMode') && room.settings.playerMode === 'fixed' && room.settings.maxPlayers === 0) {
        const currentActivePlayers = Array.from(room.players.values()).filter(p => !p.isDisconnected).length
        room.settings.maxPlayers = Math.max(2, currentActivePlayers)
        if (!changes.includes('maxPlayers')) {
          changes.push('maxPlayers')
        }
      }

      // Log the settings update
      console.log(`[update-settings] Room ${room.roomCode}: ${changes.join(', ')} updated by ${room.hostName}`)

      // 10. Broadcast 'settings-updated' event to all players in room
      const hostPlayer = room.players.get(socket.id)
      io.to(room.roomCode).emit('settings-updated', {
        settings: room.settings,
        updatedBy: hostPlayer?.name || room.hostName,
        changes,
      })

      // 11. Broadcast updated public rooms list
      broadcastPublicRooms()
    }
  )

  // ── submit-answer ──────────────────────────────────────────────────────
  socket.on(
    'submit-answer',
    (data: {
      roomCode: string
      roundNumber: number
      questionIndex: number
      answerIndex: number
      timeLeft: number
    }) => {
      const { roomCode, roundNumber, questionIndex, answerIndex, timeLeft } = data
      const room = rooms.get(roomCode?.toUpperCase())
      // Calculate timeTaken server-side using the authoritative round timer
      const timeTaken = room?.roundStartTime
        ? Math.min(room.roundTimerSeconds, Math.floor((Date.now() - room.roundStartTime) / 1000))
        : 0

      if (!room) {
        socket.emit('game-error', { message: 'الساحة غير موجودة' })
        return
      }

      if (room.status !== 'playing') {
        socket.emit('game-error', { message: 'المعركة مش شغالة' })
        return
      }

      const player = room.players.get(socket.id)
      if (!player) {
        socket.emit('game-error', { message: 'أنت مش في الساحة دي' })
        return
      }

      // Make sure we're on the right round
      if (roundNumber !== room.currentRound) {
        return // Ignore answers for wrong rounds
      }

      const roundContent = room.rounds[roundNumber]
      if (!roundContent) return

      // Get or create the player's answer maps
      let playerRoundsAnswers = room.playerAnswers.get(socket.id)
      if (!playerRoundsAnswers) {
        playerRoundsAnswers = new Map()
        room.playerAnswers.set(socket.id, playerRoundsAnswers)
      }

      let roundAnswers = playerRoundsAnswers.get(roundNumber)
      if (!roundAnswers) {
        roundAnswers = new Map()
        playerRoundsAnswers.set(roundNumber, roundAnswers)
      }

      // Prevent duplicate answers for the same question
      if (roundAnswers.has(questionIndex)) {
        return
      }

      // Record the answer
      roundAnswers.set(questionIndex, { answerIndex, timeTaken })

      // Calculate score for this answer (per-round score, not cumulative)
      const question = roundContent.content.questions[questionIndex]
      if (question) {
        const isCorrect = question.correctAnswer === answerIndex
        const points = calculateScore(
          isCorrect,
          timeTaken,
          room.roundTimerSeconds
        )
        player.score += points
      }

      // Check if this player has answered all questions in this round
      const totalQuestions = roundContent.content.questions.length
      const playerAnsweredAll = roundAnswers.size >= totalQuestions

      // Notify the player of their answer status
      socket.emit('answer-confirmed', {
        questionIndex,
        answerIndex,
        roundNumber,
        playerAnsweredAll,
      })

      // Check if ALL ACTIVE players have answered all questions in this round
      const allPlayersAnsweredAll = Array.from(room.players.entries())
        .filter(([_, p]) => !p.isDisconnected)  // Only check active players
        .every(([playerId, _]) => {
          const pAnswers = room.playerAnswers.get(playerId)
          if (!pAnswers) return false
          const rAnswers = pAnswers.get(roundNumber)
          if (!rAnswers) return false
          return rAnswers.size >= totalQuestions
        })

      // NOTE: We do NOT auto-end the round when all players answer.
      // The round ends when: all players click "خلصت" OR time runs out.
      // Players might want to review/change answers.
    }
  )

  // ── round-time-up ──────────────────────────────────────────────────────
  // Client can signal that the round timer expired
  socket.on('round-time-up', (data: { roomCode: string; roundNumber: number }) => {
    const { roomCode, roundNumber } = data
    const room = rooms.get(roomCode?.toUpperCase())
    if (!room || room.status !== 'playing') return
    if (roundNumber !== room.currentRound) return

    // Check if round time has actually expired
    if (room.roundStartTime) {
      const elapsed = Math.floor((Date.now() - room.roundStartTime) / 1000)
      if (elapsed >= room.roundTimerSeconds - 2) { // Allow 2s buffer for network delay
        handleRoundEnd(roomCode)
      }
    }
  })

  // ── surrender ─────────────────────────────────────────────────────────
  // Player voluntarily surrenders/withdraws during the game
  socket.on('surrender', () => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return

    const room = rooms.get(roomCode)
    if (!room) return

    const player = room.players.get(socket.id)
    const playerName = player?.name || socket.id

    // Leave the socket.io room
    socket.leave(roomCode)
    removePlayerFromRoom(socket.id, 'leave')

    // Notify the player that they successfully surrendered
    socket.emit('surrender-confirmed', { roomCode })

    // If game is playing and only 1 active player left, auto-end the game
    const updatedRoom = rooms.get(roomCode)
    const activePlayers = Array.from(updatedRoom?.players.values() || []).filter(p => !p.isDisconnected)
    if (updatedRoom && updatedRoom.status === 'playing' && activePlayers.length === 1) {
      // Notify the remaining player that they won because the opponent left
      const remainingPlayer = activePlayers[0]
      io.to(roomCode).emit('opponent-left-game', {
        leftPlayerName: playerName,
        winnerName: remainingPlayer?.name,
      })
      // End the game immediately
      handleGameEnd(roomCode)
    } else if (updatedRoom && updatedRoom.status === 'playing' && activePlayers.length === 0) {
      deleteRoom(roomCode)
    }
  })

  // ── player-ready ────────────────────────────────────────────────────────
  // Player marks themselves as ready for the next round
  // Captains do NOT need to ready up — they monitor and start the round
  socket.on('player-ready', () => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return

    const room = rooms.get(roomCode)
    if (!room || room.status !== 'playing') return

    const player = room.players.get(socket.id)

    // Captains/hosts do NOT ready up — their role is to monitor and start
    const isLeader = player?.isHost || (room.battleMode === 'فرق' && player?.isCaptain)
    if (isLeader) return // Silently ignore — leaders don't have a ready state

    // Add this player to the ready set
    room.readyPlayers.add(socket.id)

    // Broadcast ready status to all players (with names for UI display)
    // Captains are excluded from ready counts — they don't need to ready up
    const activeNonLeaders = [...room.players.entries()].filter(
      ([, p]) => !p.isDisconnected && !(p.isHost || (room.battleMode === 'فرق' && p.isCaptain))
    )
    const activePlayers = [...room.players.entries()].filter(([, p]) => !p.isDisconnected)
    const readyCount = [...room.readyPlayers].filter(id => {
      const p = room.players.get(id)
      return p && !p.isDisconnected
    }).length
    const nonLeaderCount = activeNonLeaders.length

    // Build list of unready player names (non-leaders only, leaders don't need to ready)
    const unreadyPlayerNames = activeNonLeaders
      .filter(([id]) => !room.readyPlayers.has(id))
      .map(([, p]) => p.name)

    // Build list of ready player names for the captain's monitoring panel
    const readyPlayerNames = activeNonLeaders
      .filter(([id]) => room.readyPlayers.has(id))
      .map(([, p]) => p.name)

    // All fighters ready = all non-leaders are in the ready set
    const allFightersReady = readyCount >= nonLeaderCount

    io.to(roomCode).emit('ready-status-update', {
      readyPlayers: [...room.readyPlayers],
      readyCount,
      totalActive: activePlayers.length,
      totalFighters: nonLeaderCount,
      unreadyPlayerNames,
      readyPlayerNames,
      allFightersReady,
    })

    // NOTE: Round does NOT start automatically when all are ready.
    // The captain must explicitly click "ابدأ المعركة" which emits host-start-round.
  })

  // ── host-start-round ──────────────────────────────────────────────────
  // Captain initiates the next round — only works if all fighters (non-leaders) are ready
  // Captains themselves are excluded from the ready requirement
  socket.on('host-start-round', () => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return

    const room = rooms.get(roomCode)
    if (!room || room.status !== 'playing') return

    // Verify the requester is the host (solo) or a captain (team mode)
    const player = room.players.get(socket.id)
    const isHostOrCaptain = player?.isHost || 
      (room.battleMode === 'فرق' && player?.isCaptain)
    if (!isHostOrCaptain) {
      socket.emit('game-error', { message: 'فقط القائد يستطيع بدء الجولة' })
      return
    }

    // Check if all active NON-LEADER fighters are ready
    // Captains/hosts are excluded from the ready requirement
    const activeNonLeaders = [...room.players.entries()].filter(
      ([, p]) => !p.isDisconnected && !(p.isHost || (room.battleMode === 'فرق' && p.isCaptain))
    )
    const nonLeaderCount = activeNonLeaders.length
    const readyNonLeaders = activeNonLeaders.filter(([id]) => room.readyPlayers.has(id))

    if (readyNonLeaders.length < nonLeaderCount) {
      // Not all fighters are ready — tell the captain who isn't ready
      const unreadyNames = activeNonLeaders
        .filter(([id]) => !room.readyPlayers.has(id))
        .map(([, p]) => p.name)

      socket.emit('host-start-rejected', {
        unreadyPlayers: unreadyNames,
        readyCount: readyNonLeaders.length,
        totalActive: nonLeaderCount,
      })
      return
    }

    // All fighters are ready — start the next round
    startNextRound(roomCode)
  })

  // ── player-finished ────────────────────────────────────────────────────
  // Player clicks "خلصت" to indicate they're done with the round
  socket.on('player-finished', () => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return

    const room = rooms.get(roomCode)
    if (!room || room.status !== 'playing') return

    // Check team readiness BEFORE adding this player (to detect transitions)
    let teamABeforeReady = false
    let teamBBeforeReady = false
    if (room.battleMode === 'فرق') {
      const teamAPlayers = [...room.players.entries()].filter(([, p]) => !p.isDisconnected && p.teamId === 'A')
      const teamBPlayers = [...room.players.entries()].filter(([, p]) => !p.isDisconnected && p.teamId === 'B')
      teamABeforeReady = teamAPlayers.length > 0 && teamAPlayers.every(([id]) => room.finishedPlayers.has(id))
      teamBBeforeReady = teamBPlayers.length > 0 && teamBPlayers.every(([id]) => room.finishedPlayers.has(id))
    }

    // Add this player to the finished set
    room.finishedPlayers.add(socket.id)

    // Build team-aware finished status
    const finishedData = buildFinishedStatus(room)

    io.to(roomCode).emit('finished-status-update', finishedData)

    // Emit team-ready-state when a team JUST completed (transition from not-ready to ready)
    if (room.battleMode === 'فرق') {
      const player = room.players.get(socket.id)
      const finishedTeamId = player?.teamId as TeamId | undefined

      if (finishedTeamId === 'A' && !teamABeforeReady && finishedData.teamAReady) {
        // Team A just completed — emit cinematic notification
        const teamAName = getTeamDisplayName(room, 'A')
        io.to(roomCode).emit('team-ready-state', {
          teamId: 'A',
          teamName: teamAName,
          message: `${teamAName} جاهز! ⚔️`,
          allTeamsReady: !!finishedData.teamBReady,
        })
      } else if (finishedTeamId === 'B' && !teamBBeforeReady && finishedData.teamBReady) {
        // Team B just completed — emit cinematic notification
        const teamBName = getTeamDisplayName(room, 'B')
        io.to(roomCode).emit('team-ready-state', {
          teamId: 'B',
          teamName: teamBName,
          message: `${teamBName} جاهز! ⚔️`,
          allTeamsReady: !!finishedData.teamAReady,
        })
      }
    }

    // If all active players have finished, end the round
    if (finishedData.finishedCount >= finishedData.totalActive && finishedData.totalActive >= 2) {
      handleRoundEnd(roomCode)
    }
  })

  // ── player-unfinish ────────────────────────────────────────────────────
  // Player clicks "لا أنا عايز أراجع إجاباتي" to go back to questions
  socket.on('player-unfinish', () => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return

    const room = rooms.get(roomCode)
    if (!room || room.status !== 'playing') return

    // Remove this player from the finished set
    room.finishedPlayers.delete(socket.id)

    // Build team-aware finished status
    const finishedData = buildFinishedStatus(room)

    io.to(roomCode).emit('finished-status-update', finishedData)
  })

  // ── request-rematch ────────────────────────────────────────────────────
  // Player clicks "نعم" to play a similar battle again
  socket.on('request-rematch', (data: { oldRoomCode: string; playerName: string }) => {
    const { oldRoomCode, playerName } = data
    const rData = rematchData.get(oldRoomCode?.toUpperCase())
    if (!rData) {
      socket.emit('game-error', { message: 'انتهت صلاحية إعادة المعركة' })
      return
    }

    // Check if this player was in the original room
    const oldSocketId = socket.id // Their current socket ID
    // Find the player by name in the rematch data (since socket IDs change)
    let foundPlayer: { name: string; oldSocketId: string } | null = null
    for (const [, p] of rData.players.entries()) {
      if (p.name === playerName.trim()) {
        foundPlayer = p
        break
      }
    }

    if (!foundPlayer) {
      socket.emit('game-error', { message: 'لم تكن في هذه المعركة' })
      return
    }

    // Check if this player already rematched
    if (rData.matchedPlayers.has(foundPlayer.oldSocketId)) {
      socket.emit('game-error', { message: 'لقد انضممت بالفعل للمعركة الجديدة' })
      return
    }

    // Mark this player as rematched
    rData.matchedPlayers.add(foundPlayer.oldSocketId)

    // Check if a rematch room already exists for this old room
    if (rData.newRoomCode) {
      // Join the existing rematch room
      const existingRoom = rooms.get(rData.newRoomCode)
      if (existingRoom && existingRoom.status === 'waiting') {
        // Add player to existing room
        const player: Player = {
          id: socket.id,
          name: playerName.trim(),
          score: 0,
          isHost: false,
          isReady: false,
          joinOrder: globalJoinCounter++,
          roundWins: 0,
          isDisconnected: false,
          disconnectedAt: null,
          oldSocketIds: [],
          teamId: null,  // Start as unassigned in team mode
          isCaptain: false,  // Never captain on rematch join
        }

        existingRoom.players.set(socket.id, player)
        socketRoomMap.set(socket.id, rData.newRoomCode)
        socket.join(rData.newRoomCode)

        socket.emit('game-joined', {
          roomCode: rData.newRoomCode,
          players: playersToArray(existingRoom.players),
          settings: existingRoom.settings,
          roomType: existingRoom.roomType,
          hasPassword: !!existingRoom.password,
          battleMode: existingRoom.battleMode,
          teams: getTeamsInfo(existingRoom),
          pendingJoinRequests: Array.from(existingRoom.joinRequests.values())
            .filter(r => r.status === 'pending')
            .map(r => ({ id: r.id, playerName: r.playerName, playerId: r.playerId, targetTeamId: r.targetTeamId, type: r.type, currentTeamId: r.currentTeamId, expiresAt: r.expiresAt })),
        })

        socket.to(rData.newRoomCode).emit('player-joined', {
          player,
          players: playersToArray(existingRoom.players),
          battleMode: existingRoom.battleMode,
          teams: getTeamsInfo(existingRoom),
          pendingJoinRequests: Array.from(existingRoom.joinRequests.values())
            .filter(r => r.status === 'pending')
            .map(r => ({ id: r.id, playerName: r.playerName, playerId: r.playerId, targetTeamId: r.targetTeamId, type: r.type, currentTeamId: r.currentTeamId, expiresAt: r.expiresAt })),
        })

        broadcastPublicRooms()
        console.log(`[request-rematch] ${playerName} joined rematch room ${rData.newRoomCode}`)
        return
      }
    }

    // First player to rematch → create a new room with same settings
    const newRoomCode = generateRoomCode()

    const player: Player = {
      id: socket.id,
      name: playerName.trim(),
      score: 0,
      isHost: true, // First player to rematch becomes the new host
      isReady: true,
      joinOrder: globalJoinCounter++,
      roundWins: 0,
      isDisconnected: false,
      disconnectedAt: null,
      oldSocketIds: [],
      teamId: rData.settings.battleMode === 'فرق' ? 'A' : null,
      isCaptain: rData.settings.battleMode === 'فرق' ? true : false,
    }

    const playersMap = new Map<string, Player>()
    playersMap.set(socket.id, player)

    const newRoom: GameRoom = {
      roomCode: newRoomCode,
      roomType: rData.roomType as RoomType,
      password: rData.password,
      hostId: socket.id,
      hostName: playerName.trim(),
      settings: { ...rData.settings },
      players: playersMap,
      rounds: [],
      status: 'waiting',
      currentRound: 0,
      playerAnswers: new Map(),
      roundStartTime: null,
      roundTimerSeconds: rData.settings.timePerRound * 60,
      roundResults: new Map(),
      roundWinners: new Map(),
      roundEnding: false,
      roundTimer: null,
      earlyEnding: false,
      gameStartTime: null,
      readyPlayers: new Set(),
      finishedPlayers: new Set(),
      battleMode: rData.settings.battleMode || 'فردي',
      voiceMerged: false,
      pendingApproval: null,
      joinRequests: new Map(),
      teamNames: { A: null, B: null },
      _prefetchInProgress: -1,
    }

    rooms.set(newRoomCode, newRoom)
    socketRoomMap.set(socket.id, newRoomCode)
    socket.join(newRoomCode)

    // Store the new room code for other players to join
    rData.newRoomCode = newRoomCode

    socket.emit('game-created', {
      roomCode: newRoomCode,
      roomType: newRoom.roomType,
      hasPassword: !!newRoom.password,
      battleMode: newRoom.battleMode,
      teams: getTeamsInfo(newRoom),
    })

    broadcastPublicRooms()
    console.log(`[request-rematch] ${playerName} created rematch room ${newRoomCode} (from ${oldRoomCode})`)
  })

  // ── explain-answer ─────────────────────────────────────────────────────
  // Player asks AI why an answer is correct/wrong — uses the passage context
  socket.on('explain-answer', async (data: {
    roomCode: string
    roundNumber: number
    questionIndex: number
  }) => {
    const { roomCode, roundNumber, questionIndex } = data
    const room = rooms.get(roomCode?.toUpperCase())
    if (!room) return

    const roundContent = room.rounds[roundNumber]
    if (!roundContent) return

    const question = roundContent.content.questions[questionIndex]
    if (!question) return

    const playerId = socket.id
    const playerAnswers = room.playerAnswers.get(playerId)
    const roundAnswers = playerAnswers?.get(roundNumber)
    const answer = roundAnswers?.get(questionIndex)

    try {
      const prompt = `أنت معلم ذكي يتحدث العربية. لقد قرأ الطالب القطعة التالية ثم أجاب على سؤال.

--- القطعة ---
${roundContent.content.text}

--- السؤال ---
${question.text}

--- الخيارات ---
${question.options.map((o: string, i: number) => `${['أ','ب','ج','د'][i]}) ${o}`).join('\n')}

--- إجابة الطالب ---
${answer ? `${['أ','ب','ج','د'][answer.answerIndex]}) ${question.options[answer.answerIndex]}` : 'لم يُجب'}

--- الإجابة الصحيحة ---
${['أ','ب','ج','د'][question.correctAnswer]}) ${question.options[question.correctAnswer]}

${question.explanation ? `--- التفسير المُعطى ---\n${question.explanation}` : ''}

${answer && answer.answerIndex !== question.correctAnswer ? 'الطالب أجاب إجابة خاطئة. اشرح له بلطف واختصار (3-4 جمل) لماذا إجابته خاطئة ولماذا الإجابة الصحيحة هي الصحيحة، مع الإشارة للقطعة إن أمكن.' : 'اشرح بلطف واختصار (3-4 جمل) لماذا الإجابة الصحيحة هي الصحيحة، مع الإشارة للقطعة إن أمكن.'}

⚠️ اكتب بالعربية الفصحى البسيطة. كن مختصراً ودوداً.`

      const explanation = await callLLM(
        [{ role: 'user', content: prompt }],
        { temperature: 0.7, maxTokens: 300, timeoutMs: 20000 }
      )

      socket.emit('answer-explanation', {
        roundNumber,
        questionIndex,
        explanation: explanation || 'لم أستطع توليد تفسير.',
      })
    } catch {
      socket.emit('answer-explanation', {
        roundNumber,
        questionIndex,
        explanation: 'حدث خطأ في توليد التفسير.',
      })
    }
  })

  // ── kick-player ──────────────────────────────────────────────────────
  // Host can kick a player from the room (works in lobby AND during game)
  socket.on('kick-player', (data: { playerId: string }) => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return

    const room = rooms.get(roomCode)
    if (!room) return

    // Validate sender is the host
    if (room.hostId !== socket.id) {
      socket.emit('game-error', { message: 'فقط القائد يقدر يطرد مقاتل' })
      return
    }

    // Can't kick yourself
    if (data.playerId === socket.id) {
      socket.emit('game-error', { message: 'مش ممكن تطرد نفسك' })
      return
    }

    // Find the player to kick
    const playerToKick = room.players.get(data.playerId)
    if (!playerToKick) {
      socket.emit('game-error', { message: 'المقاتل مش موجود في الساحة' })
      return
    }

    console.log(`[kick-player] Host ${socket.id} kicked ${playerToKick.name} from room ${roomCode}`)

    // Notify the kicked player specifically
    io.to(data.playerId).emit('player-kicked', {
      reason: 'تم طردك من الساحة بواسطة القائد',
      kickedByName: room.players.get(socket.id)?.name || 'القائد',
    })

    // Notify everyone else in the room
    io.to(roomCode).emit('player-left', {
      playerId: data.playerId,
      playerName: playerToKick.name,
      players: playersToArray(room.players).filter(p => p.id !== data.playerId),
    })

    // Remove the player from the room
    room.players.delete(data.playerId)
    room.playerAnswers.delete(data.playerId)

    // Clean up socketRoomMap
    socketRoomMap.delete(data.playerId)

    // Make the kicked socket leave the room
    const kickedSocket = io.sockets.sockets.get(data.playerId)
    if (kickedSocket) {
      kickedSocket.leave(roomCode)
    }

    // If only one active player left during game, end it
    const activePlayers = Array.from(room.players.values()).filter(p => !p.isDisconnected)
    if (room.status === 'playing' && activePlayers.length === 1) {
      const remainingPlayer = activePlayers[0]
      io.to(roomCode).emit('opponent-left-game', {
        leftPlayerName: playerToKick.name,
        winnerName: remainingPlayer.name,
      })
      handleGameEnd(roomCode)
    } else if (activePlayers.length === 0) {
      deleteRoom(roomCode)
    }

    broadcastPublicRooms()
  })

  // ── mute-player (host broadcast mute) ──────────────────────────────────
  // Host can mute a player for EVERYONE in the room (voice chat)
  socket.on('mute-player', (data: { playerId: string }) => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return

    const room = rooms.get(roomCode)
    if (!room) return

    // Validate sender is the host
    if (room.hostId !== socket.id) {
      socket.emit('game-error', { message: 'فقط القائد يقدر يكتم مقاتل' })
      return
    }

    // Can't mute yourself
    if (data.playerId === socket.id) {
      socket.emit('game-error', { message: 'مش ممكن تكتم نفسك' })
      return
    }

    const playerToMute = room.players.get(data.playerId)
    if (!playerToMute) {
      socket.emit('game-error', { message: 'المقاتل مش موجود في الساحة' })
      return
    }

    console.log(`[mute-player] Host muted ${playerToMute.name} in room ${roomCode}`)

    // Notify the muted player to stop their mic
    io.to(data.playerId).emit('player-muted', {
      mutedBy: 'host',
      mutedByName: room.players.get(socket.id)?.name || 'القائد',
    })

    // Notify all players in the room to mute this player's audio
    io.to(roomCode).emit('player-audio-muted', {
      playerId: data.playerId,
      playerName: playerToMute.name,
    })
  })

  // ── request-join-team ──────────────────────────────────────────────────
  // An unassigned player requests to join a team. The request goes to the team's captain.
  socket.on('request-join-team', (data: { targetTeamId: TeamId }) => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return
    const room = rooms.get(roomCode)
    if (!room || room.status !== 'waiting' || room.battleMode !== 'فرق') return
    
    const player = room.players.get(socket.id)
    if (!player) return
    
    // Must be unassigned to request joining
    if (player.teamId !== null) {
      socket.emit('game-error', { message: 'أنت بالفعل في فريق. استخدم طلب تبديل الفريق بدلاً من ذلك.' })
      return
    }
    
    const targetTeam = data.targetTeamId
    if (targetTeam !== 'A' && targetTeam !== 'B') return
    
    // Check if player already has a pending request
    const existingRequest = Array.from(room.joinRequests.values()).find(
      r => r.playerId === socket.id && r.status === 'pending'
    )
    if (existingRequest) {
      socket.emit('game-error', { message: 'لديك طلب معلق بالفعل. انتظر الرد أو انتهاء المهلة.' })
      return
    }
    
    // Find the target team's captain
    const targetTeamPlayers = getTeamPlayers(room, targetTeam)
    const targetCaptain = targetTeamPlayers.find(p => p.isCaptain)
    
    // If the target team has NO members at all (no captain, no players),
    // auto-assign this player as the first member AND captain — skip approval flow
    if (targetTeamPlayers.length === 0) {
      player.teamId = targetTeam
      player.isCaptain = true
      
      const teamsInfo = getTeamsInfo(room)
      io.to(roomCode).emit('team-update', {
        teams: teamsInfo,
        players: playersToArray(room.players),
        switchedPlayerId: player.id,
        switchedPlayerName: player.name,
        newTeamId: targetTeam,
      })
      
      // Notify the player they were auto-assigned as captain
      socket.emit('join-request-approved', {
        requestId: 'auto',
        teamId: targetTeam,
        teamName: getTeamDisplayName(room, targetTeam),
        captainName: player.name,
      })
      
      // Broadcast captain change
      io.to(roomCode).emit('team-captain-changed', {
        teamId: targetTeam,
        newCaptainId: player.id,
        newCaptainName: player.name,
        teams: teamsInfo,
      })
      
      console.log(`[request-join-team] ${player.name} auto-assigned as captain of Team ${targetTeam} (empty team)`)
      return
    }
    
    if (!targetCaptain) {
      socket.emit('game-error', { message: 'لا يوجد قائد لهذا الفريق بعد. لا يمكن تقديم الطلب حالياً.' })
      return
    }
    
    const requestId = `join-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const request: JoinRequest = {
      id: requestId,
      playerId: socket.id,
      playerName: player.name,
      targetTeamId: targetTeam,
      type: 'join',
      currentTeamId: null,
      createdAt: Date.now(),
      expiresAt: Date.now() + 40000,
      status: 'pending',
    }
    
    room.joinRequests.set(requestId, request)
    
    // Notify the captain
    io.to(targetCaptain.id).emit('join-request-received', {
      requestId,
      playerName: player.name,
      playerId: socket.id,
      targetTeamId: targetTeam,
      type: 'join',
      expiresAt: request.expiresAt,
    })
    
    // Confirm to requester
    socket.emit('join-request-sent', {
      requestId,
      targetTeamId: targetTeam,
      captainName: targetCaptain.name,
    })
    
    // Auto-expire after 40 seconds
    setTimeout(() => {
      const req = room.joinRequests.get(requestId)
      if (req && req.status === 'pending') {
        req.status = 'expired'
        // Notify both player and captain
        io.to(req.playerId).emit('join-request-expired', { requestId })
        const captain = getTeamPlayers(room, targetTeam).find(p => p.isCaptain)
        if (captain) {
          io.to(captain.id).emit('join-request-expired', { requestId })
        }
        room.joinRequests.delete(requestId)
      }
    }, 41000)
  })

  // ── join-team-response ──────────────────────────────────────────────────
  // Captain approves or rejects a join request (for both 'join' and 'switch' types)
  socket.on('join-team-response', (data: { requestId: string; approved: boolean }) => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return
    const room = rooms.get(roomCode)
    if (!room) return
    
    const player = room.players.get(socket.id)
    if (!player || !player.isCaptain) {
      socket.emit('game-error', { message: 'فقط قائد الفريق يقدر يوافق أو يرفض طلبات الانضمام' })
      return
    }
    
    const request = room.joinRequests.get(data.requestId)
    if (!request || request.status !== 'pending') {
      socket.emit('game-error', { message: 'طلب الانضمام غير موجود أو تم الرد عليه' })
      return
    }
    
    // Verify this captain is the captain of the target team
    if (player.teamId !== request.targetTeamId) {
      socket.emit('game-error', { message: 'أنت لست قائد الفريق المطلوب' })
      return
    }
    
    if (data.approved) {
      request.status = 'approved'
      const requestingPlayer = room.players.get(request.playerId)
      if (requestingPlayer) {
        // If the request is a switch and the player was a captain, transfer captain role
        if (request.type === 'switch' && requestingPlayer.isCaptain && request.currentTeamId) {
          requestingPlayer.isCaptain = false
          // Transfer captain to next player in old team
          const oldTeamPlayers = getTeamPlayers(room, request.currentTeamId).filter(p => p.id !== requestingPlayer.id)
          if (oldTeamPlayers.length > 0 && !oldTeamPlayers.some(p => p.isCaptain)) {
            const newCaptain = oldTeamPlayers[0]
            newCaptain.isCaptain = true
          }
        }
        
        requestingPlayer.teamId = request.targetTeamId
        // If the target team has no captain (shouldn't happen but safety), make them captain
        const teamHasCaptain = getTeamPlayers(room, request.targetTeamId).some(p => p.isCaptain && p.id !== requestingPlayer.id)
        if (!teamHasCaptain) {
          requestingPlayer.isCaptain = true
        }
        
        const teamsInfo = getTeamsInfo(room)
        io.to(roomCode).emit('team-update', {
          teams: teamsInfo,
          players: playersToArray(room.players),
          switchedPlayerId: requestingPlayer.id,
          switchedPlayerName: requestingPlayer.name,
          newTeamId: request.targetTeamId,
        })
        
        // Notify the player
        io.to(request.playerId).emit('join-request-approved', {
          requestId: request.id,
          teamId: request.targetTeamId,
          teamName: getTeamDisplayName(room, request.targetTeamId),
          captainName: player.name,
        })
        
        // Notify captain who approved
        socket.emit('join-request-resolved', {
          requestId: request.id,
          playerName: requestingPlayer.name,
          approved: true,
        })
      }
    } else {
      request.status = 'rejected'
      
      // Notify the player
      io.to(request.playerId).emit('join-request-rejected', {
        requestId: request.id,
        captainName: player.name,
      })
      
      // Notify captain who rejected
      socket.emit('join-request-resolved', {
        requestId: request.id,
        playerName: request.playerName,
        approved: false,
      })
    }
    
    room.joinRequests.delete(data.requestId)
  })

  // ── switch-team ────────────────────────────────────────────────────────
  // Now requires captain approval instead of instant switching
  socket.on('switch-team', (data: { teamId: TeamId }) => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return
    
    const room = rooms.get(roomCode)
    if (!room || room.status !== 'waiting' || room.battleMode !== 'فرق') return
    
    const player = room.players.get(socket.id)
    if (!player) return
    
    const targetTeam = data.teamId
    if (targetTeam !== 'A' && targetTeam !== 'B') return
    if (player.teamId === targetTeam) return
    
    // If player is unassigned, they should use request-join-team instead
    if (player.teamId === null) {
      socket.emit('game-error', { message: 'استخدم طلب الانضمام لفريق بدلاً من ذلك' })
      return
    }
    
    // Check for duplicate pending requests
    const existingRequest = Array.from(room.joinRequests.values()).find(
      r => r.playerId === socket.id && r.status === 'pending'
    )
    if (existingRequest) {
      socket.emit('game-error', { message: 'لديك طلب معلق بالفعل' })
      return
    }
    
    // Find target team's captain
    const targetCaptain = getTeamPlayers(room, targetTeam).find(p => p.isCaptain)
    if (!targetCaptain) {
      socket.emit('game-error', { message: 'لا يوجد قائد للفريق المستهدف' })
      return
    }
    
    const requestId = `switch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const request: JoinRequest = {
      id: requestId,
      playerId: socket.id,
      playerName: player.name,
      targetTeamId: targetTeam,
      type: 'switch',
      currentTeamId: player.teamId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 40000,
      status: 'pending',
    }
    
    room.joinRequests.set(requestId, request)
    
    // Notify the target team's captain
    io.to(targetCaptain.id).emit('join-request-received', {
      requestId,
      playerName: player.name,
      playerId: socket.id,
      targetTeamId: targetTeam,
      type: 'switch',
      currentTeamId: player.teamId,
      expiresAt: request.expiresAt,
    })
    
    // Confirm to requester
    socket.emit('join-request-sent', {
      requestId,
      targetTeamId: targetTeam,
      captainName: targetCaptain.name,
    })
    
    // Auto-expire after 40 seconds
    setTimeout(() => {
      const req = room.joinRequests.get(requestId)
      if (req && req.status === 'pending') {
        req.status = 'expired'
        io.to(req.playerId).emit('join-request-expired', { requestId })
        const captain = getTeamPlayers(room, targetTeam).find(p => p.isCaptain)
        if (captain) {
          io.to(captain.id).emit('join-request-expired', { requestId })
        }
        room.joinRequests.delete(requestId)
      }
    }, 41000)
  })

  // ── cancel-join-request ──────────────────────────────────────────────
  // Player cancels their own pending join/switch request
  socket.on('cancel-join-request', (data: { requestId: string }) => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return

    const room = rooms.get(roomCode)
    if (!room) return

    const request = room.joinRequests.get(data.requestId)
    if (!request || request.status !== 'pending') return

    // Only the requester can cancel
    if (request.playerId !== socket.id) {
      socket.emit('game-error', { message: 'فقط صاحب الطلب يقدر يلغيه' })
      return
    }

    // Mark as expired and remove
    request.status = 'expired'
    room.joinRequests.delete(data.requestId)

    // Notify the target team's captain
    const targetCaptain = getTeamPlayers(room, request.targetTeamId).find(p => p.isCaptain)
    if (targetCaptain) {
      io.to(targetCaptain.id).emit('join-request-expired', { requestId: data.requestId })
    }

    console.log(`[cancel-join-request] ${request.playerName} cancelled their join request (${data.requestId})`)
  })

  // ── captain-approval-request ──────────────────────────────────────────
  socket.on('captain-approval-request', (data: { type: string; description: string; data: any }) => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return
    
    const room = rooms.get(roomCode)
    if (!room || room.battleMode !== 'فرق') return
    
    const player = room.players.get(socket.id)
    if (!player || !player.isCaptain) {
      socket.emit('game-error', { message: 'فقط قائد الفريق يقدر يطلب موافقة' })
      return
    }
    
    // If there's already a pending approval, auto-reject it to prevent deadlock
    if (room.pendingApproval && room.pendingApproval.status === 'pending') {
      const oldApproval = room.pendingApproval
      oldApproval.status = 'rejected'
      // Notify the original requester that their approval was superseded
      io.to(oldApproval.requestedBy).emit('approval-resolved', {
        approvalId: oldApproval.id,
        approved: false,
        rejectedByName: 'النظام',
        type: oldApproval.type,
      })
      // Notify the target captain that the old request is no longer valid
      io.to(oldApproval.targetCaptainId).emit('approval-expired', {
        approvalId: oldApproval.id,
      })
      room.pendingApproval = null
    }
    
    // Find the other team's captain
    const otherTeamId: TeamId = player.teamId === 'A' ? 'B' : 'A'
    const otherCaptain = getTeamPlayers(room, otherTeamId).find(p => p.isCaptain)
    
    if (!otherCaptain) {
      socket.emit('game-error', { message: 'لا يوجد قائد للفريق الآخر' })
      return
    }
    
    const approvalId = `approval-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    
    const approval: ApprovalRequest = {
      id: approvalId,
      type: data.type as any,
      description: data.description,
      requestedBy: socket.id,
      requestedByName: player.name,
      targetCaptainId: otherCaptain.id,
      targetCaptainName: otherCaptain.name,
      createdAt: Date.now(),
      expiresAt: Date.now() + 40000, // 40 seconds
      data: data.data,
      status: 'pending',
    }
    
    room.pendingApproval = approval
    
    // Send to the other captain
    io.to(otherCaptain.id).emit('approval-requested', {
      approvalId,
      type: data.type,
      description: data.description,
      requestedByName: player.name,
      requestedByTeam: player.teamId,
      expiresAt: approval.expiresAt,
    })
    
    // Confirm to requester
    socket.emit('approval-sent', {
      approvalId,
      targetCaptainName: otherCaptain.name,
    })
    
    // Auto-expire after 40 seconds
    setTimeout(() => {
      if (room.pendingApproval && room.pendingApproval.id === approvalId && room.pendingApproval.status === 'pending') {
        room.pendingApproval.status = 'expired'
        io.to(roomCode).emit('approval-expired', { approvalId })
        room.pendingApproval = null
      }
    }, 41000)
  })

  // ── captain-approval-response ──────────────────────────────────────────
  socket.on('captain-approval-response', (data: { approvalId: string; approved: boolean }) => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return
    
    const room = rooms.get(roomCode)
    if (!room) return
    
    const player = room.players.get(socket.id)
    if (!player || !player.isCaptain) {
      socket.emit('game-error', { message: 'فقط قائد الفريق يقدر يوافق أو يرفض' })
      return
    }
    
    if (!room.pendingApproval || room.pendingApproval.id !== data.approvalId) {
      socket.emit('game-error', { message: 'طلب الموافقة مش موجود أو انتهت صلاحيته' })
      return
    }
    
    if (room.pendingApproval.status !== 'pending') {
      socket.emit('game-error', { message: 'طلب الموافقة تم الرد عليه بالفعل' })
      return
    }
    
    if (room.pendingApproval.targetCaptainId !== socket.id) {
      socket.emit('game-error', { message: 'أنت مش القائد المطلوب للموافقة' })
      return
    }
    
    const approval = room.pendingApproval
    
    if (data.approved) {
      approval.status = 'approved'
      
      io.to(roomCode).emit('approval-resolved', {
        approvalId: approval.id,
        approved: true,
        approvedByName: player.name,
        type: approval.type,
      })
      
      // Execute the approved action
      if (approval.type === 'settings' && approval.data) {
        // Apply settings changes
        Object.assign(room.settings, approval.data)
        io.to(roomCode).emit('settings-updated', {
          settings: room.settings,
          updatedBy: approval.requestedByName,
          changes: Object.keys(approval.data),
        })
      } else if (approval.type === 'early-end') {
        // Execute early end
        room.earlyEnding = true
        if (room.roundStartTime && !room.roundEnding) {
          const currentRound = room.currentRound
          const roundScores = calculateRoundScores(room, currentRound)
          room.roundResults.set(currentRound, roundScores)
          if (roundScores.length > 0) {
            const winnerId = roundScores[0].playerId
            room.roundWinners.set(currentRound, winnerId)
            const winnerPlayer = room.players.get(winnerId)
            if (winnerPlayer) winnerPlayer.roundWins++
          }
          for (const p of room.players.values()) p.score = 0
          io.to(room.roomCode).emit('round-end', {
            roundNumber: currentRound,
            totalRounds: room.settings.numberOfRounds,
            roundScores,
            roundWinner: roundScores[0] || null,
            isLastRound: true,
          })
        }
        setTimeout(() => handleGameEnd(room.roomCode, true), 1500)
      } else if (approval.type === 'voice-merge') {
        room.voiceMerged = true
        io.to(roomCode).emit('voice-merge-status', {
          merged: true,
          requestedByName: approval.requestedByName,
          approvedByName: player.name,
        })
      }
    } else {
      approval.status = 'rejected'
      
      io.to(roomCode).emit('approval-resolved', {
        approvalId: approval.id,
        approved: false,
        rejectedByName: player.name,
        type: approval.type,
      })
    }
    
    room.pendingApproval = null
  })

  // ── voice-merge-request ──────────────────────────────────────────────────
  socket.on('voice-merge-request', () => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return
    
    const room = rooms.get(roomCode)
    if (!room || room.battleMode !== 'فرق') return
    
    const player = room.players.get(socket.id)
    if (!player || !player.isCaptain) {
      socket.emit('game-error', { message: 'فقط قائد الفريق يقدر يطلب دمج المحادثة الصوتية' })
      return
    }
    
    if (room.voiceMerged) {
      socket.emit('game-error', { message: 'المحادثة الصوتية مدمجة بالفعل' })
      return
    }
    
    // This goes through the approval system
    socket.emit('captain-approval-needed', {
      type: 'voice-merge',
      description: 'طلب دمج المحادثة الصوتية بين الفريقين',
    })
    
    // Actually send the approval request
    const otherTeamId: TeamId = player.teamId === 'A' ? 'B' : 'A'
    const otherCaptain = getTeamPlayers(room, otherTeamId).find(p => p.isCaptain)
    
    if (!otherCaptain) {
      socket.emit('game-error', { message: 'لا يوجد قائد للفريق الآخر' })
      return
    }
    
    if (room.pendingApproval && room.pendingApproval.status === 'pending') {
      socket.emit('game-error', { message: 'يوجد طلب موافقة معلق بالفعل' })
      return
    }
    
    const approvalId = `approval-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    
    room.pendingApproval = {
      id: approvalId,
      type: 'voice-merge',
      description: 'طلب دمج المحادثة الصوتية بين الفريقين',
      requestedBy: socket.id,
      requestedByName: player.name,
      targetCaptainId: otherCaptain.id,
      targetCaptainName: otherCaptain.name,
      createdAt: Date.now(),
      expiresAt: Date.now() + 40000,
      data: null,
      status: 'pending',
    }
    
    io.to(otherCaptain.id).emit('approval-requested', {
      approvalId,
      type: 'voice-merge',
      description: 'طلب دمج المحادثة الصوتية بين الفريقين',
      requestedByName: player.name,
      requestedByTeam: player.teamId,
      expiresAt: room.pendingApproval.expiresAt,
    })
    
    socket.emit('approval-sent', {
      approvalId,
      targetCaptainName: otherCaptain.name,
    })
    
    setTimeout(() => {
      if (room.pendingApproval && room.pendingApproval.id === approvalId && room.pendingApproval.status === 'pending') {
        room.pendingApproval.status = 'expired'
        io.to(roomCode).emit('approval-expired', { approvalId })
        room.pendingApproval = null
      }
    }, 41000)
  })

  // ── team-chat-message ──────────────────────────────────────────────────
  socket.on('team-chat-message', (data: { content: string }) => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return
    
    const room = rooms.get(roomCode)
    if (!room) return
    
    const player = room.players.get(socket.id)
    if (!player || !player.teamId) return
    
    if (!data.content?.trim()) return
    
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      senderId: socket.id,
      senderName: player.name,
      content: data.content.trim(),
      mode: 'team' as const,
      teamId: player.teamId,
      timestamp: Date.now(),
    }
    
    // Send only to teammates
    const teammates = getTeamPlayers(room, player.teamId)
    for (const teammate of teammates) {
      io.to(teammate.id).emit('chat-message', message)
    }
  })

  // ── global-chat-message ──────────────────────────────────────────────────
  socket.on('global-chat-message', (data: { content: string }) => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return
    
    const room = rooms.get(roomCode)
    if (!room) return
    
    const player = room.players.get(socket.id)
    if (!player) return
    
    if (!data.content?.trim()) return
    
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      senderId: socket.id,
      senderName: player.name,
      content: data.content.trim(),
      mode: 'global' as const,
      teamId: player.teamId,
      timestamp: Date.now(),
    }
    
    io.to(roomCode).emit('chat-message', message)
  })

  // ── private-message ──────────────────────────────────────────────────
  socket.on('private-message', (data: { targetId: string; content: string }) => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return
    
    const room = rooms.get(roomCode)
    if (!room) return
    
    const player = room.players.get(socket.id)
    if (!player) return
    
    const target = room.players.get(data.targetId)
    if (!target) return
    
    if (!data.content?.trim()) return
    
    const message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      senderId: socket.id,
      senderName: player.name,
      content: data.content.trim(),
      mode: 'private' as const,
      targetId: data.targetId,
      targetName: target.name,
      timestamp: Date.now(),
    }
    
    // Send to sender and target only
    socket.emit('chat-message', message)
    io.to(data.targetId).emit('chat-message', message)
  })

  // ── disconnect ─────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) {
      console.log(`[disconnect] ${socket.id} (not in any room)`)
      return
    }

    console.log(`[disconnect] ${socket.id} disconnected from room ${roomCode}`)

    // Leave the socket.io room
    socket.leave(roomCode)

    // Mark player as disconnected (grace period applies - can rejoin)
    removePlayerFromRoom(socket.id, 'disconnect')
  })

  // ── rename-team ────────────────────────────────────────────────────────
  // Captain renames their own team
  socket.on('rename-team', (data: { teamId: TeamId; newName: string }) => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return
    
    const room = rooms.get(roomCode)
    if (!room || room.battleMode !== 'فرق') return
    
    const player = room.players.get(socket.id)
    if (!player || !player.isCaptain) {
      socket.emit('game-error', { message: 'فقط قائد الفريق يقدر يغيّر اسم الفريق' })
      return
    }
    
    // Captain can only rename their OWN team
    if (player.teamId !== data.teamId) {
      socket.emit('game-error', { message: 'تقدر تغيّر اسم فريقك بس' })
      return
    }
    
    // Validate name
    const trimmed = (data.newName || '').trim()
    
    // Min 2 chars, max 20 chars
    if (trimmed.length < 2) {
      socket.emit('game-error', { message: 'اسم الفريق لازم يكون حرفين على الأقل' })
      return
    }
    if (trimmed.length > 20) {
      socket.emit('game-error', { message: 'اسم الفريق لازم يكون 20 حرف على الأكثر' })
      return
    }
    
    // No emoji-only names (must contain at least one letter)
    const hasLetter = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FFa-zA-Z]/.test(trimmed)
    if (!hasLetter) {
      socket.emit('game-error', { message: 'اسم الفريق لازم يحتوي على حروف' })
      return
    }
    
    // Basic profanity filter (common Arabic profanity - add more as needed)
    const profanityList = ['لعنة', 'حقير', 'غبي', 'حمار', 'كلب', 'قحبة', 'عرص', 'شرموطة', 'كس أمك', 'نك']
    const lowerName = trimmed.toLowerCase()
    const hasProfanity = profanityList.some(word => lowerName.includes(word))
    if (hasProfanity) {
      socket.emit('game-error', { message: 'اسم الفريق غير مناسب' })
      return
    }
    
    // Check if the other team already has this name (duplicate prevention)
    const otherTeamId: TeamId = data.teamId === 'A' ? 'B' : 'A'
    const otherTeamCustomName = room.teamNames?.[otherTeamId]
    const otherTeamDefaultName = otherTeamId === 'A' ? 'الفريق الأحمر' : 'الفريق الأزرق'
    const otherTeamDisplayName = otherTeamCustomName || otherTeamDefaultName
    
    if (trimmed === otherTeamDisplayName) {
      socket.emit('game-error', { message: 'الفريق الآخر يستخدم هذا الاسم بالفعل' })
      return
    }
    
    // Also check against the other team's default name
    if (trimmed === otherTeamDefaultName) {
      socket.emit('game-error', { message: 'لا يمكنك استخدام الاسم الافتراضي للفريق الآخر' })
      return
    }
    
    // Apply the rename
    if (!room.teamNames) room.teamNames = { A: null, B: null }
    room.teamNames[data.teamId] = trimmed
    
    const teamsInfo = getTeamsInfo(room)
    
    // Broadcast team update to all players
    io.to(roomCode).emit('team-update', {
      teams: teamsInfo,
      players: playersToArray(room.players),
    })
    
    // Also emit a specific rename event for cinematic notification
    const defaultName = data.teamId === 'A' ? 'الفريق الأحمر' : 'الفريق الأزرق'
    io.to(roomCode).emit('team-renamed', {
      teamId: data.teamId,
      oldName: defaultName,
      newName: trimmed,
      captainName: player.name,
    })
    
    console.log(`[rename-team] ${player.name} renamed team ${data.teamId} to "${trimmed}" in room ${roomCode}`)
  })

  // ── transfer-leadership ──────────────────────────────────────────────────
  // Allows a captain to transfer captain role to another team member,
  // or a host to transfer host role to another player (both solo and team modes)
  socket.on('transfer-leadership', (data: { targetPlayerId: string; type: 'captain' | 'host' }) => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) return
    const room = rooms.get(roomCode)
    if (!room || room.status !== 'waiting') return
    
    const currentPlayer = room.players.get(socket.id)
    if (!currentPlayer) return
    
    const targetPlayer = room.players.get(data.targetPlayerId)
    if (!targetPlayer || targetPlayer.isDisconnected) {
      socket.emit('game-error', { message: 'المقاتل المحدد غير موجود' })
      return
    }
    
    if (data.type === 'captain') {
      // Captain transfer: only current captain can do this, target must be in same team
      if (!currentPlayer.isCaptain) {
        socket.emit('game-error', { message: 'فقط قائد الفريق يقدر ينقل القيادة' })
        return
      }
      if (currentPlayer.teamId !== targetPlayer.teamId) {
        socket.emit('game-error', { message: 'ممكن تنقل القيادة بس لأعضاء فريقك' })
        return
      }
      if (targetPlayer.id === currentPlayer.id) {
        socket.emit('game-error', { message: 'ما تنقلش القيادة لنفسك!' })
        return
      }
      
      const teamId = currentPlayer.teamId as TeamId
      
      // Remove captain from current player
      currentPlayer.isCaptain = false
      // Set new captain
      targetPlayer.isCaptain = true
      
      const teamsInfo = getTeamsInfo(room)
      
      // Broadcast captain change
      io.to(roomCode).emit('team-captain-changed', {
        teamId,
        newCaptainId: targetPlayer.id,
        newCaptainName: targetPlayer.name,
        teams: teamsInfo,
      })
      
      // Notify the new captain
      io.to(targetPlayer.id).emit('leadership-received', {
        type: 'captain',
        teamId,
        teamName: getTeamDisplayName(room, teamId),
        transferredByName: currentPlayer.name,
      })
      
      // Notify the old captain
      socket.emit('leadership-transferred', {
        type: 'captain',
        teamId,
        newLeaderName: targetPlayer.name,
      })
      
      console.log(`[transfer-leadership] Captain ${currentPlayer.name} transferred captain of Team ${teamId} to ${targetPlayer.name} in room ${roomCode}`)
      
    } else if (data.type === 'host') {
      // Host transfer: only current host can do this, target can be any player
      if (!currentPlayer.isHost) {
        socket.emit('game-error', { message: 'فقط القائد يقدر ينقل القيادة' })
        return
      }
      if (targetPlayer.id === currentPlayer.id) {
        socket.emit('game-error', { message: 'ما تنقلش الإدارة لنفسك!' })
        return
      }
      
      // Transfer host
      currentPlayer.isHost = false
      targetPlayer.isHost = true
      room.hostId = targetPlayer.id
      room.hostName = targetPlayer.name
      
      io.to(roomCode).emit('host-changed', {
        newHostId: targetPlayer.id,
        newHostName: targetPlayer.name,
        oldHostName: currentPlayer.name,
        players: playersToArray(room.players),
      })
      
      // Notify the new host
      io.to(targetPlayer.id).emit('leadership-received', {
        type: 'host',
        transferredByName: currentPlayer.name,
      })
      
      // Notify the old host
      socket.emit('leadership-transferred', {
        type: 'host',
        newLeaderName: targetPlayer.name,
      })
      
      console.log(`[transfer-leadership] Host ${currentPlayer.name} transferred host to ${targetPlayer.name} in room ${roomCode}`)
    }
  })

  socket.on('error', (error) => {
    console.error(`[error] Socket error (${socket.id}):`, error)
  })
})

// ─── Round Management ─────────────────────────────────────────────────────────

// ─── Prefetch next round content in the background ───────────────────────
// Only generates the NEXT round while players are playing the current one.
// This is much faster than the old approach that generated ALL rounds upfront.
async function prefetchNextRound(roomCode: string) {
  const room = rooms.get(roomCode)
  if (!room || room.status !== 'playing') return

  const nextRoundIndex = room.rounds.length // Next round to generate
  const totalRounds = room.settings.numberOfRounds

  // Already have all rounds? Nothing to prefetch
  if (nextRoundIndex >= totalRounds) return

  // Already generating or already have this round?
  if (room.rounds[nextRoundIndex]) {
    console.log(`[prefetchNextRound] Round ${nextRoundIndex + 1} already exists for room ${roomCode}`)
    return
  }

  // Prevent duplicate prefetch for the same round
  if (room._prefetchInProgress === nextRoundIndex) {
    console.log(`[prefetchNextRound] Round ${nextRoundIndex + 1} already being generated for room ${roomCode}`)
    return
  }
  room._prefetchInProgress = nextRoundIndex

  console.log(`[prefetchNextRound] 🔄 Generating round ${nextRoundIndex + 1} content in background for room ${roomCode}...`)

  try {
    const playerNames = playersToArray(room.players).map(p => p.name)
    const previousTopics = room.rounds
      .filter(r => r.content?.title)
      .map(r => r.content.title)

    const content = await fetchGameContent(
      room.settings.gameType,
      room.settings.difficulty,
      roomCode,
      playerNames,
      previousTopics,
      room.settings.passageType
    )

    // Check room still exists and we haven't been superseded
    const currentRoom = rooms.get(roomCode)
    if (!currentRoom || currentRoom.status !== 'playing') return

    // Only push if the round hasn't been generated by another process
    if (!currentRoom.rounds[nextRoundIndex]) {
      currentRoom.rounds.push({
        roundNumber: nextRoundIndex,
        content,
      })
      console.log(`[prefetchNextRound] ✅ Round ${nextRoundIndex + 1} content ready for room ${roomCode}`)
    }

    currentRoom._prefetchInProgress = -1
  } catch (err) {
    console.error(`[prefetchNextRound] ❌ Failed to generate round ${nextRoundIndex + 1} for room ${roomCode}:`, err)
    const currentRoom = rooms.get(roomCode)
    if (currentRoom) currentRoom._prefetchInProgress = -1
  }
}

function handleRoundEnd(roomCode: string) {
  const room = rooms.get(roomCode)
  if (!room || room.status !== 'playing') return

  // Prevent double calls - if round is already ending, skip
  if (room.roundEnding) {
    console.log(`[handleRoundEnd] Round already ending in room ${roomCode}, skipping duplicate call`)
    return
  }
  room.roundEnding = true

  // Clear the server-side round timer since the round is ending
  if (room.roundTimer) {
    clearTimeout(room.roundTimer)
    room.roundTimer = null
  }

  const currentRound = room.currentRound
  const totalRounds = room.settings.numberOfRounds

  // Calculate per-round scores (not cumulative)
  const roundScores = calculateRoundScores(room, currentRound)
  room.roundResults.set(currentRound, roundScores)

  // Determine round winner (player with highest score in this round)
  if (roundScores.length > 0) {
    const winnerId = roundScores[0].playerId
    room.roundWinners.set(currentRound, winnerId)

    // Update player's roundWins count
    const winnerPlayer = room.players.get(winnerId)
    if (winnerPlayer) {
      winnerPlayer.roundWins++
    }
  }

  // Reset all player scores for the next round (scores are per-round, not cumulative)
  // The cumulative score is now replaced by roundWins
  for (const player of room.players.values()) {
    player.score = 0
  }

  // Build per-player answer review for this round
  const roundContent = room.rounds[currentRound]
  const playerAnswerReviews: Record<string, Array<{
    questionIndex: number
    question: string
    options: string[]
    playerAnswer: number
    correctAnswer: number
    isCorrect: boolean
    explanation: string
  }>> = {}

  if (roundContent) {
    for (const [playerId, player] of room.players.entries()) {
      if (player.isDisconnected) continue
      const playerAnswers = room.playerAnswers.get(playerId)
      const roundAnswers = playerAnswers?.get(currentRound)
      const reviews: typeof playerAnswerReviews[string] = []
      for (let qIdx = 0; qIdx < roundContent.content.questions.length; qIdx++) {
        const q = roundContent.content.questions[qIdx]
        const answer = roundAnswers?.get(qIdx)
        reviews.push({
          questionIndex: qIdx,
          question: q.text,
          options: q.options,
          playerAnswer: answer ? answer.answerIndex : -1,
          correctAnswer: q.correctAnswer,
          isCorrect: answer ? q.correctAnswer === answer.answerIndex : false,
          explanation: q.explanation,
        })
      }
      playerAnswerReviews[playerId] = reviews
    }
  }

  // Calculate team scores for team mode
  let teamRoundScores: {
    A: { score: number; correctAnswers: number; speedBonus: number; finishedFirst: boolean }
    B: { score: number; correctAnswers: number; speedBonus: number; finishedFirst: boolean }
    winningTeam: string | null
  } | null = null
  if (room.battleMode === 'فرق') {
    // Determine which team finished first (speed bonus for synchronized progression)
    const teamAFinishedPlayers = [...room.players.entries()].filter(([, p]) => !p.isDisconnected && p.teamId === 'A')
    const teamBFinishedPlayers = [...room.players.entries()].filter(([, p]) => !p.isDisconnected && p.teamId === 'B')
    
    const teamAAllFinished = teamAFinishedPlayers.length > 0 && teamAFinishedPlayers.every(([id]) => room.finishedPlayers.has(id))
    const teamBAllFinished = teamBFinishedPlayers.length > 0 && teamBFinishedPlayers.every(([id]) => room.finishedPlayers.has(id))
    
    // Speed bonus: small bonus for the team that finished first
    // Only applies if both teams eventually finished (not if timer expired for one)
    const SPEED_BONUS = 2 // Small fixed bonus that never overpowers accuracy
    let teamASpeedBonus = 0
    let teamBSpeedBonus = 0
    let teamAFinishedFirst = false
    let teamBFinishedFirst = false
    
    if (teamAAllFinished && teamBAllFinished) {
      // Find the earliest finish time for each team
      // The team whose last player finished first gets the bonus
      // Since we don't track per-player finish timestamps, use the order:
      // Check which team had all members in finishedPlayers first
      // Heuristic: if the last finished player is from team A, team B finished first (and vice versa)
      // Actually, we should track this properly. For now, give bonus to team with fewer unfinished at the time.
      // Simple approach: the team that was fully ready while the other wasn't gets the bonus
      // We detect this from the team-ready-state events that were emitted
      // For a clean implementation, track which team completed first
      // The team that had all players in finishedPlayers before the other gets the bonus
      // Since we can't easily retroactively determine this, use the simpler approach:
      // Check which team's last player was added to finishedPlayers more recently
      // The team whose last player was NOT the most recent finisher finished first
      const lastFinishedId = [...room.finishedPlayers].pop() // Most recent finisher (approx)
      const lastFinishedPlayer = lastFinishedId ? room.players.get(lastFinishedId) : null
      if (lastFinishedPlayer?.teamId === 'A') {
        // Team A finished last, so Team B finished first
        teamBSpeedBonus = SPEED_BONUS
        teamBFinishedFirst = true
      } else if (lastFinishedPlayer?.teamId === 'B') {
        // Team B finished last, so Team A finished first
        teamASpeedBonus = SPEED_BONUS
        teamAFinishedFirst = true
      }
    }

    const teamAScore = roundScores
      .filter(s => {
        const p = room.players.get(s.playerId)
        return p?.teamId === 'A'
      })
      .reduce((sum, s) => sum + s.score, 0) + teamASpeedBonus
    
    const teamBScore = roundScores
      .filter(s => {
        const p = room.players.get(s.playerId)
        return p?.teamId === 'B'
      })
      .reduce((sum, s) => sum + s.score, 0) + teamBSpeedBonus
    
    const teamACorrect = roundScores
      .filter(s => {
        const p = room.players.get(s.playerId)
        return p?.teamId === 'A'
      })
      .reduce((sum, s) => sum + s.correctAnswers, 0)
    
    const teamBCorrect = roundScores
      .filter(s => {
        const p = room.players.get(s.playerId)
        return p?.teamId === 'B'
      })
      .reduce((sum, s) => sum + s.correctAnswers, 0)
    
    teamRoundScores = {
      A: { score: teamAScore, correctAnswers: teamACorrect, speedBonus: teamASpeedBonus, finishedFirst: teamAFinishedFirst },
      B: { score: teamBScore, correctAnswers: teamBCorrect, speedBonus: teamBSpeedBonus, finishedFirst: teamBFinishedFirst },
      winningTeam: teamAScore > teamBScore ? 'A' : teamBScore > teamAScore ? 'B' : null,
    }
  }

  // Check if this was the last round
  if (currentRound >= totalRounds - 1) {
    // Game over! Send round-end first, then game-ended
    io.to(roomCode).emit('round-end', {
      roundNumber: currentRound,
      totalRounds,
      roundScores,
      roundWinner: roundScores[0] || null,
      isLastRound: true,
      playerAnswerReviews,
      teamRoundScores,
    })

    // Small delay before showing final results
    setTimeout(() => {
      handleGameEnd(roomCode)
    }, 3000)
    return
  }

  // Send round-end event with scores + per-player answer review
  io.to(roomCode).emit('round-end', {
    roundNumber: currentRound,
    totalRounds,
    roundScores,
    roundWinner: roundScores[0] || null,
    isLastRound: false,
    playerAnswerReviews,
    teamRoundScores,
  })

  // Wait for all players to be ready instead of auto-advancing
  // Reset ready state for the new round transition
  room.readyPlayers = new Set()
  room.finishedPlayers = new Set()
  room.roundEnding = false  // Allow the round-end processing to complete

  // Emit initial ready status so captain immediately sees the monitoring panel
  const activeNonLeaders = [...room.players.entries()].filter(
    ([, p]) => !p.isDisconnected && !(p.isHost || (room.battleMode === 'فرق' && p.isCaptain))
  )
  const unreadyPlayerNames = activeNonLeaders.map(([, p]) => p.name)
  io.to(roomCode).emit('ready-status-update', {
    readyPlayers: [],
    readyCount: 0,
    totalActive: [...room.players.entries()].filter(([, p]) => !p.isDisconnected).length,
    totalFighters: activeNonLeaders.length,
    unreadyPlayerNames,
    readyPlayerNames: [],
    allFightersReady: activeNonLeaders.length === 0,
  })

  // Next round will be started by startNextRoundWhenReady when all players are ready
}

// ─── Start next round (called when all players are ready) ──────────────────
function startNextRound(roomCode: string) {
  const room = rooms.get(roomCode)
  if (!room || room.status !== 'playing') return

  const currentRound = room.currentRound
  const totalRounds = room.settings.numberOfRounds

  room.currentRound = currentRound + 1

  // Check if next round content is ready
  const nextRound = room.rounds[room.currentRound]
  if (!nextRound) {
    // Content not ready yet, show loading
    console.log(`[startNextRound] Round ${room.currentRound + 1} content not ready for room ${roomCode}, waiting...`)
    io.to(roomCode).emit('round-loading', {
      roundNumber: room.currentRound,
      totalRounds,
    })

    // Poll for content
    const checkInterval = setInterval(() => {
      const rr = rooms.get(roomCode)
      if (!rr || rr.status !== 'playing') {
        clearInterval(checkInterval)
        return
      }
      const nextR = rr.rounds[rr.currentRound]
      if (nextR) {
        clearInterval(checkInterval)
        rr.roundStartTime = Date.now()
        rr.roundTimerSeconds = rr.settings.timePerRound * 60
        rr.roundEnding = false
        rr.readyPlayers = new Set()
        rr.finishedPlayers = new Set()
        io.to(roomCode).emit('round-start', {
          roundNumber: rr.currentRound,
          totalRounds: rr.settings.numberOfRounds,
          content: nextR.content,
          timePerRound: rr.roundTimerSeconds,
        })
        console.log(`[startNextRound] Delayed round ${rr.currentRound + 1} started in room ${roomCode}`)

        // Server-side round timer as authoritative backup
        if (rr.roundTimer) clearTimeout(rr.roundTimer)
        rr.roundTimer = setTimeout(() => {
          const rrr = rooms.get(roomCode)
          if (rrr && rrr.status === 'playing' && !rrr.roundEnding) {
            console.log(`[timer] Server-side timer expired for room ${roomCode}`)
            handleRoundEnd(roomCode)
          }
        }, rr.roundTimerSeconds * 1000 + 2000) // 2s grace for network

        // Prefetch the NEXT round while players are playing this one
        prefetchNextRound(roomCode)
      }
    }, 2000)

    return
  }

  // Start next round
  room.roundStartTime = Date.now()
  room.roundTimerSeconds = room.settings.timePerRound * 60
  room.roundEnding = false
  room.readyPlayers = new Set()
  room.finishedPlayers = new Set()

  io.to(roomCode).emit('round-start', {
    roundNumber: room.currentRound,
    totalRounds,
    content: nextRound.content,
    timePerRound: room.roundTimerSeconds,
  })

  // Server-side round timer as authoritative backup
  if (room.roundTimer) clearTimeout(room.roundTimer)
  room.roundTimer = setTimeout(() => {
    const rr = rooms.get(roomCode)
    if (rr && rr.status === 'playing' && !rr.roundEnding) {
      console.log(`[timer] Server-side timer expired for room ${roomCode}`)
      handleRoundEnd(roomCode)
    }
  }, room.roundTimerSeconds * 1000 + 2000) // 2s grace for network

  console.log(`[startNextRound] Round ${room.currentRound + 1} started in room ${roomCode}. Timer: ${room.roundTimerSeconds}s`)

  // Prefetch the NEXT round while players are playing this one
  prefetchNextRound(roomCode)
}

function handleGameEnd(roomCode: string, wasEarlyEnd: boolean = false) {
  const room = rooms.get(roomCode)
  if (!room) return

  room.status = 'finished'

  // Clear the server-side round timer since the game is ending
  if (room.roundTimer) {
    clearTimeout(room.roundTimer)
    room.roundTimer = null
  }

  // ─── Track rematch eligibility: store old room's player list + settings ───
  const rematchPlayers = new Map<string, { name: string; oldSocketId: string }>()
  for (const [id, p] of room.players.entries()) {
    if (!p.isDisconnected) {
      rematchPlayers.set(id, { name: p.name, oldSocketId: id })
    }
  }
  // Store rematch data keyed by old room code
  rematchData.set(roomCode, {
    players: rematchPlayers,
    settings: { ...room.settings },
    roomType: room.roomType,
    password: room.password,
    newRoomCode: null, // Will be set when first player requests rematch
    matchedPlayers: new Set(), // Old socket IDs of players who already rematched
  })

  // Set a 60-second timeout to clean up rematch data
  setTimeout(() => {
    rematchData.delete(roomCode)
  }, 120000) // 2 minutes cleanup

  // Determine overall winner by round wins (not cumulative score)
  // Include ALL players (even disconnected ones who participated in earlier rounds)
  const finalResults = playersToArrayAll(room.players)
    .sort((a, b) => b.roundWins - a.roundWins || b.score - a.score)

  // The "score" field now represents roundWins for the final results
  const scoresWithWins = finalResults.map(p => ({
    ...p,
    score: p.roundWins, // Override score with roundWins for the leaderboard
  }))

  const completedRounds = room.roundResults.size

  // ─── Build full battle data for history saving ───
  // Use the actual game start time for accurate duration
  const battleStartedAt = room.gameStartTime || Date.now()

  const battleParticipants = finalResults.map((p, index) => {
    // Build answer review for this player
    const answerReview: any[] = []
    const playerAnswers = room.playerAnswers.get(p.id)

    for (let rIdx = 0; rIdx < room.rounds.length; rIdx++) {
      const roundContent = room.rounds[rIdx]
      const roundAnswers = playerAnswers?.get(rIdx)

      if (!roundContent) continue

      for (let qIdx = 0; qIdx < roundContent.content.questions.length; qIdx++) {
        const question = roundContent.content.questions[qIdx]
        const answer = roundAnswers?.get(qIdx)

        answerReview.push({
          roundNumber: rIdx + 1,
          questionIndex: qIdx,
          question: question.text,
          options: question.options,
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
          playerAnswer: answer ? answer.answerIndex : -1,
          isCorrect: answer ? question.correctAnswer === answer.answerIndex : false,
          timeTaken: answer ? answer.timeTaken : 0,
        })
      }
    }

    return {
      playerName: p.name,
      finalRank: index + 1,
      totalScore: p.score,
      roundWins: p.roundWins,
      isHost: p.isHost,
      answerReview,
    }
  })

  const battleRounds = room.rounds.map((roundContent, rIdx) => {
    const roundScores = room.roundResults.get(rIdx) || []
    return {
      roundNumber: rIdx + 1,
      title: roundContent.content.title,
      source: roundContent.content.source,
      winnerName: room.roundWinners.get(rIdx)
        ? finalResults.find(p => p.id === room.roundWinners.get(rIdx))?.name || null
        : null,
      duration: room.roundTimerSeconds,
      questions: roundContent.content.questions.map(q => ({
        text: q.text,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
      })),
      roundScores: roundScores.map(s => ({
        playerName: s.playerName,
        score: s.score,
        correctAnswers: s.correctAnswers,
        totalQuestions: s.totalQuestions,
      })),
    }
  })

  const battleData = {
    roomCode: room.roomCode,
    gameType: room.settings.gameType,
    difficulty: room.settings.difficulty,
    roomType: room.roomType,
    passageType: room.settings.passageType,
    totalRounds: room.settings.numberOfRounds,
    completedRounds,
    totalDuration: room.gameStartTime ? Math.floor((Date.now() - room.gameStartTime) / 1000) : completedRounds * room.roundTimerSeconds,
    hostName: room.hostName,
    wasEarlyEnd,
    startedAt: battleStartedAt,
    participants: battleParticipants,
    rounds: battleRounds,
  }

  io.to(roomCode).emit('game-ended', {
    scores: scoresWithWins,
    roundWinners: Object.fromEntries(room.roundWinners),
    roundResults: Object.fromEntries(
      Array.from(room.roundResults.entries()).map(([k, v]) => [k, v])
    ),
    totalRounds: room.settings.numberOfRounds,
    battleData, // Full battle data for history saving
    battleMode: room.battleMode,
    teams: room.battleMode === 'فرق' ? getTeamsInfo(room) : null,
  })

  // If this was an early end, emit additional info
  if (wasEarlyEnd) {
    io.to(roomCode).emit('early-end-confirmed', {
      completedRounds,
      totalPlannedRounds: room.settings.numberOfRounds,
      wasEarlyEnd: true,
    })
  }

  console.log(`[handleGameEnd] Game ended in room ${roomCode}. Winner: ${finalResults[0]?.name} (${finalResults[0]?.roundWins} round wins)${wasEarlyEnd ? ' (early end)' : ''}`)
  broadcastPublicRooms()
}

// ─── Self-Ping Keep-Alive ──────────────────────────────────────────────────────
// Prevents Render.com from spinning down the free tier by pinging own /health
// endpoint every 4 minutes.
let selfPingInterval: NodeJS.Timeout | null = null

function startSelfPing() {
  if (!SELF_PING_URL) {
    console.log('[keepalive] SELF_PING_URL not set, skipping self-ping')
    return
  }

  const pingUrl = SELF_PING_URL.replace(/\/+$/, '') + '/health'
  console.log(`[keepalive] Starting self-ping to ${pingUrl} every 4 minutes`)

  selfPingInterval = setInterval(async () => {
    try {
      const response = await fetch(pingUrl)
      if (response.ok) {
        console.log(`[keepalive] Ping OK (${response.status})`)
      } else {
        console.warn(`[keepalive] Ping returned ${response.status}`)
      }
    } catch (err: any) {
      console.warn(`[keepalive] Ping failed: ${err.message}`)
    }
  }, 4 * 60 * 1000) // 4 minutes
}

// ─── Start Server ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001', 10)
httpServer.listen(PORT, () => {
  console.log(`Game service (Socket.io) running on port ${PORT}`)
  // Start self-ping keep-alive after server starts
  startSelfPing()
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM signal, shutting down server...')
  httpServer.close(() => {
    console.log('Game service closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('Received SIGINT signal, shutting down server...')
  httpServer.close(() => {
    console.log('Game service closed')
    process.exit(0)
  })
})
