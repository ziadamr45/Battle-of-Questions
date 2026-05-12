'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Swords, Shield, ScrollText, X, ChevronLeft } from 'lucide-react'
import { audioEngine } from '@/lib/audio-engine'
import { useOnboardingStore } from '@/lib/onboarding-store'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface UIHighlightsProps {
  isActive: boolean
  onComplete: () => void
}

interface HighlightStep {
  targetSelector: string
  title: string
  description: string
  icon: React.ElementType
}

interface ElementBounds {
  top: number
  left: number
  width: number
  height: number
}

// ─── Step Definitions ──────────────────────────────────────────────────────────

const HIGHLIGHT_STEPS: HighlightStep[] = [
  {
    targetSelector: '[data-onboarding="create-room"]',
    title: 'أنشئ ساحتك الخاصة',
    description: 'أنشئ ساحتك الخاصة وادعو أصدقائك للتحدي',
    icon: Swords,
  },
  {
    targetSelector: '[data-onboarding="join-room"]',
    title: 'انضم لساحة جاهزة',
    description: 'انضم لساحة جاهزة وبدأ المعركة',
    icon: Shield,
  },
  {
    targetSelector: '[data-onboarding="battle-history"]',
    title: 'سجل المعارك',
    description: 'تابع سجل معاركك السابقة',
    icon: ScrollText,
  },
]

// ─── Helper: Get element bounds ────────────────────────────────────────────────

function getElementBounds(selector: string): ElementBounds | null {
  if (typeof document === 'undefined') return null
  const el = document.querySelector(selector)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}

// ─── Tooltip Position Helper ───────────────────────────────────────────────────

type ArrowSide = 'top' | 'bottom' | 'left' | 'right'

function getTooltipPosition(
  bounds: ElementBounds,
  tooltipWidth: number = 280
): { top: number; left: number; arrowSide: ArrowSide } {
  const viewportHeight = window.innerHeight
  const viewportWidth = window.innerWidth
  const padding = 16
  const tooltipHeight = 130 // estimated

  // Prefer placing tooltip below the highlighted element
  let top = bounds.top + bounds.height + padding
  let arrowSide: ArrowSide = 'top'

  // If not enough space below, place above
  if (top + tooltipHeight > viewportHeight - padding) {
    top = bounds.top - tooltipHeight - padding
    arrowSide = 'bottom'
  }

  // If still not enough space above, place to the side
  if (top < padding) {
    top = bounds.top
    arrowSide = 'left'
  }

  // Center horizontally relative to the target
  let left = bounds.left + bounds.width / 2 - tooltipWidth / 2

  // Clamp to viewport
  left = Math.max(padding, Math.min(left, viewportWidth - tooltipWidth - padding))

  return { top, left, arrowSide }
}

// ─── Animated Arrow Component ──────────────────────────────────────────────────

function AnimatedArrow({ bounds }: { bounds: ElementBounds }) {
  const centerX = bounds.left + bounds.width / 2
  const centerY = bounds.top + bounds.height / 2

  return (
    <motion.div
      className="absolute pointer-events-none z-[82]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        left: centerX - 12,
        top: centerY - 12,
      }}
    >
      {/* Pulsing ring around the center of the highlighted element */}
      <motion.div
        className="w-6 h-6 rounded-full border-2 border-amber-400/60"
        animate={{
          scale: [1, 1.8, 1],
          opacity: [0.8, 0, 0.8],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          boxShadow: '0 0 12px rgba(245,158,11,0.4)',
        }}
      />
    </motion.div>
  )
}

// ─── Progress Dots ─────────────────────────────────────────────────────────────

function ProgressDots({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="flex items-center gap-2 justify-center">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <motion.div
          key={i}
          className="rounded-full"
          animate={{
            width: i === currentStep ? 20 : 8,
            height: 8,
            backgroundColor: i === currentStep ? 'rgba(245,158,11,0.9)' : 'rgba(255,255,255,0.2)',
            boxShadow: i === currentStep ? '0 0 10px rgba(245,158,11,0.5)' : 'none',
          }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function UIHighlights({ isActive, onComplete }: UIHighlightsProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [bounds, setBounds] = useState<ElementBounds | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; arrowSide: ArrowSide }>({ top: 0, left: 0, arrowSide: 'top' })
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [overlayVisible, setOverlayVisible] = useState(false)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateBoundsRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const goToNextStepRef = useRef<() => void>(() => {})
  const handleCompleteRef = useRef<() => void>(() => {})

  // ─── Update bounds for current step ─────────────────────────────────────────
  const updateBounds = useCallback(() => {
    if (!isActive) return
    const step = HIGHLIGHT_STEPS[currentStep]
    if (!step) return
    const newBounds = getElementBounds(step.targetSelector)
    if (newBounds) {
      setBounds(newBounds)
      const pos = getTooltipPosition(newBounds)
      setTooltipPos(pos)
    }
  }, [isActive, currentStep])

  // ─── Observe element position changes ───────────────────────────────────────
  useEffect(() => {
    if (!isActive) return

    // Initial update with slight delay to let the DOM settle
    const initialTimer = setTimeout(() => {
      updateBounds()
      setOverlayVisible(true)
    }, 200)

    // Periodically update bounds (handles scroll, resize, animations)
    updateBoundsRef.current = setInterval(updateBounds, 300)

    // Handle resize
    const handleResize = () => updateBounds()
    window.addEventListener('resize', handleResize)

    return () => {
      clearTimeout(initialTimer)
      if (updateBoundsRef.current) clearInterval(updateBoundsRef.current)
      window.removeEventListener('resize', handleResize)
    }
  }, [isActive, updateBounds])

  // ─── Clear auto-advance timer ───────────────────────────────────────────────
  const clearAutoTimer = useCallback(() => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current)
      autoTimerRef.current = null
    }
  }, [])

  // ─── Handle complete ────────────────────────────────────────────────────────
  const handleComplete = useCallback(() => {
    clearAutoTimer()
    audioEngine.buttonClick()
    setOverlayVisible(false)
    useOnboardingStore.getState().completeUIHighlight()
    // Small delay for exit animation
    setTimeout(() => {
      onComplete()
    }, 400)
  }, [onComplete, clearAutoTimer])

  // Keep ref updated
  useEffect(() => {
    handleCompleteRef.current = handleComplete
  }, [handleComplete])

  // ─── Go to next step ────────────────────────────────────────────────────────
  const goToNextStep = useCallback(() => {
    clearAutoTimer()
    if (isTransitioning) return

    // Check if we've reached the last step (read current value)
    if (currentStep >= HIGHLIGHT_STEPS.length - 1) {
      handleCompleteRef.current()
      return
    }

    setIsTransitioning(true)
    audioEngine.buttonClick()
    useOnboardingStore.getState().setUIHighlightStep(currentStep + 1)

    const nextStepIndex = currentStep + 1

    // Smooth transition
    setTimeout(() => {
      setCurrentStep(nextStepIndex)
      setBounds(null)
      setIsTransitioning(false)

      // Update bounds after step change
      setTimeout(() => {
        const nextStep = HIGHLIGHT_STEPS[nextStepIndex]
        if (nextStep) {
          const newBounds = getElementBounds(nextStep.targetSelector)
          if (newBounds) {
            setBounds(newBounds)
            setTooltipPos(getTooltipPosition(newBounds))
          }
        }
      }, 100)
    }, 300)
  }, [currentStep, isTransitioning, clearAutoTimer])

  // Keep ref updated
  useEffect(() => {
    goToNextStepRef.current = goToNextStep
  }, [goToNextStep])

  // ─── Start auto-advance timer ───────────────────────────────────────────────
  useEffect(() => {
    if (!isActive || !bounds) return

    clearAutoTimer()
    autoTimerRef.current = setTimeout(() => {
      goToNextStepRef.current()
    }, 4000)

    return clearAutoTimer
  }, [isActive, currentStep, bounds, clearAutoTimer])

  // ─── Handle skip ────────────────────────────────────────────────────────────
  const handleSkip = useCallback(() => {
    clearAutoTimer()
    audioEngine.buttonClick()
    setOverlayVisible(false)
    useOnboardingStore.getState().completeUIHighlight()
    setTimeout(() => {
      onComplete()
    }, 400)
  }, [onComplete, clearAutoTimer])

  // ─── Handle manual next click ───────────────────────────────────────────────
  const handleNext = useCallback(() => {
    clearAutoTimer()
    goToNextStepRef.current()
  }, [clearAutoTimer])

  // ─── Pause auto timer on hover ──────────────────────────────────────────────
  const handleTooltipEnter = useCallback(() => {
    clearAutoTimer()
  }, [clearAutoTimer])

  const handleTooltipLeave = useCallback(() => {
    // Restart auto timer on leave
    if (!isActive || !bounds) return
    autoTimerRef.current = setTimeout(() => {
      goToNextStepRef.current()
    }, 4000)
  }, [isActive, bounds, clearAutoTimer])

  // ─── Don't render if not active ─────────────────────────────────────────────
  if (!isActive) return null

  const step = HIGHLIGHT_STEPS[currentStep]
  const StepIcon = step?.icon || Swords
  const isLastStep = currentStep === HIGHLIGHT_STEPS.length - 1

  return (
    <AnimatePresence>
      {overlayVisible && (
        <motion.div
          className="fixed inset-0 z-[80]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* ─── Dark overlay ─────────────────────────────────────────────── */}
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          />

          {/* ─── Spotlight cutout ──────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {bounds && (
              <motion.div
                key={`spotlight-${currentStep}`}
                className="absolute pointer-events-none"
                initial={{
                  top: bounds.top - 4,
                  left: bounds.left - 4,
                  width: bounds.width + 8,
                  height: bounds.height + 8,
                  opacity: 0.5,
                }}
                animate={{
                  top: bounds.top - 4,
                  left: bounds.left - 4,
                  width: bounds.width + 8,
                  height: bounds.height + 8,
                  opacity: 1,
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 0.5,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                style={{
                  borderRadius: 12,
                  border: '2px solid rgba(245,158,11,0.6)',
                  boxShadow:
                    '0 0 20px rgba(245,158,11,0.3), 0 0 0 9999px rgba(0,0,0,0.85), inset 0 0 15px rgba(245,158,11,0.1)',
                  zIndex: 81,
                }}
              />
            )}
          </AnimatePresence>

          {/* ─── Animated arrow/pulse on highlighted element ──────────────── */}
          <AnimatePresence>
            {bounds && <AnimatedArrow bounds={bounds} />}
          </AnimatePresence>

          {/* ─── Tooltip card ─────────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {bounds && (
              <motion.div
                key={`tooltip-${currentStep}`}
                className="absolute z-[82] pointer-events-auto"
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.35, ease: 'easeOut', delay: 0.15 }}
                style={{
                  top: tooltipPos.top,
                  left: tooltipPos.left,
                  maxWidth: 280,
                }}
                onMouseEnter={handleTooltipEnter}
                onMouseLeave={handleTooltipLeave}
              >
                {/* Arrow pointing to the highlighted element */}
                <div
                  className="absolute w-4 h-4 rotate-45"
                  style={{
                    background: '#12121E',
                    border: '1px solid rgba(245,158,11,0.3)',
                    ...(tooltipPos.arrowSide === 'top'
                      ? { top: -8, left: '50%', marginLeft: -8, borderBottom: 'none', borderRight: 'none' }
                      : tooltipPos.arrowSide === 'bottom'
                        ? { bottom: -8, left: '50%', marginLeft: -8, borderTop: 'none', borderLeft: 'none' }
                        : tooltipPos.arrowSide === 'left'
                          ? { left: -8, top: '50%', marginTop: -8, borderRight: 'none', borderTop: 'none' }
                          : { right: -8, top: '50%', marginTop: -8, borderLeft: 'none', borderBottom: 'none' }),
                  }}
                />

                {/* Card body */}
                <div
                  className="rounded-xl p-4 backdrop-blur-xl"
                  style={{
                    background: '#12121E',
                    border: '1px solid rgba(245,158,11,0.3)',
                    boxShadow: '0 0 20px rgba(245,158,11,0.15), 0 4px 24px rgba(0,0,0,0.5)',
                  }}
                >
                  {/* Icon + Title row */}
                  <div className="flex items-center gap-3 mb-2" dir="rtl">
                    <motion.div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(220,38,38,0.15))',
                        border: '1px solid rgba(245,158,11,0.25)',
                      }}
                      animate={{
                        boxShadow: [
                          '0 0 8px rgba(245,158,11,0.2)',
                          '0 0 16px rgba(245,158,11,0.4)',
                          '0 0 8px rgba(245,158,11,0.2)',
                        ],
                      }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <StepIcon className="w-4 h-4 text-amber-400" />
                    </motion.div>
                    <h3 className="text-sm font-bold text-white">
                      {step.title}
                    </h3>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-300 leading-relaxed mb-3" dir="rtl">
                    {step.description}
                  </p>

                  {/* Footer: Next button + Progress dots */}
                  <div className="flex items-center justify-between" dir="rtl">
                    <motion.button
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                      style={{
                        background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(220,38,38,0.15))',
                        border: '1px solid rgba(245,158,11,0.3)',
                        color: '#F59E0B',
                      }}
                      whileHover={{
                        boxShadow: '0 0 12px rgba(245,158,11,0.3)',
                        background: 'linear-gradient(135deg, rgba(245,158,11,0.3), rgba(220,38,38,0.2))',
                      }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleNext}
                    >
                      {isLastStep ? 'يلا نبدأ' : 'التالي'}
                      <ChevronLeft className="w-3 h-3" />
                    </motion.button>

                    <ProgressDots
                      currentStep={currentStep}
                      totalSteps={HIGHLIGHT_STEPS.length}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ─── Skip button ──────────────────────────────────────────────── */}
          <motion.button
            className="fixed top-4 left-4 z-[83] flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors pointer-events-auto"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.5)',
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{
              background: 'rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.8)',
            }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSkip}
          >
            <X className="w-3.5 h-3.5" />
            تخطي
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
