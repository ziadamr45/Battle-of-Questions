'use client'

import { useState, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import {
  ChevronRight,
  Swords,
  Heart,
  Code2,
  Globe,
  Mail,
  Sparkles,
  ExternalLink,
  Shield,
  Zap,
  BookOpen,
  Users,
  Star,
  Flame,
  Trophy,
  ChevronLeft,
  Send,
  Bug,
  Lightbulb,
  Github,
  Youtube,
  Twitter,
  Instagram,
} from 'lucide-react'

interface AboutPageProps {
  onBack: () => void
}

/* ─── Floating Particles Background ─── */
function FloatingParticles() {
  const particles = useMemo(() => Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    duration: Math.random() * 6 + 6,
    delay: Math.random() * 4,
    color: i % 3 === 0 ? '#DC2626' : i % 3 === 1 ? '#F59E0B' : '#06B6D4',
  })), [])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            boxShadow: `0 0 ${p.size * 3}px ${p.color}40`,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [0.2, 0.6, 0.2],
            scale: [1, 1.3, 1],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

/* ─── Animated Border Card ─── */
function AnimatedBorderCard({
  children,
  className = '',
  borderColor = '#DC2626',
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  borderColor?: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.6, delay }}
      className={`relative group ${className}`}
    >
      {/* Animated border glow */}
      <div
        className="absolute -inset-[1px] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-[1px]"
        style={{
          background: `linear-gradient(135deg, ${borderColor}40, transparent 40%, ${borderColor}40)`,
        }}
      />
      {/* Rotating border effect */}
      <motion.div
        className="absolute -inset-[1px] rounded-2xl overflow-hidden opacity-0 group-hover:opacity-60 transition-opacity duration-700"
        style={{}}
      >
        <motion.div
          className="absolute inset-0"
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          style={{
            background: `conic-gradient(from 0deg, transparent, ${borderColor}60, transparent, transparent)`,
          }}
        />
      </motion.div>
      {/* Card content */}
      <div className="relative rounded-2xl bg-gradient-to-br from-[#12121F]/95 to-[#1A1A2E]/95 backdrop-blur-xl border border-white/[0.06] p-6 group-hover:border-white/[0.1] transition-colors duration-300">
        {children}
      </div>
    </motion.div>
  )
}

/* ─── Social Link Data ─── */
const socialLinks = [
  {
    name: 'فيسبوك',
    nameEn: 'Facebook',
    url: 'https://www.facebook.com/ziad7mr',
    color: '#1877F2',
    icon: 'facebook',
  },
  {
    name: 'تيليجرام',
    nameEn: 'Telegram',
    url: 'https://t.me/ziadamr',
    color: '#0088CC',
    icon: 'send',
  },
  {
    name: 'البريد الإلكتروني',
    nameEn: 'Email',
    url: 'mailto:ziad90216@gmail.com',
    color: '#EA4335',
    icon: 'mail',
  },
  {
    name: 'يوتيوب',
    nameEn: 'YouTube',
    url: 'https://youtube.com/@alhayat_ala_eltarek?si=pcsc_31Kcv3Jym14',
    color: '#FF0000',
    icon: 'youtube',
  },
  {
    name: 'إنستاجرام',
    nameEn: 'Instagram',
    url: 'https://www.instagram.com/ziadamr455/',
    color: '#E4405F',
    icon: 'instagram',
  },
  {
    name: 'ثريدز',
    nameEn: 'Threads',
    url: 'https://www.threads.com/@ziadamr455',
    color: '#FFFFFF',
    icon: 'at-sign',
  },
  {
    name: 'إكس',
    nameEn: 'X / Twitter',
    url: 'https://x.com/ziad90216',
    color: '#1DA1F2',
    icon: 'twitter',
  },
  {
    name: 'غيتهب',
    nameEn: 'GitHub',
    url: 'https://github.com/ziadamr45',
    color: '#6e5494',
    icon: 'github',
  },
  {
    name: 'الموقع الشخصي',
    nameEn: 'Website',
    url: 'https://ziadamrme.netlify.app',
    color: '#00C7B7',
    icon: 'globe',
  },
]

/* ─── Social Icon Renderer ─── */
function SocialIcon({ icon, size = 20 }: { icon: string; size?: number }) {
  const props = { size, strokeWidth: 1.8 }
  switch (icon) {
    case 'facebook':
      return (
        <svg {...props} viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      )
    case 'send':
      return <Send {...props} />
    case 'mail':
      return <Mail {...props} />
    case 'youtube':
      return <Youtube {...props} />
    case 'instagram':
      return <Instagram {...props} />
    case 'at-sign':
      return <span className="font-black text-lg leading-none">@</span>
    case 'twitter':
      return <Twitter {...props} />
    case 'github':
      return <Github {...props} />
    case 'globe':
      return <Globe {...props} />
    default:
      return <ExternalLink {...props} />
  }
}

/* ─── Confetti Particle ─── */
function ConfettiBurst({ active }: { active: boolean }) {
  const confetti = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    angle: (i / 30) * 360,
    distance: Math.random() * 150 + 80,
    size: Math.random() * 8 + 4,
    color: ['#DC2626', '#F59E0B', '#FCD34D', '#EF4444', '#06B6D4', '#FF6B6B'][i % 6],
    rotation: Math.random() * 360,
    duration: Math.random() * 0.8 + 0.6,
  }))

  return (
    <AnimatePresence>
      {active && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {confetti.map((c) => {
            const rad = (c.angle * Math.PI) / 180
            const tx = Math.cos(rad) * c.distance
            const ty = Math.sin(rad) * c.distance
            return (
              <motion.div
                key={c.id}
                className="absolute top-1/2 left-1/2 rounded-sm"
                style={{
                  width: c.size,
                  height: c.size,
                  backgroundColor: c.color,
                  boxShadow: `0 0 6px ${c.color}80`,
                }}
                initial={{ x: 0, y: 0, scale: 0, rotate: 0, opacity: 1 }}
                animate={{ x: tx, y: ty, scale: 1, rotate: c.rotation + 360, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: c.duration, ease: 'easeOut' }}
              />
            )
          })}
        </div>
      )}
    </AnimatePresence>
  )
}

/* ═══════════════════════════════════════════════ */
/*             MAIN ABOUT PAGE COMPONENT            */
/* ═══════════════════════════════════════════════ */
export function AboutPage({ onBack }: AboutPageProps) {
  const [devClickCount, setDevClickCount] = useState(0)
  const [showEasterEgg, setShowEasterEgg] = useState(false)
  const devClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleDevClick = () => {
    const newCount = devClickCount + 1
    setDevClickCount(newCount)

    if (devClickTimer.current) clearTimeout(devClickTimer.current)
    devClickTimer.current = setTimeout(() => setDevClickCount(0), 2000)

    if (newCount >= 5) {
      setShowEasterEgg(true)
      setDevClickCount(0)
      setTimeout(() => setShowEasterEgg(false), 2500)
    }
  }

  return (
    <div
      dir="rtl"
      className="relative min-h-screen bg-[#0A0A12] text-white overflow-x-hidden"
    >
      {/* ═══ Background Effects ═══ */}
      <div className="fixed inset-0 battle-grid pointer-events-none" />
      <div className="fixed inset-0 arena-noise pointer-events-none" />
      <div className="fixed inset-0 arena-depth-glow-top pointer-events-none" />
      <div className="fixed inset-0 arena-depth-glow-bottom pointer-events-none" />
      <FloatingParticles />

      {/* ═══ Sticky Header ═══ */}
      <motion.header
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="sticky top-0 z-50 backdrop-blur-xl bg-[#0A0A12]/80 border-b border-white/[0.06]"
      >
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-white/70 hover:text-white hover:bg-white/[0.06] gap-1.5"
          >
            <ChevronRight size={18} />
            <span className="text-sm font-semibold">رجوع</span>
          </Button>
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-[#DC2626]" />
            <span className="text-sm font-bold tracking-wide text-white/90">عنّا</span>
          </div>
          <div className="w-16" />
        </div>
      </motion.header>

      {/* ═══ Main Content ═══ */}
      <main className="relative z-10 max-w-4xl mx-auto px-4 pb-20">

        {/* ══════════════════════════════════════ */}
        {/*         1. HERO SECTION               */}
        {/* ══════════════════════════════════════ */}
        <section className="relative pt-16 pb-20 text-center overflow-hidden">
          {/* Central glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[#DC2626]/[0.04] blur-[100px] pointer-events-none" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-[#F59E0B]/[0.03] blur-[80px] pointer-events-none" />

          {/* Shield / Logo Area */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.8, type: 'spring', stiffness: 100 }}
            className="relative mx-auto w-28 h-28 mb-8"
          >
            <motion.div
              animate={{
                boxShadow: [
                  '0 0 30px rgba(220,38,38,0.2), 0 0 60px rgba(245,158,11,0.1)',
                  '0 0 50px rgba(220,38,38,0.35), 0 0 100px rgba(245,158,11,0.15)',
                  '0 0 30px rgba(220,38,38,0.2), 0 0 60px rgba(245,158,11,0.1)',
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="w-full h-full rounded-full bg-gradient-to-br from-[#DC2626]/20 to-[#F59E0B]/10 border border-[#DC2626]/30 flex items-center justify-center"
            >
              <Swords size={48} className="text-[#DC2626] drop-shadow-[0_0_12px_rgba(220,38,38,0.5)]" />
            </motion.div>
            {/* Orbit ring */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              className="absolute -inset-3 rounded-full border border-dashed border-[#F59E0B]/20"
            />
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.7 }}
            className="text-4xl md:text-6xl font-black mb-4"
          >
            <span className="bg-gradient-to-l from-[#DC2626] via-[#FCD34D] to-[#DC2626] bg-clip-text text-transparent text-glow-red">
              معركة الأسئلة
            </span>
          </motion.h1>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.7 }}
            className="text-lg md:text-xl text-[#F59E0B]/80 font-semibold mb-6"
          >
            Battle of Questions
          </motion.p>

          {/* Emotional intro */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.7 }}
            className="max-w-md mx-auto"
          >
            <p className="text-white/50 text-sm md:text-base leading-relaxed">
              وراء كل ساحة... حلم يُصنع بشغف
            </p>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '80px' }}
              transition={{ delay: 1, duration: 0.8 }}
              className="h-[2px] mx-auto mt-4 bg-gradient-to-l from-[#DC2626] to-[#F59E0B] rounded-full"
            />
          </motion.div>

          {/* Decorative swords */}
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: 0.9, duration: 0.6 }}
            className="flex items-center justify-center gap-3 mt-8 text-white/20"
          >
            <div className="h-[1px] w-20 bg-gradient-to-l from-white/20 to-transparent" />
            <Swords size={14} />
            <div className="h-[1px] w-20 bg-gradient-to-r from-white/20 to-transparent" />
          </motion.div>
        </section>

        {/* ══════════════════════════════════════ */}
        {/*     2. ABOUT THE PROJECT SECTION      */}
        {/* ══════════════════════════════════════ */}
        <section className="mb-16">
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3 mb-8"
          >
            <div className="w-10 h-10 rounded-xl bg-[#DC2626]/10 border border-[#DC2626]/20 flex items-center justify-center">
              <Flame size={20} className="text-[#DC2626]" />
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white">عن المشروع</h2>
          </motion.div>

          <div className="grid gap-5">
            {/* What is the game */}
            <AnimatedBorderCard borderColor="#DC2626" delay={0.1}>
              <div className="flex gap-4">
                <div className="shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-[#DC2626]/20 to-[#DC2626]/5 border border-[#DC2626]/15 flex items-center justify-center">
                  <Swords size={22} className="text-[#DC2626]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-2">ما هي معركة الأسئلة؟</h3>
                  <p className="text-white/60 text-sm leading-relaxed">
                    ليست مجرد معركة أسئلة عادية... معركة الأسئلة هي ساحة رقمية تتحول فيها المعرفة إلى سلاح.
                    كل سؤال هو ضربة، وكل إجابة هي درع. هنا لا تقرأ لتتعلم فقط — بل تقرأ لتفوز.
                  </p>
                </div>
              </div>
            </AnimatedBorderCard>

            {/* Why it was created */}
            <AnimatedBorderCard borderColor="#F59E0B" delay={0.2}>
              <div className="flex gap-4">
                <div className="shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-[#F59E0B]/20 to-[#F59E0B]/5 border border-[#F59E0B]/15 flex items-center justify-center">
                  <Sparkles size={22} className="text-[#F59E0B]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-2">لماذا وُلدت هذه الساحة؟</h3>
                  <p className="text-white/60 text-sm leading-relaxed">
                    لأن العالم العربي يستحق منصات ترفيهية تليق بذكائه. لأن القراءة يمكن أن تكون مثيرة مثل القتال.
                    لأن المنافسة حين تُبنى على المعرفة لا تُخرّب — بل تبني أجيالاً تحب أن تتعلم وتتنافس.
                  </p>
                </div>
              </div>
            </AnimatedBorderCard>

            {/* Multiplayer vision */}
            <AnimatedBorderCard borderColor="#06B6D4" delay={0.3}>
              <div className="flex gap-4">
                <div className="shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-[#06B6D4]/20 to-[#06B6D4]/5 border border-[#06B6D4]/15 flex items-center justify-center">
                  <Users size={22} className="text-[#06B6D4]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-2">قتال جماعي</h3>
                  <p className="text-white/60 text-sm leading-relaxed">
                    نتخيل عالماً حيث يتحدى أصدقاؤك في ساحات حقيقية، حيث كل مواجهة هي مبارزة فكرية حية.
                    معركة الأسئلة صُممت لتكون تجربة جماعية بامتياز — صوت حي، تصويت لحظي، وإثارة لا تتوقف.
                  </p>
                </div>
              </div>
            </AnimatedBorderCard>

            {/* Arabic identity */}
            <AnimatedBorderCard borderColor="#22C55E" delay={0.4}>
              <div className="flex gap-4">
                <div className="shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-[#22C55E]/20 to-[#22C55E]/5 border border-[#22C55E]/15 flex items-center justify-center">
                  <BookOpen size={22} className="text-[#22C55E]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-2">هوية عربية، معارك قرائية</h3>
                  <p className="text-white/60 text-sm leading-relaxed">
                    المحتوى عربي، التصميم عربي، الروح عربية. لكن المنافسة عالمية.
                    نحن نؤمن أن اللغة العربية ليست حاجزاً — بل سلاح سري في ساحة المعارك الفكرية.
                  </p>
                </div>
              </div>
            </AnimatedBorderCard>
          </div>
        </section>

        {/* ══════════════════════════════════════ */}
        {/*       3. DEVELOPER SECTION            */}
        {/* ══════════════════════════════════════ */}
        <section className="mb-16">
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3 mb-8"
          >
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/20 flex items-center justify-center">
              <Code2 size={20} className="text-[#F59E0B]" />
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white">صانع الساحة</h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            {/* Outer glow */}
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-[#DC2626]/10 via-transparent to-[#F59E0B]/10 blur-xl pointer-events-none" />

            <div className="relative rounded-3xl bg-gradient-to-br from-[#12121F] to-[#1A1A2E] border border-white/[0.08] overflow-hidden">
              {/* Top accent line */}
              <div className="h-[2px] bg-gradient-to-l from-[#DC2626] via-[#F59E0B] to-[#DC2626]" />

              {/* Ambient glow behind avatar */}
              <div className="absolute top-12 right-1/2 translate-x-1/2 w-40 h-40 rounded-full bg-[#DC2626]/[0.06] blur-[60px] pointer-events-none" />

              <div className="relative p-8 text-center">
                {/* Avatar */}
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  onClick={handleDevClick}
                  className="relative mx-auto w-28 h-28 mb-6 cursor-pointer select-none"
                >
                  <motion.div
                    animate={{
                      boxShadow: [
                        '0 0 30px rgba(220,38,38,0.25), 0 0 60px rgba(245,158,11,0.1)',
                        '0 0 50px rgba(220,38,38,0.4), 0 0 90px rgba(245,158,11,0.15)',
                        '0 0 30px rgba(220,38,38,0.25), 0 0 60px rgba(245,158,11,0.1)',
                      ],
                    }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-full h-full rounded-full bg-gradient-to-br from-[#DC2626] via-[#B91C1C] to-[#7F1D1D] border-2 border-[#F59E0B]/30 flex items-center justify-center"
                  >
                    <span className="text-4xl font-black text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                      ز
                    </span>
                  </motion.div>
                  {/* Orbiting ring */}
                  <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
                    className="absolute -inset-2 rounded-full border border-dashed border-[#F59E0B]/15"
                  />
                  {/* Status indicator */}
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 translate-y-0 w-5 h-5 rounded-full bg-[#22C55E] border-2 border-[#12121F] flex items-center justify-center">
                    <Zap size={10} className="text-white" />
                  </div>
                </motion.div>

                {/* Name with easter egg */}
                <div className="relative">
                  <motion.h3
                    onClick={handleDevClick}
                    className="text-2xl md:text-3xl font-black text-white cursor-pointer select-none inline-block"
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="bg-gradient-to-l from-[#FCD34D] via-white to-[#FCD34D] bg-clip-text text-transparent">
                      زياد عمرو
                    </span>
                  </motion.h3>

                  {/* Easter Egg */}
                  <ConfettiBurst active={showEasterEgg} />
                  <AnimatePresence>
                    {showEasterEgg && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.8 }}
                        className="mt-3 text-sm font-bold text-[#FCD34D]"
                      >
                        🎮 لقد اكتشفت سرّ الساحة! أنت محارب حقيقي!
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Role badge */}
                <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DC2626]/10 border border-[#DC2626]/20">
                  <Code2 size={12} className="text-[#DC2626]" />
                  <span className="text-xs font-semibold text-[#DC2626]">مطور & صانع محتوى</span>
                </div>

                {/* Description */}
                <p className="mt-6 text-white/55 text-sm leading-loose max-w-lg mx-auto">
                  مطور عربي شغوف بصناعة تجارب لعب مبتكرة. يؤمن بأن الألعاب يمكن أن تكون جسراً
                  بين المتعة والتعلم، وأن المنصات العربية تستحق تجارب تفاعلية بجودة عالمية.
                  مهووس بأنظمة اللعب الجماعي، المنصات العربية، والتجارب التنافسية التفاعلية.
                </p>

                {/* Stats row */}
                <div className="mt-6 flex items-center justify-center gap-6">
                  {[
                    { icon: Swords, label: 'معارك', value: '∞', color: '#DC2626' },
                    { icon: Heart, label: 'شغف', value: '100%', color: '#F59E0B' },
                    { icon: Star, label: 'إلهام', value: '24/7', color: '#06B6D4' },
                  ].map((stat, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                      className="text-center"
                    >
                      <stat.icon size={18} style={{ color: stat.color }} className="mx-auto mb-1" />
                      <div className="text-lg font-black text-white">{stat.value}</div>
                      <div className="text-[10px] text-white/40 font-semibold">{stat.label}</div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* ══════════════════════════════════════ */}
        {/*     4. CONTACT & SOCIALS SECTION      */}
        {/* ══════════════════════════════════════ */}
        <section className="mb-16">
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3 mb-8"
          >
            <div className="w-10 h-10 rounded-xl bg-[#06B6D4]/10 border border-[#06B6D4]/20 flex items-center justify-center">
              <Globe size={20} className="text-[#06B6D4]" />
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white">تواصل مع المحارب</h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {socialLinks.map((link, i) => (
              <motion.a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="group relative rounded-2xl bg-gradient-to-br from-[#12121F] to-[#1A1A2E] border border-white/[0.06] p-4 flex items-center gap-4 overflow-hidden transition-all duration-300"
                style={{
                  ['--glow-color' as string]: link.color,
                }}
              >
                {/* Hover glow */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    background: `radial-gradient(ellipse at center, ${link.color}08, transparent 70%)`,
                  }}
                />

                {/* Animated border on hover */}
                <div
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{
                    boxShadow: `inset 0 0 0 1px ${link.color}30, 0 0 20px ${link.color}10`,
                  }}
                />

                {/* Sliding accent line */}
                <motion.div
                  className="absolute bottom-0 right-0 h-[2px] rounded-full"
                  style={{ backgroundColor: link.color }}
                  initial={{ width: 0 }}
                  whileHover={{ width: '100%' }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />

                {/* Icon container */}
                <div
                  className="relative shrink-0 w-11 h-11 rounded-xl flex items-center justify-center border transition-all duration-300 group-hover:scale-110"
                  style={{
                    backgroundColor: `${link.color}12`,
                    borderColor: `${link.color}25`,
                    color: link.color,
                    boxShadow: `0 0 0px ${link.color}00`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `0 0 20px ${link.color}25`
                    e.currentTarget.style.borderColor = `${link.color}50`
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = `0 0 0px ${link.color}00`
                    e.currentTarget.style.borderColor = `${link.color}25`
                  }}
                >
                  <SocialIcon icon={link.icon} size={18} />
                </div>

                {/* Text */}
                <div className="relative min-w-0 flex-1">
                  <div className="text-sm font-bold text-white/90 group-hover:text-white transition-colors truncate">
                    {link.name}
                  </div>
                  <div className="text-[11px] text-white/35 font-medium truncate">
                    {link.nameEn}
                  </div>
                </div>

                {/* Arrow */}
                <ChevronLeft
                  size={16}
                  className="relative shrink-0 text-white/20 group-hover:text-white/50 group-hover:-translate-x-1 transition-all duration-300"
                />
              </motion.a>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════ */}
        {/*    5. SUGGESTIONS & SUPPORT SECTION    */}
        {/* ══════════════════════════════════════ */}
        <section className="mb-16">
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3 mb-8"
          >
            <div className="w-10 h-10 rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/20 flex items-center justify-center">
              <Lightbulb size={20} className="text-[#22C55E]" />
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white">اقتراحاتك سلاحك</h2>
          </motion.div>

          <div className="grid gap-5">
            {/* Suggestion card */}
            <AnimatedBorderCard borderColor="#F59E0B" delay={0.1}>
              <div className="flex gap-4 items-start">
                <div className="shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-[#F59E0B]/20 to-[#F59E0B]/5 border border-[#F59E0B]/15 flex items-center justify-center">
                  <Lightbulb size={22} className="text-[#F59E0B]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-white mb-2">اقتراحك قد يغيّر المعركة القادمة</h3>
                  <p className="text-white/50 text-sm leading-relaxed mb-4">
                    كل فكرة عظيمة بدأت باقتراح. إذا كان لديك ما يمكن أن يجعل الساحة أفضل،
                    أرسله فوراً — ربما يكون اقتراحك هو الميزة التي ينتظرها آلاف المحاربين.
                  </p>
                  <a
                    href="mailto:ziad90216@gmail.com?subject=اقتراح%20لتحسين%20معركة%20الأسئلة"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl btn-battle text-sm"
                  >
                    <Send size={14} />
                    <span className="font-bold">أرسل اقتراحك</span>
                  </a>
                </div>
              </div>
            </AnimatedBorderCard>

            {/* Bug report card */}
            <AnimatedBorderCard borderColor="#EF4444" delay={0.2}>
              <div className="flex gap-4 items-start">
                <div className="shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-[#EF4444]/20 to-[#EF4444]/5 border border-[#EF4444]/15 flex items-center justify-center">
                  <Bug size={22} className="text-[#EF4444]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-white mb-2">وجدت خللاً في الساحة؟</h3>
                  <p className="text-white/50 text-sm leading-relaxed mb-4">
                    حتى أعظم المحاربين يواجهون عقبات. إذا صادفت خطأ أو مشكلة تقنية،
                    أبلغنا عنها وسنصلحها قبل المعركة التالية.
                  </p>
                  <a
                    href="mailto:ziad90216@gmail.com?subject=بلغ%20عن%20مشكلة%20-%20معركة%20الأسئلة"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-[#EF4444]/10 border border-[#EF4444]/25 text-[#EF4444] hover:bg-[#EF4444]/20 hover:border-[#EF4444]/40 transition-all duration-200"
                  >
                    <Bug size={14} />
                    <span>أبلغ عن مشكلة</span>
                  </a>
                </div>
              </div>
            </AnimatedBorderCard>
          </div>
        </section>

        {/* ══════════════════════════════════════ */}
        {/*           6. FOOTER / SIGNATURE       */}
        {/* ══════════════════════════════════════ */}
        <motion.footer
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative text-center pt-8 pb-6 border-t border-white/[0.04]"
        >
          {/* Glow accent */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-[1px] bg-gradient-to-l from-transparent via-[#DC2626]/40 to-transparent" />

          {/* Shield icon */}
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="mb-4"
          >
            <Shield size={24} className="mx-auto text-[#DC2626]/40" />
          </motion.div>

          <p className="text-white/25 text-xs font-semibold mb-1">
            صُنعت بشغف في ساحة معركة الأسئلة
          </p>
          <p className="text-white/15 text-[10px] font-medium">
            معركة الأسئلة © {new Date().getFullYear()} — كل ضربة بحب ❤️
          </p>

          {/* Developer signature */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="mt-4 flex items-center justify-center gap-1.5 text-white/10 text-[10px]"
          >
            <Code2 size={10} />
            <span>زياد عمرو</span>
            <span>·</span>
            <span>صانع الساحة</span>
          </motion.div>
        </motion.footer>
      </main>
    </div>
  )
}
