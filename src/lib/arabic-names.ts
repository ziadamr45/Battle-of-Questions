// Arabic warrior/arena-themed name generator
// Generates modern, game-like Arabic names — NOT cringe or childish

const prefixes = [
  'أسد',      // Lion
  'صقر',      // Falcon
  'ذئب',      // Wolf
  'نمر',      // Tiger
  'شاهين',    // Peregrine
  'عقاب',     // Eagle
  'فهد',      // Cheetah
  'ثعلب',     // Fox
  'كوبرا',    // Cobra
  'تنين',     // Dragon
  'رعد',      // Thunder
  'برق',      // Lightning
  'نار',      // Fire
  'سيف',      // Sword
  'رمح',      // Spear
  'قناص',     // Sniper
  'فارس',     // Knight
  'محارب',    // Warrior
  'مقاتل',    // Fighter
  'صاعقة',    // Thunderbolt
  'عاصفة',    // Storm
  'زعيم',     // Leader
  'بطل',      // Hero
  'مختار',    // Chosen
  'قائد',     // Commander
  'حارس',     // Guardian
  'درع',      // Shield
  'ظل',       // Shadow
  'شبح',      // Ghost
  'سهم',      // Arrow
]

const suffixes = [
  'الصحراء',  // of the Desert
  'الليل',    // of the Night
  'النار',    // of Fire
  'الحرب',    // of War
  'المعركة',  // of Battle
  'الظلام',   // of Darkness
  'القمة',    // of the Peak
  'الفناء',   // of Oblivion
  'الساحة',   // of the Arena
  'الشمال',   // of the North
  'الجنوب',   // of the South
  'الشرق',    // of the East
  'الغرب',    // of the West
  'الفضاء',   // of Space
  'البرد',    // of the Cold
  'الدمار',   // of Destruction
  'المجهول',  // of the Unknown
  'الأسطورة', // the Legend
  'العاصفة',  // the Storm
  'الخالد',   // the Immortal
  'الأول',    // the First
  'الموحش',   // the Fierce
  'الجبار',   // the Almighty
  'الخطير',   // the Dangerous
  'الشرس',    // the Ferocious
]

// Shorter, punchier names — single-word warrior names
const singleNames = [
  'سلطان',     // Sultan
  'غزال',      // Gazelle
  'هيام',      // Passion
  'وثاب',      // Leaper
  'هادر',      // Roaring
  'قاهر',      // Conqueror
  'صامد',      // Resilient
  'شديد',      // Fierce
  'عزيز',      // Mighty
  'كريم',      // Generous/Noble
  'حمزة',      // Lion-like
  'طارق',      // Striker
  'خالد',      // Eternal
  'عباس',      // Lion
  'عمر',       // Life/Long-lived
  'حاتم',      // Judge/Decisive
  'عنتر',      // Panther-like (legendary warrior)
  'سيف',       // Sword
  'مهند',      // Sword of India
  'راشد',      // Rightly-guided
]

// Gamertag-style names — numbers and short combos
const gamertagNames = [
  'xحاربx',
  'فارس_999',
  'أسد_X',
  'ذئب_الليل',
  'صقر_7',
  'ظل_المعركة',
  'رعد_X',
  'شبح_3',
  'نار_1',
  'سيف_القمة',
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function generateRandomArabicName(): string {
  const style = Math.random()

  if (style < 0.35) {
    // Prefix + Suffix combo (e.g., "أسد الصحراء")
    return `${pickRandom(prefixes)} ${pickRandom(suffixes)}`
  } else if (style < 0.7) {
    // Single warrior name
    return pickRandom(singleNames)
  } else if (style < 0.9) {
    // Two-prefix combo (e.g., "رعد النمر")
    return `${pickRandom(prefixes)} ${pickRandom(prefixes.filter(p => p.length <= 4))}`
  } else {
    // Gamertag style
    return pickRandom(gamertagNames)
  }
}

// Generate multiple unique names
export function generateMultipleNames(count: number = 3): string[] {
  const names = new Set<string>()
  let attempts = 0
  while (names.size < count && attempts < 30) {
    names.add(generateRandomArabicName())
    attempts++
  }
  return Array.from(names)
}

// ============================================
// TEAM NAME GENERATOR — معركة الأسئلة
// Battle-oriented, competitive, modern Arabic team names
// ============================================

// Single-word power names — short, punchy, faction-like
const teamSingleNames = [
  // Predators & beasts
  'الصقور',       // The Falcons
  'الذئاب',       // The Wolves
  'النسور',       // The Eagles
  'النمور',       // The Tigers
  'الأسود',       // The Lions
  'العقبان',      // The Eagles (dual)
  'الأفاعي',      // The Snakes
  'الفرسان',      // The Knights
  'الصيادون',     // The Hunters
  'الكواسر',      // The Predators

  // Forces of nature
  'العاصفة',      // The Storm
  'البراكين',     // The Volcanoes
  'الزلازل',      // The Earthquakes
  'الأعاصير',     // The Hurricanes
  'الصواعق',      // The Thunderbolts
  'السيول',       // The Floods
  'الرعود',       // The Thunders
  'البروق',       // The Lightnings
  'النيران',      // The Fires
  'اللهيب',       // The Flames

  // Combat & power
  'النخبة',       // The Elite
  'القناصة',      // The Snipers
  'الشبح',        // The Ghost
  'الأشباح',      // The Ghosts
  'الظلال',       // The Shadows
  'الحراس',       // The Guardians
  'الفرسان',      // The Cavalry
  'الغزاة',       // The Invaders
  'الفتوح',       // The Conquerors
  'الطامحون',     // The Ambitious
  'الجزارين',     // The Butchers
  'القاهرون',     // The Conquerors
  'الصامدون',     // The Resilient
  'المحاربون',    // The Warriors
  'المقاتلون',    // The Fighters
  'المنتصرون',    // The Victorious
  'المغوارون',    // The Daring
  'العقاب',       // The Revenge
  'الدمار',       // The Destruction
  'الهجوم',       // The Attack

  // Intelligence & strategy
  'العقول',       // The Minds
  'العباقرة',     // The Geniuses
  'الاستراتيجيون', // The Strategists
  'الأذكياء',     // The Smart Ones
  'الحواة',       // The Snake-charmers (clever)

  // Dominance & glory
  'العرش',        // The Throne
  'التاج',        // The Crown
  'المجد',        // The Glory
  'السيادة',      // The Dominance
  'السطوة',       // The Authority
  'الريادة',      // The Leadership
  'القمة',        // The Peak
  'الصدارة',      // The Forefront
  'الصولجان',     // The Scepter

  // Darkness & mystery
  'الظلام',       // The Darkness
  'الليل',        // The Night
  'السحاب',       // The Clouds
  'الضباب',       // The Fog
  'السراب',       // The Mirage
  'الكهف',        // The Cave

  // Metal & weapons
  'السيوف',       // The Swords
  'الرماح',       // The Spears
  'السهام',       // The Arrows
  'الدروع',       // The Shields
  'الخناجر',      // The Daggers
  'الحراب',       // The Spears
  'القناة',       // The Channel/Weapon

  // Intensity & energy
  'الحماس',       // The Enthusiasm
  'الشرر',        // The Sparks
  'الجمر',        // The Embers
  'الوهج',        // The Blaze
  'الشعلة',       // The Torch
  'النبض',        // The Pulse
  'الزئير',       // The Roar
  'الكفاح',       // The Struggle
  'العزيمة',      // The Determination

  // Modern competitive
  'الكونغرس',     // The Congress
  'السنيورز',     // The Seniors (elite)
  'الأبطال',      // The Champions
  'النجوم',       // The Stars
  'العمالقة',     // The Giants
  'الأساطير',     // The Legends
  'الوحوش',       // The Monsters
  'الأروقة',      // The Corridors (arena halls)
]

// Prefix + Suffix combos — "The X of Y" style
const teamPrefixes = [
  'أبناء',       // Sons of
  'فرسان',       // Knights of
  'حراس',        // Guardians of
  'سادة',        // Masters of
  'أمراء',       // Princes of
  'ملوك',        // Kings of
  'أسياد',       // Lords of
  'جنود',        // Soldiers of
  'ورثة',        // Heirs of
  'أنصار',       // Supporters of
  'فرقة',        // Squad of
  'كتيبة',       // Battalion of
  'عصابة',       // Gang of
  'رابطة',       // League of
  'لواء',        // Brigade of
]

const teamSuffixes = [
  'النار',       // Fire
  'الحرب',       // War
  'المعركة',     // Battle
  'العاصفة',     // The Storm
  'الظلام',      // Darkness
  'الليل',       // The Night
  'الدمار',      // Destruction
  'الفناء',      // Oblivion
  'الجحيم',      // Hell
  'الصحراء',     // The Desert
  'البرق',       // Lightning
  'الرعد',       // Thunder
  'الغضب',       // Fury
  'الموت',       // Death
  'الخطر',       // Danger
  'القوة',       // Power
  'الشرف',       // Honor
  'المجد',       // Glory
  'الدم',        // Blood
  'النصر',       // Victory
  'الصلب',       // Steel
  'الحديد',      // Iron
  'الفضاء',      // Space
  'الجليد',      // Ice
  'الزمن',       // Time
  'السراب',      // Mirage
  'الهاوية',     // The Abyss
  'الأشباح',     // Ghosts
  'الخالدين',    // The Immortals
  'المجهول',     // The Unknown
]

// Track recently generated team names to avoid repeats
let recentTeamNames: string[] = []
const MAX_RECENT = 20

export function generateRandomTeamName(): string {
  const style = Math.random()
  let name: string

  if (style < 0.45) {
    // Single power name — most common, punchiest
    name = pickRandom(teamSingleNames)
  } else if (style < 0.8) {
    // Prefix + Suffix combo (e.g., "فرسان النار")
    const prefix = pickRandom(teamPrefixes)
    const suffix = pickRandom(teamSuffixes)
    name = `${prefix} ${suffix}`
  } else if (style < 0.95) {
    // "الـ" + aggressive noun — definite article power
    const powerNouns = [
      'عاصفة', 'صاعقة', 'زلزال', 'بركان', 'إعصار',
      'هجوم', 'غارة', 'كتلة', 'قوة', 'ضربة',
    ]
    name = `ال${pickRandom(powerNouns)}`
  } else {
    // Short tactical code name
    const codeNames = [
      'فالكون', 'كوبرا', 'رابتور', 'تايفون', 'فينيكس',
      'سبارتان', 'فايكنج', 'ساموراي', 'تيتان', 'أولمبوس',
      'كلاود', 'شادو', 'ستورم', 'بلاك آوت', 'فيرنوم',
    ]
    name = pickRandom(codeNames)
  }

  // Avoid exact repetition from recent names
  if (recentTeamNames.includes(name)) {
    // Try once more
    return generateRandomTeamName()
  }

  // Track recently generated names
  recentTeamNames.push(name)
  if (recentTeamNames.length > MAX_RECENT) {
    recentTeamNames = recentTeamNames.slice(-MAX_RECENT)
  }

  return name
}

// Reset recent names tracker (useful when leaving a room)
export function resetTeamNameTracker(): void {
  recentTeamNames = []
}

// Avatar color palette — battle/arena themed
const avatarColors = [
  '#DC2626', // Red-600
  '#EA580C', // Orange-600
  '#D97706', // Amber-600
  '#059669', // Emerald-600
  '#0891B2', // Cyan-600
  '#7C3AED', // Violet-600
  '#DB2777', // Pink-600
  '#E11D48', // Rose-600
  '#4F46E5', // Indigo-600
  '#0D9488', // Teal-600
  '#CA8A04', // Yellow-600
  '#9333EA', // Purple-600
]

export function getRandomAvatarColor(): string {
  return pickRandom(avatarColors)
}
