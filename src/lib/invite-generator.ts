// Arabic invite message generator for معركة الأسئلة
// Generates dynamic, time-aware, Egyptian Arabic style share messages
// NO AI at runtime — all templates are predefined

// ─── Time Period Detection ─────────────────────────────────────────────

type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'late_night'

function getTimePeriod(): TimePeriod {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'late_night'
}

function isWeekend(): boolean {
  const day = new Date().getDay()
  return day === 5 || day === 6 // Friday & Saturday in Egypt
}

// ─── Game Info Interface ───────────────────────────────────────────────

export interface ShareRoomInfo {
  roomCode: string
  roomType: 'عامة' | 'خاصة'
  hasPassword: boolean
  gameType: string        // e.g., 'قراءة متحررة' or 'نصوص'
  difficulty: string      // 'سهل' | 'متوسط' | 'صعب'
  passageType?: string   // 'علمي' | 'أدبي' | 'عشوائي' (only for قراءة متحررة)
  numberOfRounds: number
  maxPlayers: number
  currentPlayers: number
  timePerRound: number    // minutes
  hostName: string
  roomStatus: 'waiting' | 'playing' | 'finished'
  joinUrl: string
}

// ─── Intro Templates (by time period) ─────────────────────────────────

const introTemplates: Record<TimePeriod, string[]> = {
  morning: [
    'صباح الخير يا محارب ☀️ المعركة مستنياك!',
    'فطرت وعندك طاقة؟ 🔥 تعالى كَسّر الدنيا',
    'صباح الفل يا بطل 🌸 المعركة هتبدأ',
    'اصحى وصحّي معاك ⚔️ ساحة القتال فاتحة',
    'الصبح ده مناسب لمعركة كبيرة 💪',
    'نبهت بدري؟ كويس عشان المعركة مستنياك 🎯',
    'صباح الحلوين 🌅 تعال نحارب بعض!',
    'فياتك الصبح ومستني المنافسة 🏆',
  ],
  afternoon: [
    'بعد الظهر ده محتاج معركة 🔥 يلا بينا!',
    'الظهر حار والمنافسة أحلى ⚡',
    'فاضيك التعلّه؟ 👀 تعال نلعب معركة',
    'وقت القيلولة ولا وقت المعركة؟ 😈 يلا!',
    'الظهيرة دي ملهاش طعم بدون معركة 💥',
    'جرب حاجة تشعلل بكرة ☀️ ادخل الساحة',
    'بعد الأكل محتاج تشتغل شوية ⚔️ المعركة مستنياك',
    'الظهرده أحلى وقت للتحدي 🎯',
  ],
  evening: [
    'المسا ده أحلى وقت للمعركة 🌙 يلا!',
    'بعد المغرب نرتاح ولا نحارب؟ 😈 طبعاً نحارب',
    'مساء الخير يا محارب 🌆 الساحة مستنياك',
    'المسا ده مناسب مناخ المعارك 🔥',
    'المغرب فات والمعركة قربت 🏆 ادخل بسرعة',
    'مساء الفعال ⚔️ تعال نكسر بعض!',
    'وقت المساء أحلى وقت للمنافسة 💪',
    'المسا حلو والمعركة أحلى 🎯',
  ],
  late_night: [
    'سهرانين؟ 💀 أحسن عشان المعركة!',
    'الليل ده طويل والمعركة أطول 🌃 يلا!',
    'سهر ومعركة 🔥 أحلى مزاج',
    'مش نايم لسه؟ ⚔️ كويس عشان محتاجينك',
    'الساعة كده لكن المعركة مش بتنتظر 🎯',
    'برضه فايق؟ 😈 المعركة مستنياك',
    'سهراية والتحدي شغال 🌙 ادخل الساحة',
    'الليل ده محتاج معركة نارية 💥',
  ],
}

const weekendBonusIntros: string[] = [
  'إجازة ومناخ معركة 🔥 يلا!',
  'أحلى إجازة مع أحلى معركة ⚔️',
  'الإجازة دي محتاجة شوية حركة 💪',
  'إجازة بدون معركة ملهاش طعم 🎯',
  'يوم إجازة ويوم معركة 😈',
]

// ─── Situation Templates ───────────────────────────────────────────────

function getUrgencyLine(status: string, currentPlayers: number, maxPlayers: number): string {
  const remaining = maxPlayers - currentPlayers

  if (status === 'playing') {
    return '⏳ المعركة بدأت خلاص! ممكن متلحقش'
  }

  if (currentPlayers === 1) {
    const lines = [
      'ناككككككككككككككك لاعب واحد عشان نبدأ 😤',
      'مستنيينك بس إنت عشان نبدأ 🔥',
      'فاضل واحد وبنبدأ... يلا ادخل! ⚡',
      'ناكس لاعب واحد وهنبدا المعركة 🎯',
    ]
    return pickRandom(lines)
  }

  if (remaining === 1) {
    const lines = [
      'مكان واحد بس فاضل! 🏃‍♂️ اسرع',
      'فاضل مكان واحد يا بطل ⚡',
      'آخر مكان متاح! ادخل بسرعة 🔥',
      'مكان واحد بس وندخل المعركة 🎯',
    ]
    return pickRandom(lines)
  }

  if (remaining <= 3) {
    return `فاضل ${remaining} بس وهنبدا 🏃‍♂️`
  }

  if (currentPlayers === 0) {
    return 'الساحة فاضية... كن أول المحاربين 💪'
  }

  return 'الساحة فاتحة... ادخل قبل ما تتملى 🔥'
}

function getDifficultyLine(difficulty: string): string {
  switch (difficulty) {
    case 'سهل': return pickRandom([
      'مستوى سهل... بداية كويسة 👌',
      'سهلة يعني متفرج وبس؟ 😏',
      'مستوى خفيف عشان الإحماء 🔥',
    ])
    case 'متوسط': return pickRandom([
      'مستوى متوسط... محتاجين تركيز 🧠',
      'مش سهل ومش صعب... متوسط وزي الزفت 😤',
      'متوسط يعني محتاج دماغ 🎯',
    ])
    case 'صعب': return pickRandom([
      'مستوى صعب... مش للضعافا 💀',
      'الصعب ده مش هتقدر 😈',
      'مستوى ناري... جريء تدخل؟ 🔥',
      'صعب يعني محتاج محارب حقيقي ⚔️',
    ])
    default: return ''
  }
}

function getGameTypeLine(gameType: string, passageType?: string): string {
  if (gameType === 'قراءة متحررة') {
    if (passageType === 'علمي') {
      return pickRandom([
        '🔬 معركة قراءة علمية',
        '🧪 تحدي علمي مباشر',
        '🔬 معركة علمية وتحليلية',
      ])
    } else if (passageType === 'أدبي') {
      return pickRandom([
        '✒️ معركة قراءة أدبية',
        '📖 تحدي أدبي تعبيري',
        '✒️ معركة أدبية بلاغية',
      ])
    } else {
      return pickRandom([
        '📚 معركة قراءة متحررة',
        '📖 تحدي الفهم والاستنتاج',
        '📚 معركة القراءة الذكية',
      ])
    }
  } else if (gameType === 'نصوص') {
    return pickRandom([
      '📜 معركة النصوص الأدبية',
      '✍️ تحدي البلاغة والتذوق',
      '📜 معركة النصوص والتحليل',
    ])
  }
  return `🎮 ${gameType}`
}

function getPlayerLine(currentPlayers: number, maxPlayers: number): string {
  if (currentPlayers === 1) {
    return 'محارب واحد مستني ⏳'
  }
  if (currentPlayers >= maxPlayers) {
    return 'الساحة ممتلئة! 🏟️'
  }
  return `${currentPlayers} محاربين داخلين 🏟️`
}

// ─── Main Generator ────────────────────────────────────────────────────

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function generateInviteMessage(info: ShareRoomInfo): string {
  const period = getTimePeriod()
  const weekend = isWeekend()

  // 1. Intro line (time-aware, with weekend bonus)
  let intro: string
  if (weekend && Math.random() < 0.35) {
    intro = pickRandom(weekendBonusIntros)
  } else {
    intro = pickRandom(introTemplates[period])
  }

  // 2. Game type line
  const gameTypeLine = getGameTypeLine(info.gameType, info.passageType)

  // 2b. Passage type detail line (for قراءة متحررة)
  const passageTypeLine = info.gameType === 'قراءة متحررة' && info.passageType
    ? info.passageType === 'علمي'
      ? '🔬 قطع علمية وتحليلية'
      : info.passageType === 'أدبي'
        ? '✒️ قطع أدبية وتعبيرية'
        : '🎲 قطع متنوعة وعشوائية'
    : ''

  // 3. Player line
  const playerLine = getPlayerLine(info.currentPlayers, info.maxPlayers)

  // 4. Urgency / situation line
  const urgencyLine = getUrgencyLine(info.roomStatus, info.currentPlayers, info.maxPlayers)

  // 5. Difficulty line (optional, 50% chance to include)
  const difficultyLine = Math.random() < 0.5 ? getDifficultyLine(info.difficulty) : ''

  // 6. Room details
  const roomTypeEmoji = info.roomType === 'عامة' ? '🌍' : '🔒'
  const roomTypeLabel = info.roomType === 'عامة' ? 'ساحة عامة' : 'ساحة خاصة'
  const passwordNote = info.hasPassword ? ' 🔑' : ''

  // 7. Assemble message
  const lines: string[] = [
    intro,
    '',
    gameTypeLine,
    `${roomTypeEmoji} ${roomTypeLabel}${passwordNote}`,
    playerLine,
    `⚡ ${info.difficulty}${info.gameType === 'قراءة متحررة' && info.passageType ? ' • ' + (info.passageType === 'علمي' ? 'علمي' : info.passageType === 'أدبي' ? 'أدبي' : 'عشوائي') : ''} • ${info.numberOfRounds} جولات • ${info.timePerRound} دقيقة`,
    urgencyLine,
    '',
    `🔗 ${info.joinUrl}`,
    '',
    '⚔️ معركة الأسئلة',
  ]

  if (difficultyLine) {
    lines.splice(6, 0, difficultyLine)
  }
  if (passageTypeLine) {
    lines.splice(3, 0, passageTypeLine)
  }

  return lines.join('\n')
}

// ─── Short Message (for SMS/character-limited) ─────────────────────────

export function generateShortInvite(info: ShareRoomInfo): string {
  const period = getTimePeriod()
  const intro = pickRandom(introTemplates[period])

  const remaining = info.maxPlayers - info.currentPlayers
  const statusPart = remaining > 0 && info.roomStatus === 'waiting'
    ? `فاضل ${remaining} مكان`
    : info.roomStatus === 'playing'
      ? 'اللعبة بدأت!'
      : 'الساحة فاتحة'

  return `${intro}\n⚔️ ${info.gameType}${info.gameType === 'قراءة متحررة' && info.passageType ? ' • ' + info.passageType : ''} • ${info.difficulty}\n${statusPart}\n🔗 ${info.joinUrl}`
}

// ─── WhatsApp-specific format ───────────────────────────────────────────

export function generateWhatsAppInvite(info: ShareRoomInfo): string {
  // WhatsApp renders plain text nicely with emojis
  return generateInviteMessage(info)
}

// ─── Telegram-specific format ───────────────────────────────────────────

export function generateTelegramInvite(info: ShareRoomInfo): string {
  // Telegram supports bold with *text*
  const period = getTimePeriod()
  const intro = pickRandom(introTemplates[period])
  const remaining = info.maxPlayers - info.currentPlayers
  const playerLine = getPlayerLine(info.currentPlayers, info.maxPlayers)
  const urgencyLine = getUrgencyLine(info.roomStatus, info.currentPlayers, info.maxPlayers)

  return [
    intro,
    '',
    `*${info.gameType}${info.gameType === 'قراءة متحررة' && info.passageType ? ' • ' + info.passageType : ''}* • ${info.difficulty} • ${info.numberOfRounds} جولات`,
    `${info.roomType === 'عامة' ? '🌍' : '🔒'} ${info.roomType === 'عامة' ? 'ساحة عامة' : 'ساحة خاصة'}${info.hasPassword ? ' 🔑' : ''}`,
    playerLine,
    urgencyLine,
    '',
    `🔗 ${info.joinUrl}`,
    '',
    '⚔️ *معركة الأسئلة*',
  ].join('\n')
}
