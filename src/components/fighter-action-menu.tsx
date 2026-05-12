'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MicOff,
  Volume1,
  VolumeX,
  UserX,
  Shield,
  Crown,
  MoreVertical,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { usePlayerMuteStore } from '@/lib/player-mute-store'
import { battleToast } from '@/lib/battle-toast-store'

// ============================================
// TYPES
// ============================================
interface FighterActionMenuProps {
  /** Player ID (socket ID) */
  playerId: string
  /** Player display name */
  playerName: string
  /** Is the current user the host? */
  isHost: boolean
  /** Is the current user a team captain? */
  isCaptain?: boolean
  /** Current user's team ID (team mode only) */
  myTeamId?: string | null
  /** Target player's team ID (team mode only) */
  playerTeamId?: string | null
  /** Is the target player the host? */
  isPlayerHost?: boolean
  /** Is the target player a team captain? */
  isPlayerCaptain?: boolean
  /** Is this the current user? (self) */
  isMe?: boolean
  /** Socket getter function for emitting events */
  getSocket: () => any
  /** Compact mode (for smaller lists like game sidebar) */
  compact?: boolean
  /** Context: where is this menu being used? */
  context?: 'lobby' | 'game' | 'results'
}

// ============================================
// FIGHTER ACTION MENU COMPONENT
// ============================================
export function FighterActionMenu({
  playerId,
  playerName,
  isHost,
  isCaptain = false,
  myTeamId,
  playerTeamId,
  isPlayerHost = false,
  isPlayerCaptain = false,
  isMe = false,
  getSocket,
  compact = false,
  context = 'lobby',
}: FighterActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'kick' | 'transfer-host' | 'transfer-captain' | null>(null)
  const [optimisticLocalMute, setOptimisticLocalMute] = useState<boolean | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const isMuted = usePlayerMuteStore((s) => s.isPlayerMuted(playerId))
  const localMuteState = optimisticLocalMute !== null ? optimisticLocalMute : isMuted

  // Close menu helper
  const closeMenu = () => setIsOpen(false)

  // Close on outside click, Escape, and scroll
  useEffect(() => {
    if (!isOpen) return

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        closeMenu()
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    const handleScroll = () => {
      closeMenu()
    }
    const handleResize = () => {
      closeMenu()
    }

    // Use mousedown for instant response (before click completes)
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    // Close on any scroll in the page to avoid detached menus
    window.addEventListener('scroll', handleScroll, true) // capture phase
    window.addEventListener('resize', handleResize)

    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [isOpen])

  // Clear optimistic state after real state catches up
  useEffect(() => {
    if (optimisticLocalMute !== null && optimisticLocalMute === isMuted) {
      const t = setTimeout(() => setOptimisticLocalMute(null), 200)
      return () => clearTimeout(t)
    }
  }, [optimisticLocalMute, isMuted])

  // ---- Action handlers ----
  const doLocalMute = () => {
    // Optimistic update for instant visual feedback
    setOptimisticLocalMute(!localMuteState)
    usePlayerMuteStore.getState().toggleLocalMute(playerId, playerName)
    closeMenu()
  }

  const doGlobalMute = () => {
    const socket = getSocket()
    if (socket) {
      socket.emit('mute-player', { playerId })
      battleToast('global_mute_sent', 'تم كتم الصوت', `${playerName} تم كتم صوته للجميع`)
    }
    closeMenu()
  }

  const doKick = () => {
    const socket = getSocket()
    if (socket) {
      socket.emit('kick-player', { playerId })
      battleToast('kick_sent', 'تم الطرد', `${playerName} تم طرده من الساحة`)
    }
    setConfirmAction(null)
    closeMenu()
  }

  const doTransferHost = () => {
    const socket = getSocket()
    if (socket) {
      socket.emit('transfer-leadership', { targetPlayerId: playerId, type: 'host' })
    }
    setConfirmAction(null)
    closeMenu()
  }

  const doTransferCaptain = () => {
    const socket = getSocket()
    if (socket) {
      socket.emit('transfer-leadership', { targetPlayerId: playerId, type: 'captain' })
    }
    setConfirmAction(null)
    closeMenu()
  }

  // ---- Build menu items ----
  const menuItems: {
    id: string
    label: string
    icon: React.ReactNode
    colorClass: string
    hoverClass: string
    action: () => void
    dividerAfter?: boolean
  }[] = []

  // 1. Local mute — available to everyone (not self)
  if (!isMe) {
    menuItems.push({
      id: 'local-mute',
      label: localMuteState ? 'إلغاء الكتم لدي فقط' : 'كتم لدي فقط',
      icon: localMuteState ? <Volume1 className="w-4 h-4" /> : <MicOff className="w-4 h-4" />,
      colorClass: localMuteState ? 'text-amber-400' : 'text-slate-300',
      hoverClass: 'hover:bg-amber-500/15',
      action: doLocalMute,
    })
  }

  // 2. Global mute — host only, not on self, not on other host
  if (isHost && !isMe && !isPlayerHost) {
    menuItems.push({
      id: 'global-mute',
      label: 'كتم لدى الجميع',
      icon: <VolumeX className="w-4 h-4" />,
      colorClass: 'text-orange-400',
      hoverClass: 'hover:bg-orange-500/15',
      action: doGlobalMute,
    })
  }

  // 3. Kick — host only, not on self, not on other host
  if (isHost && !isMe && !isPlayerHost) {
    menuItems.push({
      id: 'kick',
      label: 'طرد من الساحة',
      icon: <UserX className="w-4 h-4" />,
      colorClass: 'text-red-400',
      hoverClass: 'hover:bg-red-500/15',
      action: () => setConfirmAction('kick'),
      dividerAfter: true,
    })
  }

  // 4. Transfer host leadership — host only, not on self, not on other host
  if (isHost && !isMe && !isPlayerHost) {
    menuItems.push({
      id: 'transfer-host',
      label: 'نوّل الإدارة',
      icon: <Shield className="w-4 h-4" />,
      colorClass: 'text-violet-400',
      hoverClass: 'hover:bg-violet-500/15',
      action: () => setConfirmAction('transfer-host'),
    })
  }

  // 5. Transfer captain leadership — captain only, on same team, not on self, not on other captains
  if (isCaptain && myTeamId && playerTeamId === myTeamId && !isMe && !isPlayerCaptain) {
    menuItems.push({
      id: 'transfer-captain',
      label: 'نوّل القيادة',
      icon: <Crown className="w-4 h-4" />,
      colorClass: 'text-amber-400',
      hoverClass: 'hover:bg-amber-500/15',
      action: () => setConfirmAction('transfer-captain'),
    })
  }

  // No actions available — don't render the menu trigger
  if (menuItems.length === 0) return null

  const btnSize = compact ? 'w-7 h-7' : 'w-8 h-8 sm:w-9 sm:h-9'
  const iconSize = compact ? 'w-3.5 h-3.5' : 'w-3.5 h-3.5 sm:w-4 sm:h-4'

  return (
    <>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        className={`${btnSize} rounded-full flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition-all duration-150 active:scale-90 ${isOpen ? 'text-white bg-white/10' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen((prev) => !prev)
        }}
        aria-label={`إجراءات ${playerName}`}
        aria-expanded={isOpen}
      >
        <MoreVertical className={iconSize} />
      </button>

      {/* Action Menu Popup */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.9, y: -2 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -2 }}
            transition={{ duration: 0.12, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="absolute left-0 top-full mt-1 z-50 min-w-[180px] sm:min-w-[200px] rounded-xl bg-[#1a1a2e]/98 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50 py-1.5 overflow-hidden"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Player name header */}
            <div className="px-3 py-2 border-b border-white/5 mb-1">
              <span className="text-xs font-semibold text-slate-400 truncate block">{playerName}</span>
            </div>

            {menuItems.map((item) => (
              <div key={item.id}>
                <button
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm ${item.colorClass} ${item.hoverClass} active:scale-[0.98] transition-all duration-75 text-right`}
                  onClick={() => item.action()}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                </button>
                {item.dividerAfter && (
                  <div className="my-1 mx-3 border-t border-white/5" />
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialogs */}
      <AlertDialog open={confirmAction === 'kick'} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="bg-[#12121F] border-white/10 text-white max-w-[calc(100vw-2rem)]" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">طرد {playerName}؟</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {context === 'game'
                ? `هتطرد ${playerName} من المعركة. النقاط بتاعته هتتحسب لحد ما اتحسبت.`
                : `هتطرد ${playerName} من الساحة. المقاتل مش هيقدر يرجع غير لو دخل من أول وجديد.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={doKick}
            >
              طرد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAction === 'transfer-host'} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="bg-[#12121F] border-white/10 text-white max-w-[calc(100vw-2rem)]" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">نقل الإدارة لـ {playerName}؟</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              هتسيب منصب قائد الساحة و {playerName} هيبقى القائد الجديد
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-violet-600 text-white hover:bg-violet-700"
              onClick={doTransferHost}
            >
              <Shield className="w-3.5 h-3.5 ml-1" /> نوّل الإدارة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAction === 'transfer-captain'} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="bg-[#12121F] border-white/10 text-white max-w-[calc(100vw-2rem)]" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">نقل القيادة لـ {playerName}؟</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              هتسيب منصب قائد الفريق و {playerName} هيبقى القائد الجديد
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={doTransferCaptain}
            >
              <Crown className="w-3.5 h-3.5 ml-1" /> نوّل القيادة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
