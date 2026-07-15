/**
 * ConversationMemory — Stores full chat history persistently.
 * Every message (user + assistant) is saved to SQLite.
 * Survives: page refresh, tab close, browser close, server restart, redeployment.
 *
 * Sessions: a sessionId groups a conversation. The frontend sends a sessionId
 * (stored in localStorage) so the same conversation is always retrieved.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../db/database.js';
import { ConversationMessage } from '../types.js';

export class ConversationMemory {
  static readonly id = 'memory:conversation';

  /**
   * Save a message to the conversation history.
   */
  saveMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string
  ): ConversationMessage {
    const db = getDB();
    const msg: ConversationMessage = {
      id: uuidv4(),
      role,
      content,
      timestamp: Date.now(),
      sessionId,
    };

    db.prepare(`
      INSERT INTO conversations (id, role, content, timestamp, session_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(msg.id, msg.role, msg.content, msg.timestamp, msg.sessionId);

    return msg;
  }

  /**
   * Get all messages for a session, oldest first (for LLM context).
   */
  getHistory(sessionId: string, limit = 50): ConversationMessage[] {
    const db = getDB();
    const rows = db.prepare(`
      SELECT * FROM conversations
      WHERE session_id = ?
      ORDER BY timestamp ASC
      LIMIT ?
    `).all(sessionId, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      role: row.role as ConversationMessage['role'],
      content: row.content,
      timestamp: row.timestamp,
      sessionId: row.session_id,
    }));
  }

  /**
   * Get recent messages as LLM-ready format [{role, content}].
   */
  getLLMContext(sessionId: string, limit = 20): { role: string; content: string }[] {
    return this.getHistory(sessionId, limit).map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * List all unique sessions (for session picker UI in future).
   */
  listSessions(): { sessionId: string; messageCount: number; lastMessage: number }[] {
    const db = getDB();
    const rows = db.prepare(`
      SELECT session_id, COUNT(*) as count, MAX(timestamp) as last
      FROM conversations
      GROUP BY session_id
      ORDER BY last DESC
    `).all() as any[];

    return rows.map(r => ({
      sessionId: r.session_id,
      messageCount: r.count,
      lastMessage: r.last,
    }));
  }

  /**
   * Delete all messages for a session.
   */
  clearSession(sessionId: string): void {
    const db = getDB();
    db.prepare('DELETE FROM conversations WHERE session_id = ?').run(sessionId);
  }

  /**
   * Get total message count for a session.
   */
  messageCount(sessionId: string): number {
    const db = getDB();
    return (db.prepare('SELECT COUNT(*) as c FROM conversations WHERE session_id = ?').get(sessionId) as any).c;
  }
}
