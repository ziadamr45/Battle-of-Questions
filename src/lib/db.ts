import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  })

// ─── Connection Pooling & Best Practices ─────────────────────────────────────
// 1. The DATABASE_URL already uses Neon's `-pooler` endpoint (PgBouncer)
//    which handles server-side connection pooling.
// 2. In development, we reuse the singleton via globalThis to avoid
//    exhausting connections with hot-reloading.
// 3. Prisma's built-in connection pool defaults (5 connections, 10s timeout)
//    are appropriate for this app's scale.

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Graceful shutdown: disconnect Prisma when the process exits
// This prevents dangling connections in serverless environments
if (typeof process !== 'undefined') {
  const shutdown = async () => {
    try {
      await db.$disconnect()
    } catch {
      // Ignore disconnect errors during shutdown
    }
    process.exit(0)
  }
  process.on('beforeExit', shutdown)
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
