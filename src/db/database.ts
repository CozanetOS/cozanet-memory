/**
 * CozanetOS Memory Database
 * Uses SQLite via better-sqlite3.
 * Upgraded: importance scoring, decay, embeddings, user profiles, consolidation
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

let db: Database.Database | null = null;

export function getDB(): Database.Database {
  if (db) return db;

  const dbPath = process.env.MEMORY_DB_PATH || './data/cozanet-memory.db';
  const dir = path.dirname(dbPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    -- ── Memory Records ────────────────────────────────────
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

    -- ── Conversations ──────────────────────────────────────
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

    -- ── Episodes ───────────────────────────────────────────
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

    -- ── Semantic Entries ──────────────────────────────────
    CREATE TABLE IF NOT EXISTS semantic_entries (
      concept TEXT PRIMARY KEY,
      definition TEXT NOT NULL,
      relations TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL,
      confidence REAL DEFAULT 0.5,
      embedding TEXT,
      source TEXT
    );

    -- ── NEW: User Profile ──────────────────────────────────
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

    -- ── NEW: Consolidation Log ─────────────────────────────
    CREATE TABLE IF NOT EXISTS consolidation_log (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      target_type TEXT NOT NULL,
      consolidated_at INTEGER NOT NULL,
      rule_applied TEXT
    );

    -- ── FTS5 for full-text search ──────────────────────────
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
  if (db) {
    db.close();
    db = null;
  }
}
