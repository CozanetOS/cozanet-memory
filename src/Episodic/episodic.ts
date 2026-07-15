/**
 * EpisodicMemory — Records events and experiences as episodes.
 * Persisted to SQLite — survives restarts and redeployments.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../db/database.js';
import { Episode, EpisodeEvent } from '../types.js';

export class EpisodicMemory {
  static readonly id = 'memory:episodic';

  startEpisode(label: string, sessionId?: string): string {
    const db = getDB();
    const episodeId = uuidv4();
    db.prepare(`
      INSERT INTO episodes (id, label, events, start_time, session_id)
      VALUES (?, ?, '[]', ?, ?)
    `).run(episodeId, label, Date.now(), sessionId ?? null);
    return episodeId;
  }

  addToEpisode(episodeId: string, event: Omit<EpisodeEvent, 'timestamp'>): void {
    const db = getDB();
    const row = db.prepare('SELECT events FROM episodes WHERE id = ?').get(episodeId) as any;
    if (!row) throw new Error(`Episode ${episodeId} not found`);

    const events: EpisodeEvent[] = JSON.parse(row.events);
    events.push({ ...event, timestamp: Date.now() });
    db.prepare('UPDATE episodes SET events = ? WHERE id = ?').run(JSON.stringify(events), episodeId);
  }

  endEpisode(episodeId: string): Episode {
    const db = getDB();
    db.prepare('UPDATE episodes SET end_time = ? WHERE id = ?').run(Date.now(), episodeId);
    return this.getEpisode(episodeId);
  }

  getEpisode(episodeId: string): Episode {
    const db = getDB();
    const row = db.prepare('SELECT * FROM episodes WHERE id = ?').get(episodeId) as any;
    if (!row) throw new Error(`Episode ${episodeId} not found`);
    return {
      id: row.id,
      label: row.label,
      events: JSON.parse(row.events),
      startTime: row.start_time,
      endTime: row.end_time ?? undefined,
      sessionId: row.session_id ?? undefined,
    };
  }

  getRecentEpisodes(limit = 10): Episode[] {
    const db = getDB();
    const rows = db.prepare('SELECT * FROM episodes ORDER BY start_time DESC LIMIT ?').all(limit) as any[];
    return rows.map(row => ({
      id: row.id,
      label: row.label,
      events: JSON.parse(row.events),
      startTime: row.start_time,
      endTime: row.end_time ?? undefined,
      sessionId: row.session_id ?? undefined,
    }));
  }
}
