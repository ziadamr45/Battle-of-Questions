---
Task ID: 1
Agent: Main Agent
Task: Fix all 5 game issues (reconnection, timer, progress, game flow, question count)

Work Log:
- Read and analyzed entire codebase (game-service/index.ts 1629 lines, page.tsx 2542 lines, game-store.ts)
- Identified critical reconnection bug: disconnect handler immediately removes player, making rejoin impossible
- Added 60-second grace period for disconnected players with periodic cleanup
- Added `isDisconnected`, `disconnectedAt`, `oldSocketIds` fields to Player interface
- Added `roundEnding` flag to GameRoom to prevent double handleRoundEnd calls
- Updated `playersToArray` to filter out disconnected players from visible list
- Added `playersToArrayAll` helper for internal use
- Added `cleanupExpiredDisconnects` function running every 15 seconds
- Updated `removePlayerFromRoom` to mark players as disconnected instead of removing them
- Updated `rejoin-room` handler to find disconnected players by name and restore them
- Updated `start-game` to remove lingering disconnected players before starting
- Updated `submit-answer` to only check active (non-disconnected) players for all-answered
- Updated `handleRoundEnd` with roundEnding guard to prevent double calls
- Updated disconnect handler to use new grace period system
- Updated `findNextHost` to skip disconnected players
- Updated `getPublicRoomsList` to count only active players
- Updated `calculateRoundScores` to skip disconnected players
- Changed question count from 7 to 10 for medium difficulty
- Increased max_tokens from 4096 to 8192 for longer LLM responses
- Made timer full-width at top of game HUD (mobile-friendly)
- Moved badges (round/question progress) below timer
- Fixed progress steps clearing on game-starting and round-loading events
- Improved progress step rendering (ready/validating show as completed)
- Updated completion message to say "waiting for other player or time to end"
- Changed game-service .env to use google/gemini-2.0-flash-001 for speed
- Pushed all changes to GitHub

Stage Summary:
- Reconnection now works: players can refresh and rejoin within 60 seconds
- Timer is now the most prominent element at the top of the game screen
- Progress levels are accurate and cleared between rounds
- Both players finishing ends the round immediately (no double-call bugs)
- Medium difficulty now generates 10 questions instead of 7
