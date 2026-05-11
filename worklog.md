---
Task ID: 1
Agent: Main
Task: Implement persistent guest identity system for معركة الأسئلة

Work Log:
- Updated Prisma schema with Guest model (id UUID, displayName, avatarColor, createdAt, lastSeen)
- Ran `bun run db:push` to sync database
- Created `/api/guest` API route with GET (lookup), POST (create/restore), PATCH (update name)
- Created `src/lib/arabic-names.ts` with Arabic warrior/arena-themed name generator and avatar color palette
- Created `src/lib/guest-store.ts` - Zustand store for guest identity with cookie persistence
- Created `src/components/guest-identity.tsx` with:
  - NameEntryModal: Cinematic first-visit name entry with Framer Motion, glow effects, random name generator
  - EditNameModal: Small modal for changing display name
  - PlayerNameBadge: Compact badge showing avatar initial + name + edit icon
- Integrated into `src/app/page.tsx`:
  - Added guest store imports
  - CreateGameScreen: Uses guest.displayName as effectiveName, shows edit button
  - JoinGameScreen: Uses guest.displayName as effectiveJoinName, shows edit button
  - Home component: Restores guest from cookie on mount, shows NameEntryModal for first-timers, syncs playerName with guest identity
  - All button disabled checks use effective name instead of raw input
- Fixed lint errors: Replaced useEffect-based name sync with direct derived variables (effectiveName, effectiveJoinName)

Stage Summary:
- Full guest identity system implemented: database → API → Zustand store → UI components
- First visit shows cinematic name-entry modal
- Returning users auto-restore from cookie + database lookup
- Name is editable via edit icon on create/join screens
- Arabic random name generator with warrior/arena themes
- PlayerNameBadge component available for in-game use
- Game store playerName stays synced with guest displayName
- No authentication required - lightweight cookie-based persistence
