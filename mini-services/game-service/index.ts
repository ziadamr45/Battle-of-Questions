import { createServer, IncomingMessage, ServerResponse } from 'http'
import { Server, Socket } from 'socket.io'
// OpenRouter API - replaces z-ai-web-dev-sdk
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ''
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001'

interface ChatMessage {
  role: 'system' | 'assistant' | 'user'
  content: string
}

async function callOpenRouterLLM(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number; timeoutMs?: number }
): Promise<string | null> {
  if (!OPENROUTER_API_KEY) {
    console.error('[OpenRouter] OPENROUTER_API_KEY is not set!')
    return null
  }
  const timeoutMs = options?.timeoutMs || 45000
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
        max_tokens: options?.maxTokens ?? 4096,
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
      console.log(`[OpenRouter] LLM response received (${content.length} chars, model: ${OPENROUTER_MODEL})`)
    }
    return content
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error('[OpenRouter] LLM request timed out')
    } else {
      console.error('[OpenRouter] LLM request failed:', err.message)
    }
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function duckDuckGoSearch(
  query: string,
  options?: { timeoutMs?: number }
): Promise<Array<{ name: string; snippet: string }>> {
  const timeoutMs = options?.timeoutMs || 6000
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

interface GameSettings {
  gameType: GameType
  difficulty: Difficulty
  timePerRound: number       // minutes per round (5, 7, 10, 15, 20, 25)
  numberOfRounds: number     // total rounds to play (max 20)
  maxPlayers: number         // max players (max 20)
}

interface Player {
  id: string
  name: string
  score: number
  isHost: boolean
  isReady: boolean
  joinOrder: number
  roundWins: number          // number of rounds this player has won
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
}

// Info sent to clients about public rooms
interface RoomInfo {
  roomCode: string
  roomType: RoomType
  hasPassword: boolean
  hostName: string
  playerCount: number
  maxPlayers: number
  settings: GameSettings
  status: 'waiting' | 'playing' | 'finished'
}

// ─── In-Memory State (declared BEFORE createServer so health-check can read them) ──

const rooms = new Map<string, GameRoom>()

// Map socket.id → roomCode so we can clean up on disconnect
const socketRoomMap = new Map<string, string>()

// Global counter for join order tracking
let globalJoinCounter = 0

// ─── HTTP Server + Health Check ───────────────────────────────────────────────
// Railway (and other cloud providers) need a working HTTP endpoint to confirm
// the container is alive.  Socket.IO responds with 400 on GET / which makes
// Railway think the service is unhealthy and restarts it in a loop.
// We add a simple /health endpoint that returns 200.
const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), rooms: rooms.size, players: socketRoomMap.size }))
    return
  }
  // For any other path, let Socket.IO handle it
})

const io = new Server(httpServer, {
  path: '/socket.io/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
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
    .sort((a, b) => a.joinOrder - b.joinOrder)
}

function findNextHost(players: Map<string, Player>, excludeId?: string): Player | undefined {
  let earliest: Player | undefined
  for (const player of players.values()) {
    if (excludeId && player.id === excludeId) continue
    if (!earliest || player.joinOrder < earliest.joinOrder) {
      earliest = player
    }
  }
  return earliest
}

function getPublicRoomsList(): RoomInfo[] {
  const list: RoomInfo[] = []
  for (const room of rooms.values()) {
    // Only show public rooms that are waiting AND have at least 1 player
    if (room.roomType === 'عامة' && room.status === 'waiting' && room.players.size > 0) {
      list.push({
        roomCode: room.roomCode,
        roomType: room.roomType,
        hasPassword: !!room.password,
        hostName: room.hostName,
        playerCount: room.players.size,
        maxPlayers: room.settings.maxPlayers,
        settings: room.settings,
        status: room.status,
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
const CONTENT_TIMEOUT_MS = 90000 // 90 seconds max (1.5 minutes)

// ─── Content Generation Helpers ──────────────────────────────────────────────────

// Search queries pool for diverse topic selection
const searchQueriesPool: Record<GameType, string[]> = {
  'قراءة متحررة': [
    'الحضارة الإسلامية الأندلسية إنجازات علمية وفكرية',
    'تاريخ الحروب الصليبية وتأثيرها على العالم العربي',
    'الحضارة المصرية القديمة أهرامات وفراعنة',
    'تاريخ الدولة العثمانية وعلاقتها بالعالم العربي',
    'طريق الحرير التجارة بين الشرق والغرب',
    'الذكاء الاصطناعي وتأثيره على مستقبل التعليم',
    'استكشاف الفضاء والبعثات إلى المريخ',
    'الطاقة المتجددة الشمسية والرياح ومستقبل الكوكب',
    'التطور الطبي ثورة اللقاحات والعلاج الجيني',
    'تكنولوجيا النانو وثورة المواد الذكية',
    'البلوك تشين والعملات الرقمية مستقبل المال',
    'فلسفة التفكير النقدي وأهميته في العصر الرقمي',
    'نظرية الذكاءات المتعددة لهوارد غاردنر',
    'علم النفس الإيجابي والسعادة البشرية',
    'قوة العادات وكيف تتشكل في الدماغ',
    'التغير المناخي أسبابه وآثاره على الوطن العربي',
    'أزمة المياه في الشرق الأوسط وحلول مبتكرة',
    'التنوع البيولوجي والانقراض السادس',
    'التصحر في العالم العربي ومشاريع التشجير',
    'ظاهرة الهجرة الدماغية من الدول العربية',
    'التعليم عن بعد ثورة كوفيد وتحولات المستقبل',
    'هوية الشباب العربي بين الأصالة والعولمة',
    'المرأة العربية إنجازات وتحديات معاصرة',
    'الاقتصاد الأخضر فرص الاستدامة في الوطن العربي',
    'ريادة الأعمال الشبابية في المنطقة العربية',
    'رؤية 2030 التنمية المستدامة في السعودية',
    'الأدب العربي الحديث رواد التجديد والتحول',
    'الفن التشكيلي العربي معاصرة وهوية',
    'الصحة النفسية للمراهقين في عصر السوشيال ميديا',
    'إدمان الهواتف الذكية تأثيره على الدماغ والسلوك',
    'رحلة ابن بطوطة عبر العالم الإسلامي',
    'اكتشافات أثرية حديثة في العالم العربي',
  ],
  'نصوص': [
    'شعر المتنبي حكمة وفخر وصور بيانية',
    'شعر أبو تمام البديع والصنعة اللفظية',
    'شعر البحتري وصف وجلال الطبيعة',
    'رثاء الخنساء وعاطفة الأمومة الصادقة',
    'شعر عمر بن أبي ربيعة الغزل الصريح',
    'معلقة امرئ القيس وصف الليل والفرس',
    'أسلوب الجاحظ السخرية والفكاهة في البيان والتبيين',
    'مقامات الهمذاني والحريري فن السجع والتضمين',
    'شعر نزار قباني الحرية والمرأة والتحدي',
    'شعر محمود درويش الهوية والأرض والمنفى',
    'نثر جبران خليل جبران الفلسفة والتصوف الأدبي',
    'شعر أحمد شوقي أمير الشعراء بين التقليد والتجديد',
    'أدب نجيب محفوظ الواقعية المصرية والرمز',
    'البلاغة القرآنية في سورة الرحمن التكرار والجمال',
    'القصص القرآني في سورة يوسف دروس بلاغية',
    'الحوار القرآني في سورة الكهف أساليب وإيقاع',
    'الاستعارات القرآنية في وصف الجنة والنار',
    'فن الخطابة العربية قديما وحديثا أساليب الإقناع',
    'فن المقالة الأدبية العربية تحليل ونقد',
    'السجع والطباق في النثر العربي القديم',
    'وصف القدس في الأدب العربي صور وحروف',
    'وصف الصحراء في الشعر العربي الجاهلي',
    'وصف البحر في الشعر العربي رومانسية وجلال',
    'الغزل العذري عند عمر بن أبي ربيعة وجميل بثينة',
    'الحماسة والفخر في شعر عنترة بن شداد',
    'الحكمة في شعر زهير بن أبي سلمى',
    'أمثال العرب وبلاغتها في النثر القديم',
    'فلسفة الوجود في الشعر العربي المعاصر',
  ],
}

const topicSeeds: Record<GameType, string[]> = {
  'قراءة متحررة': [
    'اكتب عن شخصية عربية نسائية رائدة لم تحظ بشهرة كافية',
    'اكتب عن اختراع إسلامي غير معروف غيّر مجرى التاريخ',
    'اكتب عن مدينة عربية منسية كانت مركز حضارة',
    'اكتب عن ظاهرة طبيعية فريدة في العالم العربي',
    'اكتب عن تقنية مستقبلية وكيف ستغير حياتنا',
    'اكتب عن تحدّ بيئي يواجه منطقة عربية محددة وحلولاً مبتكرة',
    'اكتب عن تقاطع العلم والإيمان في حضارة إسلامية',
    'اكتب عن عادات اجتماعية عربية تتغير مع العولمة',
    'اكتب عن مشروع تنموي عربي ملهم يصلح نموذجاً',
    'اكتب عن تأثير لغة الضاد على طريقة تفكير أهلها',
    'اكتب عن رحالة عربي استكشف عوالم مجهولة',
    'اكتب عن اكتشاف أثري حديث في وطن عربي',
    'اكتب عن أزمة تعليمية وحلاً إبداعياً مقترحاً',
    'اكتب عن فن عربي تقليدي يواجه الانقراض',
    'اكتب عن تجربة تعايش بين ثقافات في مدينة عربية',
  ],
  'نصوص': [
    'اكتب نصاً أدبياً عن ذاكرة المكان وأثره في النفس',
    'اكتب نصاً عن لقاء بين شاعرين من عصرين مختلفين',
    'اكتب نصاً عن صمت الليل وما يبوح به الوجدان',
    'اكتب نصاً عن حوار بين النور والظلام',
    'اكتب نصاً عن رحلة البحث عن الهوية في الغربة',
    'اكتب نصاً عن جمال الكلمة حين تصبح سلاحاً',
    'اكتب نصاً عن الأمل الذي ينبت من ركام الألم',
    'اكتب نصاً عن الوداع ولقاء لا يكتمل',
    'اكتب نصاً عن علاقة الإنسان بالبحر كرمز للحرية',
    'اكتب نصاً عن القدس كمدينة تتحدث عن نفسها',
    'اكتب نصاً عن الشوق بأسلوب يستخدم الاستعارة المكنية',
    'اكتب نصاً عن الكبرياء والضعف البشري بصور بيانية',
    'اكتب نصاً عن الفقدان كتجربة إنسانية جامعة',
    'اكتب نصاً عن القمر كشاهد على أحلام البشر',
    'اكتب نصاً عن الحرية بين القيد والتحليق',
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
    if (typeof question.id !== 'number') return false
    if (typeof question.text !== 'string') return false
    if (!Array.isArray(question.options) || question.options.length !== 4) return false
    if (typeof question.correctAnswer !== 'number') return false
    if (typeof question.explanation !== 'string') return false
  }
  return true
}

function buildPrompt(
  gameType: GameType,
  difficulty: Difficulty,
  searchTitle?: string,
  searchSnippet?: string,
  previousTopics?: string[],
  topicSeed?: string
): string {
  const wordCounts: Record<Difficulty, string> = {
    سهل: '250-350 كلمة على الأقل',
    متوسط: '350-500 كلمة على الأقل',
    صعب: '450-650 كلمة على الأقل',
  }

  const questionCounts: Record<Difficulty, string> = {
    سهل: '3 أسئلة',
    متوسط: '5 أسئلة',
    صعب: '7 أسئلة',
  }

  const difficultyInstructions: Record<Difficulty, string> = {
    سهل: 'أسئلة مباشرة من النص: الإجابة تُوجَد حرفياً أو شبه حرفياً في النص. الخيارات واضحة الفرق.',
    متوسط: 'أسئلة فهم واستنتاج: الإجابة مش موجودة نصاً في النص لكن لازم تفهم وتستنتج. الخيارات متقاربة جداً.',
    صعب: 'أسئلة قدرات عليا (تحليل - تركيب - تقويم - استنتاج بعيد): الإجابة مش مباشرة خالص واحتياج تفكير عميق. الخيارات متقاربة جداً جداً.',
  }

  const typeFocus =
    gameType === 'قراءة متحررة'
      ? 'ركّز على أسئلة الفهم والاستنتاج واستيعاب المقروء والتحليل الفكري'
      : 'ركّز على أسئلة البلاغة والتحليل الأدبي والتذوق والصور البيانية والمحسنات البديعية والأساليب الإنشائية'

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

  return `أنت معلم خبير في اللغة العربية متخصص في إعداد امتحانات القراءة المتحررة والنصوص لمرحلة الثانوية العامة.

⚠️ قاعدة ذهبية: كل نص تنتجه يجب أن يكون فريداً ومختلفاً تماماً عن أي نص آخر.

${searchInspiration}${seedInstruction}${varietyConstraint}

نوع اللعبة: ${gameType}
مستوى الصعوبة: ${difficulty}

القواعد:
1. اكتب نصاً عربياً أصلياً طويلاً وغنياً بالمعلومات والتفاصيل. يجب أن يكون النص: ${wordCounts[difficulty]}
   أسلوب الكتابة: ${randomStyle}

2. ${typeFocus}

3. عدد الأسئلة: ${questionCounts[difficulty]}

4. كل سؤال يحتوي على 4 خيارات بالضبط مع إجابة صحيحة واحدة فقط

5. ${difficultyInstructions[difficulty]}

6. أضف شرحاً لماذا الإجابة الصحيحة هي الصحيحة

7. التزام تام بقواعد اللغة العربية

أجب بصيغة JSON فقط:
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
      "explanation": "شرح"
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
  previousTopics?: string[]
): Promise<GameContent> {
  // Step 1: Emit "checking"
  io.to(roomCode).emit('content-progress', { step: 'checking', text: 'جاري فحص المحتوى السابق للاعبين...' })
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
        const queryPool = searchQueriesPool[gameType]
        let availableQueries = queryPool.filter(q => !usedQueries.has(q))
        if (availableQueries.length === 0) {
          usedQueries.clear()
          availableQueries = queryPool
        }
        const randomQuery = availableQueries[Math.floor(Math.random() * availableQueries.length)]
        usedQueries.add(randomQuery)

        const seeds = topicSeeds[gameType]
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
        const seeds = topicSeeds[gameType]
        topicSeed = seeds[Math.floor(Math.random() * seeds.length)]
      }

      // Step 2: Generate with LLM via OpenRouter
      const prompt = buildPrompt(gameType, difficulty, searchTitle, searchSnippet, previousTopics, topicSeed)

      const responseText = await callOpenRouterLLM(
        [
          {
            role: 'system',
            content: 'أنت معلم خبير في اللغة العربية متخصص في إعداد امتحانات القراءة المتحررة والنصوص. تُجيب دائماً بصيغة JSON صالحة فقط بدون أي نص إضافي.',
          },
          { role: 'user', content: prompt },
        ],
        { timeoutMs: 45000 }
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

        const validatedQuestions = parsed.questions.map((q, index) => ({
          ...q,
          id: index + 1,
          correctAnswer: Math.max(0, Math.min(3, q.correctAnswer)),
        }))

        return {
          title: parsed.title,
          text: parsed.text,
          source: parsed.source,
          questions: validatedQuestions,
        }
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
  throw new Error('فشل في توليد المحتوى بعد محاولات متعددة. يرجى المحاولة مرة أخرى.')
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

// Remove a player from a room, handle host migration, and delete room if empty
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

  // Remove player entirely
  room.players.delete(socketId)
  room.playerAnswers.delete(socketId)
  socketRoomMap.delete(socketId)

  // If room is now empty, delete it immediately
  if (room.players.size === 0) {
    deleteRoom(roomCode)
    console.log(`[removePlayer] ${playerName} left room ${roomCode}. Room deleted (empty).`)
    return
  }

  // If the removed player was the host, transfer host to the earliest remaining player
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

  // Notify remaining players
  if (reason === 'leave') {
    io.to(roomCode).emit('player-left', {
      playerId: socketId,
      playerName,
      players: playersToArray(room.players),
    })
  } else {
    io.to(roomCode).emit('player-disconnected', {
      playerId: socketId,
      playerName,
      players: playersToArray(room.players),
    })
  }

  console.log(`[removePlayer] ${playerName} ${reason === 'leave' ? 'left' : 'disconnected from'} room ${roomCode}. Remaining: ${room.players.size}`)

  broadcastPublicRooms()
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
        socket.emit('rejoin-failed', { message: 'الغرفة لم تعد موجودة' })
        return
      }

      // Find the player by name in the room
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
        socket.emit('rejoin-failed', { message: 'أنت لست في هذه الغرفة' })
        return
      }

      // Update the player's ID to the new socket ID
      const oldId = existingPlayerId
      existingPlayer.id = socket.id

      // Move from old key to new key in players map
      room.players.delete(oldId)
      room.players.set(socket.id, existingPlayer)

      // Move answers too
      const oldAnswers = room.playerAnswers.get(oldId)
      if (oldAnswers) {
        room.playerAnswers.delete(oldId)
        room.playerAnswers.set(socket.id, oldAnswers)
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
        const finalScores = playersToArray(room.players).sort((a, b) => b.score - a.score)
        rejoinData.scores = finalScores
        rejoinData.totalRounds = room.settings.numberOfRounds
        rejoinData.roundWinners = Object.fromEntries(room.roundWinners)
        rejoinData.roundResults = Object.fromEntries(
          Array.from(room.roundResults.entries()).map(([k, v]) => [k, v])
        )
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
        socket.emit('game-error', { message: 'اسم اللاعب مطلوب' })
        return
      }

      // Validate rounds rule: 2 players can't play 2 rounds, 3 players can't play 3 rounds
      if ((settings.maxPlayers === 2 && settings.numberOfRounds === 2) || (settings.maxPlayers === 3 && settings.numberOfRounds === 3)) {
        socket.emit('game-error', { message: 'عدد الجولات لا يمكن أن يساوي عدد اللاعبين عند 2 أو 3 لاعبين' })
        return
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
      }

      rooms.set(roomCode, room)
      socketRoomMap.set(socket.id, roomCode)
      socket.join(roomCode)

      socket.emit('game-created', {
        roomCode,
        roomType: room.roomType,
        hasPassword: !!room.password,
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
        socket.emit('game-error', { message: 'رمز الغرفة واسم اللاعب مطلوبان' })
        return
      }

      const room = rooms.get(roomCode.toUpperCase())
      if (!room) {
        socket.emit('game-error', { message: 'الغرفة غير موجودة أو تم حذفها' })
        return
      }

      if (room.players.size === 0) {
        socket.emit('game-error', { message: 'الغرفة غير موجودة أو تم حذفها' })
        broadcastPublicRooms()
        return
      }

      if (room.status !== 'waiting') {
        socket.emit('game-error', { message: 'اللعبة قد بدأت بالفعل' })
        return
      }

      if (room.players.size >= room.settings.maxPlayers) {
        socket.emit('game-error', { message: 'الغرفة ممتلئة' })
        return
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
        socket.emit('game-error', { message: 'اسم اللاعب مستخدم بالفعل في هذه الغرفة' })
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
      })

      // Notify others in the room
      socket.to(roomCode).emit('player-joined', {
        player,
        players: playersToArray(room.players),
      })

      broadcastPublicRooms()

      console.log(
        `[join-game] ${playerName} (${socket.id}) joined room ${roomCode}`
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
        socket.emit('game-error', { message: 'الغرفة غير موجودة' })
        return
      }

      if (room.hostId !== socket.id) {
        socket.emit('game-error', { message: 'فقط المضيف يمكنه بدء اللعبة' })
        return
      }

      if (room.players.size < 2) {
        socket.emit('game-error', { message: 'يجب أن يكون هناك لاعبان على الأقل' })
        return
      }

      if (room.status !== 'waiting') {
        socket.emit('game-error', { message: 'اللعبة قد بدأت بالفعل' })
        return
      }

      // Update room status
      room.status = 'playing'
      room.currentRound = 0

      // Reset all player scores and round wins for the new game
      for (const player of room.players.values()) {
        player.score = 0
        player.roundWins = 0
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
          [] // No previous topics for first round
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

        console.log(`[start-game] Round 1 content sent to room ${roomCode}. Timer: ${room.roundTimerSeconds}s`)

        // Pre-generate remaining rounds in the background
        generateRemainingRounds(roomCode, room.settings.numberOfRounds, room.settings.gameType, room.settings.difficulty, playerNames)
      } catch (err) {
        console.error(`[start-game] Failed to generate content for room ${roomCode}:`, err)
        room.status = 'waiting'
        room.rounds = []
        io.to(roomCode).emit('game-error', {
          message: 'فشل في توليد محتوى اللعبة. يرجى المحاولة مرة أخرى.',
        })
        broadcastPublicRooms()
      }
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
      timeTaken: number
    }) => {
      const { roomCode, roundNumber, questionIndex, answerIndex, timeTaken } = data
      const room = rooms.get(roomCode?.toUpperCase())

      if (!room) {
        socket.emit('game-error', { message: 'الغرفة غير موجودة' })
        return
      }

      if (room.status !== 'playing') {
        socket.emit('game-error', { message: 'اللعبة ليست قيد التشغيل' })
        return
      }

      const player = room.players.get(socket.id)
      if (!player) {
        socket.emit('game-error', { message: 'أنت لست في هذه الغرفة' })
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

      // Check if ALL players have answered all questions in this round
      const allPlayersAnsweredAll = Array.from(room.players.keys()).every((playerId) => {
        const pAnswers = room.playerAnswers.get(playerId)
        if (!pAnswers) return false
        const rAnswers = pAnswers.get(roundNumber)
        if (!rAnswers) return false
        return rAnswers.size >= totalQuestions
      })

      if (allPlayersAnsweredAll) {
        // All players finished this round
        handleRoundEnd(roomCode)
      }
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

    // If game is playing and only 1 player left, auto-end the game
    const updatedRoom = rooms.get(roomCode)
    if (updatedRoom && updatedRoom.status === 'playing' && updatedRoom.players.size === 1) {
      // Notify the remaining player that they won because the opponent left
      const remainingPlayer = Array.from(updatedRoom.players.values())[0]
      io.to(roomCode).emit('opponent-left-game', {
        leftPlayerName: playerName,
        winnerName: remainingPlayer?.name,
      })
      // End the game immediately
      handleGameEnd(roomCode)
    } else if (updatedRoom && updatedRoom.status === 'playing' && updatedRoom.players.size === 0) {
      deleteRoom(roomCode)
    }
  })

  // ── disconnect ─────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const roomCode = socketRoomMap.get(socket.id)
    if (!roomCode) {
      console.log(`[disconnect] ${socket.id} (not in any room)`)
      return
    }

    // Get player name BEFORE removing them
    const room = rooms.get(roomCode)
    const player = room?.players.get(socket.id)
    const disconnectedPlayerName = player?.name || socket.id

    console.log(`[disconnect] ${socket.id} disconnected from room ${roomCode}`)

    // Leave the socket.io room
    socket.leave(roomCode)

    // Remove player immediately - no grace period
    removePlayerFromRoom(socket.id, 'disconnect')

    // If game is playing and only 1 player left, notify them and auto-end the game
    const updatedRoom = rooms.get(roomCode)
    if (updatedRoom && updatedRoom.status === 'playing' && updatedRoom.players.size === 1) {
      const remainingPlayer = Array.from(updatedRoom.players.values())[0]
      io.to(roomCode).emit('opponent-left-game', {
        leftPlayerName: disconnectedPlayerName,
        winnerName: remainingPlayer?.name,
      })
      // End the game immediately - only one player left
      handleGameEnd(roomCode)
    } else if (updatedRoom && updatedRoom.status === 'playing' && updatedRoom.players.size === 0) {
      // No players left - delete room
      deleteRoom(roomCode)
    }
  })

  socket.on('error', (error) => {
    console.error(`[error] Socket error (${socket.id}):`, error)
  })
})

// ─── Round Management ─────────────────────────────────────────────────────────

async function generateRemainingRounds(roomCode: string, totalRounds: number, gameType: GameType, difficulty: Difficulty, playerNames: string[]) {
  const room = rooms.get(roomCode)
  if (!room) return

  for (let i = 1; i < totalRounds; i++) {
    try {
      // Collect previous topics for variety
      const previousTopics = room.rounds
        .filter(r => r.content?.title)
        .map(r => r.content.title)

      const content = await fetchGameContent(gameType, difficulty, roomCode, playerNames, previousTopics)
      if (!rooms.has(roomCode)) return // Room was deleted

      room.rounds.push({
        roundNumber: i,
        content,
      })
      console.log(`[generateRemainingRounds] Generated round ${i + 1} content for room ${roomCode}`)
    } catch (err) {
      console.error(`[generateRemainingRounds] Failed to generate round ${i + 1} for room ${roomCode}:`, err)
    }
  }
}

function handleRoundEnd(roomCode: string) {
  const room = rooms.get(roomCode)
  if (!room || room.status !== 'playing') return

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

  // Check if this was the last round
  if (currentRound >= totalRounds - 1) {
    // Game over! Send round-end first, then game-ended
    io.to(roomCode).emit('round-end', {
      roundNumber: currentRound,
      totalRounds,
      roundScores,
      roundWinner: roundScores[0] || null,
      isLastRound: true,
    })

    // Small delay before showing final results
    setTimeout(() => {
      handleGameEnd(roomCode)
    }, 3000)
    return
  }

  // Send round-end event with scores
  io.to(roomCode).emit('round-end', {
    roundNumber: currentRound,
    totalRounds,
    roundScores,
    roundWinner: roundScores[0] || null,
    isLastRound: false,
  })

  // Move to next round after a brief delay for showing round results
  setTimeout(() => {
    const r = rooms.get(roomCode)
    if (!r || r.status !== 'playing') return

    r.currentRound = currentRound + 1

    // Check if next round content is ready
    const nextRound = r.rounds[r.currentRound]
    if (!nextRound) {
      // Content not ready yet, show loading
      console.log(`[handleRoundEnd] Round ${r.currentRound + 1} content not ready for room ${roomCode}, waiting...`)
      io.to(roomCode).emit('round-loading', {
        roundNumber: r.currentRound,
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
          io.to(roomCode).emit('round-start', {
            roundNumber: rr.currentRound,
            totalRounds: rr.settings.numberOfRounds,
            content: nextR.content,
            timePerRound: rr.roundTimerSeconds,
          })
          console.log(`[handleRoundEnd] Delayed round ${rr.currentRound + 1} started in room ${roomCode}`)
        }
      }, 2000)

      return
    }

    // Start next round
    r.roundStartTime = Date.now()
    r.roundTimerSeconds = r.settings.timePerRound * 60

    io.to(roomCode).emit('round-start', {
      roundNumber: r.currentRound,
      totalRounds,
      content: nextRound.content,
      timePerRound: r.roundTimerSeconds,
    })

    console.log(`[handleRoundEnd] Round ${r.currentRound + 1} started in room ${roomCode}. Timer: ${r.roundTimerSeconds}s`)
  }, 5000) // 5 second delay between rounds to show round results
}

function handleGameEnd(roomCode: string) {
  const room = rooms.get(roomCode)
  if (!room) return

  room.status = 'finished'

  // Determine overall winner by round wins (not cumulative score)
  const finalResults = playersToArray(room.players)
    .sort((a, b) => b.roundWins - a.roundWins)

  // The "score" field now represents roundWins for the final results
  // We'll send roundWins as a separate field
  const scoresWithWins = finalResults.map(p => ({
    ...p,
    score: p.roundWins, // Override score with roundWins for the leaderboard
  }))

  io.to(roomCode).emit('game-ended', {
    scores: scoresWithWins,
    roundWinners: Object.fromEntries(room.roundWinners),
    roundResults: Object.fromEntries(
      Array.from(room.roundResults.entries()).map(([k, v]) => [k, v])
    ),
    totalRounds: room.settings.numberOfRounds,
  })

  console.log(`[handleGameEnd] Game ended in room ${roomCode}. Winner: ${finalResults[0]?.name} (${finalResults[0]?.roundWins} round wins)`)
  broadcastPublicRooms()
}

// ─── Start Server ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3003', 10)
httpServer.listen(PORT, () => {
  console.log(`Game service (Socket.io) running on port ${PORT}`)
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
