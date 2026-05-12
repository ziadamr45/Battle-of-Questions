'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence, PanInfo } from 'framer-motion'
import { useBattleToastStore, getToastTypeConfig, type BattleToastType, type BattleToastItem } from '@/lib/battle-toast-store'
import { audioEngine } from '@/lib/audio-engine'
import {
  Swords,
  Shield,
  Crown,
  Users,
  UserPlus,
  UserMinus,
  UserX,
  UserCheck,
  WifiOff,
  Wifi,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Settings2,
  Lock,
  LockOpen,
  Info,
  Zap,
  Trophy,
  ChevronLeft,
  DoorOpen,
  type LucideIcon,
} from 'lucide-react'

// ─── Type → Icon mapping ──────────────────────────────────────────────────────

function getToastIcon(type: BattleToastType): LucideIcon {
  const map: Record<BattleToastType, LucideIcon> = {
    player_joined: UserPlus,
    player_left: UserMinus,
    player_disconnected: WifiOff,
    player_reconnected: Wifi,
    opponent_left: UserX,
    surrender: DoorOpen,
    host_changed_self: Crown,
    host_changed_other: Crown,
    rejoin_success: UserCheck,
    rejoin_failed: WifiOff,
    error: XCircle,
    connection_error: WifiOff,
    timeout: AlertTriangle,
    settings_updated: Settings2,
    room_full: Lock,
    room_open: LockOpen,
    success: CheckCircle2,
    info: Info,
    warning: AlertTriangle,
    early_end_rejected: Shield,
    battle_event: Swords,
  }
  return map[type] || Info
}

// ─── Type → Color scheme ──────────────────────────────────────────────────────

interface ToastColors {
  accent: string        // border / glow accent color
  accentBg: string      // icon bg
  iconColor: string     // icon fill color
  glowColor: string     // box-shadow glow
  progressFrom: string  // progress bar gradient start
  progressTo: string    // progress bar gradient end
}

function getToastColors(type: BattleToastType): ToastColors {
  const config = getToastTypeConfig(type)

  switch (config.category) {
    case 'arena':
      return {
        accent: 'border-cyan-500/30',
        accentBg: 'bg-cyan-500/10',
        iconColor: 'text-cyan-400',
        glowColor: '0 0 20px rgba(6,182,212,0.15), 0 0 40px rgba(6,182,212,0.05)',
        progressFrom: 'from-cyan-500',
        progressTo: 'to-cyan-500/0',
      }
    case 'combat':
      return {
        accent: 'border-amber-500/30',
        accentBg: 'bg-amber-500/10',
        iconColor: 'text-amber-400',
        glowColor: '0 0 20px rgba(245,158,11,0.15), 0 0 40px rgba(245,158,11,0.05)',
        progressFrom: 'from-amber-500',
        progressTo: 'to-amber-500/0',
      }
    case 'error':
      return {
        accent: 'border-red-500/30',
        accentBg: 'bg-red-500/10',
        iconColor: 'text-red-400',
        glowColor: '0 0 20px rgba(220,38,38,0.2), 0 0 40px rgba(220,38,38,0.08)',
        progressFrom: 'from-red-500',
        progressTo: 'to-red-500/0',
      }
    case 'system':
    default:
      return {
        accent: 'border-white/15',
        accentBg: 'bg-white/5',
        iconColor: 'text-slate-400',
        glowColor: '0 0 15px rgba(255,255,255,0.05)',
        progressFrom: 'from-slate-500',
        progressTo: 'to-slate-500/0',
      }
  }
}

// ─── Sound mapping ────────────────────────────────────────────────────────────

function playToastSound(type: BattleToastType) {
  try {
    switch (type) {
      case 'player_joined':
      case 'player_reconnected':
        audioEngine.playerJoined()
        break
      case 'player_left':
      case 'player_disconnected':
      case 'opponent_left':
        audioEngine.playerLeft()
        break
      case 'error':
      case 'connection_error':
      case 'timeout':
      case 'rejoin_failed':
      case 'early_end_rejected':
        audioEngine.error()
        break
      case 'host_changed_self':
        audioEngine.transition('metallic')
        break
      case 'success':
      case 'rejoin_success':
      case 'room_open':
        audioEngine.buttonClick()
        break
      default:
        // No sound for low-priority toasts
        break
    }
  } catch {
    // Audio not initialized yet, ignore
  }
}

// ─── Single Toast Card ────────────────────────────────────────────────────────

function BattleToastCard({ toast, index }: { toast: BattleToastItem; index: number }) {
  const removeToast = useBattleToastStore((s) => s.removeToast)
  const colors = getToastColors(toast.type)
  const Icon = getToastIcon(toast.type)
  const config = getToastTypeConfig(toast.type)

  const [progress, setProgress] = useState(100)
  const startTimeRef = useRef(Date.now())
  const rafRef = useRef<number>(0)
  const isPausedRef = useRef(false)

  // Animate progress bar
  useEffect(() => {
    startTimeRef.current = Date.now()
    const duration = toast.duration

    const tick = () => {
      if (isPausedRef.current) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      const elapsed = Date.now() - startTimeRef.current
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)
      if (remaining <= 0) {
        removeToast(toast.id)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [toast.id, toast.duration, removeToast])

  // Play sound on mount
  useEffect(() => {
    playToastSound(toast.type)
  }, [toast.type])

  // Swipe / drag handlers
  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 80
    const velocity = 200

    const shouldDismiss =
      Math.abs(info.offset.x) > threshold ||
      Math.abs(info.velocity.x) > velocity ||
      info.offset.y < -threshold ||
      info.velocity.y < -velocity

    if (shouldDismiss) {
      removeToast(toast.id)
    }
  }, [toast.id, removeToast])

  // Pause on hover
  const handlePointerEnter = useCallback(() => {
    isPausedRef.current = true
  }, [])

  const handlePointerLeave = useCallback(() => {
    // Adjust start time so progress continues smoothly
    const elapsed = Date.now() - startTimeRef.current
    const duration = toast.duration
    const remaining = duration - elapsed
    startTimeRef.current = Date.now() - (duration - remaining)
    isPausedRef.current = false
  }, [toast.duration])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.9, filter: 'blur(8px)' }}
      animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{
        opacity: 0,
        x: (vi: any) => {
          // Exit in the direction of the swipe if dragging, otherwise slide out right
          return vi?.velocity?.x ? Math.sign(vi.velocity.x) * 200 : 80
        },
        scale: 0.85,
        filter: 'blur(4px)',
        transition: { duration: 0.25, ease: 'easeIn' },
      }}
      transition={{
        type: 'spring',
        stiffness: 350,
        damping: 28,
        mass: 0.8,
      }}
      drag="x"
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.15}
      onDragEnd={handleDragEnd}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className="touch-none select-none"
    >
      <div
        className={`relative overflow-hidden rounded-xl border ${colors.accent} bg-[#0E0E18]/95 backdrop-blur-xl cursor-grab active:cursor-grabbing`}
        style={{
          boxShadow: colors.glowColor,
        }}
      >
        {/* Progress bar (top edge) */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/[0.03]">
          <motion.div
            className={`h-full bg-gradient-to-l ${colors.progressFrom} ${colors.progressTo}`}
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.1, ease: 'linear' }}
          />
        </div>

        {/* Content */}
        <div className="flex items-start gap-3 p-3 pr-4">
          {/* Icon */}
          <div className={`flex-shrink-0 w-9 h-9 rounded-lg ${colors.accentBg} flex items-center justify-center border ${colors.accent}`}>
            <Icon className={`w-4 h-4 ${colors.iconColor}`} />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0 text-right">
            <div className="text-sm font-bold text-slate-200 leading-tight">
              {toast.title}
            </div>
            {toast.description && (
              <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                {toast.description}
              </div>
            )}
          </div>

          {/* Dismiss button */}
          <button
            onClick={() => removeToast(toast.id)}
            className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-slate-600 hover:text-slate-300 hover:bg-white/5 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Subtle energy flash on entry */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{
            background: config.category === 'combat'
              ? 'linear-gradient(90deg, transparent, rgba(245,158,11,0.05), transparent)'
              : config.category === 'error'
                ? 'linear-gradient(90deg, transparent, rgba(220,38,38,0.05), transparent)'
                : config.category === 'arena'
                  ? 'linear-gradient(90deg, transparent, rgba(6,182,212,0.05), transparent)'
                  : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.02), transparent)',
          }}
        />
      </div>
    </motion.div>
  )
}

// ─── Toast Container / Provider ───────────────────────────────────────────────

export function BattleToastProvider() {
  const toasts = useBattleToastStore((s) => s.toasts)
  const visibleToasts = toasts.slice(0, 3) // Max 3 visible

  return (
    <div
      className="fixed top-4 left-4 z-[100] flex flex-col-reverse gap-2 w-[calc(100%-2rem)] max-w-[380px] pointer-events-none"
      dir="rtl"
    >
      <AnimatePresence mode="popLayout">
        {visibleToasts.map((toast, idx) => (
          <div key={toast.id} className="pointer-events-auto">
            <BattleToastCard toast={toast} index={idx} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  )
}
