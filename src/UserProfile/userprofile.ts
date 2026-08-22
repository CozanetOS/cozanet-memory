/**
 * PATCH: UserProfileMemory — adds Redis flush after writes.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDB, scheduleRedisFlush } from '../db/redis-database.js';
import { UserProfile } from '../types.js';

export class UserProfileMemoryPatched {
  static readonly id = 'memory:userprofile';

  set(key: string, value: any, category: UserProfile['category'], source: string, confidence = 0.5, verified = false): UserProfile {
    const db = getDB();
    const existing = db.prepare('SELECT id FROM user_profile WHERE key = ?').get(key) as any;

    const id = existing?.id ?? uuidv4();
    const now = Date.now();

    db.prepare(`
      INSERT INTO user_profile (id, key, value, category, confidence, updated_at, source, verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        category = excluded.category,
        confidence = MAX(excluded.confidence, user_profile.confidence),
        updated_at = excluded.updated_at,
        source = excluded.source,
        verified = CASE WHEN excluded.verified = 1 THEN 1 ELSE user_profile.verified END
    `).run(id, key, JSON.stringify(value), category, confidence, now, source, verified ? 1 : 0);

    scheduleRedisFlush(); // ← FIX: persist to Redis for serverless survival
    return this.get(key)!;
  }

  verify(key: string): void {
    const db = getDB();
    db.prepare('UPDATE user_profile SET verified = 1, confidence = 1.0 WHERE key = ?').run(key);
    scheduleRedisFlush(); // ← FIX
  }

  forget(key: string): void {
    const db = getDB();
    db.prepare('DELETE FROM user_profile WHERE key = ?').run(key);
    scheduleRedisFlush(); // ← FIX
  }

  applyExtractions(content: string, source = 'conversation'): number {
    // Use enhanced extraction (from extraction-fix.ts)
    const extractions = extractFromMessageEnhanced(content);
    let count = 0;
    for (const ext of extractions) {
      this.set(ext.key, ext.value, ext.category as UserProfile['category'], source, ext.confidence);
      count++;
    }
    return count;
  }

  // ... rest of methods unchanged (get, getByCategory, all, getIdentity, etc.) ...
  get(key: string): UserProfile | undefined {
    const db = getDB();
    const row = db.prepare('SELECT * FROM user_profile WHERE key = ?').get(key) as any;
    if (!row) return undefined;
    return this.rowToProfile(row);
  }

  getByCategory(category: UserProfile['category']): UserProfile[] {
    const db = getDB();
    const rows = db.prepare('SELECT * FROM user_profile WHERE category = ? ORDER BY updated_at DESC').all(category) as any[];
    return rows.map(row => this.rowToProfile(row));
  }

  all(): UserProfile[] {
    const db = getDB();
    const rows = db.prepare('SELECT * FROM user_profile ORDER BY category ASC, updated_at DESC').all() as any[];
    return rows.map(row => this.rowToProfile(row));
  }

  getIdentity(): Record<string, any> {
    const entries = this.getByCategory('identity');
    const identity: Record<string, any> = {};
    for (const e of entries) identity[e.key] = e.value;
    return identity;
  }

  getPreferences(): Record<string, any> {
    const entries = this.getByCategory('preference');
    const prefs: Record<string, any> = {};
    for (const e of entries) prefs[e.key] = e.value;
    return prefs;
  }

  getFacts(): UserProfile[] { return this.getByCategory('fact'); }
  getGoals(): UserProfile[] { return this.getByCategory('goal'); }

  getContextString(): string {
    const all = this.all();
    if (all.length === 0) return '';
    const lines: string[] = ['\n\n=== USER PROFILE ==='];
    const categories: Record<string, string> = {};
    for (const entry of all) {
      if (!categories[entry.category]) categories[entry.category] = '';
      categories[entry.category] += `- ${entry.key}: ${JSON.stringify(entry.value)}${entry.verified ? ' (verified)' : ''}\n`;
    }
    for (const [cat, items] of Object.entries(categories)) {
      lines.push(`\n${cat.toUpperCase()}:`);
      lines.push(items.trimEnd());
    }
    return lines.join('\n');
  }

  count(): number {
    const db = getDB();
    return (db.prepare('SELECT COUNT(*) as c FROM user_profile').get() as any).c;
  }

  private rowToProfile(row: any): UserProfile {
    return {
      id: row.id, key: row.key, value: JSON.parse(row.value),
      category: row.category as UserProfile['category'],
      confidence: row.confidence, updatedAt: row.updated_at,
      source: row.source, verified: row.verified === 1,
    };
  }
}

// Import enhanced extraction
import { extractFromMessageEnhanced } from './extraction-enhanced.js';
