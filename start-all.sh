#!/bin/bash
cd /home/z/my-project

# Kill any existing processes
pkill -9 -f "next dev" 2>/dev/null
pkill -9 -f "game-service" 2>/dev/null
pkill -9 -f "node.*index.ts" 2>/dev/null
sleep 2

# Start Next.js dev server
nohup bun run dev > /dev/null 2>&1 &
echo "Next.js PID: $!"

# Start Game Service with keepalive
cd /home/z/my-project/mini-services/game-service
chmod +x keepalive.sh
nohup bash keepalive.sh > /tmp/game-service.log 2>&1 &
echo "Game Service PID: $!"
