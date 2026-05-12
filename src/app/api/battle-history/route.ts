import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

// GET /api/battle-history?playerName=xxx&page=1&limit=30
// List battles for a specific player, newest first
export async function GET(req: NextRequest) {
  // Rate limit: 30 requests per minute per IP
  const ip = getClientIp(req)
  const rateCheck = checkRateLimit(ip, 'battle-history', { maxRequests: 30, windowSeconds: 60 })
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'طلبات كتير، حاول تاني بعد شوية' },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } }
    )
  }

  const playerName = req.nextUrl.searchParams.get('playerName')
  const page = parseInt(req.nextUrl.searchParams.get('page') || '1', 10)
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '30', 10), 30)
  const battleId = req.nextUrl.searchParams.get('battleId')

  // Single battle detail
  if (battleId) {
    const battle = await db.battle.findUnique({
      where: { id: battleId },
      include: {
        participants: { orderBy: { finalRank: 'asc' } },
        rounds: { orderBy: { roundNumber: 'asc' } },
      },
    })
    if (!battle) {
      return NextResponse.json({ error: 'Battle not found' }, { status: 404 })
    }
    return NextResponse.json(battle)
  }

  if (!playerName) {
    return NextResponse.json({ error: 'Missing playerName' }, { status: 400 })
  }

  // Validate playerName length to prevent abuse
  if (playerName.length > 30) {
    return NextResponse.json({ error: 'Invalid playerName' }, { status: 400 })
  }

  const skip = (page - 1) * limit

  const [battles, total] = await Promise.all([
    db.battle.findMany({
      where: {
        participants: {
          some: { playerName },
        },
      },
      include: {
        participants: { orderBy: { finalRank: 'asc' } },
        rounds: { orderBy: { roundNumber: 'asc' } },
      },
      orderBy: { endedAt: 'desc' },
      skip,
      take: limit,
    }),
    db.battle.count({
      where: {
        participants: {
          some: { playerName },
        },
      },
    }),
  ])

  return NextResponse.json({
    battles,
    total,
    page,
    limit,
    hasMore: skip + battles.length < total,
  })
}

// POST /api/battle-history — Save a new battle record
export async function POST(req: NextRequest) {
  // Rate limit: 5 creates per minute per IP (battle saves are infrequent)
  const ip = getClientIp(req)
  const rateCheck = checkRateLimit(ip, 'battle-history:post', { maxRequests: 5, windowSeconds: 60 })
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'طلبات كتير، حاول تاني بعد شوية' },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } }
    )
  }

  try {
    const body = await req.json()
    const {
      roomCode,
      gameType,
      difficulty,
      roomType,
      passageType,
      totalRounds,
      completedRounds,
      totalDuration,
      hostName,
      wasEarlyEnd,
      startedAt,
      participants,
      rounds,
    } = body

    if (!roomCode || !gameType || !difficulty || !hostName || !participants || !rounds) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Validate participants array length to prevent abuse
    if (!Array.isArray(participants) || participants.length === 0 || participants.length > 20) {
      return NextResponse.json({ error: 'Invalid participants data' }, { status: 400 })
    }

    // Validate rounds array length
    if (!Array.isArray(rounds) || rounds.length === 0 || rounds.length > 20) {
      return NextResponse.json({ error: 'Invalid rounds data' }, { status: 400 })
    }

    const battle = await db.battle.create({
      data: {
        roomCode,
        gameType,
        difficulty,
        roomType: roomType || 'عامة',
        passageType: passageType || null,
        totalRounds,
        completedRounds: completedRounds || totalRounds,
        totalDuration: totalDuration || 0,
        hostName,
        wasEarlyEnd: wasEarlyEnd || false,
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        participants: {
          create: participants.map((p: any) => ({
            playerName: p.playerName,
            finalRank: p.finalRank,
            totalScore: p.totalScore || 0,
            roundWins: p.roundWins || 0,
            isHost: p.isHost || false,
            answerReview: p.answerReview || null,
          })),
        },
        rounds: {
          create: rounds.map((r: any) => ({
            roundNumber: r.roundNumber,
            title: r.title || '',
            source: r.source || null,
            winnerName: r.winnerName || null,
            duration: r.duration || 0,
            questions: r.questions || [],
            roundScores: r.roundScores || [],
          })),
        },
      },
      include: {
        participants: { orderBy: { finalRank: 'asc' } },
        rounds: { orderBy: { roundNumber: 'asc' } },
      },
    })

    return NextResponse.json(battle, { status: 201 })
  } catch (error) {
    console.error('[Battle History API] Error saving battle:', error)
    return NextResponse.json({ error: 'Failed to save battle' }, { status: 500 })
  }
}
