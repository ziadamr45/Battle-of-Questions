'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Room, RoomEvent, RemoteParticipant, RemoteTrackPublication, RemoteAudioTrack, Track, ParticipantEvent } from 'livekit-client'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Volume2, VolumeX, MessageCircle, X, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { usePlayerMuteStore } from '@/lib/player-mute-store'

// ============================================
// LIVEKIT CONFIG
// ============================================
const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || 'wss://battle-of-questions-qfmqttef.livekit.cloud'

// ============================================
// SHARED STATE - accessible via custom events
// ============================================
// Dispatch 'livekit-speaking-change' with { identities: string[] }
// Dispatch 'livekit-unread-chat' with { count: number }

// ============================================
// TYPES
// ============================================
interface ChatMessage {
  id: string
  sender: string
  text: string
  timestamp: number
}

interface VoiceChatProps {
  roomCode: string
  playerName: string
  /** If true, text chat is available. If false, voice-only. */
  showChat: boolean
}

// ============================================
// LIVEKIT ROOM STORE (singleton per room)
// ============================================
let livekitRoom: Room | null = null
let currentRoomCode: string | null = null
let isConnecting = false

function getSharedRoom(): Room {
  if (!livekitRoom) {
    livekitRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
      },
    })
  }
  return livekitRoom
}

// Shared chat messages so they persist across remounts
let sharedChatMessages: ChatMessage[] = []

// Track audio element management
const audioElements = new Map<string, HTMLAudioElement>()

function attachAudioTrack(track: RemoteAudioTrack, participantIdentity: string) {
  const key = `${participantIdentity}-${track.sid}`
  let audioEl = audioElements.get(key)
  if (!audioEl) {
    audioEl = new Audio()
    audioEl.autoplay = true
    audioEl.id = `audio-${key}`
    audioElements.set(key, audioEl)
  }
  // Check if this player is muted (locally or by host) using exact name matching
  const muteStore = usePlayerMuteStore.getState()
  const shouldMute = muteStore.isLiveKitIdentityMuted(participantIdentity)
  track.attach(audioEl)
  // Apply mute state after attaching
  if (shouldMute) {
    audioEl.muted = true
  }
  console.log(`[VoiceChat] Attached audio track from ${participantIdentity}${shouldMute ? ' (MUTED)' : ''}`)
}

function detachAudioTrack(track: RemoteAudioTrack, participantIdentity: string) {
  const key = `${participantIdentity}-${track.sid}`
  const audioEl = audioElements.get(key)
  if (audioEl) {
    track.detach(audioEl)
    audioEl.pause()
    audioEl.srcObject = null
    audioElements.delete(key)
    console.log(`[VoiceChat] Detached audio track from ${participantIdentity}`)
  }
}

// ============================================
// VOICE CHAT COMPONENT
// ============================================
export function VoiceChat({ roomCode, playerName, showChat }: VoiceChatProps) {
  const [isConnected, setIsConnected] = useState(!!livekitRoom?.state && livekitRoom.state === 'connected')
  const [_connecting, setConnecting] = useState(false)
  const [isMicMuted, setIsMicMuted] = useState(true)
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false)
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([])
  const [showChatPanel, setShowChatPanel] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(sharedChatMessages)
  const [chatInput, setChatInput] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set())
  const chatEndRef = useRef<HTMLDivElement>(null)
  const hasInitialized = useRef(false)
  const chatPanelOpenRef = useRef(false)
  const audioContainerRef = useRef<HTMLDivElement>(null)

  // Keep ref in sync
  useEffect(() => { chatPanelOpenRef.current = showChatPanel }, [showChatPanel])

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Update shared chat messages when local state changes
  useEffect(() => {
    sharedChatMessages = chatMessages
  }, [chatMessages])

  // Notify about unread messages via custom events
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('livekit-unread-chat', { detail: { count: unreadCount } }))
  }, [unreadCount])

  // Notify about speaking participants via custom events
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('livekit-speaking-change', { detail: { identities: Array.from(speakingIds) } }))
  }, [speakingIds])

  // Reset unread count when chat panel is opened
  useEffect(() => {
    if (showChatPanel) queueMicrotask(() => setUnreadCount(0))
  }, [showChatPanel])

  // Handle speaker mute/unmute for audio elements
  useEffect(() => {
    audioElements.forEach((audioEl) => {
      audioEl.muted = isSpeakerMuted
    })
  }, [isSpeakerMuted])

  // ─── Per-Player Mute: Listen for mute changes from player-mute-store ───
  useEffect(() => {
    const handleMuteChange = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail?.playerId) return
      // Convert player name to LiveKit identity format for matching audio elements
      const liveKitIdentity = detail.playerName ? detail.playerName.replace(/\s+/g, '_') : detail.playerId
      // Mute/unmute the audio element for this specific player
      audioElements.forEach((audioEl, key) => {
        if (key.startsWith(liveKitIdentity + '-') || key.includes(liveKitIdentity)) {
          audioEl.muted = detail.isMuted || isSpeakerMuted
        }
      })
    }

    const handleForceMicMute = async () => {
      // Host muted this player — force disable their mic
      const room = roomRef
      if (!room || room.state !== 'connected') return
      try {
        await room.localParticipant.setMicrophoneEnabled(false)
        setIsMicMuted(true)
      } catch (err) {
        console.error('[VoiceChat] Force mic mute error:', err)
      }
    }

    window.addEventListener('player-mute-changed', handleMuteChange)
    window.addEventListener('force-local-mic-mute', handleForceMicMute)
    return () => {
      window.removeEventListener('player-mute-changed', handleMuteChange)
      window.removeEventListener('force-local-mic-mute', handleForceMicMute)
    }
  }, [isSpeakerMuted])

  // Connect to LiveKit room
  useEffect(() => {
    if (!roomCode || !playerName || hasInitialized.current) return
    hasInitialized.current = true

    const room = getSharedRoom()

    // If already connected to the same room, just sync state
    if (room.state === 'connected' && currentRoomCode === roomCode) {
      // Use microtask to avoid calling setState directly in effect body
      queueMicrotask(() => {
        setIsConnected(true)
        setRemoteParticipants(Array.from(room.remoteParticipants.values()))
      })
      roomRef = room

      // Re-attach any existing audio tracks
      room.remoteParticipants.forEach(participant => {
        participant.audioTrackPublications.forEach(pub => {
          if (pub.track && pub.track.kind === Track.Kind.Audio) {
            attachAudioTrack(pub.track as RemoteAudioTrack, participant.identity)
          }
        })
      })
      return
    }

    // If connected to a different room, disconnect first
    if (room.state === 'connected' && currentRoomCode !== roomCode) {
      room.disconnect()
      livekitRoom = null
      currentRoomCode = null
    }

    // Connect
    if (isConnecting) return
    isConnecting = true
    queueMicrotask(() => setConnecting(true))

    const connect = async () => {
      try {
        const tokenRes = await fetch('/api/livekit-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomName: `battle-${roomCode}`,
            participantName: playerName,
          }),
        })

        if (!tokenRes.ok) {
          const err = await tokenRes.json()
          console.error('[VoiceChat] Token error:', err.error)
          isConnecting = false
          setConnecting(false)
          return
        }

        const { token } = await tokenRes.json()
        const newRoom = getSharedRoom()
        roomRef = newRoom

        // ──── CRITICAL: Handle remote audio tracks ────
        // When a remote audio track is subscribed, attach it to an Audio element
        const onTrackSubscribed = (
          track: RemoteAudioTrack | any,
          publication: RemoteTrackPublication,
          participant: RemoteParticipant
        ) => {
          console.log(`[VoiceChat] Track subscribed: ${track.kind} from ${participant.identity}`)
          setRemoteParticipants(Array.from(newRoom.remoteParticipants.values()))

          if (track.kind === Track.Kind.Audio) {
            attachAudioTrack(track as RemoteAudioTrack, participant.identity)
          }
        }

        const onTrackUnsubscribed = (
          track: RemoteAudioTrack | any,
          publication: RemoteTrackPublication,
          participant: RemoteParticipant
        ) => {
          console.log(`[VoiceChat] Track unsubscribed: ${track.kind} from ${participant.identity}`)
          setRemoteParticipants(Array.from(newRoom.remoteParticipants.values()))

          if (track.kind === Track.Kind.Audio) {
            detachAudioTrack(track as RemoteAudioTrack, participant.identity)
          }
        }

        const onParticipantConnected = () => {
          setRemoteParticipants(Array.from(newRoom.remoteParticipants.values()))
        }

        const onParticipantDisconnected = (participant: RemoteParticipant) => {
          setRemoteParticipants(Array.from(newRoom.remoteParticipants.values()))
          // Clean up audio elements for disconnected participant
          const keysToDelete: string[] = []
          audioElements.forEach((_, key) => {
            if (key.startsWith(participant.identity)) {
              keysToDelete.push(key)
            }
          })
          keysToDelete.forEach(key => {
            const el = audioElements.get(key)
            if (el) { el.pause(); el.srcObject = null }
            audioElements.delete(key)
          })
        }

        const onDataReceived = (payload: Uint8Array, _participant: any, _kind: any, topic?: string) => {
          if (topic === 'chat') {
            try {
              const data = JSON.parse(new TextDecoder().decode(payload))
              const msg: ChatMessage = {
                id: `${data.sender}-${data.timestamp}`,
                sender: data.sender,
                text: data.text,
                timestamp: data.timestamp,
              }
              setChatMessages(prev => [...prev, msg])
              if (!chatPanelOpenRef.current) {
                setUnreadCount(prev => prev + 1)
              }
            } catch (e) {
              console.error('[VoiceChat] Failed to parse chat message:', e)
            }
          }
        }

        const onDisconnected = () => {
          setIsConnected(false)
          setRemoteParticipants([])
          setSpeakingIds(new Set())
          // Clean up all audio elements
          audioElements.forEach((el) => { el.pause(); el.srcObject = null })
          audioElements.clear()
        }

        const onReconnected = () => {
          setIsConnected(true)
        }

        const onActiveSpeakersChanged = (speakers: any[]) => {
          const ids = new Set<string>()
          for (const speaker of speakers) {
            ids.add(speaker.identity || speaker.sid)
          }
          setSpeakingIds(ids)
        }

        // Attach event listeners
        newRoom.on(RoomEvent.TrackSubscribed, onTrackSubscribed)
        newRoom.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
        newRoom.on(RoomEvent.ParticipantConnected, onParticipantConnected)
        newRoom.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
        newRoom.on(RoomEvent.DataReceived, onDataReceived)
        newRoom.on(RoomEvent.Disconnected, onDisconnected)
        newRoom.on(RoomEvent.Reconnected, onReconnected)
        newRoom.on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged)

        // Connect
        await newRoom.connect(LIVEKIT_URL, token)
        currentRoomCode = roomCode

        // Publish microphone (start muted for privacy)
        await newRoom.localParticipant.setMicrophoneEnabled(false)
        setIsMicMuted(true)

        setIsConnected(true)
        setConnecting(false)
        isConnecting = false

        // Set initial remote participants and attach their audio
        const remotes = Array.from(newRoom.remoteParticipants.values())
        setRemoteParticipants(remotes)

        // Attach any already-published audio tracks from existing participants
        for (const participant of remotes) {
          participant.audioTrackPublications.forEach(pub => {
            if (pub.track && pub.track.kind === Track.Kind.Audio) {
              attachAudioTrack(pub.track as RemoteAudioTrack, participant.identity)
            }
          })
        }

        console.log(`[VoiceChat] Connected! ${remotes.length} remote participants`)
      } catch (err: any) {
        console.error('[VoiceChat] Connection error:', err.message)
        setConnecting(false)
        isConnecting = false
        hasInitialized.current = false
      }
    }

    connect()

    return () => {
      // Don't disconnect - the room persists across screens
    }
  }, [roomCode, playerName])

  // Toggle mic
  const toggleMic = useCallback(async () => {
    const room = roomRef
    if (!room || room.state !== 'connected') return

    try {
      if (isMicMuted) {
        await room.localParticipant.setMicrophoneEnabled(true)
        setIsMicMuted(false)
      } else {
        await room.localParticipant.setMicrophoneEnabled(false)
        setIsMicMuted(true)
      }
    } catch (err) {
      console.error('[VoiceChat] Mic toggle error:', err)
    }
  }, [isMicMuted])

  // Toggle speaker - mute/unmute all audio elements
  const toggleSpeaker = useCallback(() => {
    const newMuted = !isSpeakerMuted
    // Mute/unmute all audio elements directly
    audioElements.forEach((audioEl) => {
      audioEl.muted = newMuted
    })
    setIsSpeakerMuted(newMuted)
  }, [isSpeakerMuted])

  // Send chat message
  const sendMessage = useCallback(async () => {
    if (!chatInput.trim()) return
    const room = roomRef
    if (!room || room.state !== 'connected') return

    const msg = {
      sender: playerName,
      text: chatInput.trim(),
      timestamp: Date.now(),
    }

    try {
      const encoder = new TextEncoder()
      await room.localParticipant.publishData(
        encoder.encode(JSON.stringify(msg)),
        { reliable: true, topic: 'chat' }
      )

      const chatMsg: ChatMessage = {
        id: `${msg.sender}-${msg.timestamp}`,
        sender: msg.sender,
        text: msg.text,
        timestamp: msg.timestamp,
      }
      setChatMessages(prev => [...prev, chatMsg])
      setChatInput('')
    } catch (err) {
      console.error('[VoiceChat] Send message error:', err)
    }
  }, [chatInput, playerName])

  // Determine if local player is speaking
  const isLocalSpeaking = speakingIds.has('local') || speakingIds.has(playerName.replace(/\s+/g, '_'))

  return (
    <>
      {/* Hidden audio container for remote participants' audio */}
      <div ref={audioContainerRef} className="hidden" aria-hidden="true" />

      {/* Voice Chat Floating Controls */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 items-end">
        {/* Chat Panel */}
        <AnimatePresence>
          {showChatPanel && showChat && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="w-80 max-h-96 rounded-2xl overflow-hidden border border-white/10 bg-black/80 backdrop-blur-xl shadow-2xl"
            >
              {/* Chat Header */}
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-red-900/30 to-amber-900/20">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-white">محادثة المقاتلين</span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowChatPanel(false)}
                  className="w-6 h-6 text-slate-400 hover:text-white hover:bg-white/10"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>

              {/* Chat Messages */}
              <ScrollArea className="h-60 p-3">
                <div className="space-y-3">
                  {chatMessages.length === 0 && (
                    <p className="text-center text-slate-500 text-xs py-8">لا توجد رسائل بعد... ابدأ المحادثة!</p>
                  )}
                  {chatMessages.map((msg) => {
                    const isMe = msg.sender === playerName
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <span className="text-[10px] text-slate-500 mb-0.5 px-1">
                          {msg.sender}
                        </span>
                        <div
                          className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                            isMe
                              ? 'bg-red-500/20 text-red-100 border border-red-500/20 rounded-bl-sm'
                              : 'bg-white/10 text-slate-200 border border-white/10 rounded-br-sm'
                          }`}
                        >
                          {msg.text}
                        </div>
                      </motion.div>
                    )
                  })}
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>

              {/* Chat Input */}
              <div className="p-3 border-t border-white/10 flex gap-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  placeholder="اكتب رسالة..."
                  className="flex-1 h-9 text-sm bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-amber-500/30"
                  dir="rtl"
                />
                <Button
                  size="icon"
                  onClick={sendMessage}
                  disabled={!chatInput.trim()}
                  className="w-9 h-9 bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                >
                  <Send className="w-4 h-4 rotate-180" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Control buttons */}
        <div className="flex items-center gap-2">
          {/* Chat toggle (only in lobby/waiting) */}
          {showChat && isConnected && (
            <div className="relative">
              <Button
                size="icon"
                onClick={() => setShowChatPanel(!showChatPanel)}
                className={`w-11 h-11 rounded-full backdrop-blur-xl border transition-all ${
                  showChatPanel
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30'
                    : 'bg-black/40 border-white/10 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/20'
                }`}
              >
                <MessageCircle className="w-5 h-5" />
              </Button>
              {/* Unread messages badge */}
              {unreadCount > 0 && !showChatPanel && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-lg shadow-red-500/50"
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </motion.div>
              )}
            </div>
          )}

          {/* Speaker toggle */}
          <Button
            size="icon"
            onClick={toggleSpeaker}
            className={`w-11 h-11 rounded-full backdrop-blur-xl border transition-all ${
              isSpeakerMuted
                ? 'bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30'
                : 'bg-black/40 border-white/10 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/20'
            }`}
          >
            {isSpeakerMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </Button>

          {/* Mic toggle */}
          <Button
            size="icon"
            onClick={toggleMic}
            className={`w-11 h-11 rounded-full backdrop-blur-xl border transition-all relative ${
              isMicMuted
                ? 'bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30'
                : isLocalSpeaking
                  ? 'bg-green-500/30 border-green-400/50 text-green-300 hover:bg-green-500/40 shadow-lg shadow-green-500/30'
                  : 'bg-green-500/20 border-green-500/30 text-green-400 hover:bg-green-500/30'
            }`}
          >
            {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            {!isMicMuted && (
              <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${isLocalSpeaking ? 'bg-green-300 animate-pulse' : 'bg-green-400'} `} />
            )}
          </Button>

          {/* Connection status indicator */}
          <div className="flex items-center gap-1.5 px-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : _connecting ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="text-[10px] text-slate-500">
              {isConnected ? 'متصل' : _connecting ? 'جاري الاتصال...' : 'غير متصل'}
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

// Module-level reference to the current room for callbacks
let roomRef: Room | null = null

// ============================================
// DISCONNECT HELPER - called when leaving game
// ============================================
export function disconnectLiveKit() {
  // Clean up all audio elements
  audioElements.forEach((el) => { el.pause(); el.srcObject = null })
  audioElements.clear()

  if (livekitRoom) {
    livekitRoom.disconnect()
    livekitRoom = null
    roomRef = null
    currentRoomCode = null
    isConnecting = false
    sharedChatMessages = []
  }
}

// ============================================
// HOOK: Get speaking participants from LiveKit
// ============================================
export function useLiveKitSpeakingState(): Set<string> {
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const room = livekitRoom
    if (!room || room.state !== 'connected') return

    const onActiveSpeakersChanged = (speakers: any[]) => {
      const ids = new Set<string>()
      for (const speaker of speakers) {
        ids.add(speaker.identity || speaker.sid)
      }
      setSpeakingIds(ids)
    }

    room.on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged)
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged)
    }
  }, [])

  return speakingIds
}
