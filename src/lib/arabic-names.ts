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
