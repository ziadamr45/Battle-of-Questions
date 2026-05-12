'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Swords, BookOpen, Zap, ShieldAlert } from 'lucide-react'
import { useOnboardingStore } from '@/lib/onboarding-store'
import { audioEngine } from '@/lib/audio-engine'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CinematicIntroProps {
  onComplete: () => void
  playerName: string
}

interface StepConfig {
  id: number
  text: string
  Icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>
  iconColor: string
  glowColor: string
  accentColor: string
  duration: number // ms to show this step
  dramaticPause?: number // ms pause before text reveal
}

// ─── Step Definitions ──────────────────────────────────────────────────────────

const STEPS: StepConfig[] = [
  {
    id: 0,
    text: 'مرحبًا بك في ساحة المعركة',
    Icon: Swords,
    iconColor: '#DC2626',
    glowColor: 'rgba(220, 38, 38, 0.6)',
    accentColor: '#F59E0B',
    duration: 2500,
  },
  {
    id: 1,
    text: 'هنا… المعرفة وحدها لا تكفي',
    Icon: BookOpen,
    iconColor: '#06B6D4',
    glowColor: 'rgba(6, 182, 212, 0.5)',
    accentColor: '#94A3B8',
    duration: 2500,
  },
  {
    id: 2,
    text: 'السرعة والتركيز يصنعان الفارق',
    Icon: Zap,
    iconColor: '#F59E0B',
    glowColor: 'rgba(245, 158, 11, 0.6)',
    accentColor: '#EF4444',
    duration: 2500,
  },
  {
    id: 3,
    text: 'في معركة الأسئلة… الحقيقة لا تظهر إلا بعد انتهاء الجولة',
    Icon: ShieldAlert,
    iconColor: '#F59E0B',
    glowColor: 'rgba(245, 158, 11, 0.5)',
    accentColor: '#DC2626',
    duration: 4000,
    dramaticPause: 600,
  },
]

// ─── Floating Embers (matching splash screen style) ────────────────────────────

function FloatingEmbers() {
  const embers = useRef(
    Array.from({ length: 14 }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 500,
      startX: (Math.random() - 0.5) * 400,
      y: 300,
      drift: (Math.random() - 0.5) * 500,
      duration: 3 + Math.random() * 2,
      delay: i * 0.35 + Math.random() * 0.5,
      isRed: i % 2 === 0,
    }))
  ).current

  return (
    <>
      {embers.map((e) => (
        <motion.div
          key={`ember-${e.id}`}
          initial={{
            opacity: 0,
            x: e.startX,
            y: 300,
            scale: 0,
          }}
          animate={{
            opacity: [0, 0.8, 0.6, 0],
            y: -350,
            x: e.drift,
            scale: [0, 1, 0.4],
          }}
          transition={{
            duration: e.duration,
            delay: e.delay,
            repeat: Infinity,
            ease: 'easeOut',
          }}
          className="absolute bottom-0 w-1.5 h-1.5 rounded-full"
          style={{
            background: e.isRed ? '#DC2626' : '#F59E0B',
            boxShadow: e.isRed
              ? '0 0 6px rgba(220,38,38,0.8), 0 0 12px rgba(220,38,38,0.4)'
              : '0 0 6px rgba(245,158,11,0.8), 0 0 12px rgba(245,158,11,0.4)',
          }}
        />
      ))}
    </>
  )
}

// ─── Animated Word Reveal ──────────────────────────────────────────────────────

function AnimatedText({ text, delay = 0 }: { text: string; delay?: number }) {
  // Split text into words for dramatic reveal
  const words = text.split(' ')

  return (
    <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1" dir="rtl">
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{
            duration: 0.4,
            delay: delay + i * 0.08,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
          className="text-xl sm:text-2xl md:text-3xl font-black text-white/90 inline-block"
        >
          {word}
        </motion.span>
      ))}
    </div>
  )
}

// ─── Step Scene ────────────────────────────────────────────────────────────────

function StepScene({ step }: { step: StepConfig }) {
  // Text delay accounts for icon entrance + optional dramatic pause
  const textDelay = 400 + (step.dramaticPause || 0)

  return (
    <motion.div
      className="flex flex-col items-center justify-center gap-6 sm:gap-8"
      initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(5px)' }}
      transition={{
        duration: 0.6,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      {/* Icon with glow pulse */}
      <motion.div
        className="relative"
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{
          type: 'spring',
          stiffness: 200,
          damping: 15,
          duration: 0.7,
        }}
      >
        {/* Outer glow ring */}
        <motion.div
          className="absolute inset-0 -m-4 rounded-full"
          animate={{
            boxShadow: [
              `0 0 30px ${step.glowColor}, 0 0 60px ${step.glowColor.replace(/[\d.]+\)$/, '0.15)')}`,
              `0 0 50px ${step.glowColor}, 0 0 100px ${step.glowColor.replace(/[\d.]+\)$/, '0.25)')}`,
              `0 0 30px ${step.glowColor}, 0 0 60px ${step.glowColor.replace(/[\d.]+\)$/, '0.15)')}`,
            ],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Icon container */}
        <motion.div
          className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center"
          style={{
            background: `radial-gradient(circle, ${step.iconColor}15, ${step.iconColor}08)`,
            border: `1.5px solid ${step.iconColor}40`,
          }}
          animate={{
            boxShadow: [
              `0 0 20px ${step.iconColor}30, inset 0 0 15px ${step.iconColor}10`,
              `0 0 40px ${step.iconColor}50, inset 0 0 25px ${step.iconColor}20`,
              `0 0 20px ${step.iconColor}30, inset 0 0 15px ${step.iconColor}10`,
            ],
          }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <step.Icon
            size={40}
            className="sm:hidden"
            style={{
              color: step.iconColor,
              filter: `drop-shadow(0 0 12px ${step.glowColor})`,
            }}
          />
          <step.Icon
            size={48}
            className="hidden sm:flex md:hidden"
            style={{
              color: step.iconColor,
              filter: `drop-shadow(0 0 16px ${step.glowColor})`,
            }}
          />
          <step.Icon
            size={56}
            className="hidden md:flex"
            style={{
              color: step.iconColor,
              filter: `drop-shadow(0 0 20px ${step.glowColor})`,
            }}
          />
        </motion.div>
      </motion.div>

      {/* Text reveal with delay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: textDelay / 1000 }}
        className="max-w-xs sm:max-w-sm md:max-w-md text-center"
      >
        <AnimatedText text={step.text} delay={textDelay / 1000} />

        {/* Decorative line under text */}
        <motion.div
          className="mx-auto mt-4 sm:mt-5 h-[2px] rounded-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${step.iconColor}80, ${step.accentColor}80, transparent)`,
          }}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 80, opacity: 1 }}
          transition={{ delay: textDelay / 1000 + step.text.split(' ').length * 0.08 + 0.2, duration: 0.5 }}
        />
      </motion.div>
    </motion.div>
  )
}

// ─── Progress Dots ─────────────────────────────────────────────────────────────

function ProgressDots({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="flex items-center gap-2.5">
      {Array.from({ length: totalSteps }, (_, i) => (
        <motion.div
          key={i}
          className="rounded-full"
          animate={{
            width: i === currentStep ? 24 : 8,
            height: 8,
            backgroundColor:
              i === currentStep
                ? '#F59E0B'
                : i < currentStep
                  ? '#DC2626'
                  : 'rgba(255, 255, 255, 0.15)',
            boxShadow:
              i === currentStep
                ? '0 0 12px rgba(245, 158, 11, 0.6), 0 0 24px rgba(245, 158, 11, 0.2)'
                : i < currentStep
                  ? '0 0 8px rgba(220, 38, 38, 0.4)'
                  : 'none',
          }}
          transition={{
            duration: 0.4,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function CinematicIntro({ onComplete, playerName }: CinematicIntroProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const completedRef = useRef(false)

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t))
      timersRef.current = []
    }
  }, [])

  // Mark intro step in store
  useEffect(() => {
    useOnboardingStore.getState().setCinematicIntroStep(currentStep)
  }, [currentStep])

  const handleComplete = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    setIsComplete(true)

    // Complete in store
    useOnboardingStore.getState().completeCinematicIntro()

    // Play splash sound
    audioEngine.splash()

    // Small delay for exit animation, then call onComplete
    setTimeout(() => {
      onComplete()
    }, 500)
  }, [onComplete])

  // Auto-advance through steps
  useEffect(() => {
    if (isComplete) return

    const step = STEPS[currentStep]
    if (!step) return

    const timer = setTimeout(() => {
      if (currentStep < STEPS.length - 1) {
        // Play transition sound on step change
        audioEngine.transition('metallic')
        setCurrentStep((prev) => prev + 1)
      } else {
        // Final step - complete the intro
        handleComplete()
      }
    }, step.duration + (step.dramaticPause || 0))

    timersRef.current.push(timer)

    return () => {
      clearTimeout(timer)
    }
  }, [currentStep, isComplete, handleComplete])

  const handleSkip = useCallback(() => {
    // Skip immediately
    handleComplete()
  }, [handleComplete])

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: '#0A0A12' }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.5 }}
      dir="rtl"
    >
      {/* ── Background layers ── */}
      <div className="absolute inset-0 battle-grid pointer-events-none" />
      <div className="absolute inset-0 particles-bg pointer-events-none" />
      <div className="absolute inset-0 arena-noise opacity-30 pointer-events-none" />

      {/* Depth glows */}
      <div className="absolute inset-0 arena-depth-glow-top pointer-events-none" />
      <div className="absolute inset-0 arena-depth-glow-bottom pointer-events-none" />

      {/* Central ambient glow - changes color per step */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`glow-${currentStep}`}
          className="absolute w-[500px] h-[500px] sm:w-[600px] sm:h-[600px] rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${STEPS[currentStep]?.iconColor}10 0%, ${STEPS[currentStep]?.accentColor}06 40%, transparent 70%)`,
          }}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1.2, opacity: 1 }}
          exit={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 0.8 }}
        />
      </AnimatePresence>

      {/* Floating embers */}
      <FloatingEmbers />

      {/* ── Step Content ── */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen w-full px-6">
        {/* Player name personalization (subtle) */}
        <AnimatePresence>
          {currentStep === 0 && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 0.4, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="absolute top-16 sm:top-20 text-sm font-semibold text-white/40"
            >
              {playerName}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Main step content with AnimatePresence */}
        <div className="flex-1 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <StepScene
              key={`step-${currentStep}`}
              step={STEPS[currentStep]}
            />
          </AnimatePresence>
        </div>

        {/* ── Bottom controls ── */}
        <div className="absolute bottom-8 sm:bottom-10 left-0 right-0 flex items-center justify-between px-6 sm:px-10">
          {/* Skip button - bottom right in RTL */}
          <motion.button
            onClick={handleSkip}
            className="text-white/30 hover:text-white/60 text-sm font-semibold transition-colors duration-200 px-3 py-2 rounded-lg hover:bg-white/5"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            تخطي
          </motion.button>

          {/* Progress dots - center */}
          <ProgressDots currentStep={currentStep} totalSteps={STEPS.length} />

          {/* Spacer for balance */}
          <div className="w-14" />
        </div>
      </div>

      {/* ── Completion flash ── */}
      <AnimatePresence>
        {isComplete && (
          <motion.div
            className="absolute inset-0 z-50 pointer-events-none"
            style={{ backgroundColor: '#F59E0B' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.15, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
