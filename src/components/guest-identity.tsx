'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useGuestStore } from '@/lib/guest-store'
import { generateRandomArabicName, getRandomAvatarColor } from '@/lib/arabic-names'
import { Swords, Sparkles, Dice5, ArrowLeft, Flame, Zap } from 'lucide-react'

// ============================================
// CINEMATIC NAME ENTRY MODAL
// Shows on first visit — feels like entering an arena
// ============================================
export function NameEntryModal() {
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [phase, setPhase] = useState<'input' | 'entering'>('input')
  const [suggestedNames] = useState(() => generateRandomArabicName())
  const setGuest = useGuestStore((s) => s.setGuest)
  const saveGuestId = useGuestStore((s) => s.saveGuestId)
  const setShowNameModal = useGuestStore((s) => s.setShowNameModal)

  const handleSubmit = useCallback(async () => {
    const finalName = name.trim() || suggestedNames
    if (!finalName) return

    setIsSubmitting(true)
    setPhase('entering')

    const avatarColor = getRandomAvatarColor()
    let guestSaved = false

    try {
      const res = await fetch('/api/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: finalName, avatarColor }),
      })

      if (res.ok) {
        const guest = await res.json()
        saveGuestId(guest.id)
        setGuest(guest)
        guestSaved = true
      }
    } catch {
      // API unavailable (e.g., Vercel serverless without SQLite)
    }

    // Fallback: create a local-only guest identity if API failed
    if (!guestSaved) {
      const localGuest = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        displayName: finalName,
        avatarColor,
      }
      saveGuestId(localGuest.id)
      setGuest(localGuest)
    }

    // Small delay for the cinematic "entering" animation
    setTimeout(() => {
      setShowNameModal(false)
    }, 1200)
  }, [name, suggestedNames, setGuest, saveGuestId, setShowNameModal])

  const handleRandomName = useCallback(() => {
    setName(generateRandomArabicName())
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit()
    }
  }, [handleSubmit])

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0A0A12] overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Background effects */}
      <div className="absolute inset-0 battle-grid opacity-30" />
      <div className="absolute inset-0 particles-bg opacity-40" />

      {/* Ambient glow */}
      <motion.div
        className="absolute w-[800px] h-[800px] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.12) 0%, rgba(245,158,11,0.08) 30%, transparent 60%)' }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Floating embers */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={`ember-${i}`}
          initial={{ opacity: 0, y: 400, x: (Math.random() - 0.5) * 300 }}
          animate={{
            opacity: [0, 0.8, 0.4, 0],
            y: -400,
            x: (Math.random() - 0.5) * 500,
            scale: [0, 1, 0.3],
          }}
          transition={{
            duration: 4 + Math.random() * 3,
            delay: i * 0.6,
            repeat: Infinity,
            ease: 'easeOut',
          }}
          className="absolute bottom-0 w-2 h-2 rounded-full"
          style={{
            background: i % 2 === 0 ? '#DC2626' : '#F59E0B',
            boxShadow: i % 2 === 0
              ? '0 0 8px rgba(220,38,38,0.8), 0 0 16px rgba(220,38,38,0.4)'
              : '0 0 8px rgba(245,158,11,0.8), 0 0 16px rgba(245,158,11,0.4)',
          }}
        />
      ))}

      {/* Main content */}
      <AnimatePresence mode="wait">
        {phase === 'input' ? (
          <motion.div
            key="input-phase"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 1.05 }}
            transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
            className="relative z-10 w-full max-w-md px-6"
          >
            {/* Icon */}
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
              className="mx-auto mb-6 w-24 h-24 rounded-2xl bg-gradient-to-br from-red-600 to-amber-600 flex items-center justify-center relative"
              style={{ boxShadow: '0 0 40px rgba(220,38,38,0.4), 0 0 80px rgba(245,158,11,0.2)' }}
            >
              <Swords className="w-12 h-12 text-white" />
              <motion.div
                className="absolute inset-0 rounded-2xl border-2 border-amber-400/30"
                animate={{ opacity: [0.3, 0.8, 0.3], scale: [1, 1.05, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.div>

            {/* Title */}
            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-3xl sm:text-4xl font-black text-center text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-amber-300 to-red-400 mb-2"
            >
              اختار اسم المحارب
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-center text-slate-400 mb-8 text-lg"
            >
              اكتب اسمك قبل دخول المعركة ⚔️
            </motion.p>

            {/* Name input */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="space-y-4"
            >
              <div className="relative">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={suggestedNames}
                  className="battle-input rounded-xl text-right text-xl h-14 pr-4 pl-14 font-bold"
                  maxLength={20}
                  autoFocus
                  dir="rtl"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleRandomName}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 transition-all"
                  title="اسم عشوائي"
                >
                  <Dice5 className="w-5 h-5" />
                </Button>
              </div>

              {/* Random name button */}
              <Button
                variant="ghost"
                onClick={handleRandomName}
                className="w-full py-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 hover:bg-amber-500/15 hover:text-amber-300 transition-all text-base font-semibold gap-2"
              >
                <Dice5 className="w-5 h-5" />
                🎲 اسم عشوائي
              </Button>

              {/* Enter arena button */}
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full py-4 rounded-xl text-lg font-black bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white shadow-lg shadow-red-500/25 transition-all border-0"
                  style={{ boxShadow: '0 0 30px rgba(220,38,38,0.3), 0 0 60px rgba(245,158,11,0.15)' }}
                >
                  {isSubmitting ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <Flame className="w-6 h-6" />
                    </motion.div>
                  ) : (
                    <>
                      <Zap className="w-5 h-5 ml-2" />
                      ادخل الساحة
                    </>
                  )}
                </Button>
              </motion.div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="entering-phase"
            initial={{ opacity: 0, scale: 0.8, filter: 'blur(20px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            className="relative z-10 text-center"
          >
            {/* Entering animation */}
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                filter: [
                  'drop-shadow(0 0 20px rgba(220,38,38,0.4))',
                  'drop-shadow(0 0 40px rgba(220,38,38,0.8)) drop-shadow(0 0 80px rgba(245,158,11,0.4))',
                  'drop-shadow(0 0 20px rgba(220,38,38,0.4))',
                ],
              }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
              className="mb-6"
            >
              <Swords className="w-24 h-24 mx-auto text-red-500" />
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-amber-300 to-red-400 mb-2"
            >
              أهلاً يا {name.trim() || suggestedNames}
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-slate-400 text-lg"
            >
              <Sparkles className="w-5 h-5 inline ml-1 text-amber-400" />
              الساحة بتستناك...
            </motion.p>

            {/* Burst effect */}
            <motion.div
              initial={{ scale: 0, opacity: 1 }}
              animate={{ scale: 4, opacity: 0 }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.6) 0%, rgba(245,158,11,0.3) 40%, transparent 70%)' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ============================================
// EDIT NAME MODAL
// Small modal for changing display name
// ============================================
export function EditNameModal() {
  const guest = useGuestStore((s) => s.guest)
  const setGuest = useGuestStore((s) => s.setGuest)
  const showEditModal = useGuestStore((s) => s.showEditModal)
  const setShowEditModal = useGuestStore((s) => s.setShowEditModal)
  const saveGuestId = useGuestStore((s) => s.saveGuestId)
  const [name, setName] = useState(guest?.displayName || '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Sync name when guest changes or modal opens
  useEffect(() => {
    if (showEditModal && guest?.displayName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(guest.displayName)
    }
  }, [showEditModal, guest?.displayName])

  const handleRandomName = useCallback(() => {
    setName(generateRandomArabicName())
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!guest?.id || !name.trim()) return

    setIsSubmitting(true)
    let apiSucceeded = false

    try {
      // Try PATCH first (update existing guest)
      const res = await fetch('/api/guest', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestId: guest.id, displayName: name.trim() }),
      })

      if (res.ok) {
        const updated = await res.json()
        setGuest({ ...guest, displayName: updated.displayName })
        apiSucceeded = true
      } else {
        // PATCH failed — guest may not exist in DB (e.g. local-only fallback)
        // Try creating a new guest record instead
        const createRes = await fetch('/api/guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: name.trim(), avatarColor: guest.avatarColor, guestId: guest.id }),
        })
        if (createRes.ok) {
          const created = await createRes.json()
          setGuest({ ...guest, id: created.id, displayName: created.displayName })
          saveGuestId(created.id)
          apiSucceeded = true
        }
      }
    } catch {
      // API unavailable — update locally anyway
    }

    // Always update local state even if API failed
    if (!apiSucceeded) {
      setGuest({ ...guest, displayName: name.trim() })
    }

    setShowEditModal(false)
    setIsSubmitting(false)
    // Notify game server so other players see the new name
    window.dispatchEvent(new CustomEvent('player-name-changed', { detail: { newName: name.trim() } }))
  }, [guest, name, setGuest, setShowEditModal, saveGuestId])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
  }, [handleSubmit])

  if (!showEditModal) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={() => setShowEditModal(false)}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm mx-4 p-6 rounded-2xl bg-[#12121E] border border-white/10 shadow-2xl"
          style={{ boxShadow: '0 0 40px rgba(220,38,38,0.15), 0 0 80px rgba(245,158,11,0.08)' }}
        >
          <h3 className="text-xl font-black text-white mb-1 text-right">غيّر اسمك</h3>
          <p className="text-sm text-slate-400 mb-4 text-right">اختار اسم جديد للمعركة</p>

          <div className="space-y-3">
            <div className="relative">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="اكتب اسمك الجديد..."
                className="battle-input rounded-xl text-right text-lg h-12 pr-4 pl-12"
                maxLength={20}
                autoFocus
                dir="rtl"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleRandomName}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20"
                title="اسم عشوائي"
              >
                <Dice5 className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !name.trim()}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold border-0"
              >
                {isSubmitting ? '...' : 'حفظ'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowEditModal(false)}
                className="px-6 py-3 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5"
              >
                إلغاء
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ============================================
// PLAYER NAME BADGE
// Shows the guest name with an edit icon
// ============================================
export function PlayerNameBadge() {
  const guest = useGuestStore((s) => s.guest)
  const setShowEditModal = useGuestStore((s) => s.setShowEditModal)

  if (!guest) return null

  return (
    <motion.button
      onClick={() => setShowEditModal(true)}
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all group"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Avatar dot */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black"
        style={{ backgroundColor: guest.avatarColor }}
      >
        {guest.displayName.charAt(0)}
      </div>
      <span className="text-white font-bold text-sm">{guest.displayName}</span>
      <motion.span
        className="text-slate-500 group-hover:text-amber-400 transition-colors"
        whileHover={{ rotate: 15 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
          <path d="m15 5 4 4"/>
        </svg>
      </motion.span>
    </motion.button>
  )
}
