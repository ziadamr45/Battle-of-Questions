#!/bin/bash
cd /home/z/my-project

# Start Next.js
echo "Starting Next.js..."
bun run dev &
NEXT_PID=$!

# Wait a bit for Next.js to claim port 3000
sleep 5

# Start Game Service
echo "Starting Game Service..."
cd /home/z/my-project/mini-services/game-service
node --watch index.ts &
GAME_PID=$!

echo "Next.js PID: $NEXT_PID"
echo "Game Service PID: $GAME_PID"

# Keep script alive
wait
