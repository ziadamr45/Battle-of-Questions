#!/bin/bash
while true; do
  cd /home/z/my-project/mini-services/game-service
  node index.ts 2>&1
  echo "Game service died at $(date), restarting in 3s..."
  sleep 3
done
