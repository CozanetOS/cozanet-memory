/**
 * RedisDatabase — Serverless-compatible database for CozanetOS Memory.
 *
 * PROBLEM: better-sqlite3 writes to a local file. On Vercel, the filesystem
 * is ephemeral — every cold start wipes it. So memories don't survive.
 *
 * SOLUTION: Write-through cache pattern.
 * 1. On init, create an in-memory SQLite database (`:memory:`)
 * 2. Load all data from Upstash Redis (HTTP-based, works on serverless)
 * 3. All reads/writes hit the in-memory DB (fast, synchronous)
 * 4. After each write, async flush to Redis (persistent, survives cold starts)
 *
 * This means:
 * - Zero changes to existing memory classes (still use synchronous SQLite)
 * - Memories survive Vercel cold starts (persisted in Redis)
 * - No performance hit (reads are in-memory)
 *
 * ENV VARS:
 *   UPSTASH_REDIS_URL    — Your Upstash Redis REST URL
 *   UPSTASH_REDIS_TOKEN   — Your Upstash Redis REST token
 *
 * If UPSTASH_REDIS_URL is not set, falls back to file-based SQLite (local dev).
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

let db: Database.Database | null = null;
let useRedis = false;
let flushQueue: Promise<void> = Promise.resolve();
const REDIS_KEY_PREFIX = 'cozanet:memory';
const FLUSH_DEBOUNCE_MS = 100;
let flushTimer: NodeJS.Timeout | null = null;

// ── Redis HTTP helpers (Upstash REST API) ──────────────────────────────
async function redisGet(key: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data.result ?? null;
  } catch {
    return null;
  }
}

async function redisSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  const url = process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_TOKEN;
  if (!url || !token) return;

  try {
    const pipeline: any[] = [['SET', key, value]];
    if (ttlSeconds) pipeline.push(['EXPIRE', key, ttlSeconds]);
    await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pipeline),
    });
  } catch {}
}

async function redisDel(key: string): Promise<void> {
  const url = process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(`${url}/del/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {}
}

async function redisScan(pattern: string): Promise<string[]> {
  const url = process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_TOKEN;
  if (!url || !token) return [];

  try {
    const res = await fetch(`${url}/scan/0?match=${encodeURIComponent(pattern)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data.result?.[1] ?? [];
  } catch {
    return [];
  }
}

// ── Table definitions for sync ─────────────────────────────────────────
const TABLES = [
  'memory_records',
  'conversations',
  'episodes',
  'semantic_entries',
  'user_profile',
  'consolidation_log',
];

const FTS_TABLES = ['memory_fts', 'conversations_fts'];

// ── Export ─────────────────────────────────────────────────────────────

export function getDB(): Database.Database {
  if (db) return db;

  useRedis = !!process.env.UPSTASH_REDIS_URL;

  if (useRedis) {
    // Use in-memory SQLite — data will be loaded from Redis
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);

    // Load existing data from Redis (async, non-blocking on first call)
    // The DB starts empty and gets populated as Redis data arrives.
    // For critical paths, the caller should await ensureLoaded().
    loadFromRedis().catch(err => {
      console.error('[RedisDB] Failed to load from Redis:', err);
    });

    console.log('[RedisDB] Using Redis-backed in-memory SQLite (serverless mode)');
  } else {
    // Local dev: file-based SQLite (original behavior)
    const dbPath = process.env.MEMORY_DB_PATH || './data/cozanet-memory.db';
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    console.log('[SQLiteDB] Using file-based SQLite (local dev mode):', dbPath);
  }

  return db;
}

// ── Track if Redis data has been loaded ────────────────────────────────
let redisLoaded = false;
let loadPromise: Promise<void> | null = null;

export async function ensureLoaded(): Promise<void> {
  if (!useRedis) return;
  if (redisLoaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = loadFromRedis();
  return loadPromise;
}

async function loadFromRedis(): Promise<void> {
  if (!db || !useRedis) return;

  for (const table of TABLES) {
    try {
      const keys = await redisScan(`${REDIS_KEY_PREFIX}:${table}:*`);
      for (const key of keys) {
        const raw = await redisGet(key);
        if (!raw) continue;
        const record = JSON.parse(raw);
        const id = key.split(':').pop();

        // Insert into in-memory SQLite
        if (table === 'memory_records') {
          insertMemoryRecord(record);
        } else if (table === 'conversations') {
          insertConversation(record);
        } else if (table === 'episodes') {
          insertEpisode(record);
        } else if (table === 'semantic_entries') {
          insertSemanticEntry(record);
        } else if (table === 'user_profile') {
          insertUserProfile(record);
        } else if (table === 'consolidation_log') {
          insertConsolidationLog(record);
        }
      }
    } catch (err) {
      console.error(`[RedisDB] Failed to load table ${table}:`, err);
    }
  }

  redisLoaded = true;
  console.log('[RedisDB] Loaded from Redis into in-memory SQLite');
}

// ── Insert helpers (for loading from Redis) ────────────────────────────
function insertMemoryRecord(r: any): void {
  if (!db) return;
  db.prepare(`
    INSERT OR REPLACE INTO memory_records
      (id, type, content, tags, timestamp, ttl, session_id,
       importance, access_count, last_accessed, decay_score, embedding, source, confidence)
    VALUES (@id, @type, @content, @tags, @timestamp, @ttl, @sessionId,
       @importance, @accessCount, @lastAccessed, @decayScore, @embedding, @source, @confidence)
  `).run({
    id: r.id, type: r.type, content: r.content, tags: r.tags,
    timestamp: r.timestamp, ttl: r.ttl ?? null, sessionId: r.session_id ?? null,
    importance: r.importance ?? 0, accessCount: r.access_count ?? 0,
    lastAccessed: r.last_accessed ?? null, decayScore: r.decay_score ?? 0,
    embedding: r.embedding ?? null, source: r.source ?? 'unknown',
    confidence: r.confidence ?? 0.5,
  });

  // FTS
  try {
    db.prepare('DELETE FROM memory_fts WHERE id = ?').run(r.id);
    const content = typeof r.content === 'string' ? r.content : JSON.stringify(r.content);
    db.prepare('INSERT INTO memory_fts (id, content, tags, type) VALUES (?, ?, ?, ?)').run(
      r.id, content, r.tags ?? '[]', r.type
    );
  } catch {}
}

function insertConversation(r: any): void {
  if (!db) return;
  db.prepare(`
    INSERT OR REPLACE INTO conversations
      (id, role, content, timestamp, session_id, importance, search_results, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(r.id, r.role, r.content, r.timestamp, r.session_id,
    r.importance ?? 0, r.search_results ?? null, r.metadata ?? null);
  try {
    db.prepare('DELETE FROM conversations_fts WHERE id = ?').run(r.id);
    db.prepare('INSERT INTO conversations_fts (id, content, session_id) VALUES (?, ?, ?)').run(
      r.id, r.content, r.session_id
    );
  } catch {}
}

function insertEpisode(r: any): void {
  if (!db) return;
  db.prepare(`
    INSERT OR REPLACE INTO episodes
      (id, label, events, start_time, end_time, session_id, importance, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(r.id, r.label, r.events ?? '[]', r.start_time, r.end_time ?? null,
    r.session_id ?? null, r.importance ?? 0, r.tags ?? '[]');
}

function insertSemanticEntry(r: any): void {
  if (!db) return;
  db.prepare(`
    INSERT OR REPLACE INTO semantic_entries
      (concept, definition, relations, updated_at, confidence, embedding, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(r.concept, r.definition, r.relations ?? '[]', r.updated_at,
    r.confidence ?? 0.5, r.embedding ?? null, r.source ?? 'unknown');
}

function insertUserProfile(r: any): void {
  if (!db) return;
  db.prepare(`
    INSERT OR REPLACE INTO user_profile
      (id, key, value, category, confidence, updated_at, source, verified)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(r.id, r.key, r.value, r.category, r.confidence ?? 0.5,
    r.updated_at, r.source ?? 'conversation', r.verified ?? 0);
}

function insertConsolidationLog(r: any): void {
  if (!db) return;
  db.prepare(`
    INSERT OR REPLACE INTO consolidation_log
      (id, source_id, target_id, source_type, target_type, consolidated_at, rule_applied)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(r.id, r.source_id, r.target_id, r.source_type, r.target_type,
    r.consolidated_at, r.rule_applied ?? null);
}

// ── Write-through to Redis ─────────────────────────────────────────────
// Called after any write to the SQLite database.
// Debounced — batches multiple writes into one flush.

export function scheduleRedisFlush(): void {
  if (!useRedis) return;

  // Debounce: wait FLUSH_DEBOUNCE_MS, then flush all dirty tables
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushToRedis().catch(err => {
      console.error('[RedisDB] Flush failed:', err);
    });
  }, FLUSH_DEBOUNCE_MS);
}

async function flushToRedis(): Promise<void> {
  if (!db || !useRedis) return;

  for (const table of TABLES) {
    try {
      const rows = db.prepare(`SELECT * FROM ${table}`).all() as any[];
      for (const row of rows) {
        const key = `${REDIS_KEY_PREFIX}:${table}:${row.id || row.key || row.concept}`;
        await redisSet(key, JSON.stringify(row), 86400); // 24h TTL
      }
    } catch (err) {
      console.error(`[RedisDB] Failed to flush table ${table}:`, err);
    }
  }
}

// ── Schema (same as original) ─────────────────────────────────────────
function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_records (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      timestamp INTEGER NOT NULL,
      ttl INTEGER,
      session_id TEXT,
      importance REAL DEFAULT 0,
      access_count INTEGER DEFAULT 0,
      last_accessed INTEGER,
      decay_score REAL DEFAULT 0,
      embedding TEXT,
      source TEXT,
      confidence REAL DEFAULT 0.5
    );

    CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_records(type);
    CREATE INDEX IF NOT EXISTS idx_memory_session ON memory_records(session_id);
    CREATE INDEX IF NOT EXISTS idx_memory_timestamp ON memory_records(timestamp);
    CREATE INDEX IF NOT EXISTS idx_memory_importance ON memory_records(importance);
    CREATE INDEX IF NOT EXISTS idx_memory_decay ON memory_records(decay_score);

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      importance REAL DEFAULT 0,
      search_results TEXT,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_conv_session ON conversations(session_id);
    CREATE INDEX IF NOT EXISTS idx_conv_timestamp ON conversations(timestamp);
    CREATE INDEX IF NOT EXISTS idx_conv_importance ON conversations(importance);

    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '[]',
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      session_id TEXT,
      importance REAL DEFAULT 0,
      tags TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS semantic_entries (
      concept TEXT PRIMARY KEY,
      definition TEXT NOT NULL,
      relations TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL,
      confidence REAL DEFAULT 0.5,
      embedding TEXT,
      source TEXT
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'fact',
      confidence REAL DEFAULT 0.5,
      updated_at INTEGER NOT NULL,
      source TEXT,
      verified INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_profile_category ON user_profile(category);
    CREATE INDEX IF NOT EXISTS idx_profile_key ON user_profile(key);

    CREATE TABLE IF NOT EXISTS consolidation_log (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      consolidated_at INTEGER NOT NULL,
      rule_applied TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      id UNINDEXED,
      content,
      tags,
      type UNINDEXED
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(
      id UNINDEXED,
      content,
      session_id UNINDEXED
    );
  `);
}

export function closeDB(): void {
  // Flush before closing
  if (useRedis && db) {
    flushToRedis().catch(() => {});
  }
  if (db) {
    db.close();
    db = null;
  }
}

export { useRedis as isRedisMode };
