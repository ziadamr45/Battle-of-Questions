// ─── Per-Player Mute State ────────────────────────────────────────────────────
// Tracks which players are locally muted (audio) and which are host-muted (broadcast)
// This is client-side only — not persisted

import { create } from 'zustand'

interface PlayerMuteState {
  // Player IDs that the current user has locally muted (their own choice)
  locallyMutedPlayers: Set<string>
  // Player IDs that the host has muted (broadcast to all)
  hostMutedPlayers: Set<string>
  // Map playerId → playerName for accurate LiveKit identity matching
  playerNames: Map<string, string>

  // Toggle local mute for a player
  toggleLocalMute: (playerId: string, playerName?: string) => void
  // Add a host-muted player
  addHostMuted: (playerId: string, playerName?: string) => void
  // Remove a host-muted player (when they rejoin or unmuted)
  removeHostMuted: (playerId: string) => void
  // Check if a player is muted (either locally or by host)
  isPlayerMuted: (playerId: string) => boolean
  // Check if a LiveKit participant identity matches any muted player
  isLiveKitIdentityMuted: (participantIdentity: string) => boolean
  // Clear all mutes (on room leave)
  clearAllMutes: () => void
}

export const usePlayerMuteStore = create<PlayerMuteState>((set, get) => ({
  locallyMutedPlayers: new Set<string>(),
  hostMutedPlayers: new Set<string>(),
  playerNames: new Map<string, string>(),

  toggleLocalMute: (playerId: string, playerName?: string) => {
    set((state) => {
      const newSet = new Set(state.locallyMutedPlayers)
      const newNames = new Map(state.playerNames)
      if (newSet.has(playerId)) {
        newSet.delete(playerId)
      } else {
        newSet.add(playerId)
        if (playerName) newNames.set(playerId, playerName)
      }
      return { locallyMutedPlayers: newSet, playerNames: newNames }
    })
    // Dispatch event for voice-chat to pick up
    window.dispatchEvent(new CustomEvent('player-mute-changed', {
      detail: { playerId, playerName, isMuted: get().isPlayerMuted(playerId) }
    }))
  },

  addHostMuted: (playerId: string, playerName?: string) => {
    set((state) => {
      const newSet = new Set(state.hostMutedPlayers)
      const newNames = new Map(state.playerNames)
      newSet.add(playerId)
      if (playerName) newNames.set(playerId, playerName)
      return { hostMutedPlayers: newSet, playerNames: newNames }
    })
    window.dispatchEvent(new CustomEvent('player-mute-changed', {
      detail: { playerId, playerName, isMuted: true }
    }))
  },

  removeHostMuted: (playerId: string) => {
    set((state) => {
      const newSet = new Set(state.hostMutedPlayers)
      newSet.delete(playerId)
      return { hostMutedPlayers: newSet }
    })
  },

  isPlayerMuted: (playerId: string) => {
    const state = get()
    return state.locallyMutedPlayers.has(playerId) || state.hostMutedPlayers.has(playerId)
  },

  isLiveKitIdentityMuted: (participantIdentity: string) => {
    const state = get()
    const mutedIds = [...state.locallyMutedPlayers, ...state.hostMutedPlayers]
    for (const mutedId of mutedIds) {
      const mutedName = state.playerNames.get(mutedId)
      if (mutedName) {
        // Convert name to LiveKit identity format (spaces → underscores)
        const mutedLiveKitId = mutedName.replace(/\s+/g, '_')
        if (mutedLiveKitId === participantIdentity) return true
      }
    }
    return false
  },

  clearAllMutes: () => {
    set({ locallyMutedPlayers: new Set<string>(), hostMutedPlayers: new Set<string>(), playerNames: new Map<string, string>() })
  },
}))
