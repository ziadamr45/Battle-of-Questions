import { NextRequest, NextResponse } from 'next/server'
import { AccessToken } from 'livekit-server-sdk'

export async function POST(req: NextRequest) {
  try {
    const { roomName, participantName, participantIdentity } = await req.json()

    if (!roomName || !participantName) {
      return NextResponse.json(
        { error: 'roomName and participantName are required' },
        { status: 400 }
      )
    }

    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET

    if (!apiKey || !apiSecret) {
      console.error('[livekit-token] Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET')
      return NextResponse.json(
        { error: 'LiveKit is not configured on the server' },
        { status: 500 }
      )
    }

    const identity = participantIdentity || participantName.replace(/\s+/g, '_')

    // Create access token with appropriate grants
    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      name: participantName,
    })

    // Grant access to the specific room
    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true, // Allow data channel for text chat
    })

    const jwt = await token.toJwt()

    return NextResponse.json({
      token: jwt,
      roomName,
      identity,
    })
  } catch (error: any) {
    console.error('[livekit-token] Error generating token:', error.message)
    return NextResponse.json(
      { error: 'Failed to generate LiveKit token' },
      { status: 500 }
    )
  }
}
