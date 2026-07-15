/**
 * LongTermMemory — Persistent memory backed by SQLite.
 * Survives: server restarts, redeployments, page refreshes, browser close.
 * Data is stored in a SQLite file at MEMORY_DB_PATH.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../db/database.js';
import { MemoryRecord, MemoryQuery } from '../types.js';

export class LongTermMemory {
  static readonly id = 'memory:longterm';

  /**
   * Store a memory record. Upserts if ID already exists.
   */
  store(record: Partial<MemoryRecord> & { content: any; type: MemoryRecord['type'] }): MemoryRecord {
    const db = getDB();
    const full: MemoryRecord = {
      id: record.id ?? uuidv4(),
      type: record.type,
      content: record.content,
      tags: record.tags ?? [],
      timestamp: record.timestamp ?? Date.now(),
      ttl: record.ttl,
      sessionId: record.sessionId,
    };

    const stmt = db.prepare(`
      INSERT INTO memory_records (id, type, content, tags, timestamp, ttl, session_id)
      VALUES (@id, @type, @content, @tags, @timestamp, @ttl, @sessionId)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        tags = excluded.tags,
        timestamp = excluded.timestamp,
        ttl = excluded.ttl
    `);

    stmt.run({
      id: full.id,
      type: full.type,
      content: JSON.stringify(full.content),
      tags: JSON.stringify(full.tags),
      timestamp: full.timestamp,
      ttl: full.ttl ?? null,
      sessionId: full.sessionId ?? null,
    });

    // Also update FTS index
    const ftsStmt = db.prepare(`
      INSERT INTO memory_fts (id, content, tags, type)
      VALUES (?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `);
    try {
      ftsStmt.run(
        full.id,
        typeof full.content === 'string' ? full.content : JSON.stringify(full.content),
        full.tags.join(' '),
        full.type
      );
    } catch { /* FTS insert failure is non-fatal */ }

    return full;
  }

  /**
   * Retrieve memory records with optional filtering.
   */
  retrieve(query: MemoryQuery = {}): MemoryRecord[] {
    const db = getDB();
    const now = Date.now();

    let sql = 'SELECT * FROM memory_records WHERE 1=1';
    const params: any[] = [];

    if (query.type) {
      sql += ' AND type = ?';
      params.push(query.type);
    }
    if (query.sessionId) {
      sql += ' AND session_id = ?';
      params.push(query.sessionId);
    }

    sql += ' ORDER BY timestamp DESC';

    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    const rows = db.prepare(sql).all(...params) as any[];

    return rows
      .map(row => ({
        id: row.id,
        type: row.type as MemoryRecord['type'],
        content: JSON.parse(row.content),
        tags: JSON.parse(row.tags),
        timestamp: row.timestamp,
        ttl: row.ttl ?? undefined,
        sessionId: row.session_id ?? undefined,
      }))
      .filter(r => {
        // Expire records with TTL
        if (r.ttl && r.timestamp + r.ttl < now) {
          this.forget(r.id);
          return false;
        }
        return true;
      });
  }

  /**
   * Full-text search across stored memories.
   */
  search(query: string, limit = 10): MemoryRecord[] {
    const db = getDB();
    try {
      const rows = db.prepare(`
        SELECT mr.* FROM memory_fts
        JOIN memory_records mr ON memory_fts.id = mr.id
        WHERE memory_fts MATCH ?
        LIMIT ?
      `).all(query, limit) as any[];

      return rows.map(row => ({
        id: row.id,
        type: row.type as MemoryRecord['type'],
        content: JSON.parse(row.content),
        tags: JSON.parse(row.tags),
        timestamp: row.timestamp,
      }));
    } catch {
      // FTS fallback: simple LIKE search
      const rows = db.prepare(`
        SELECT * FROM memory_records
        WHERE content LIKE ? OR tags LIKE ?
        LIMIT ?
      `).all(`%${query}%`, `%${query}%`, limit) as any[];

      return rows.map(row => ({
        id: row.id,
        type: row.type as MemoryRecord['type'],
        content: JSON.parse(row.content),
        tags: JSON.parse(row.tags),
        timestamp: row.timestamp,
      }));
    }
  }

  /**
   * Delete a specific memory record.
   */
  forget(id: string): void {
    const db = getDB();
    db.prepare('DELETE FROM memory_records WHERE id = ?').run(id);
  }

  /**
   * Get total count of records.
   */
  count(type?: MemoryRecord['type']): number {
    const db = getDB();
    if (type) {
      return (db.prepare('SELECT COUNT(*) as c FROM memory_records WHERE type = ?').get(type) as any).c;
    }
    return (db.prepare('SELECT COUNT(*) as c FROM memory_records').get() as any).c;
  }
}
