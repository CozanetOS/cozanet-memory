/**
 * UserProfile — Persistent user profile memory.
 * Stores facts, preferences, skills, goals about the user.
 * Extracted from conversations and confirmed by the user.
 * Used to personalize AI responses.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../db/database.js';
import { UserProfile } from '../types.js';

export class UserProfileMemory {
  static readonly id = 'memory:userprofile';

  /**
   * Set or update a profile entry.
   */
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

    return this.get(key)!;
  }

  /**
   * Get a profile entry by key.
   */
  get(key: string): UserProfile | undefined {
    const db = getDB();
    const row = db.prepare('SELECT * FROM user_profile WHERE key = ?').get(key) as any;
    if (!row) return undefined;
    return this.rowToProfile(row);
  }

  /**
   * Get all profile entries in a category.
   */
  getByCategory(category: UserProfile['category']): UserProfile[] {
    const db = getDB();
    const rows = db.prepare('SELECT * FROM user_profile WHERE category = ? ORDER BY updated_at DESC').all(category) as any[];
    return rows.map(row => this.rowToProfile(row));
  }

  /**
   * Get all profile entries.
   */
  all(): UserProfile[] {
    const db = getDB();
    const rows = db.prepare('SELECT * FROM user_profile ORDER BY category ASC, updated_at DESC').all() as any[];
    return rows.map(row => this.rowToProfile(row));
  }

  /**
   * Get the user's identity (name, timezone, etc).
   */
  getIdentity(): Record<string, any> {
    const entries = this.getByCategory('identity');
    const identity: Record<string, any> = {};
    for (const e of entries) identity[e.key] = e.value;
    return identity;
  }

  /**
   * Get all preferences.
   */
  getPreferences(): Record<string, any> {
    const entries = this.getByCategory('preference');
    const prefs: Record<string, any> = {};
    for (const e of entries) prefs[e.key] = e.value;
    return prefs;
  }

  /**
   * Get all known facts.
   */
  getFacts(): UserProfile[] {
    return this.getByCategory('fact');
  }

  /**
   * Get all goals.
   */
  getGoals(): UserProfile[] {
    return this.getByCategory('goal');
  }

  /**
   * Mark a profile entry as verified (user confirmed).
   */
  verify(key: string): void {
    const db = getDB();
    db.prepare('UPDATE user_profile SET verified = 1, confidence = 1.0 WHERE key = ?').run(key);
  }

  /**
   * Delete a profile entry.
   */
  forget(key: string): void {
    const db = getDB();
    db.prepare('DELETE FROM user_profile WHERE key = ?').run(key);
  }

  /**
   * Extract potential profile updates from a conversation.
   * Looks for patterns like "my name is X", "I prefer X", "I work at X".
   */
  extractFromMessage(content: string): { key: string; value: string; category: UserProfile['category']; confidence: number }[] {
    const extractions: { key: string; value: string; category: UserProfile['category']; confidence: number }[] = [];
    const lower = content.toLowerCase();

    // Name: "my name is X", "I'm X", "call me X"
    const nameMatch = content.match(/my name is ([A-Za-z\s]+?)(?:[,.!?]|\s*$)/i);
    if (nameMatch) {
      extractions.push({ key: 'name', value: nameMatch[1].trim(), category: 'identity', confidence: 0.9 });
    }

    const callMatch = content.match(/call me ([A-Za-z\s]+?)(?:[,.!?]|\s*$)/i);
    if (callMatch) {
      extractions.push({ key: 'nickname', value: callMatch[1].trim(), category: 'identity', confidence: 0.9 });
    }

    // Timezone: "I'm in X timezone" or "my timezone is X"
    const tzMatch = content.match(/(?:I'?m in|my timezone is|I live in)\s+(.+?)(?:timezone|time zone)?(?:[,.!?]|\s*$)/i);
    if (tzMatch) {
      extractions.push({ key: 'timezone', value: tzMatch[1].trim(), category: 'identity', confidence: 0.7 });
    }

    // Preferences: "I prefer X", "I like X", "I love X"
    const prefMatch = content.match(/I (?:prefer|like|love|enjoy|hate|dislike)\s+(.+?)(?:[,.!?]|\s*$)/i);
    if (prefMatch) {
      const pref = prefMatch[1].trim();
      extractions.push({ key: `preference:${pref}`, value: true, category: 'preference', confidence: 0.6 });
    }

    // Work: "I work at X", "I work for X"
    const workMatch = content.match(/I work (?:at|for)\s+(.+?)(?:[,.!?]|\s*$)/i);
    if (workMatch) {
      extractions.push({ key: 'workplace', value: workMatch[1].trim(), category: 'identity', confidence: 0.8 });
    }

    // Goals: "I want to X", "I'm trying to X", "my goal is X"
    const goalMatch = content.match(/I(?:'?m)?\s+(?:want|trying|planning) to\s+(.+?)(?:[,.!?]|\s*$)/i);
    if (goalMatch) {
      extractions.push({ key: `goal:${goalMatch[1].trim().slice(0, 50)}`, value: goalMatch[1].trim(), category: 'goal', confidence: 0.7 });
    }

    return extractions;
  }

  /**
   * Apply extracted profile updates.
   */
  applyExtractions(content: string, source = 'conversation'): number {
    const extractions = this.extractFromMessage(content);
    let count = 0;
    for (const ext of extractions) {
      this.set(ext.key, ext.value, ext.category, source, ext.confidence);
      count++;
    }
    return count;
  }

  /**
   * Get profile as a context string for the AI.
   */
  getContextString(): string {
    const all = this.all();
    if (all.length === 0) return '';

    const lines: string[] = ['\n\n=== USER PROFILE ==='];
    
    const categories: Record<string, string> = {};
    for (const entry of all) {
      if (!categories[entry.category]) categories[entry.category] = [];
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
      id: row.id,
      key: row.key,
      value: JSON.parse(row.value),
      category: row.category as UserProfile['category'],
      confidence: row.confidence,
      updatedAt: row.updated_at,
      source: row.source,
      verified: row.verified === 1,
    };
  }
}
