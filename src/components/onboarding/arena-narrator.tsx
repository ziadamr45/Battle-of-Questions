'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { audioEngine } from '@/lib/audio-engine'

// ─── Narration Event Types ────────────────────────────────────────────────────

export type NarrationEvent =
  | 'player_entered'
  | 'battle_starting'
  | 'round_starting'
  | 'round_ending'
  | 'battle_ending'
  | 'last_seconds'
  | 'new_host'
  | 'player_reconnected'
  | 'team_formed'           // Both teams have at least one player
  | 'captain_takeover'      // A new captain takes over
  | 'join_request_arrived'  // A join request is waiting for captain
  | 'team_ready'            // An entire team is ready
  | 'all_fighters_ready'    // All fighters across teams are ready
  | 'voice_merged'          // Voice channels merged between teams
  | 'settings_change'       // Settings changed during battle

// ─── Narration Texts ──────────────────────────────────────────────────────────

const NARRATION_TEXTS: Record<NarrationEvent, string[]> = {
  player_entered: [
    'دخل مقاتل جديد إلى الساحة',
    'محارب جديد انضم للمعركة',
  ],
  battle_starting: [
    'استعدوا… المعركة على وشك أن تبدأ',
    'الساحة تستعد للقتال',
  ],
  round_starting: [
    'الجولة التالية تبدأ الآن',
    'استعدوا… جولة جديدة تبدأ',
  ],
  round_ending: [
    'اقتربت نهاية الجولة',
    'الجولة تشارف على الانتهاء',
  ],
  battle_ending: [
    'المعركة تشارف على النهاية',
    'اللحظة الأخيرة… من سيفوز؟',
  ],
  last_seconds: [
    'الثواني الأخيرة!',
    'وقت حرج!',
  ],
  new_host: [
    'قائد جديد يتولى قيادة الساحة',
  ],
  player_reconnected: [
    'المحارب عاد إلى الساحة',
  ],
  team_formed: [
    'الفرق جاهزة… المعركة على الأبواب',
    'كلا الفريقين جاهزان للقتال',
  ],
  captain_takeover: [
    'قائد جديد يتولى قيادة الفريق',
    'القيادة انتقلت… القائد الجديد جاهز',
  ],
  join_request_arrived: [
    'طلب انضمام ينتظر الموافقة',
  ],
  team_ready: [
    'فريق كامل جاهز للقتال',
  ],
  all_fighters_ready: [
    'كل المقاتلين جاهزون… في انتظار القائد',
  ],
  voice_merged: [
    'المحادثة الصوتية دُمجت بين الفريقين',
  ],
  settings_change: [
    'الإعدادات تغيّرت… استعدوا للمعركة',
  ],
}

// ─── Narration Queue State (module-level) ─────────────────────────────────────

interface NarrationItem {
  id: string
  event: NarrationEvent
  text: string
}

let narrationQueue: NarrationItem[] = []
let isNarrating = false
let listeners: Set<() => void> = new Set()

function emitChange() {
  listeners.forEach((fn) => fn())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): NarrationItem | null {
  return narrationQueue.length > 0 ? narrationQueue[0]! : null
}

function getRandomText(event: NarrationEvent): string {
  const texts = NARRATION_TEXTS[event]
  return texts[Math.floor(Math.random() * texts.length)]!
}

function enqueueNarration(event: NarrationEvent): void {
  const text = getRandomText(event)
  const item: NarrationItem = {
    id: `narration-${Date.now()}-${event}-${Math.random().toString(36).slice(2, 6)}`,
    event,
    text,
  }

  // Max queue: 2 (including the currently showing one)
  // If queue is full and already has a waiting item, replace it with the newer one
  if (narrationQueue.length >= 2) {
    // Replace the last queued item (not the currently showing one) with the new one
    if (narrationQueue.length > 1) {
      narrationQueue[narrationQueue.length - 1] = item
    } else {
      // Only one item (currently showing), add the new one
      narrationQueue.push(item)
    }
  } else {
    narrationQueue.push(item)
  }

  emitChange()
}

function dequeueNarration(): void {
  narrationQueue.shift()
  isNarrating = false
  emitChange()
}

function setNarrating(value: boolean): void {
  isNarrating = value
}

// ─── Imperative API ───────────────────────────────────────────────────────────

export function showNarration(event: NarrationEvent): void {
  enqueueNarration(event)
}

// ─── Animation Variants ───────────────────────────────────────────────────────

const narrationVariants = {
  initial: {
    opacity: 0,
    y: 16,
    filter: 'blur(8px)',
    scale: 0.98,
  },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    filter: 'blur(6px)',
    scale: 0.99,
    transition: {
      duration: 0.4,
      ease: [0.55, 0.06, 0.68, 0.19] as [number, number, number, number],
    },
  },
}

// ─── Narration Display ────────────────────────────────────────────────────────

function NarrationDisplay({ item, onComplete }: { item: NarrationItem; onComplete: () => void }) {
  const completedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    // Play whoosh sound on narration appearance
    try {
      audioEngine.transition('whoosh')
    } catch {
      // Audio not initialized yet
    }

    // Auto-dismiss after 2.5 seconds
    timerRef.current = setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true
        onComplete()
      }
    }, 2500)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [item.id, onComplete])

  return (
    <motion.div
      variants={narrationVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-full flex justify-center pointer-events-none select-none"
      dir="rtl"
    >
      <div className="max-w-lg text-center px-6">
        <span
          className="text-2xl font-black text-white/70 text-center leading-relaxed"
          style={{
            textShadow: '0 0 20px rgba(245,158,11,0.3), 0 0 40px rgba(245,158,11,0.1)',
          }}
        >
          {item.text}
        </span>
      </div>
    </motion.div>
  )
}

// ─── Provider Component ───────────────────────────────────────────────────────

export function ArenaNarratorProvider({ children }: { children: React.ReactNode }) {
  const [activeNarration, setActiveNarration] = useState<NarrationItem | null>(null)
  const narratingRef = useRef(false)

  // Subscribe to queue changes
  useEffect(() => {
    const checkQueue = () => {
      // If we're currently showing a narration, wait
      if (narratingRef.current) return

      const next = getSnapshot()
      if (next && !activeNarration) {
        narratingRef.current = true
        setNarrating(true)
        setActiveNarration(next)
      }
    }

    // Check immediately
    checkQueue()

    // Subscribe to future changes
    const unsubscribe = subscribe(checkQueue)
    return unsubscribe
  }, [])

  // Check when activeNarration becomes null (after dismissal)
  useEffect(() => {
    if (activeNarration === null) {
      narratingRef.current = false
      setNarrating(false)

      // Check if there's a next narration in queue
      const next = getSnapshot()
      if (next) {
        // Small delay before showing next narration
        const timer = setTimeout(() => {
          narratingRef.current = true
          setNarrating(true)
          setActiveNarration(next)
        }, 400)
        return () => clearTimeout(timer)
      }
    }
  }, [activeNarration])

  const handleComplete = useCallback(() => {
    dequeueNarration()
    setActiveNarration(null)
  }, [])

  return (
    <>
      {children}
      {/* Narration overlay positioned at bottom-center */}
      <div
        className="fixed bottom-32 left-0 right-0 z-[85] flex justify-center pointer-events-none"
        dir="rtl"
      >
        <AnimatePresence mode="wait">
          {activeNarration && (
            <NarrationDisplay
              key={activeNarration.id}
              item={activeNarration}
              onComplete={handleComplete}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
