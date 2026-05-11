# ── Game Service Dockerfile for Railway ──────────────────────────────────────
# Uses Node.js + tsx for reliable TypeScript execution

FROM node:20-alpine
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies + tsx for TypeScript execution
RUN npm install --production && npm install tsx

# Copy source code
COPY index.ts index-wrapper.ts ./

# Railway provides the PORT env variable automatically
ENV PORT=3003
EXPOSE $PORT

# Start the game service using tsx (TypeScript runner for Node.js)
CMD ["npx", "tsx", "index-wrapper.ts"]
