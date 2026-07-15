/**
 * SemanticMemory — Stores facts, concepts, and their relationships.
 * Persisted to SQLite.
 */

import { getDB } from '../db/database.js';
import { SemanticEntry } from '../types.js';

export class SemanticMemory {
  static readonly id = 'memory:semantic';

  set(concept: string, definition: string, relations: string[] = []): void {
    const db = getDB();
    db.prepare(`
      INSERT INTO semantic_entries (concept, definition, relations, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(concept) DO UPDATE SET
        definition = excluded.definition,
        relations = excluded.relations,
        updated_at = excluded.updated_at
    `).run(concept, definition, JSON.stringify(relations), Date.now());
  }

  get(concept: string): SemanticEntry | undefined {
    const db = getDB();
    const row = db.prepare('SELECT * FROM semantic_entries WHERE concept = ?').get(concept) as any;
    if (!row) return undefined;
    return {
      concept: row.concept,
      definition: row.definition,
      relations: JSON.parse(row.relations),
      updatedAt: row.updated_at,
    };
  }

  search(query: string, limit = 10): SemanticEntry[] {
    const db = getDB();
    const rows = db.prepare(`
      SELECT * FROM semantic_entries
      WHERE concept LIKE ? OR definition LIKE ?
      LIMIT ?
    `).all(`%${query}%`, `%${query}%`, limit) as any[];
    return rows.map(row => ({
      concept: row.concept,
      definition: row.definition,
      relations: JSON.parse(row.relations),
      updatedAt: row.updated_at,
    }));
  }

  forget(concept: string): void {
    const db = getDB();
    db.prepare('DELETE FROM semantic_entries WHERE concept = ?').run(concept);
  }

  all(): SemanticEntry[] {
    const db = getDB();
    const rows = db.prepare('SELECT * FROM semantic_entries ORDER BY updated_at DESC').all() as any[];
    return rows.map(row => ({
      concept: row.concept,
      definition: row.definition,
      relations: JSON.parse(row.relations),
      updatedAt: row.updated_at,
    }));
  }
}
