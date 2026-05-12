'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOnboardingStore, shouldShowGameplayHints, type GameplayHintType } from '@/lib/onboarding-store'
import { audioEngine } from '@/lib/audio-engine'
import { X } from 'lucide-react'

// ─── Hint Configuration ──────────────────────────────────────────────────────

interface HintConfig {
  text: string
  duration: number // ms
  isDramatic: boolean // larger text, more glow, slower fade
  glowClass: string
}

const HINT_CONFIG: Record<GameplayHintType, HintConfig> = {
  timer: {
    text: 'الوقت بيعدّي… خلّي تركيزك عالي',
    duration: 4000,
    isDramatic: false,
    glowClass: 'shadow-amber-500/10',
  },
  readingArea: {
    text: 'اقرأ النص كويس… الأسئلة جاية منه',
    duration: 4000,
    isDramatic: false,
    glowClass: 'shadow-amber-500/10',
  },
  answerArea: {
    text: 'اختار إجابتك… بس متعرفش صح ولا غلط لحد ما الجولة تخلص',
    duration: 4000,
    isDramatic: false,
    glowClass: 'shadow-red-500/20',
  },
  leaderboard: {
    text: 'الترتيب ممكن يتغير في أي لحظة',
    duration: 4000,
    isDramatic: false,
    glowClass: 'shadow-amber-500/10',
  },
  roundTransition: {
    text: 'كل جولة جديدة… فرصة جديدة للفوز',
    duration: 4000,
    isDramatic: false,
    glowClass: 'shadow-amber-500/10',
  },
  noImmediateAnswers: {
    text: 'في معركة الأسئلة… مفيش إجابات فورية. النتيجة بتظهر بعد الجولة',
    duration: 6000,
    isDramatic: true,
    glowClass: 'shadow-red-500/20',
  },
  captainMonitor: {
    text: 'أنت القائد… راقب استعداد فريقك وابدأ الجولة لما الكل يكون جاهز',
    duration: 5000,
    isDramatic: false,
    glowClass: 'shadow-emerald-500/15',
  },
  teamChat: {
    text: 'الدردشة متاحة… تواصل مع فريقك بالدردشة العامة أو الخاصة بفريقك',
    duration: 4500,
    isDramatic: false,
    glowClass: 'shadow-violet-500/10',
  },
  teamScore: {
    text: 'نتيجة فريقك تظهر هنا… كل إجابة صحيحة تضيف لرصيد الفريق',
    duration: 4500,
    isDramatic: false,
    glowClass: 'shadow-amber-500/10',
  },
  joinRequest: {
    text: 'للانضمام لفريق… اضغط على الفريق وأرسل طلب للقائد',
    duration: 5000,
    isDramatic: false,
    glowClass: 'shadow-cyan-500/10',
  },
}

// ─── Hint Queue State (module-level, not React state) ─────────────────────────

interface HintItem {
  id: string
  type: GameplayHintType
}

let hintQueue: HintItem[] = []
let isShowingHint = false
let listeners: Set<() => void> = new Set()

function emitChange() {
  listeners.forEach((fn) => fn())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): HintItem | null {
  return hintQueue.length > 0 ? hintQueue[0]! : null
}

function enqueueHint(type: GameplayHintType): void {
  // Check if gameplay hints should be shown
  if (!shouldShowGameplayHints()) return

  // Check if this hint was already shown
  const state = useOnboardingStore.getState()
  const keyMap: Record<GameplayHintType, keyof typeof state> = {
    timer: 'timerHintShown',
    readingArea: 'readingAreaHintShown',
    answerArea: 'answerAreaHintShown',
    leaderboard: 'leaderboardHintShown',
    roundTransition: 'roundTransitionHintShown',
    noImmediateAnswers: 'noImmediateAnswersHintShown',
    captainMonitor: 'captainMonitorHintShown',
    teamChat: 'teamChatHintShown',
    teamScore: 'teamScoreHintShown',
    joinRequest: 'joinRequestHintShown',
  }
  const key = keyMap[type]
  if (state[key]) return // Already shown

  // Don't add duplicates
  if (hintQueue.some((h) => h.type === type)) return

  // Max queue size: 3 (drop oldest if full, but keep the currently showing one)
  if (hintQueue.length >= 3) {
    // Remove oldest non-showing item
    if (hintQueue.length > 1) {
      hintQueue.splice(1, 1) // Remove second item (first is currently showing)
    } else {
      return // Queue full with showing item
    }
  }

  hintQueue.push({ id: `hint-${Date.now()}-${type}`, type })
  emitChange()
}

function dequeueHint(): void {
  hintQueue.shift()
  isShowingHint = false
  emitChange()
}

function setShowingHint(value: boolean): void {
  isShowingHint = value
}

// ─── Imperative API ──────────────────────────────────────────────────────────

export function showGameplayHint(hint: GameplayHintType): void {
  enqueueHint(hint)
}

// ─── Single Hint Card ────────────────────────────────────────────────────────

function GameplayHintCard({ hint, onDismiss }: { hint: HintItem; onDismiss: () => void }) {
  const config = HINT_CONFIG[hint.type]
  const [progress, setProgress] = useState(100)
  const startTimeRef = useRef(Date.now())
  const rafRef = useRef<number>(0)
  const isPausedRef = useRef(false)
  const dismissedRef = useRef(false)
  const onDismissRef = useRef(onDismiss)

  // Keep onDismiss ref up to date
  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  const handleDismiss = useCallback(() => {
    if (dismissedRef.current) return
    dismissedRef.current = true
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    onDismissRef.current()
  }, [])

  // Mark hint as shown in the store
  useEffect(() => {
    useOnboardingStore.getState().showGameplayHint(hint.type)
  }, [hint.type])

  // Play subtle sound on mount
  useEffect(() => {
    try {
      audioEngine.buttonClick()
    } catch {
      // Audio not initialized yet
    }
  }, [])

  // Animate progress bar
  useEffect(() => {
    startTimeRef.current = Date.now()
    const duration = config.duration

    const tick = () => {
      if (dismissedRef.current) return
      if (isPausedRef.current) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      const elapsed = Date.now() - startTimeRef.current
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)
      if (remaining <= 0) {
        handleDismiss()
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [hint.id, config.duration, handleDismiss])

  // Pause on hover/touch
  const handlePointerEnter = useCallback(() => {
    isPausedRef.current = true
  }, [])

  const handlePointerLeave = useCallback(() => {
    if (!startTimeRef.current) return
    // Adjust start time so progress continues smoothly after pause
    const elapsed = Date.now() - startTimeRef.current
    const duration = config.duration
    const remaining = duration - elapsed
    // Extend by 2 seconds on hover leave
    startTimeRef.current = Date.now() - (duration - remaining) + 2000
    isPausedRef.current = false
  }, [config.duration])

  // Animation variants based on dramatic vs regular
  const enterDuration = config.isDramatic ? 0.6 : 0.35
  const exitDuration = config.isDramatic ? 0.5 : 0.3

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{
        duration: enterDuration,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className="w-full max-w-md mx-auto"
    >
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{
          duration: exitDuration,
          ease: 'easeInOut',
        }}
        className={`relative overflow-hidden rounded-xl border border-white/10 bg-[#0E0E18]/90 backdrop-blur-md ${config.glowClass} cursor-default select-none`}
        style={{
          boxShadow: config.isDramatic
            ? '0 0 30px rgba(220,38,38,0.15), 0 0 60px rgba(220,38,38,0.05)'
            : '0 0 20px rgba(245,158,11,0.08), 0 0 40px rgba(245,158,11,0.03)',
        }}
        dir="rtl"
      >
        {/* Progress bar (bottom edge) */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/[0.03]">
          <motion.div
            className={`h-full ${
              config.isDramatic
                ? 'bg-gradient-to-l from-red-500 to-red-500/0'
                : 'bg-gradient-to-l from-amber-500 to-amber-500/0'
            }`}
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.1, ease: 'linear' }}
          />
        </div>

        {/* Content */}
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Text */}
          <div className="flex-1 min-w-0 text-right">
            <span
              className={`${
                config.isDramatic
                  ? 'text-base font-bold leading-relaxed'
                  : 'text-sm font-medium leading-relaxed'
              } text-white/90`}
            >
              {config.text}
            </span>
          </div>

          {/* Dismiss button */}
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-white/20 hover:text-white/60 hover:bg-white/5 transition-colors"
            aria-label="إغلاق التلميح"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Dramatic hint gets an extra glow layer */}
        {config.isDramatic && (
          <motion.div
            className="absolute inset-0 pointer-events-none rounded-xl"
            initial={{ opacity: 0.3 }}
            animate={{ opacity: [0.15, 0.25, 0.15] }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              boxShadow: 'inset 0 0 30px rgba(220,38,38,0.05)',
            }}
          />
        )}

        {/* Subtle energy flash on entry */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{
            background: config.isDramatic
              ? 'linear-gradient(90deg, transparent, rgba(220,38,38,0.06), transparent)'
              : 'linear-gradient(90deg, transparent, rgba(245,158,11,0.04), transparent)',
          }}
        />
      </motion.div>
    </motion.div>
  )
}

// ─── Provider Component ──────────────────────────────────────────────────────

export function GameplayHintsProvider({ children }: { children: React.ReactNode }) {
  const [activeHint, setActiveHint] = useState<HintItem | null>(null)
  const showingRef = useRef(false)

  // Subscribe to queue changes
  useEffect(() => {
    const checkQueue = () => {
      // If we're currently showing a hint, wait
      if (showingRef.current) return

      const next = getSnapshot()
      if (next && !activeHint) {
        showingRef.current = true
        setShowingHint(true)
        setActiveHint(next)
      }
    }

    // Check immediately
    checkQueue()

    // Subscribe to future changes
    const unsubscribe = subscribe(checkQueue)
    return unsubscribe
  }, [])

  // Also check when activeHint becomes null (after dismissal)
  useEffect(() => {
    if (activeHint === null) {
      showingRef.current = false
      setShowingHint(false)

      // Check if there's a next hint in queue
      const next = getSnapshot()
      if (next) {
        // Small delay before showing next hint
        const timer = setTimeout(() => {
          showingRef.current = true
          setShowingHint(true)
          setActiveHint(next)
        }, 300)
        return () => clearTimeout(timer)
      }
    }
  }, [activeHint])

  const handleDismiss = useCallback(() => {
    dequeueHint()
    setActiveHint(null)
  }, [])

  return (
    <>
      {children}
      {/* Hints are positioned at bottom-center, above toast notifications */}
      <div
        className="fixed bottom-20 left-0 right-0 z-[90] flex justify-center pointer-events-none px-4"
        dir="rtl"
      >
        <AnimatePresence mode="wait">
          {activeHint && (
            <div key={activeHint.id} className="pointer-events-auto">
              <GameplayHintCard hint={activeHint} onDismiss={handleDismiss} />
            </div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
