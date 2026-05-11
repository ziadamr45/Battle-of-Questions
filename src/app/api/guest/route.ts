import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/guest?id=<guest_id> — Lookup existing guest
export async function GET(req: NextRequest) {
  const guestId = req.nextUrl.searchParams.get('id')

  if (!guestId) {
    return NextResponse.json({ error: 'Missing guest id' }, { status: 400 })
  }

  const guest = await db.guest.findUnique({ where: { id: guestId } })

  if (!guest) {
    return NextResponse.json({ error: 'Guest not found' }, { status: 404 })
  }

  // Update lastSeen
  await db.guest.update({ where: { id: guestId }, data: { lastSeen: new Date() } })

  return NextResponse.json({
    id: guest.id,
    displayName: guest.displayName,
    avatarColor: guest.avatarColor,
    createdAt: guest.createdAt,
  })
}

// POST /api/guest — Create new guest or restore by id
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { displayName, avatarColor, guestId } = body

    // If guestId provided, try to restore
    if (guestId) {
      const existing = await db.guest.findUnique({ where: { id: guestId } })
      if (existing) {
        await db.guest.update({ where: { id: guestId }, data: { lastSeen: new Date() } })
        return NextResponse.json({
          id: existing.id,
          displayName: existing.displayName,
          avatarColor: existing.avatarColor,
          createdAt: existing.createdAt,
        })
      }
      // Not found — create new one
    }

    // Create new guest
    if (!displayName || displayName.trim().length === 0) {
      return NextResponse.json({ error: 'Display name is required' }, { status: 400 })
    }

    const guest = await db.guest.create({
      data: {
        displayName: displayName.trim().slice(0, 20),
        avatarColor: avatarColor || '#DC2626',
      },
    })

    return NextResponse.json({
      id: guest.id,
      displayName: guest.displayName,
      avatarColor: guest.avatarColor,
      createdAt: guest.createdAt,
    }, { status: 201 })
  } catch (error) {
    console.error('[Guest API] Error creating guest:', error)
    return NextResponse.json({ error: 'Failed to create guest' }, { status: 500 })
  }
}

// PATCH /api/guest — Update guest (name, avatarColor)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { guestId, displayName, avatarColor } = body

    if (!guestId) {
      return NextResponse.json({ error: 'Missing guest id' }, { status: 400 })
    }

    const updateData: Record<string, string> = {}
    if (displayName && displayName.trim().length > 0) {
      updateData.displayName = displayName.trim().slice(0, 20)
    }
    if (avatarColor) {
      updateData.avatarColor = avatarColor
    }

    const guest = await db.guest.update({
      where: { id: guestId },
      data: updateData,
    })

    return NextResponse.json({
      id: guest.id,
      displayName: guest.displayName,
      avatarColor: guest.avatarColor,
    })
  } catch (error) {
    console.error('[Guest API] Error updating guest:', error)
    return NextResponse.json({ error: 'Failed to update guest' }, { status: 500 })
  }
}
