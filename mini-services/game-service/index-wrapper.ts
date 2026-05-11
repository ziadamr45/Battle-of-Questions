// Signal handlers for graceful shutdown (Railway sends SIGTERM on scale-down)
process.on('SIGTERM', () => { console.log('[shutdown] Received SIGTERM, exiting gracefully'); process.exit(0) })
process.on('SIGINT', () => { console.log('[shutdown] Received SIGINT, exiting gracefully'); process.exit(0) })

// Import the main game service
import './index.ts'
