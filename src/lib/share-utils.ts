// Share utilities for معركة الأسئلة
// Handles Web Share API, WhatsApp, Telegram, SMS, copy link, and deep link generation

import type { ShareRoomInfo } from './invite-generator'
import {
  generateInviteMessage,
  generateShortInvite,
  generateWhatsAppInvite,
  generateTelegramInvite,
} from './invite-generator'

// ─── Deep Link / URL Generation ────────────────────────────────────────

export function getBaseUrl(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

export function generateJoinUrl(roomCode: string): string {
  const base = getBaseUrl()
  return `${base}/?join=${roomCode.toUpperCase()}`
}

export function parseJoinUrl(): { roomCode: string; autoJoin: boolean } | null {
  if (typeof window === 'undefined') return null

  const params = new URLSearchParams(window.location.search)
  const joinCode = params.get('join')

  if (joinCode && joinCode.length > 0) {
    return { roomCode: joinCode.toUpperCase(), autoJoin: true }
  }

  // Also check hash-based URLs for compatibility
  const hash = window.location.hash
  if (hash && hash.startsWith('#join=')) {
    const code = hash.replace('#join=', '')
    if (code.length > 0) {
      return { roomCode: code.toUpperCase(), autoJoin: true }
    }
  }

  return null
}

// Clean join params from URL without reloading (preserves other params)
export function cleanJoinParams(): void {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  if (url.searchParams.has('join')) {
    url.searchParams.delete('join')
    window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''))
  }
}

// ─── Share Channel Types ───────────────────────────────────────────────

export type ShareChannel = 'native' | 'whatsapp' | 'telegram' | 'messenger' | 'sms' | 'copy'

export interface ShareResult {
  success: boolean
  channel: ShareChannel
  message?: string
}

// ─── Web Share API Detection ───────────────────────────────────────────

export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

export function canShareFiles(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'
}

// ─── Copy to Clipboard ─────────────────────────────────────────────────

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
    // Fallback for older browsers
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const result = document.execCommand('copy')
    document.body.removeChild(textarea)
    return result
  } catch {
    return false
  }
}

// ─── Share Functions ───────────────────────────────────────────────────

export async function shareNative(info: ShareRoomInfo): Promise<ShareResult> {
  if (!canNativeShare()) {
    return { success: false, channel: 'native', message: 'Web Share API not supported' }
  }

  try {
    const message = generateInviteMessage(info)

    await navigator.share({
      title: 'معركة الأسئلة - انضم للمعركة! ⚔️',
      text: message,
      url: info.joinUrl,
    })

    return { success: true, channel: 'native' }
  } catch (err: any) {
    // User cancelled sharing is not an error
    if (err?.name === 'AbortError') {
      return { success: false, channel: 'native', message: 'cancelled' }
    }
    return { success: false, channel: 'native', message: err?.message || 'Share failed' }
  }
}

export function shareWhatsApp(info: ShareRoomInfo): ShareResult {
  try {
    const message = generateWhatsAppInvite(info)
    const encoded = encodeURIComponent(message)
    window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer')
    return { success: true, channel: 'whatsapp' }
  } catch (err: any) {
    return { success: false, channel: 'whatsapp', message: err?.message || 'Failed to open WhatsApp' }
  }
}

export function shareTelegram(info: ShareRoomInfo): ShareResult {
  try {
    const message = generateTelegramInvite(info)
    const encoded = encodeURIComponent(message)
    window.open(`https://t.me/share/url?url=${encodeURIComponent(info.joinUrl)}&text=${encoded}`, '_blank', 'noopener,noreferrer')
    return { success: true, channel: 'telegram' }
  } catch (err: any) {
    return { success: false, channel: 'telegram', message: err?.message || 'Failed to open Telegram' }
  }
}

export function shareMessenger(info: ShareRoomInfo): ShareResult {
  try {
    // Use Facebook share dialog (works without app_id for link sharing)
    const encodedUrl = encodeURIComponent(info.joinUrl)
    const encodedQuote = encodeURIComponent(generateShortInvite(info))
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedQuote}`, '_blank', 'noopener,noreferrer')
    return { success: true, channel: 'messenger' }
  } catch (err: any) {
    return { success: false, channel: 'messenger', message: err?.message || 'Failed to open Facebook' }
  }
}

export function shareSMS(info: ShareRoomInfo): ShareResult {
  try {
    const message = generateShortInvite(info)
    const encoded = encodeURIComponent(message)
    // SMS URI scheme - works on mobile
    window.open(`sms:?body=${encoded}`, '_blank')
    return { success: true, channel: 'sms' }
  } catch (err: any) {
    return { success: false, channel: 'sms', message: err?.message || 'Failed to open SMS' }
  }
}

export async function shareCopyLink(info: ShareRoomInfo): Promise<ShareResult> {
  const success = await copyToClipboard(info.joinUrl)
  return {
    success,
    channel: 'copy',
    message: success ? 'تم نسخ رابط الدعوة' : 'فشل نسخ الرابط',
  }
}

export async function shareCopyMessage(info: ShareRoomInfo): Promise<ShareResult> {
  const message = generateInviteMessage(info)
  const success = await copyToClipboard(message)
  return {
    success,
    channel: 'copy',
    message: success ? 'تم نسخ رسالة الدعوة' : 'فشل نسخ الرسالة',
  }
}

// ─── Master Share Function ─────────────────────────────────────────────

export async function shareRoom(channel: ShareChannel, info: ShareRoomInfo): Promise<ShareResult> {
  switch (channel) {
    case 'native':
      return shareNative(info)
    case 'whatsapp':
      return shareWhatsApp(info)
    case 'telegram':
      return shareTelegram(info)
    case 'messenger':
      return shareMessenger(info)
    case 'sms':
      return shareSMS(info)
    case 'copy':
      return shareCopyLink(info)
    default:
      return { success: false, channel, message: 'Unknown channel' }
  }
}
