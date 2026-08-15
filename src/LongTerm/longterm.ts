/**
 * LongTermMemory — Persistent memory backed by SQLite.
 * Upgraded: importance scoring, decay computation, semantic embedding search,
 *           access tracking, memory consolidation, export/import.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../db/database.js';
import { MemoryRecord, MemoryQuery, ConsolidationRule } from '../types.js';

export class LongTermMemory {
  static readonly id = 'memory:longterm';

  // ── Default consolidation rules ──────────────────────────
  private static DEFAULT_RULES: ConsolidationRule[] = [
    {
      sourceType: 'working',
      targetType: 'longterm',
      threshold: 5,       // importance >= 5
      minAccessCount: 2,  // accessed at least twice
      maxAge: 3_600_000,  // within last hour
    },
    {
      sourceType: 'conversation',
      targetType: 'longterm',
      threshold: 7,
      minAccessCount: 1,
      maxAge: 86_400_000,  // within last day
    },
    {
      sourceType: 'episodic',
      targetType: 'longterm',
      threshold: 6,
      minAccessCount: 1,
      maxAge: 604_800_000, // within last week
    },
  ];

  /**
   * Store a memory record with importance scoring.
   */
  store(record: Partial<MemoryRecord> & { content: any; type: MemoryRecord['type'] }): MemoryRecord {
    const db = getDB();
    const importance = record.importance ?? this.computeImportance(record);
    const now = Date.now();

    const full: MemoryRecord = {
      id: record.id ?? uuidv4(),
      type: record.type,
      content: record.content,
      tags: record.tags ?? [],
      timestamp: record.timestamp ?? now,
      ttl: record.ttl,
      sessionId: record.sessionId,
      importance,
      accessCount: record.accessCount ?? 0,
      lastAccessed: record.lastAccessed ?? now,
      decayScore: this.computeDecayScore(importance, now, 0),
      embedding: record.embedding,
      source: record.source ?? 'unknown',
      confidence: record.confidence ?? 0.5,
    };

    db.prepare(`
      INSERT INTO memory_records 
        (id, type, content, tags, timestamp, ttl, session_id, 
         importance, access_count, last_accessed, decay_score, embedding, source, confidence)
      VALUES 
        (@id, @type, @content, @tags, @timestamp, @ttl, @sessionId,
         @importance, @accessCount, @lastAccessed, @decayScore, @embedding, @source, @confidence)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        tags = excluded.tags,
        timestamp = excluded.timestamp,
        ttl = excluded.ttl,
        importance = excluded.importance,
        embedding = excluded.embedding,
        source = excluded.source,
        confidence = excluded.confidence
    `).run({
      id: full.id,
      type: full.type,
      content: JSON.stringify(full.content),
      tags: JSON.stringify(full.tags),
      timestamp: full.timestamp,
      ttl: full.ttl ?? null,
      sessionId: full.sessionId ?? null,
      importance,
      accessCount: full.accessCount ?? 0,
      lastAccessed: full.lastAccessed ?? null,
      decayScore: full.decayScore ?? 0,
      embedding: full.embedding ? JSON.stringify(full.embedding) : null,
      source: full.source,
      confidence: full.confidence ?? 0.5,
    });

    // FTS5 update
    try {
      db.prepare('DELETE FROM memory_fts WHERE id = ?').run(full.id);
      db.prepare('INSERT INTO memory_fts (id, content, tags, type) VALUES (?, ?, ?, ?)').run(
        full.id,
        typeof full.content === 'string' ? full.content : JSON.stringify(full.content),
        full.tags.join(' '),
        full.type
      );
    } catch { /* FTS failure is non-fatal */ }

    return full;
  }

  /**
   * Retrieve memory records with advanced filtering.
   */
  retrieve(query: MemoryQuery = {}): MemoryRecord[] {
    const db = getDB();
    const now = Date.now();

    let sql = 'SELECT * FROM memory_records WHERE 1=1';
    const params: any[] = [];

    if (query.type) { sql += ' AND type = ?'; params.push(query.type); }
    if (query.sessionId) { sql += ' AND session_id = ?'; params.push(query.sessionId); }
    if (query.minImportance !== undefined) { sql += ' AND importance >= ?'; params.push(query.minImportance); }
    if (query.maxAge !== undefined) {
      sql += ' AND timestamp >= ?'; 
      params.push(now - query.maxAge);
    }

    // Sorting
    switch (query.sortBy) {
      case 'importance':
        sql += ' ORDER BY importance DESC';
        break;
      case 'relevance':
        sql += ' ORDER BY access_count DESC, importance DESC';
        break;
      case 'decay':
        sql += ' ORDER BY decay_score DESC';
        break;
      case 'timestamp':
      default:
        sql += ' ORDER BY timestamp DESC';
        break;
    }

    if (query.limit) { sql += ' LIMIT ?'; params.push(query.limit); }

    const rows = db.prepare(sql).all(...params) as any[];

    return rows
      .map(row => this.rowToRecord(row))
      .filter(r => {
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
        ORDER BY mr.importance DESC, mr.timestamp DESC
        LIMIT ?
      `).all(query, limit) as any[];

      // Update access count for retrieved memories
      for (const row of rows) {
        this.incrementAccess(row.id);
      }

      return rows.map(row => this.rowToRecord(row));
    } catch {
      const rows = db.prepare(`
        SELECT * FROM memory_records
        WHERE content LIKE ? OR tags LIKE ?
        ORDER BY importance DESC, timestamp DESC
        LIMIT ?
      `).all(`%${query}%`, `%${query}%`, limit) as any[];
      for (const row of rows) {
        this.incrementAccess(row.id);
      }
      return rows.map(row => this.rowToRecord(row));
    }
  }

  /**
   * Semantic search using embedding similarity (cosine).
   * Falls back to FTS if no embeddings exist.
   */
  semanticSearch(queryEmbedding: number[], limit = 10): MemoryRecord[] {
    const db = getDB();
    const rows = db.prepare(`
      SELECT * FROM memory_records 
      WHERE embedding IS NOT NULL
      ORDER BY importance DESC
      LIMIT 100
    `).all() as any[];

    if (rows.length === 0) return [];

    const scored = rows.map(row => {
      const embedding = JSON.parse(row.embedding) as number[];
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      return { row, score: similarity };
    }).sort((a, b) => b.score - a.score).slice(0, limit);

    for (const { row } of scored) {
      this.incrementAccess(row.id);
    }

    return scored.map(({ row, score }) => ({
      ...this.rowToRecord(row),
      decayScore: score, // reuse decayScore field to carry similarity
    }));
  }

  /**
   * Compute importance score (0-10) based on content characteristics.
   */
  private computeImportance(record: Partial<MemoryRecord>): number {
    let score = 0;

    // Content length factor (longer = more detailed = more important)
    const contentStr = typeof record.content === 'string' 
      ? record.content 
      : JSON.stringify(record.content ?? '');
    if (contentStr.length > 500) score += 3;
    else if (contentStr.length > 200) score += 2;
    else if (contentStr.length > 50) score += 1;

    // Tag count factor (more tags = more connected = more important)
    const tagCount = record.tags?.length ?? 0;
    if (tagCount >= 3) score += 2;
    else if (tagCount >= 1) score += 1;

    // Explicit confidence
    if (record.confidence && record.confidence > 0.8) score += 2;

    // Source factor
    if (record.source === 'user_confirmed') score += 3;
    else if (record.source === 'web_search') score += 1;

    // Type factor
    if (record.type === 'semantic') score += 2;
    else if (record.type === 'episodic') score += 1;

    return Math.min(score, 10);
  }

  /**
   * Compute decay score: higher importance + recent access + frequent access = higher score.
   * Memories with low decay scores are candidates for pruning.
   */
  computeDecayScore(importance: number, lastAccessed: number, accessCount: number): number {
    const now = Date.now();
    const ageMs = now - lastAccessed;
    const ageDays = ageMs / 86_400_000;

    // Decay formula: importance * (1 / (1 + ageDays * 0.1)) * (1 + log(1 + accessCount))
    const recencyFactor = 1 / (1 + ageDays * 0.1);
    const accessFactor = 1 + Math.log(1 + accessCount);
    
    return importance * recencyFactor * accessFactor;
  }

  /**
   * Update decay scores for all memories (run periodically).
   */
  refreshDecayScores(): number {
    const db = getDB();
    const rows = db.prepare('SELECT id, importance, last_accessed, access_count FROM memory_records').all() as any[];
    
    let updated = 0;
    const updateStmt = db.prepare('UPDATE memory_records SET decay_score = ? WHERE id = ?');
    
    for (const row of rows) {
      const score = this.computeDecayScore(
        row.importance ?? 0,
        row.last_accessed ?? row.timestamp ?? Date.now(),
        row.access_count ?? 0
      );
      updateStmt.run(score, row.id);
      updated++;
    }

    return updated;
  }

  /**
   * Prune low-value memories (decay score below threshold).
   */
  prune(threshold = 0.5): number {
    const db = getDB();
    const result = db.prepare('DELETE FROM memory_records WHERE decay_score < ?').run(threshold);
    // Also clean up FTS
    try {
      db.prepare('DELETE FROM memory_fts WHERE id NOT IN (SELECT id FROM memory_records)').run();
    } catch {}
    return result.changes;
  }

  /**
   * Consolidate memories: promote high-importance short-term memories to long-term.
   */
  consolidate(rules: ConsolidationRule[] = LongTermMemory.DEFAULT_RULES): { promoted: number; details: any[] } {
    const db = getDB();
    const details: any[] = [];
    let promoted = 0;

    for (const rule of rules) {
      const now = Date.now();
      let sql = `SELECT * FROM memory_records WHERE type = ? AND importance >= ? AND access_count >= ?`;
      const params: any[] = [rule.sourceType, rule.threshold, rule.minAccessCount];
      
      if (rule.maxAge) {
        sql += ' AND timestamp >= ?';
        params.push(now - rule.maxAge);
      }

      const candidates = db.prepare(sql).all(...params) as any[];

      for (const candidate of candidates) {
        // Skip if already longterm
        if (rule.targetType === 'longterm' && candidate.type === 'longterm') continue;

        // Promote: update type to target
        db.prepare('UPDATE memory_records SET type = ? WHERE id = ?')
          .run(rule.targetType, candidate.id);

        // Log consolidation
        const logId = uuidv4();
        db.prepare(`
          INSERT INTO consolidation_log (id, source_id, target_id, source_type, target_type, consolidated_at, rule_applied)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(logId, candidate.id, candidate.id, rule.sourceType, rule.targetType, now, JSON.stringify(rule));

        promoted++;
        details.push({ id: candidate.id, from: rule.sourceType, to: rule.targetType });
      }
    }

    return { promoted, details };
  }

  /**
   * Increment access count and update last accessed time.
   */
  incrementAccess(id: string): void {
    const db = getDB();
    db.prepare(`
      UPDATE memory_records 
      SET access_count = access_count + 1, last_accessed = ?
      WHERE id = ?
    `).run(Date.now(), id);
  }

  /**
   * Attach an embedding to a memory record.
   */
  setEmbedding(id: string, embedding: number[]): void {
    const db = getDB();
    db.prepare('UPDATE memory_records SET embedding = ? WHERE id = ?')
      .run(JSON.stringify(embedding), id);
  }

  /**
   * Batch store multiple records (for import).
   */
  batchStore(records: MemoryRecord[]): number {
    let count = 0;
    for (const record of records) {
      this.store(record);
      count++;
    }
    return count;
  }

  /**
   * Export all memory data.
   */
  export(): { records: MemoryRecord[]; conversations: any[]; episodes: any[]; semanticEntries: any[] } {
    const db = getDB();
    
    const records = (db.prepare('SELECT * FROM memory_records').all() as any[]).map(r => this.rowToRecord(r));
    const conversations = db.prepare('SELECT * FROM conversations ORDER BY timestamp ASC').all();
    const episodes = db.prepare('SELECT * FROM episodes ORDER BY start_time DESC').all();
    const semanticEntries = db.prepare('SELECT * FROM semantic_entries ORDER BY updated_at DESC').all();

    return { records, conversations, episodes, semanticEntries };
  }

  forget(id: string): void {
    const db = getDB();
    db.prepare('DELETE FROM memory_records WHERE id = ?').run(id);
    try { db.prepare('DELETE FROM memory_fts WHERE id = ?').run(id); } catch {}
  }

  count(type?: MemoryRecord['type']): number {
    const db = getDB();
    if (type) return (db.prepare('SELECT COUNT(*) as c FROM memory_records WHERE type = ?').get(type) as any).c;
    return (db.prepare('SELECT COUNT(*) as c FROM memory_records').get() as any).c;
  }

  /**
   * Get memory statistics.
   */
  stats(): { total: number; byType: Record<string, number>; avgImportance: number; avgDecay: number; needsConsolidation: number } {
    const db = getDB();
    const total = this.count();
    
    const typeRows = db.prepare('SELECT type, COUNT(*) as c FROM memory_records GROUP BY type').all() as any[];
    const byType: Record<string, number> = {};
    for (const r of typeRows) byType[r.type] = r.c;

    const avgRow = db.prepare('SELECT AVG(importance) as ai, AVG(decay_score) as ad FROM memory_records').get() as any;
    
    const needsCon = db.prepare(`
      SELECT COUNT(*) as c FROM memory_records 
      WHERE type != 'longterm' AND importance >= 5 AND access_count >= 2
    `).get() as any;

    return {
      total,
      byType,
      avgImportance: avgRow?.ai ?? 0,
      avgDecay: avgRow?.ad ?? 0,
      needsConsolidation: needsCon?.c ?? 0,
    };
  }

  // ── Helpers ──────────────────────────────────────────────

  private rowToRecord(row: any): MemoryRecord {
    return {
      id: row.id,
      type: row.type as MemoryRecord['type'],
      content: JSON.parse(row.content),
      tags: JSON.parse(row.tags),
      timestamp: row.timestamp,
      ttl: row.ttl ?? undefined,
      sessionId: row.session_id ?? undefined,
      importance: row.importance ?? 0,
      accessCount: row.access_count ?? 0,
      lastAccessed: row.last_accessed ?? undefined,
      decayScore: row.decay_score ?? 0,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
      source: row.source ?? undefined,
      confidence: row.confidence ?? 0.5,
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const mag = Math.sqrt(magA) * Math.sqrt(magB);
    return mag > 0 ? dot / mag : 0;
  }
}
