/**
 * CozanetOS Memory Database
 * Auto-detects environment:
 *   - If UPSTASH_REDIS_URL is set → Redis-backed in-memory SQLite (serverless)
 *   - Otherwise → file-based SQLite (local dev)
 *
 * This fixes the "AI can't save memory" bug on Vercel: the file-based
 * SQLite database was on ephemeral storage, wiped on every cold start.
 * Redis-backed mode loads from Redis on init and writes through on change.
 */

export { getDB, closeDB, ensureLoaded, scheduleRedisFlush, isRedisMode } from './redis-database.js';
