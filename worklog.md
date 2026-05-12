# Bug Fix Worklog — Arabic Multiplayer Quiz Game

## Date: 2026-03-04

### FIX 1: Fix audioEngine.error() used for non-error events
**Problem:** The harsh error sound (`audioEngine.error()`) was used for join request notifications and captain approval events — creating negative associations for non-error events.

**Solution:**
- Added a new `playNotification()` function in `/home/z/my-project/src/lib/audio-engine.ts` that plays a gentle ascending chime (C5→E5→G5) instead of the harsh descending square wave of the error sound.
- Exported it as `notification: playNotification` in the audioEngine API.
- Replaced two misuse sites in `/home/z/my-project/src/app/page.tsx`:
  - Line ~638: `join-request-received` handler — changed `audioEngine.error()` → `audioEngine.notification()`
  - Line ~705: `approval-requested` handler — changed `audioEngine.error()` → `audioEngine.notification()`
- Kept legitimate `audioEngine.error()` calls at lines 372 (game-error) and 433 (early-end-rejected) and 682 (join-request-rejected) since those are actual errors.

### FIX 2: Add minimal audio control in arena screens
**Problem:** Audio controls were completely hidden during arena screens (lobby, loading, game, round-transition). Players had no way to mute without leaving the game.

**Solution:**
- Added a new `ArenaMuteButton` component in `page.tsx` — a small floating mute/unmute icon button (8×8 rounded, subtle backdrop-blur) in the top-right corner.
- Only visible when screen is in `ARENA_SCREENS` set (lobby, loading, game, round-transition).
- Toggles mute on click via `useAudioStore`'s `toggleMute()`.
- Placed in the main layout alongside the existing `<AudioControls />`.

### FIX 3: Fix "عنّا" button using Sparkles icon
**Problem:** The "عنّا" (About) button used `Sparkles` icon which doesn't fit the battle theme.

**Solution:**
- Replaced `<Sparkles className="w-5 h-5 ml-2" />` with `<Shield className="w-5 h-5 ml-2" />` in the About button at line ~1670. Shield is already imported and fits the battle/arena theme.

### FIX 4: Fix chat messages double-filtered
**Problem:** `chatMessages.filter(m => ...)` was called twice in the lobby chat — once for the empty check, once for rendering — causing redundant computation on every render.

**Solution:**
- Added a `useMemo`-based `filteredMessages` variable in the `LobbyScreen` component:
  ```typescript
  const filteredMessages = useMemo(() =>
    chatMessages.filter(m => chatMode === 'global' ? m.mode === 'global' : m.mode === 'team' && m.teamId === myTeamId),
    [chatMessages, chatMode, myTeamId]
  )
  ```
- Replaced the two `.filter()` calls with `filteredMessages.length === 0` (empty check) and `filteredMessages.map(...)` (rendering).

### FIX 5: Fix Podium hidden for 2-player games
**Problem:** The podium visualization was only shown when `scores.length >= 3`, making 1v1 games have no podium at all.

**Solution:**
- Kept the existing 3-podium layout for `scores.length >= 3`.
- Added a new 2-podium "duel face-off" layout for `scores.length === 2`:
  - Winner (left) with Crown icon, gold styling, and "بطل المعركة!" label
  - Center VS divider with Swords icon
  - Runner-up (right) with silver styling and "الوصيف" label
  - Uses `items-stretch` for equal height columns and slide-in animations (x: ±30)

### FIX 6: Auto-submit room code on 6 characters
**Problem:** When joining by code, the user had to type 6 characters and then manually click the join button.

**Solution:**
- Added `handleCodeChange` callback in `JoinGameScreen`:
  - Converts input to uppercase (also handles FIX 7)
  - When input length reaches 6 and a name is entered, auto-triggers `joinGame()` after a 150ms delay to allow the last character to register.
- Updated the Input's `onChange` to use `handleCodeChange` instead of inline `setCode(e.target.value.toUpperCase())`.

### FIX 7: Add room code auto-uppercase
**Problem:** Room codes are uppercase but the input didn't enforce this.

**Solution:**
- Already handled as part of FIX 6: `handleCodeChange` converts the value to uppercase before setting state. The previous inline `.toUpperCase()` in the onChange was replaced by the same logic inside `handleCodeChange`.

---

## Files Modified
1. `/home/z/my-project/src/lib/audio-engine.ts` — Added `playNotification()` function and `notification` export
2. `/home/z/my-project/src/app/page.tsx` — All 7 fixes applied (audio misuses, ArenaMuteButton, icon swap, useMemo filter, duel podium, auto-submit, auto-uppercase)

## Verification
- `bun run lint` — passes with no errors
- Dev server compiles and serves successfully
