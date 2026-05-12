'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOnboardingStore } from '@/lib/onboarding-store'

// ─── Tips Collection ──────────────────────────────────────────────────────────

interface ArenaTip {
  text: string
  context: 'loading' | 'lobby' | 'game' | 'results' | 'round-transition'
  mode?: 'solo' | 'team' | 'any'  // Which battle mode this tip is relevant for
}

const ARENA_TIPS: ArenaTip[] = [
  // ─── General / Philosophy ──────────────────────────────────────────────────
  { text: 'كل ثانية قد تغيّر نتيجة المعركة', context: 'loading' },
  { text: 'التركيز يهزم السرعة أحيانًا', context: 'loading' },
  { text: 'لا تثق بسهولة في ترتيبك', context: 'loading' },
  { text: 'المعركة مش بس عن الإجابات… عن الاستراتيجية', context: 'lobby' },
  { text: 'اختر وقتك بحكمة… الوقت أسرع مما تتصور', context: 'game' },
  { text: 'كل إجابة خاطئة درس جديد', context: 'results' },
  { text: 'القراءة السريعة مهارة تُكتسب بالمعركة', context: 'loading' },
  { text: 'حتى أقوى المحاربين يخسرون أحيانًا', context: 'results' },
  { text: 'المنافسة الحقيقية تبدأ عندما يبدأ العد التنازلي', context: 'loading' },
  { text: 'لا تستعجل الإجابة… لكن لا تنتظر كثيرًا', context: 'game' },
  { text: 'المعرفة سلاح… والسرعة هي الزناد', context: 'loading' },
  { text: 'الفوز في جولة لا يعني الفوز في المعركة', context: 'round-transition' },
  { text: 'أفضل المحاربين يعرفون متى يتباطئون', context: 'game' },
  { text: 'الساحة لا ترحم المترددين', context: 'lobby' },
  { text: 'كل معركة جديدة فرصة لإثبات نفسك', context: 'loading' },
  { text: 'الخبرة تأتي من المعارك… ليس من الانتظار', context: 'lobby' },
  { text: 'التركيز في اللحظة الأخيرة قد يقلب النتيجة', context: 'game' },
  { text: 'لا تحكم على المعركة من جولة واحدة', context: 'round-transition' },
  { text: 'المحارب الذكي يقرأ السؤال قبل الخيارات', context: 'game' },
  { text: 'الصبر في القراءة أسرع من التسرع في الإجابة', context: 'game' },

  // ─── Core Game Philosophy (emphasized) ─────────────────────────────────────
  { text: 'النتائج لا تظهر مباشرة… الحقيقة تكشف بعد الجولة', context: 'game' },
  { text: 'السرعة وحدها لا تكفي… التركيز هو المفتاح', context: 'loading' },
  { text: 'لا تنخدع بسهولة الأسئلة… الإجابة الصحيحة تحتاج تفكير', context: 'game' },
  { text: 'في المعركة… الشك أحيانًا أفضل من التسرع', context: 'game' },

  // ─── Team System Tips ─────────────────────────────────────────────────────
  { text: 'القائد يستطيع إدارة فرقته والتحكم في بداية المعركة', context: 'lobby', mode: 'team' },
  { text: 'يمكنك طلب الانضمام إلى أي فريق… القائد يوافق أو يرفض', context: 'lobby', mode: 'team' },
  { text: 'في وضع الفرق… النقاط تُحسب للفريق ككل', context: 'game', mode: 'team' },
  { text: 'الفريق المتناسق يهزم الفريق الأقوى', context: 'lobby', mode: 'team' },
  { text: 'غيّر فريقك من خلال طلب تبديل للقائد', context: 'lobby', mode: 'team' },
  { text: 'الغير مصنف لا يتبع أي فريق… انضم لفريق للمشاركة', context: 'lobby', mode: 'team' },
  { text: 'كل فريق يحتاج قائد يوجّه ويدير المعركة', context: 'lobby', mode: 'team' },
  { text: 'أسماء الفرق يمكن تغييرها من قبل القائد', context: 'lobby', mode: 'team' },
  { text: 'الفوز الجماعي أقوى من الفوز الفردي', context: 'results', mode: 'team' },
  { text: 'في الفرق… كل إجابة صحيحة تضيف لرصيد فريقك', context: 'game', mode: 'team' },
  { text: 'إذا انقطع قائد الفريق… يتم تعيين قائد جديد تلقائيًا', context: 'lobby', mode: 'team' },

  // ─── Captain-Specific Tips ────────────────────────────────────────────────
  { text: 'القائد لا يضغط جاهز… هو يراقب ويبدأ بعد استعداد الجميع', context: 'round-transition', mode: 'team' },
  { text: 'القائد يوافق على تعديل الإعدادات أثناء المعركة', context: 'lobby', mode: 'team' },
  { text: 'كقائد… راقب استعداد مقاتليك وابدأ في الوقت المناسب', context: 'round-transition', mode: 'team' },
  { text: 'القائد يمكنه قبول أو رفض طلبات الانضمام', context: 'lobby', mode: 'team' },

  // ─── Chat & Communication Tips ────────────────────────────────────────────
  { text: 'بعض الرسائل لا يراها إلا فريقك', context: 'lobby', mode: 'team' },
  { text: 'الدردشة العامة يراها الجميع… الخاصة بفريقك فقط', context: 'lobby', mode: 'team' },
  { text: 'استخدم الدردشة للتنسيق مع فريقك قبل المعركة', context: 'lobby', mode: 'team' },
  { text: 'الرسائل الخاصة تصل لشخص واحد فقط', context: 'lobby' },
  { text: 'تواصل مع فريقك بالدردشة أو الصوت', context: 'lobby', mode: 'team' },

  // ─── Voice Chat Tips ──────────────────────────────────────────────────────
  { text: 'المحادثة الصوتية خاصة بفريقك… الفريق الآخر لا يسمعكم', context: 'lobby', mode: 'team' },
  { text: 'يمكن للقادة دمج المحادثة الصوتية بين الفريقين بالموافقة', context: 'lobby', mode: 'team' },
  { text: 'اضغط على الميكروفون لتفعيل الصوت', context: 'lobby', mode: 'team' },

  // ─── Ready System Tips ────────────────────────────────────────────────────
  { text: 'المقاتلون يضغطون جاهز… القائد يبدأ الجولة', context: 'round-transition', mode: 'team' },
  { text: 'لا تنسَ تضغط جاهز بعد كل جولة', context: 'round-transition' },
  { text: 'القائد لا يضغط جاهز… هو يراقب الاستعداد ويبدأ', context: 'round-transition', mode: 'team' },
  { text: 'استعد بسرعة… القائد يمكنه بدء الجولة في أي وقت', context: 'round-transition' },

  // ─── Settings & Approval Tips ─────────────────────────────────────────────
  { text: 'تعديل الإعدادات أثناء المعركة يحتاج موافقة القائد الآخر', context: 'lobby', mode: 'team' },
  { text: 'يمكنك تعديل إعدادات المعركة حتى أثناء وجود مقاتلين', context: 'lobby' },
  { text: 'القائد يمكنه طلب إنهاء المعركة مبكرًا بالموافقة', context: 'game', mode: 'team' },

  // ─── Battle History Tips ──────────────────────────────────────────────────
  { text: 'راجع معاركك السابقة من سجل المعارك', context: 'results' },
  { text: 'كل معركة تضاف لسجلك… تعلّم من أخطائك', context: 'results' },
]

// ─── Component Props ──────────────────────────────────────────────────────────

interface ArenaTipsProps {
  context: 'loading' | 'lobby' | 'game' | 'results' | 'round-transition'
  battleMode?: 'فردي' | 'فرق'
}

// ─── Animation Variants ───────────────────────────────────────────────────────

const tipVariants = {
  initial: {
    opacity: 0,
    y: 4,
    filter: 'blur(4px)',
  },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      duration: 0.8,
      ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
    },
  },
  exit: {
    opacity: 0,
    y: -4,
    filter: 'blur(4px)',
    transition: {
      duration: 0.6,
      ease: [0.55, 0.06, 0.68, 0.19] as [number, number, number, number],
    },
  },
}

// ─── Helper: Get tips for a context and mode ──────────────────────────────────

function getContextTips(context: ArenaTipsProps['context'], battleMode?: 'فردي' | 'فرق'): ArenaTip[] {
  const isTeamMode = battleMode === 'فرق'
  
  // Filter tips: show mode-specific tips only in their mode, and 'any' mode tips always
  const contextTips = ARENA_TIPS.filter((tip) => {
    if (tip.context !== context) return false
    if (tip.mode === 'team' && !isTeamMode) return false
    if (tip.mode === 'solo' && isTeamMode) return false
    return true
  })
  
  return contextTips.length > 0 ? contextTips : ARENA_TIPS.filter(tip => tip.context === context)
}

// ─── ArenaTips Component ──────────────────────────────────────────────────────

export function ArenaTips({ context, battleMode }: ArenaTipsProps) {
  // Compute initial tip from context using useMemo
  const initialTip = useMemo(() => {
    const tips = getContextTips(context, battleMode)
    const idx = Math.floor(Math.random() * tips.length)
    return { tip: tips[idx] ?? null, index: idx }
  }, [context, battleMode])

  const [currentIndex, setCurrentIndex] = useState(initialTip.index)
  const [visibleTip, setVisibleTip] = useState<ArenaTip | null>(initialTip.tip)
  const incrementCalledRef = useRef<Set<number>>(new Set(initialTip.tip ? [initialTip.index] : []))

  // When context or battleMode changes, reset to a new random tip via useEffect
  const prevContextRef = useRef(context)
  const prevModeRef = useRef(battleMode)
  useEffect(() => {
    if (prevContextRef.current !== context || prevModeRef.current !== battleMode) {
      prevContextRef.current = context
      prevModeRef.current = battleMode
      const tips = getContextTips(context, battleMode)
      const idx = Math.floor(Math.random() * tips.length)
      const newTip = tips[idx] ?? null
      setCurrentIndex(idx)
      setVisibleTip(newTip)
      incrementCalledRef.current = new Set(idx >= 0 ? [idx] : [])
    }
  }, [context, battleMode])

  // Track currentIndex in a ref so the interval doesn't restart on every tip change
  const currentIndexRef = useRef(currentIndex)
  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  // Rotate tips every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const tips = getContextTips(context, battleMode)
      let nextIdx: number
      if (tips.length <= 1) {
        nextIdx = 0
      } else {
        do {
          nextIdx = Math.floor(Math.random() * tips.length)
        } while (nextIdx === currentIndexRef.current && tips.length > 1)
      }
      const nextTip = tips[nextIdx] ?? null
      if (nextTip) {
        setCurrentIndex(nextIdx)
        setVisibleTip(nextTip)
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [context, battleMode])

  // Increment tips seen counter in onboarding store
  useEffect(() => {
    if (visibleTip && !incrementCalledRef.current.has(currentIndex)) {
      incrementCalledRef.current.add(currentIndex)
      try {
        useOnboardingStore.getState().incrementTipsSeen()
      } catch {
        // Store not available yet
      }
    }
  }, [visibleTip, currentIndex])

  if (!visibleTip) return null

  return (
    <div
      className="w-full flex justify-center pointer-events-none select-none"
      dir="rtl"
    >
      <div className="max-w-md text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${context}-${currentIndex}-${visibleTip.text}`}
            variants={tipVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="flex items-center justify-center gap-2"
          >
            <span className="text-white/20 text-sm">⚔</span>
            <span className="text-white/30 text-sm font-medium leading-relaxed">
              {visibleTip.text}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
