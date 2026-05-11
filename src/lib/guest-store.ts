'use client'

import { create } from 'zustand'

const GUEST_COOKIE_KEY = 'maaraka-guest-id'
const GUEST_PROFILE_KEY = 'maaraka-guest-profile'

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

  // Persist full guest profile to localStorage + cookie
  saveGuestProfile: (guest: GuestProfile) => void
  loadGuestProfile: () => GuestProfile | null
  removeGuestProfile: () => void

  // Check if the user has visited before (has a cached profile)
  hasVisitedBefore: () => boolean
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

function saveToLocalStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage errors (quota, privacy mode, etc.)
  }
}

function loadFromLocalStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch {
    // Ignore parse errors
  }
  return null
}

function removeFromLocalStorage(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore
  }
}

export const useGuestStore = create<GuestState>((set, get) => ({
  guest: null,
  setGuest: (guest) => {
    // Save to localStorage AND cookie whenever guest is set
    get().saveGuestProfile(guest)
    set({ guest, isLoading: false })
  },
  clearGuest: () => {
    get().removeGuestProfile()
    set({ guest: null })
  },

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

  saveGuestProfile: (guest: GuestProfile) => {
    if (typeof window === 'undefined') return
    // Save full profile to localStorage
    saveToLocalStorage(GUEST_PROFILE_KEY, guest)
    // Also save ID to cookie for backward compatibility
    setCookie(GUEST_COOKIE_KEY, guest.id)
  },

  loadGuestProfile: () => {
    if (typeof window === 'undefined') return null
    return loadFromLocalStorage<GuestProfile>(GUEST_PROFILE_KEY)
  },

  removeGuestProfile: () => {
    if (typeof window === 'undefined') return
    removeFromLocalStorage(GUEST_PROFILE_KEY)
    deleteCookie(GUEST_COOKIE_KEY)
  },

  hasVisitedBefore: () => {
    if (typeof window === 'undefined') return false
    return loadFromLocalStorage<GuestProfile>(GUEST_PROFILE_KEY) !== null
  },
}))
