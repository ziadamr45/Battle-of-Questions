'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Trophy,
  Medal,
  Swords,
  Clock,
  Users,
  Target,
  ChevronRight,
  ChevronLeft,
  Crown,
  Flame,
  Shield,
  Star,
  Zap,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  XCircle,
  Timer,
  Award,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Loader2,
  ScrollText,
  Brain,
  Eye,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface BattleParticipantDB {
  id: string
  playerName: string
  finalRank: number
  totalScore: number
  roundWins: number
  isHost: boolean
  answerReview: any[] | null
}

interface BattleRoundDB {
  id: string
  roundNumber: number
  title: string
  source: string | null
  winnerName: string | null
  duration: number
  questions: any[]
  roundScores: any[]
}

interface BattleDB {
  id: string
  roomCode: string
  gameType: string
  difficulty: string
  roomType: string
  passageType: string | null
  totalRounds: number
  completedRounds: number
  totalDuration: number
  hostName: string
  wasEarlyEnd: boolean
  startedAt: string
  endedAt: string
  participants: BattleParticipantDB[]
  rounds: BattleRoundDB[]
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'الآن'
  if (minutes < 60) return `منذ ${minutes} دقيقة`
  if (hours < 24) return `منذ ${hours} ساعة`
  if (days < 7) return `منذ ${days} يوم`
  if (days < 30) return `منذ ${Math.floor(days / 7)} أسبوع`
  return `منذ ${Math.floor(days / 30)} شهر`
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}ث`
  return `${m}د ${s}ث`
}

function getRankEmoji(rank: number): string {
  if (rank === 1) return '🏆'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return ''
}

function getRankLabel(rank: number): string {
  if (rank === 1) return 'المركز الأول'
  if (rank === 2) return 'المركز الثاني'
  if (rank === 3) return 'المركز الثالث'
  return `المركز ${rank}`
}

function getRankColor(rank: number): string {
  if (rank === 1) return 'from-amber-500 to-yellow-300'
  if (rank === 2) return 'from-slate-400 to-slate-300'
  if (rank === 3) return 'from-amber-700 to-amber-600'
  return 'from-slate-600 to-slate-500'
}

function getDifficultyColor(diff: string): string {
  if (diff === 'سهل') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
  if (diff === 'متوسط') return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
  return 'bg-red-500/20 text-red-400 border-red-500/30'
}

function GameTypeIcon({ gameType, className }: { gameType: string; className?: string }) {
  if (gameType === 'قراءة متحررة') return <BookOpen className={className} />
  return <Swords className={className} />
}

function getResultType(myParticipant: BattleParticipantDB | undefined): 'win' | 'podium' | 'loss' {
  if (!myParticipant) return 'loss'
  if (myParticipant.finalRank === 1) return 'win'
  if (myParticipant.finalRank <= 3) return 'podium'
  return 'loss'
}

// ─── Battle History List ───────────────────────────────────────────────────────

interface BattleHistoryListProps {
  playerName: string
  onBattleSelect: (battle: BattleDB) => void
  onBack: () => void
}

export function BattleHistoryList({ playerName, onBattleSelect, onBack }: BattleHistoryListProps) {
  const [battles, setBattles] = useState<BattleDB[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)

  const fetchBattles = useCallback(async (pageNum: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/battle-history?playerName=${encodeURIComponent(playerName)}&page=${pageNum}&limit=30`)
      if (res.ok) {
        const data = await res.json()
        setBattles(data.battles || [])
        setTotal(data.total || 0)
        setHasMore(data.hasMore || false)
      }
    } catch (err) {
      console.error('[BattleHistory] Fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [playerName])

  useEffect(() => {
    fetchBattles(page)
  }, [page, fetchBattles])

  // Stats
  const wins = battles.filter(b => {
    const me = b.participants.find(p => p.playerName === playerName)
    return me?.finalRank === 1
  }).length

  return (
    <motion.div
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen flex flex-col"
    >
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0A0A12]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="w-10 h-10 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-l from-red-500 via-amber-400 to-red-500">
                سجل المعارك
              </h1>
              <p className="text-sm text-slate-500">سجل معاركك السابقة</p>
            </div>
            <div className="flex items-center gap-1.5">
              <ScrollText className="w-5 h-5 text-amber-500/60" />
            </div>
          </div>

          {/* Quick Stats */}
          {!loading && battles.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex gap-3"
            >
              <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                <Swords className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs text-slate-300">{total} معركة</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs text-slate-300">{wins} فوز</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-xs text-slate-300">{total > 0 ? Math.round((wins / total) * 100) : 0}% انتصار</span>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Battle List */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
            <span className="text-slate-400 text-sm">جاري تحميل المعارك...</span>
          </div>
        ) : battles.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-20 gap-4 text-center"
          >
            <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <ScrollText className="w-10 h-10 text-slate-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-400 mb-1">لا توجد معارك بعد</p>
              <p className="text-sm text-slate-600">ابدأ معركتك الأولى لتظهر هنا</p>
            </div>
            <Button
              onClick={onBack}
              className="bg-gradient-to-l from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white border-0 mt-2"
            >
              <Swords className="w-4 h-4 ml-2" />
              ابدأ معركة
            </Button>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {battles.map((battle, idx) => {
                const myParticipant = battle.participants.find(p => p.playerName === playerName)
                const resultType = getResultType(myParticipant)
                return (
                  <motion.div
                    key={battle.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: idx * 0.05, duration: 0.3 }}
                    onClick={() => onBattleSelect(battle)}
                    className="group cursor-pointer"
                  >
                    <div className={`relative overflow-hidden rounded-xl border transition-all duration-300 ${
                      resultType === 'win'
                        ? 'bg-gradient-to-l from-amber-500/5 via-transparent to-amber-500/5 border-amber-500/20 hover:border-amber-500/40'
                        : resultType === 'podium'
                          ? 'bg-gradient-to-l from-slate-500/5 via-transparent to-slate-500/5 border-slate-500/20 hover:border-slate-500/40'
                          : 'bg-white/[0.02] border-white/5 hover:border-white/15'
                    }`}>
                      {/* Win glow effect */}
                      {resultType === 'win' && (
                        <div className="absolute inset-0 bg-gradient-to-l from-amber-500/5 via-transparent to-amber-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}

                      <div className="relative p-4">
                        <div className="flex items-start gap-3">
                          {/* Rank Badge */}
                          <div className="flex-shrink-0">
                            <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getRankColor(myParticipant?.finalRank || 99)} flex items-center justify-center shadow-lg`}>
                              {myParticipant?.finalRank === 1 ? (
                                <Crown className="w-6 h-6 text-yellow-200" />
                              ) : myParticipant?.finalRank === 2 ? (
                                <Medal className="w-6 h-6 text-slate-200" />
                              ) : myParticipant?.finalRank === 3 ? (
                                <Award className="w-6 h-6 text-amber-200" />
                              ) : (
                                <span className="text-lg font-black text-white/80">#{myParticipant?.finalRank}</span>
                              )}
                            </div>
                          </div>

                          {/* Battle Info */}
                          <div className="flex-1 min-w-0">
                            {/* Top line: result + game type */}
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-sm font-bold text-white">
                                {getRankEmoji(myParticipant?.finalRank || 99)} {getRankLabel(myParticipant?.finalRank || 99)}
                              </span>
                              <Separator orientation="vertical" className="h-4 bg-white/10" />
                              <div className="flex items-center gap-1">
                                <GameTypeIcon gameType={battle.gameType} className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-xs text-slate-400">{battle.gameType}</span>
                              </div>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getDifficultyColor(battle.difficulty)}`}>
                                {battle.difficulty}
                              </Badge>
                            </div>

                            {/* Second line: details */}
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                              <div className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                <span>{battle.participants.length} مقاتلين</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Target className="w-3 h-3" />
                                <span>{battle.completedRounds}/{battle.totalRounds} جولات</span>
                              </div>
                              {myParticipant && (
                                <div className="flex items-center gap-1">
                                  <Flame className="w-3 h-3 text-orange-400/60" />
                                  <span>{myParticipant.roundWins} فوز جولة</span>
                                </div>
                              )}
                            </div>

                            {/* Third line: time */}
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-600">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>{timeAgo(battle.endedAt)}</span>
                              </div>
                              {battle.wasEarlyEnd && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-orange-500/10 text-orange-400 border-orange-500/20">
                                  إنهاء مبكر
                                </Badge>
                              )}
                              {battle.passageType && battle.passageType !== 'عشوائي' && (
                                <span className="text-slate-600">• {battle.passageType}</span>
                              )}
                            </div>
                          </div>

                          {/* Arrow */}
                          <div className="flex-shrink-0 self-center">
                            <ChevronLeft className="w-5 h-5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>

            {/* Pagination */}
            {total > 30 && (
              <div className="flex justify-center gap-2 pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="text-slate-400"
                >
                  السابق
                </Button>
                <span className="text-xs text-slate-600 self-center">
                  صفحة {page} من {Math.ceil(total / 30)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!hasMore}
                  onClick={() => setPage(p => p + 1)}
                  className="text-slate-400"
                >
                  التالي
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── Battle Detail View ────────────────────────────────────────────────────────

interface BattleDetailProps {
  battle: BattleDB
  playerName: string
  onBack: () => void
}

export function BattleDetail({ battle, playerName, onBack }: BattleDetailProps) {
  const [expandedRound, setExpandedRound] = useState<number | null>(null)
  const [showAnswerReview, setShowAnswerReview] = useState(false)

  const myParticipant = battle.participants.find(p => p.playerName === playerName)
  const resultType = getResultType(myParticipant)

  // Calculate player performance stats
  const answerReview = (myParticipant?.answerReview as any[]) || []
  const totalQuestions = answerReview.length
  const correctAnswers = answerReview.filter(a => a.isCorrect).length
  const accuracy = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0
  const avgTime = totalQuestions > 0
    ? Math.round(answerReview.reduce((sum, a) => sum + (a.timeTaken || 0), 0) / totalQuestions)
    : 0

  // Find strongest and weakest rounds
  const roundPerformance: Record<number, { correct: number; total: number }> = {}
  answerReview.forEach(a => {
    if (!roundPerformance[a.roundNumber]) roundPerformance[a.roundNumber] = { correct: 0, total: 0 }
    roundPerformance[a.roundNumber].total++
    if (a.isCorrect) roundPerformance[a.roundNumber].correct++
  })

  const strongestRound = Object.entries(roundPerformance).sort((a, b) => {
    const aRate = a[1].total > 0 ? a[1].correct / a[1].total : 0
    const bRate = b[1].total > 0 ? b[1].correct / b[1].total : 0
    return bRate - aRate
  })[0]

  const weakestRound = Object.entries(roundPerformance).sort((a, b) => {
    const aRate = a[1].total > 0 ? a[1].correct / a[1].total : 0
    const bRate = b[1].total > 0 ? b[1].correct / b[1].total : 0
    return aRate - bRate
  })[0]

  return (
    <motion.div
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen flex flex-col"
    >
      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0A0A12]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="w-10 h-10 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-black text-white">تقرير المعركة</h1>
              <p className="text-xs text-slate-500">{timeAgo(battle.endedAt)} • غرفة {battle.roomCode}</p>
            </div>
            {/* Result badge */}
            <div className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
              resultType === 'win'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : resultType === 'podium'
                  ? 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                  : 'bg-white/5 text-slate-400 border border-white/10'
            }`}>
              {getRankEmoji(myParticipant?.finalRank || 99)} {getRankLabel(myParticipant?.finalRank || 99)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 space-y-4">
        {/* ─── Podium Section ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-l from-red-500/5 via-transparent to-amber-500/5 p-5"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.08),transparent_60%)]" />

          <div className="relative">
            <h2 className="text-center text-lg font-black text-white mb-4">
              <Crown className="w-5 h-5 inline-block text-amber-400 ml-1" />
              منصة الفائزين
            </h2>

            <div className="flex items-end justify-center gap-3">
              {/* 2nd place */}
              {battle.participants[1] && (
                <div className="flex flex-col items-center w-1/3">
                  <div className="text-sm font-bold text-slate-300 mb-1 truncate max-w-full">{battle.participants[1].playerName}</div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-400 to-slate-300 flex items-center justify-center text-xs font-black text-slate-800 mb-1">
                    2
                  </div>
                  <div className="text-xs text-slate-400">{battle.participants[1].roundWins} فوز</div>
                  <div className="w-full h-16 bg-slate-500/20 rounded-t-lg mt-2 border border-slate-500/30" />
                </div>
              )}

              {/* 1st place */}
              {battle.participants[0] && (
                <div className="flex flex-col items-center w-1/3">
                  <div className="text-sm font-bold text-amber-400 mb-1 truncate max-w-full">{battle.participants[0].playerName}</div>
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-yellow-300 flex items-center justify-center text-sm font-black text-amber-900 mb-1 shadow-lg shadow-amber-500/30"
                  >
                    <Crown className="w-6 h-6" />
                  </motion.div>
                  <div className="text-xs text-amber-500">{battle.participants[0].roundWins} فوز</div>
                  <div className="w-full h-24 bg-amber-500/20 rounded-t-lg mt-2 border border-amber-500/30" />
                </div>
              )}

              {/* 3rd place */}
              {battle.participants[2] && (
                <div className="flex flex-col items-center w-1/3">
                  <div className="text-sm font-bold text-amber-700 mb-1 truncate max-w-full">{battle.participants[2].playerName}</div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-700 to-amber-600 flex items-center justify-center text-xs font-black text-amber-200 mb-1">
                    3
                  </div>
                  <div className="text-xs text-amber-600">{battle.participants[2].roundWins} فوز</div>
                  <div className="w-full h-12 bg-amber-700/20 rounded-t-lg mt-2 border border-amber-700/30" />
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ─── General Battle Info ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden"
        >
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
              <Shield className="w-4 h-4 text-red-400" />
              معلومات المعركة
            </h3>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <InfoItem icon={<GameTypeIcon gameType={battle.gameType} className="w-3.5 h-3.5" />} label="نوع اللعبة" value={battle.gameType} />
            <InfoItem icon={<Target className="w-3.5 h-3.5" />} label="الصعوبة" value={battle.difficulty} highlight />
            <InfoItem icon={<Users className="w-3.5 h-3.5" />} label="عدد اللاعبين" value={`${battle.participants.length} مقاتلين`} />
            <InfoItem icon={<Swords className="w-3.5 h-3.5" />} label="الجولات" value={`${battle.completedRounds}/${battle.totalRounds}`} />
            <InfoItem icon={<Clock className="w-3.5 h-3.5" />} label="المدة" value={formatDuration(battle.totalDuration)} />
            <InfoItem icon={<Star className="w-3.5 h-3.5" />} label="قائد الساحة" value={battle.hostName} />
            {battle.passageType && battle.passageType !== 'عشوائي' && (
              <InfoItem icon={<BookOpen className="w-3.5 h-3.5" />} label="نوع القطعة" value={battle.passageType} />
            )}
            {battle.wasEarlyEnd && (
              <InfoItem icon={<Zap className="w-3.5 h-3.5 text-orange-400" />} label="إنهاء مبكر" value="نعم" highlight />
            )}
          </div>
        </motion.div>

        {/* ─── Player Performance ─── */}
        {myParticipant && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden"
          >
            <div className="p-4 border-b border-white/5">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                أدائك في المعركة
              </h3>
            </div>
            <div className="p-4">
              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <StatCard
                  icon={<Trophy className="w-4 h-4 text-amber-400" />}
                  label="الترتيب"
                  value={`#${myParticipant.finalRank}`}
                  accent={myParticipant.finalRank === 1}
                />
                <StatCard
                  icon={<Target className="w-4 h-4 text-red-400" />}
                  label="الدقة"
                  value={`${accuracy}%`}
                  accent={accuracy >= 80}
                />
                <StatCard
                  icon={<Flame className="w-4 h-4 text-orange-400" />}
                  label="فوز الجولات"
                  value={`${myParticipant.roundWins}`}
                  accent={myParticipant.roundWins > 0}
                />
                <StatCard
                  icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  label="إجابات صحيحة"
                  value={`${correctAnswers}/${totalQuestions}`}
                />
                <StatCard
                  icon={<Timer className="w-4 h-4 text-blue-400" />}
                  label="متوسط السرعة"
                  value={`${avgTime}ث`}
                />
                <StatCard
                  icon={<Star className="w-4 h-4 text-amber-400" />}
                  label="النقاط"
                  value={`${myParticipant.totalScore}`}
                />
              </div>

              {/* Strongest / Weakest */}
              {strongestRound && weakestRound && strongestRound[0] !== weakestRound[0] && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 text-center">
                    <div className="text-[10px] text-emerald-400/60 mb-1">أقوى جولة</div>
                    <div className="text-sm font-bold text-emerald-400">الجولة {strongestRound[0]}</div>
                    <div className="text-xs text-emerald-500/60">{strongestRound[1].correct}/{strongestRound[1].total} صحيح</div>
                  </div>
                  <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 text-center">
                    <div className="text-[10px] text-red-400/60 mb-1">أضعف جولة</div>
                    <div className="text-sm font-bold text-red-400">الجولة {weakestRound[0]}</div>
                    <div className="text-xs text-red-500/60">{weakestRound[1].correct}/{weakestRound[1].total} صحيح</div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ─── All Participants ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden"
        >
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              جميع المقاتلين
            </h3>
          </div>
          <div className="divide-y divide-white/5">
            {battle.participants.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 px-4 py-3 ${p.playerName === playerName ? 'bg-amber-500/5' : ''}`}
              >
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${getRankColor(p.finalRank)} flex items-center justify-center text-xs font-black text-white/90`}>
                  {p.finalRank <= 3 ? getRankEmoji(p.finalRank) : `#${p.finalRank}`}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold truncate ${p.playerName === playerName ? 'text-amber-400' : 'text-slate-300'}`}>
                      {p.playerName}
                    </span>
                    {p.isHost && <Crown className="w-3 h-3 text-amber-500/60" />}
                    {p.playerName === playerName && (
                      <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1 rounded">أنت</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">{p.roundWins} فوز جولة • {p.totalScore} نقطة</div>
                </div>
                <div className="text-xs text-slate-500">
                  <Flame className="w-3 h-3 inline text-orange-400/50 ml-1" />
                  {p.roundWins}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ─── Round-by-Round Breakdown ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden"
        >
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
              <Swords className="w-4 h-4 text-red-400" />
              تفصيل الجولات
            </h3>
          </div>
          <div className="divide-y divide-white/5">
            {battle.rounds.map((round) => (
              <div key={round.id}>
                <button
                  onClick={() => setExpandedRound(expandedRound === round.roundNumber ? null : round.roundNumber)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-xs font-bold text-red-400">
                    {round.roundNumber}
                  </div>
                  <div className="flex-1 min-w-0 text-right">
                    <div className="text-sm font-bold text-slate-300 truncate">{round.title || `الجولة ${round.roundNumber}`}</div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {round.winnerName && (
                        <span className="text-amber-400/70">🏆 {round.winnerName}</span>
                      )}
                      <span>• {formatDuration(round.duration)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* My score for this round */}
                    {(() => {
                      const roundScore = (round.roundScores as any[])?.find((s: any) => s.playerName === playerName)
                      if (roundScore) {
                        return (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-white/5 border-white/10">
                            {roundScore.correctAnswers}/{roundScore.totalQuestions}
                          </Badge>
                        )
                      }
                      return null
                    })()}
                    {expandedRound === round.roundNumber ? (
                      <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                </button>

                <AnimatePresence>
                  {expandedRound === round.roundNumber && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-3">
                        {/* Round Scores */}
                        <div className="bg-white/[0.02] rounded-lg p-3">
                          <div className="text-[10px] text-slate-500 mb-2 font-bold">ترتيب الجولة</div>
                          <div className="space-y-1.5">
                            {(round.roundScores as any[])
                              ?.sort((a: any, b: any) => b.score - a.score)
                              .map((score: any, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <span className={`w-4 text-center font-bold ${i === 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                                    {i + 1}
                                  </span>
                                  <span className={`flex-1 ${score.playerName === playerName ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>
                                    {score.playerName}
                                  </span>
                                  <span className="text-slate-500">{score.correctAnswers}/{score.totalQuestions}</span>
                                  <span className="text-red-400 font-bold w-12 text-left">{score.score}</span>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Questions Preview */}
                        {(round.questions as any[])?.length > 0 && (
                          <div className="bg-white/[0.02] rounded-lg p-3">
                            <div className="text-[10px] text-slate-500 mb-2 font-bold">الأسئلة ({(round.questions as any[]).length})</div>
                            <div className="space-y-2">
                              {(round.questions as any[]).slice(0, 3).map((q: any, i: number) => (
                                <div key={i} className="text-xs text-slate-400 leading-relaxed">
                                  <span className="text-slate-500 font-bold">{i + 1}.</span> {q.text?.substring(0, 80)}{q.text?.length > 80 ? '...' : ''}
                                </div>
                              ))}
                              {(round.questions as any[]).length > 3 && (
                                <div className="text-[10px] text-slate-600">
                                  +{(round.questions as any[]).length - 3} أسئلة أخرى
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ─── Answer Review ─── */}
        {answerReview.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden"
          >
            <button
              onClick={() => setShowAnswerReview(!showAnswerReview)}
              className="w-full p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
            >
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-400" />
                مراجعة الإجابات
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-white/5 border-white/10">
                  {correctAnswers}/{totalQuestions}
                </Badge>
              </h3>
              {showAnswerReview ? (
                <ChevronUp className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              )}
            </button>

            <AnimatePresence>
              {showAnswerReview && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-3">
                    {/* Group by round */}
                    {Object.entries(
                      answerReview.reduce((acc: Record<number, any[]>, a: any) => {
                        if (!acc[a.roundNumber]) acc[a.roundNumber] = []
                        acc[a.roundNumber].push(a)
                        return acc
                      }, {})
                    ).map(([roundNum, answers]) => (
                      <div key={roundNum}>
                        <div className="text-[10px] text-slate-500 font-bold mb-2">الجولة {roundNum}</div>
                        <div className="space-y-2">
                          {(answers as any[]).map((answer: any, idx: number) => (
                            <div
                              key={idx}
                              className={`rounded-lg p-3 border ${
                                answer.isCorrect
                                  ? 'bg-emerald-500/5 border-emerald-500/20'
                                  : 'bg-red-500/5 border-red-500/20'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                {answer.isCorrect ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-slate-300 mb-1 leading-relaxed">
                                    {answer.question}
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px]">
                                    <span className="text-slate-500">
                                      إجابتك: <span className={answer.isCorrect ? 'text-emerald-400' : 'text-red-400'}>
                                        {answer.playerAnswer >= 0 ? (answer.options as string[])?.[answer.playerAnswer] || `خيار ${answer.playerAnswer + 1}` : 'لم تجب'}
                                      </span>
                                    </span>
                                    {!answer.isCorrect && (
                                      <span className="text-slate-500">
                                        الصحيح: <span className="text-emerald-400">
                                          {(answer.options as string[])?.[answer.correctAnswer] || `خيار ${answer.correctAnswer + 1}`}
                                        </span>
                                      </span>
                                    )}
                                    {answer.timeTaken > 0 && (
                                      <span className="text-slate-600">
                                        <Timer className="w-2.5 h-2.5 inline ml-0.5" />
                                        {Math.round(answer.timeTaken)}ث
                                      </span>
                                    )}
                                  </div>
                                  {answer.explanation && !answer.isCorrect && (
                                    <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                                      {answer.explanation}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Bottom spacing */}
        <div className="h-8" />
      </div>
    </motion.div>
  )
}

// ─── Small Helper Components ───────────────────────────────────────────────────

function InfoItem({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-slate-500">{icon}</div>
      <div>
        <div className="text-[10px] text-slate-600">{label}</div>
        <div className={`text-sm font-bold ${highlight ? 'text-amber-400' : 'text-slate-300'}`}>{value}</div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 text-center ${
      accent
        ? 'bg-amber-500/5 border-amber-500/20'
        : 'bg-white/[0.02] border-white/5'
    }`}>
      <div className="flex justify-center mb-1">{icon}</div>
      <div className={`text-lg font-black ${accent ? 'text-amber-400' : 'text-slate-300'}`}>{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  )
}
