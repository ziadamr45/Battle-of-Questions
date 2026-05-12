'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOnboardingStore } from '@/lib/onboarding-store'

// ─── Tips Collection ──────────────────────────────────────────────────────────

interface ArenaTip {
  text: string
  context: 'loading' | 'lobby' | 'game' | 'results' | 'round-transition'
}

const ARENA_TIPS: ArenaTip[] = [
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
]

// ─── Component Props ──────────────────────────────────────────────────────────

interface ArenaTipsProps {
  context: 'loading' | 'lobby' | 'game' | 'results' | 'round-transition'
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

// ─── Helper: Get tips for a context ───────────────────────────────────────────

function getContextTips(context: ArenaTipsProps['context']): ArenaTip[] {
  const contextTips = ARENA_TIPS.filter((tip) => tip.context === context)
  return contextTips.length > 0 ? contextTips : ARENA_TIPS
}

// ─── ArenaTips Component ──────────────────────────────────────────────────────

export function ArenaTips({ context }: ArenaTipsProps) {
  // Compute initial tip from context using useMemo
  const initialTip = useMemo(() => {
    const tips = getContextTips(context)
    const idx = Math.floor(Math.random() * tips.length)
    return { tip: tips[idx] ?? null, index: idx }
  }, [context])

  const [currentIndex, setCurrentIndex] = useState(initialTip.index)
  const [visibleTip, setVisibleTip] = useState<ArenaTip | null>(initialTip.tip)
  const incrementCalledRef = useRef<Set<number>>(new Set(initialTip.tip ? [initialTip.index] : []))

  // ─── FIX Medium 1: Use useEffect instead of setState during render ───
  // When context changes, reset to a new random tip via useEffect (not during render)
  const prevContextRef = useRef(context)
  useEffect(() => {
    if (prevContextRef.current !== context) {
      prevContextRef.current = context
      const tips = getContextTips(context)
      const idx = Math.floor(Math.random() * tips.length)
      const newTip = tips[idx] ?? null
      setCurrentIndex(idx)
      setVisibleTip(newTip)
      incrementCalledRef.current = new Set(idx >= 0 ? [idx] : [])
    }
  }, [context])

  // ─── FIX Medium 2: Use ref for currentIndex so interval stays stable ───
  // Track currentIndex in a ref so the interval doesn't restart on every tip change
  const currentIndexRef = useRef(currentIndex)
  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])

  // Rotate tips every 5 seconds — interval is stable (no currentIndex dependency)
  useEffect(() => {
    const interval = setInterval(() => {
      const tips = getContextTips(context)
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
  }, [context]) // Only restart when context changes, not on every tip change

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
