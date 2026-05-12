'use client'

import { create } from 'zustand'

// ─── Notification Types ──────────────────────────────────────────────────────────

export type BattleToastType =
  | 'player_joined'
  | 'player_left'
  | 'player_disconnected'
  | 'player_reconnected'
  | 'opponent_left'
  | 'surrender'
  | 'host_changed_self'
  | 'host_changed_other'
  | 'rejoin_success'
  | 'rejoin_failed'
  | 'error'
  | 'connection_error'
  | 'timeout'
  | 'settings_updated'
  | 'room_full'
  | 'room_open'
  | 'success'
  | 'info'
  | 'warning'
  | 'early_end_rejected'
  | 'battle_event'
  | 'name_updated'
  | 'kicked'
  | 'muted_by_host'
  | 'player_audio_muted'
  | 'team_switched'
  | 'team_switch'
  | 'captain_promoted'
  | 'captain_changed'
  | 'join_request'
  | 'switch_request'
  | 'join_request_sent'
  | 'join_approved'
  | 'join_rejected'
  | 'join_expired'
  | 'join_resolved'
  | 'approval_sent'
  | 'approval_approved'
  | 'approval_rejected'
  | 'approval_expired'
  | 'voice_merged'
  | 'kick_sent'

export interface BattleToastItem {
  id: string
  type: BattleToastType
  title: string
  description?: string
  playerName?: string
  priority: number
  duration: number
  createdAt: number
}

// ─── Type Configs: priority + duration + visual identity ──────────────────────────

interface ToastTypeConfig {
  priority: number
  duration: number
  category: 'arena' | 'combat' | 'system' | 'error'
}

const TOAST_TYPE_CONFIGS: Record<BattleToastType, ToastTypeConfig> = {
  player_joined:       { priority: 4, duration: 2500, category: 'arena' },
  player_left:         { priority: 4, duration: 2500, category: 'arena' },
  player_disconnected: { priority: 4, duration: 2500, category: 'arena' },
  player_reconnected:  { priority: 5, duration: 2500, category: 'arena' },
  opponent_left:       { priority: 7, duration: 3000, category: 'combat' },
  surrender:           { priority: 5, duration: 3000, category: 'combat' },
  host_changed_self:   { priority: 6, duration: 3500, category: 'combat' },
  host_changed_other:  { priority: 6, duration: 3000, category: 'arena' },
  rejoin_success:      { priority: 4, duration: 2500, category: 'system' },
  rejoin_failed:       { priority: 8, duration: 4000, category: 'error' },
  error:               { priority: 10, duration: 5000, category: 'error' },
  connection_error:    { priority: 9, duration: 4000, category: 'error' },
  timeout:             { priority: 8, duration: 4000, category: 'error' },
  settings_updated:    { priority: 2, duration: 2000, category: 'system' },
  room_full:           { priority: 3, duration: 2500, category: 'system' },
  room_open:           { priority: 3, duration: 2500, category: 'system' },
  success:             { priority: 3, duration: 2000, category: 'system' },
  info:                { priority: 1, duration: 2000, category: 'system' },
  warning:             { priority: 5, duration: 3000, category: 'system' },
  early_end_rejected:  { priority: 7, duration: 4000, category: 'error' },
  battle_event:        { priority: 5, duration: 3000, category: 'combat' },
  name_updated:        { priority: 2, duration: 2500, category: 'arena' },
  kicked:              { priority: 8, duration: 4000, category: 'error' },
  muted_by_host:       { priority: 6, duration: 3000, category: 'system' },
  player_audio_muted:  { priority: 3, duration: 2500, category: 'arena' },
  team_switched:       { priority: 4, duration: 2500, category: 'arena' },
  team_switch:         { priority: 4, duration: 2500, category: 'arena' },
  captain_promoted:    { priority: 6, duration: 3500, category: 'combat' },
  captain_changed:     { priority: 5, duration: 3000, category: 'arena' },
  join_request:        { priority: 7, duration: 4000, category: 'combat' },
  switch_request:      { priority: 7, duration: 4000, category: 'combat' },
  join_request_sent:   { priority: 4, duration: 3000, category: 'system' },
  join_approved:       { priority: 6, duration: 3000, category: 'combat' },
  join_rejected:       { priority: 6, duration: 3000, category: 'system' },
  join_expired:        { priority: 4, duration: 2500, category: 'system' },
  join_resolved:       { priority: 4, duration: 2500, category: 'arena' },
  approval_sent:       { priority: 4, duration: 3000, category: 'system' },
  approval_approved:   { priority: 6, duration: 3000, category: 'combat' },
  approval_rejected:   { priority: 6, duration: 3000, category: 'system' },
  approval_expired:    { priority: 4, duration: 2500, category: 'system' },
  voice_merged:        { priority: 5, duration: 3000, category: 'combat' },
  kick_sent:           { priority: 3, duration: 2000, category: 'system' },
}

const MAX_VISIBLE = 3
const MAX_QUEUE = 10

let toastCounter = 0
function genId(): string {
  toastCounter = (toastCounter + 1) % Number.MAX_SAFE_INTEGER
  return `bt-${toastCounter}-${Date.now()}`
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface BattleToastState {
  toasts: BattleToastItem[]
  addToast: (toast: Omit<BattleToastItem, 'id' | 'priority' | 'duration' | 'createdAt'>) => void
  removeToast: (id: string) => void
  dismissAll: () => void
}

export const useBattleToastStore = create<BattleToastState>((set, get) => ({
  toasts: [],

  addToast: (incoming) => {
    const config = TOAST_TYPE_CONFIGS[incoming.type]
    const newToast: BattleToastItem = {
      ...incoming,
      id: genId(),
      priority: config.priority,
      duration: config.duration,
      createdAt: Date.now(),
    }

    set((state) => {
      let updated = [...state.toasts, newToast]

      // Dedup: if same type + same playerName within 500ms, skip
      const isDupe = updated.some((t, idx) =>
        idx < updated.length - 1 &&
        t.type === newToast.type &&
        t.playerName === newToast.playerName &&
        Math.abs(t.createdAt - newToast.createdAt) < 500
      )
      if (isDupe) return state

      // Sort by priority (highest first), then by createdAt (newest first)
      updated.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority
        return b.createdAt - a.createdAt
      })

      // Trim queue
      if (updated.length > MAX_QUEUE) {
        updated = updated.slice(0, MAX_QUEUE)
      }

      return { toasts: updated }
    })
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },

  dismissAll: () => {
    set({ toasts: [] })
  },
}))

// ─── Convenience helper (imperative, like the old toast()) ─────────────────────

export function battleToast(
  type: BattleToastType,
  title: string,
  description?: string,
  playerName?: string
) {
  useBattleToastStore.getState().addToast({ type, title, description, playerName })
}

// ─── Type config getter (for UI rendering) ────────────────────────────────────

export function getToastTypeConfig(type: BattleToastType): ToastTypeConfig {
  return TOAST_TYPE_CONFIGS[type]
}
