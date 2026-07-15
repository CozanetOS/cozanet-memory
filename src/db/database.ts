/**
 * CozanetOS Memory Database
 * Uses SQLite via better-sqlite3.
 * - Survives server restarts, redeployments, refreshes
 * - Zero-config embedded database
 * - File stored at MEMORY_DB_PATH env var or ./data/cozanet-memory.db
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
    CREATE TABLE IF NOT EXISTS memory_records (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      timestamp INTEGER NOT NULL,
      ttl INTEGER,
      session_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_records(type);
    CREATE INDEX IF NOT EXISTS idx_memory_session ON memory_records(session_id);
    CREATE INDEX IF NOT EXISTS idx_memory_timestamp ON memory_records(timestamp);

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      session_id TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_conv_session ON conversations(session_id);
    CREATE INDEX IF NOT EXISTS idx_conv_timestamp ON conversations(timestamp);

    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '[]',
      start_time INTEGER NOT NULL,
      end_time INTEGER,
      session_id TEXT
    );

    CREATE TABLE IF NOT EXISTS semantic_entries (
      concept TEXT PRIMARY KEY,
      definition TEXT NOT NULL,
      relations TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      id UNINDEXED,
      content,
      tags,
      type UNINDEXED
    );
  `);
}

export function closeDB(): void {
  if (db) {
    db.close();
    db = null;
  }
}
