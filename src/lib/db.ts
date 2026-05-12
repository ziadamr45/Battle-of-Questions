import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Use NEON_DATABASE_URL if available (takes precedence over DATABASE_URL)
// This allows the sandbox environment to use PostgreSQL even when the system
// sets DATABASE_URL to a local SQLite path.
const effectiveDatabaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: effectiveDatabaseUrl,
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
