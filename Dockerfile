# ── Root Dockerfile for Railway ──────────────────────────────────────────────
# This Dockerfile builds the game service from the mini-services/game-service
# directory.  Railway needs a Dockerfile at the repo root (or a properly
# configured root directory setting in the Railway dashboard).

FROM node:20-alpine
WORKDIR /app

# Copy game service package files
COPY mini-services/game-service/package.json ./

# Install dependencies + tsx for TypeScript execution
RUN npm install --production && npm install tsx

# Copy game service source code
COPY mini-services/game-service/index.ts mini-services/game-service/index-wrapper.ts ./

# Railway provides the PORT env variable automatically
ENV PORT=3003
EXPOSE $PORT

# Start the game service using tsx (TypeScript runner for Node.js)
CMD ["npx", "tsx", "index-wrapper.ts"]
