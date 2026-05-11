'use client'

import { create } from 'zustand'

const GUEST_COOKIE_KEY = 'maaraka-guest-id'

export interface GuestProfile {
  id: string
  displayName: string
  avatarColor: string
}

interface GuestState {
  // The guest profile — null until loaded or created
  guest: GuestProfile | null
  setGuest: (guest: GuestProfile) => void
  clearGuest: () => void

  // Loading state for initial restore
  isLoading: boolean
  setIsLoading: (loading: boolean) => void

  // Whether the cinematic "enter your name" modal should show
  showNameModal: boolean
  setShowNameModal: (show: boolean) => void

  // Whether the edit-name modal is open
  showEditModal: boolean
  setShowEditModal: (show: boolean) => void

  // Persist guest_id to cookie
  saveGuestId: (id: string) => void
  loadGuestId: () => string | null
  removeGuestId: () => void
}

function setCookie(name: string, value: string, days: number = 365) {
  try {
    const expires = new Date(Date.now() + days * 864e5).toUTCString()
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? ';Secure' : ''
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax${secure}`
  } catch {
    // Ignore
  }
}

function getCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
    if (match) return decodeURIComponent(match[2])
  } catch {
    // Ignore
  }
  return null
}

function deleteCookie(name: string) {
  try {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
  } catch {
    // Ignore
  }
}

export const useGuestStore = create<GuestState>((set) => ({
  guest: null,
  setGuest: (guest) => set({ guest, isLoading: false }),
  clearGuest: () => set({ guest: null }),

  isLoading: true, // Start true until we check for existing guest
  setIsLoading: (loading) => set({ isLoading: loading }),

  showNameModal: false,
  setShowNameModal: (show) => set({ showNameModal: show }),

  showEditModal: false,
  setShowEditModal: (show) => set({ showEditModal: show }),

  saveGuestId: (id: string) => setCookie(GUEST_COOKIE_KEY, id),
  loadGuestId: () => {
    if (typeof window === 'undefined') return null
    return getCookie(GUEST_COOKIE_KEY)
  },
  removeGuestId: () => deleteCookie(GUEST_COOKIE_KEY),
}))
