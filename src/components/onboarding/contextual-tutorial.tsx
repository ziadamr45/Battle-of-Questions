'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { audioEngine } from '@/lib/audio-engine'
import { shouldShowContextualTutorial, markContextualTutorial, type ContextualTutorialType } from '@/lib/onboarding-store'
import {
  Shield,
  Crown,
  CheckCircle2,
  UserPlus,
  Mic,
  MessageCircle,
  ArrowLeftRight,
  Settings,
  PenTool,
  X,
} from 'lucide-react'

// ─── Tutorial Configuration ───────────────────────────────────────────────────

interface TutorialConfig {
  title: string
  description: string
  icon: React.ElementType
  accentColor: string
  glowColor: string
  duration: number // ms auto-dismiss
}

const TUTORIAL_CONFIG: Record<ContextualTutorialType, TutorialConfig> = {
  teamMode: {
    title: 'وضع الفرق',
    description: 'أنت الآن في وضع الفرق! انضم لفريق وتعاون مع زملائك للفوز. القائد يوجّه والفريق يقاتل.',
    icon: Shield,
    accentColor: '#10B981',
    glowColor: 'rgba(16, 185, 129, 0.4)',
    duration: 7000,
  },
  becameCaptain: {
    title: 'أنت القائد',
    description: 'بصفتك قائد الفريق، أنت تتحكم ببدء المعركة، توافق على التعديلات، وتدير طلبات الانضمام. مقاتليك يضغطون جاهز… وأنت تبدأ الجولة.',
    icon: Crown,
    accentColor: '#F59E0B',
    glowColor: 'rgba(245, 158, 11, 0.4)',
    duration: 8000,
  },
  captainApproval: {
    title: 'طلب موافقة',
    description: 'وصلك طلب تعديل يحتاج موافقتك كقائد. يمكنك قبوله أو رفضه.',
    icon: CheckCircle2,
    accentColor: '#06B6D4',
    glowColor: 'rgba(6, 182, 212, 0.4)',
    duration: 6000,
  },
  joinRequestSent: {
    title: 'طلب الانضمام',
    description: 'تم إرسال طلبك للقائد. في انتظار الموافقة… يمكنك اللعب بحرية في الوقت الحالي.',
    icon: UserPlus,
    accentColor: '#8B5CF6',
    glowColor: 'rgba(139, 92, 246, 0.4)',
    duration: 5000,
  },
  voiceChatAvailable: {
    title: 'محادثة صوتية',
    description: 'المحادثة الصوتية متاحة لفريقك! اضغط على الميكروفون للتحدث. صوتك لا يسمعه الفريق الآخر.',
    icon: Mic,
    accentColor: '#EC4899',
    glowColor: 'rgba(236, 72, 153, 0.4)',
    duration: 6000,
  },
  chatModes: {
    title: 'أوضاع الدردشة',
    description: 'الدردشة لها أوضاع: فريق (فريقك فقط يراها)، عام (الكل يراها)، خاص (شخص واحد). اختر المناسب!',
    icon: MessageCircle,
    accentColor: '#06B6D4',
    glowColor: 'rgba(6, 182, 212, 0.4)',
    duration: 7000,
  },
  teamSwitch: {
    title: 'تبديل الفريق',
    description: 'يمكنك طلب الانتقال لفريق آخر. القائد يجب أن يوافق على طلبك أولاً.',
    icon: ArrowLeftRight,
    accentColor: '#8B5CF6',
    glowColor: 'rgba(139, 92, 246, 0.4)',
    duration: 5000,
  },
  settingsEdit: {
    title: 'تعديل الإعدادات',
    description: 'يمكن تعديل إعدادات المعركة أثناء وجود مقاتلين. في وضع الفرق، يحتاج التعديل لموافقة القائد الآخر.',
    icon: Settings,
    accentColor: '#F59E0B',
    glowColor: 'rgba(245, 158, 11, 0.4)',
    duration: 6000,
  },
  teamRename: {
    title: 'تسمية الفريق',
    description: 'كقائد، يمكنك تغيير اسم فريقك! اضغط على اسم الفريق أو على أيقونة الاسم العشوائي.',
    icon: PenTool,
    accentColor: '#10B981',
    glowColor: 'rgba(16, 185, 129, 0.4)',
    duration: 5000,
  },
}

// ─── Tutorial Queue State (module-level) ──────────────────────────────────────

interface TutorialItem {
  id: string
  type: ContextualTutorialType
}

let tutorialQueue: TutorialItem[] = []
let isShowingTutorial = false
let tutorialListeners: Set<() => void> = new Set()

function emitTutorialChange() {
  tutorialListeners.forEach((fn) => fn())
}

function subscribeTutorial(listener: () => void): () => void {
  tutorialListeners.add(listener)
  return () => tutorialListeners.delete(listener)
}

function getTutorialSnapshot(): TutorialItem | null {
  return tutorialQueue.length > 0 ? tutorialQueue[0]! : null
}

function enqueueTutorial(type: ContextualTutorialType): void {
  // Check if this tutorial should be shown (first-time only)
  if (!shouldShowContextualTutorial(type)) return

  // Don't add duplicates
  if (tutorialQueue.some((t) => t.type === type)) return

  // Mark as shown immediately to prevent re-queuing
  markContextualTutorial(type)

  // Max queue: 2
  if (tutorialQueue.length >= 2) {
    if (tutorialQueue.length > 1) {
      tutorialQueue[tutorialQueue.length - 1] = {
        id: `tutorial-${Date.now()}-${type}`,
        type,
      }
    } else {
      tutorialQueue.push({
        id: `tutorial-${Date.now()}-${type}`,
        type,
      })
    }
  } else {
    tutorialQueue.push({
      id: `tutorial-${Date.now()}-${type}`,
      type,
    })
  }

  emitTutorialChange()
}

function dequeueTutorial(): void {
  tutorialQueue.shift()
  isShowingTutorial = false
  emitTutorialChange()
}

function setShowingTutorial(value: boolean): void {
  isShowingTutorial = value
}

// ─── Imperative API ───────────────────────────────────────────────────────────

/**
 * Trigger a contextual tutorial to show (only if it hasn't been shown before).
 * Call this when a first-time event occurs (e.g., entering team mode, becoming captain).
 */
export function showContextualTutorial(type: ContextualTutorialType): void {
  enqueueTutorial(type)
}

// ─── Single Tutorial Card ─────────────────────────────────────────────────────

function ContextualTutorialCard({ tutorial, onDismiss }: { tutorial: TutorialItem; onDismiss: () => void }) {
  const config = TUTORIAL_CONFIG[tutorial.type]
  const Icon = config.icon
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

  // Play subtle sound on mount
  useEffect(() => {
    try {
      audioEngine.transition('whoosh')
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
  }, [tutorial.id, config.duration, handleDismiss])

  // Pause on hover/touch
  const handlePointerEnter = useCallback(() => {
    isPausedRef.current = true
  }, [])

  const handlePointerLeave = useCallback(() => {
    if (!startTimeRef.current) return
    const elapsed = Date.now() - startTimeRef.current
    const duration = config.duration
    const remaining = duration - elapsed
    startTimeRef.current = Date.now() - (duration - remaining) + 2000
    isPausedRef.current = false
  }, [config.duration])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
      }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className="w-full max-w-sm mx-auto"
    >
      <motion.div
        className="relative overflow-hidden rounded-2xl backdrop-blur-xl cursor-default select-none"
        style={{
          background: `linear-gradient(135deg, ${config.accentColor}08, ${config.accentColor}04, #0E0E18)`,
          border: `1px solid ${config.accentColor}30`,
          boxShadow: `0 0 30px ${config.glowColor}, 0 4px 24px rgba(0,0,0,0.4)`,
        }}
        dir="rtl"
      >
        {/* Progress bar (bottom edge) */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/[0.03]">
          <motion.div
            className="h-full"
            style={{
              background: `linear-gradient(to left, ${config.accentColor}, ${config.accentColor}00)`,
              width: `${progress}%`,
            }}
            transition={{ duration: 0.1, ease: 'linear' }}
          />
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Header: Icon + Title + Dismiss */}
          <div className="flex items-center gap-3 mb-2">
            <motion.div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: `linear-gradient(135deg, ${config.accentColor}20, ${config.accentColor}08)`,
                border: `1px solid ${config.accentColor}30`,
              }}
              animate={{
                boxShadow: [
                  `0 0 12px ${config.glowColor}`,
                  `0 0 24px ${config.glowColor}`,
                  `0 0 12px ${config.glowColor}`,
                ],
              }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Icon className="w-5 h-5" style={{ color: config.accentColor }} />
            </motion.div>
            <h3 className="text-sm font-bold text-white flex-1">{config.title}</h3>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-white/20 hover:text-white/60 hover:bg-white/5 transition-colors"
              aria-label="إغلاق"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Description */}
          <p className="text-xs text-white/70 leading-relaxed pr-[52px]">
            {config.description}
          </p>
        </div>

        {/* Entry flash effect */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{
            background: `linear-gradient(90deg, transparent, ${config.accentColor}08, transparent)`,
          }}
        />

        {/* Pulsing border glow */}
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-2xl"
          animate={{
            boxShadow: [
              `inset 0 0 20px ${config.accentColor}05`,
              `inset 0 0 30px ${config.accentColor}08`,
              `inset 0 0 20px ${config.accentColor}05`,
            ],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </motion.div>
  )
}

// ─── Provider Component ───────────────────────────────────────────────────────

export function ContextualTutorialProvider({ children }: { children: React.ReactNode }) {
  const [activeTutorial, setActiveTutorial] = useState<TutorialItem | null>(null)
  const showingRef = useRef(false)

  // Subscribe to queue changes
  useEffect(() => {
    const checkQueue = () => {
      if (showingRef.current) return

      const next = getTutorialSnapshot()
      if (next && !activeTutorial) {
        showingRef.current = true
        setShowingTutorial(true)
        setActiveTutorial(next)
      }
    }

    checkQueue()
    const unsubscribe = subscribeTutorial(checkQueue)
    return unsubscribe
  }, [])

  // Check when activeTutorial becomes null
  useEffect(() => {
    if (activeTutorial === null) {
      showingRef.current = false
      setShowingTutorial(false)

      const next = getTutorialSnapshot()
      if (next) {
        const timer = setTimeout(() => {
          showingRef.current = true
          setShowingTutorial(true)
          setActiveTutorial(next)
        }, 500)
        return () => clearTimeout(timer)
      }
    }
  }, [activeTutorial])

  const handleDismiss = useCallback(() => {
    dequeueTutorial()
    setActiveTutorial(null)
  }, [])

  return (
    <>
      {children}
      {/* Contextual tutorials positioned at top-center, below header */}
      <div
        className="fixed top-16 left-0 right-0 z-[85] flex justify-center pointer-events-none px-4"
        dir="rtl"
      >
        <AnimatePresence mode="wait">
          {activeTutorial && (
            <div key={activeTutorial.id} className="pointer-events-auto">
              <ContextualTutorialCard
                tutorial={activeTutorial}
                onDismiss={handleDismiss}
              />
            </div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
