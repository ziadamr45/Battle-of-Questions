// ─── Per-Player Mute State ────────────────────────────────────────────────────
// Tracks which players are locally muted (audio) and which are host-muted (broadcast)
// This is client-side only — not persisted

import { create } from 'zustand'

interface PlayerMuteState {
  // Player IDs that the current user has locally muted (their own choice)
  locallyMutedPlayers: Set<string>
  // Player IDs that the host has muted (broadcast to all)
  hostMutedPlayers: Set<string>

  // Toggle local mute for a player
  toggleLocalMute: (playerId: string) => void
  // Add a host-muted player
  addHostMuted: (playerId: string) => void
  // Remove a host-muted player (when they rejoin or unmuted)
  removeHostMuted: (playerId: string) => void
  // Check if a player is muted (either locally or by host)
  isPlayerMuted: (playerId: string) => boolean
  // Clear all mutes (on room leave)
  clearAllMutes: () => void
}

export const usePlayerMuteStore = create<PlayerMuteState>((set, get) => ({
  locallyMutedPlayers: new Set<string>(),
  hostMutedPlayers: new Set<string>(),

  toggleLocalMute: (playerId: string) => {
    set((state) => {
      const newSet = new Set(state.locallyMutedPlayers)
      if (newSet.has(playerId)) {
        newSet.delete(playerId)
      } else {
        newSet.add(playerId)
      }
      return { locallyMutedPlayers: newSet }
    })
    // Dispatch event for voice-chat to pick up
    window.dispatchEvent(new CustomEvent('player-mute-changed', {
      detail: { playerId, isMuted: get().isPlayerMuted(playerId) }
    }))
  },

  addHostMuted: (playerId: string) => {
    set((state) => {
      const newSet = new Set(state.hostMutedPlayers)
      newSet.add(playerId)
      return { hostMutedPlayers: newSet }
    })
    window.dispatchEvent(new CustomEvent('player-mute-changed', {
      detail: { playerId, isMuted: true }
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

  clearAllMutes: () => {
    set({ locallyMutedPlayers: new Set<string>(), hostMutedPlayers: new Set<string>() })
  },
}))
