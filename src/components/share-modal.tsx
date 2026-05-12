'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGameStore, type GameSettings } from '@/lib/game-store'
import { useGuestStore } from '@/lib/guest-store'
import {
  shareRoom,
  canNativeShare,
  generateJoinUrl,
  type ShareChannel,
  copyToClipboard,
} from '@/lib/share-utils'
import { generateInviteMessage } from '@/lib/invite-generator'
import {
  X,
  Share2,
  Copy,
  Check,
  MessageCircle,
  Send,
  Phone,
  Link2,
  MoreHorizontal,
  Loader2,
  Sparkles,
  Swords,
  RefreshCw,
} from 'lucide-react'

// ─── Share Modal Props ────────────────────────────────────────────────

interface ShareModalProps {
  open: boolean
  onClose: () => void
}

// ─── Share Channel Button ──────────────────────────────────────────────

function ShareChannelButton({
  icon,
  label,
  color,
  onClick,
  loading,
}: {
  icon: React.ReactNode
  label: string
  color: string
  onClick: () => void
  loading?: boolean
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      disabled={loading}
      className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all hover:bg-white/5 disabled:opacity-50"
    >
      <div
        className={`w-12 h-12 rounded-full flex items-center justify-center ${color} transition-transform`}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin text-white" /> : icon}
      </div>
      <span className="text-xs text-slate-300 font-medium">{label}</span>
    </motion.button>
  )
}

// ─── Main Share Modal ─────────────────────────────────────────────────

export function ShareModal({ open, onClose }: ShareModalProps) {
  const roomCode = useGameStore((s) => s.roomCode)
  const roomType = useGameStore((s) => s.roomType)
  const roomPassword = useGameStore((s) => s.roomPassword)
  const gameSettings = useGameStore((s) => s.gameSettings)
  const players = useGameStore((s) => s.players)
  const [copied, setCopied] = useState<'none' | 'link' | 'message'>('none')
  const [sharing, setSharing] = useState<ShareChannel | null>(null)
  const [messagePreview, setMessagePreview] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  const joinUrl = generateJoinUrl(roomCode)

  const shareInfo = {
    roomCode,
    roomType,
    hasPassword: !!roomPassword,
    gameType: gameSettings.gameType,
    difficulty: gameSettings.difficulty,
    passageType: gameSettings.gameType === 'قراءة متحررة' ? gameSettings.passageType : undefined,
    numberOfRounds: gameSettings.numberOfRounds,
    maxPlayers: gameSettings.maxPlayers,
    currentPlayers: players.length,
    timePerRound: gameSettings.timePerRound,
    hostName: players.find((p) => p.isHost)?.name || '',
    roomStatus: 'waiting' as const,
    joinUrl,
  }

  // Generate message preview
  useEffect(() => {
    if (open) {
      setMessagePreview(generateInviteMessage(shareInfo))
    }
  }, [open, roomCode, players.length, gameSettings.gameType, gameSettings.difficulty, gameSettings.passageType])

  const handleShare = useCallback(async (channel: ShareChannel) => {
    setSharing(channel)
    try {
      const result = await shareRoom(channel, shareInfo)
      if (channel === 'copy' && result.success) {
        setCopied('link')
        setTimeout(() => setCopied('none'), 2000)
      }
    } finally {
      setSharing(null)
    }
  }, [shareInfo])

  const handleCopyLink = useCallback(async () => {
    setSharing('copy')
    const ok = await copyToClipboard(joinUrl)
    setSharing(null)
    if (ok) {
      setCopied('link')
      setTimeout(() => setCopied('none'), 2000)
    }
  }, [joinUrl])

  const handleCopyMessage = useCallback(async () => {
    setSharing('copy')
    const ok = await copyToClipboard(messagePreview)
    setSharing(null)
    if (ok) {
      setCopied('message')
      setTimeout(() => setCopied('none'), 2000)
    }
  }, [messagePreview])

  const handleRefreshMessage = useCallback(() => {
    setMessagePreview(generateInviteMessage(shareInfo))
  }, [shareInfo])

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 100, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[#0F0F1A] border border-white/10 shadow-2xl"
          style={{ boxShadow: '0 0 60px rgba(220,38,38,0.15), 0 0 120px rgba(245,158,11,0.08)' }}
        >
          {/* Header */}
          <div className="relative p-5 border-b border-white/5">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 to-amber-600 flex items-center justify-center"
              style={{ boxShadow: '0 0 30px rgba(220,38,38,0.3)' }}
            >
              <Share2 className="w-7 h-7 text-white" />
            </motion.div>
            <h3 className="text-xl font-black text-white text-center">شارك الساحة</h3>
            <p className="text-sm text-slate-400 text-center mt-1">ابعت الدعوة لأصحابك وخلّي المعركة تبدأ</p>

            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Room Code Display */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-white/5">
              <div className="flex-1 text-center">
                <span className="text-xs text-slate-500">كود الساحة</span>
                <p className="font-mono text-2xl tracking-[0.2em] font-black text-red-400">{roomCode}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleCopyLink}
                className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:text-white hover:bg-white/10"
              >
                {copied === 'link' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>

            {/* Join URL */}
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={joinUrl}
                className="text-xs text-slate-400 bg-black/20 border-white/5 h-9 select-all"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyLink}
                className="shrink-0 border-white/10 bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 text-xs"
              >
                {copied === 'link' ? <Check className="w-3.5 h-3.5 mr-1 text-green-400" /> : <Link2 className="w-3.5 h-3.5 mr-1" />}
                {copied === 'link' ? 'تم!' : 'نسخ'}
              </Button>
            </div>

            {/* Quick Share Buttons */}
            <div className="space-y-3">
              <p className="text-xs text-slate-500 font-semibold">مشاركة سريعة</p>
              <div className="grid grid-cols-4 gap-2">
                {/* WhatsApp */}
                <ShareChannelButton
                  icon={<MessageCircle className="w-5 h-5 text-white" />}
                  label="واتساب"
                  color="bg-[#25D366]"
                  onClick={() => handleShare('whatsapp')}
                  loading={sharing === 'whatsapp'}
                />

                {/* Telegram */}
                <ShareChannelButton
                  icon={<Send className="w-5 h-5 text-white" />}
                  label="تليجرام"
                  color="bg-[#0088cc]"
                  onClick={() => handleShare('telegram')}
                  loading={sharing === 'telegram'}
                />

                {/* SMS */}
                <ShareChannelButton
                  icon={<Phone className="w-5 h-5 text-white" />}
                  label="رسالة SMS"
                  color="bg-gradient-to-br from-green-500 to-emerald-600"
                  onClick={() => handleShare('sms')}
                  loading={sharing === 'sms'}
                />

                {/* More / Native Share */}
                <ShareChannelButton
                  icon={<MoreHorizontal className="w-5 h-5 text-white" />}
                  label="المزيد"
                  color="bg-gradient-to-br from-slate-500 to-slate-700"
                  onClick={() => handleShare('native')}
                  loading={sharing === 'native'}
                />
              </div>
            </div>

            {/* Message Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 font-semibold">معاينة الرسالة</p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleRefreshMessage}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-white/5 transition-all"
                    title="رسالة جديدة"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    {showPreview ? 'إخفاء' : 'عرض'}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {showPreview && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 rounded-xl bg-black/30 border border-white/5 text-sm text-slate-300 whitespace-pre-line max-h-48 overflow-y-auto custom-scrollbar">
                      {messagePreview}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <Button
                variant="ghost"
                onClick={handleCopyMessage}
                className="w-full py-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 hover:bg-amber-500/15 hover:text-amber-300 transition-all text-sm font-semibold gap-2"
              >
                {copied === 'message' ? (
                  <>
                    <Check className="w-4 h-4 text-green-400" />
                    تم نسخ الرسالة!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    نسخ رسالة الدعوة
                  </>
                )}
              </Button>
            </div>

            {/* Room Info Summary */}
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-300">
                {gameSettings.gameType === 'قراءة متحررة' ? '📚' : '📜'} {gameSettings.gameType}
              </span>
              {gameSettings.gameType === 'قراءة متحررة' && gameSettings.passageType && (
                <span className={`px-2.5 py-1 rounded-full border ${
                  gameSettings.passageType === 'علمي'
                    ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300'
                    : gameSettings.passageType === 'أدبي'
                      ? 'bg-purple-500/10 border-purple-500/20 text-purple-300'
                      : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                }`}>
                  {gameSettings.passageType === 'علمي' ? '🔬' : gameSettings.passageType === 'أدبي' ? '✒️' : '🎲'} {gameSettings.passageType}
                </span>
              )}
              <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">
                ⚡ {gameSettings.difficulty}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                🔄 {gameSettings.numberOfRounds} جولات
              </span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                👥 {players.length}/{gameSettings.maxPlayers}
              </span>
              {roomType === 'خاصة' && (
                <span className="px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300">
                  🔒 خاصة
                </span>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
