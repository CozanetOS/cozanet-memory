/**
 * ConversationMemory — Stores full chat history persistently.
 * Upgraded: importance scoring, search result tracking, metadata, FTS search.
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
    content: string,
    options: { importance?: number; searchResults?: { title: string; url: string }[]; metadata?: Record<string, any> } = {}
  ): ConversationMessage {
    const db = getDB();
    const msg: ConversationMessage = {
      id: uuidv4(),
      role,
      content,
      timestamp: Date.now(),
      sessionId,
      importance: options.importance ?? 0,
      searchResults: options.searchResults,
      metadata: options.metadata,
    };

    db.prepare(`
      INSERT INTO conversations 
        (id, role, content, timestamp, session_id, importance, search_results, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      msg.id, msg.role, msg.content, msg.timestamp, msg.sessionId,
      msg.importance ?? 0,
      msg.searchResults ? JSON.stringify(msg.searchResults) : null,
      msg.metadata ? JSON.stringify(msg.metadata) : null
    );

    // FTS update
    try {
      db.prepare('DELETE FROM conversations_fts WHERE id = ?').run(msg.id);
      db.prepare('INSERT INTO conversations_fts (id, content, session_id) VALUES (?, ?, ?)').run(
        msg.id, msg.content, msg.sessionId
      );
    } catch { /* FTS failure is non-fatal */ }

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

    return rows.map(row => this.rowToMessage(row));
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
   * Search across all conversations.
   */
  search(query: string, limit = 10): ConversationMessage[] {
    const db = getDB();
    try {
      const rows = db.prepare(`
        SELECT c.* FROM conversations_fts
        JOIN conversations c ON conversations_fts.id = c.id
        WHERE conversations_fts MATCH ?
        LIMIT ?
      `).all(query, limit) as any[];
      return rows.map(row => this.rowToMessage(row));
    } catch {
      const rows = db.prepare(`
        SELECT * FROM conversations WHERE content LIKE ?
        ORDER BY timestamp DESC LIMIT ?
      `).all(`%${query}%`, limit) as any[];
      return rows.map(row => this.rowToMessage(row));
    }
  }

  /**
   * List all unique sessions.
   */
  listSessions(): { sessionId: string; messageCount: number; lastMessage: number; avgImportance: number }[] {
    const db = getDB();
    const rows = db.prepare(`
      SELECT session_id, COUNT(*) as count, MAX(timestamp) as last, AVG(importance) as avg_imp
      FROM conversations
      GROUP BY session_id
      ORDER BY last DESC
    `).all() as any[];

    return rows.map(r => ({
      sessionId: r.session_id,
      messageCount: r.count,
      lastMessage: r.last,
      avgImportance: r.avg_imp ?? 0,
    }));
  }

  /**
   * Delete all messages for a session.
   */
  clearSession(sessionId: string): void {
    const db = getDB();
    db.prepare('DELETE FROM conversations WHERE session_id = ?').run(sessionId);
    try {
      db.prepare('DELETE FROM conversations_fts WHERE session_id = ?').run(sessionId);
    } catch {}
  }

  /**
   * Get total message count for a session.
   */
  messageCount(sessionId: string): number {
    const db = getDB();
    return (db.prepare('SELECT COUNT(*) as c FROM conversations WHERE session_id = ?').get(sessionId) as any).c;
  }

  /**
   * Get messages that have search results attached.
   */
  getMessagesWithSearch(sessionId: string): ConversationMessage[] {
    const db = getDB();
    const rows = db.prepare(`
      SELECT * FROM conversations 
      WHERE session_id = ? AND search_results IS NOT NULL
      ORDER BY timestamp ASC
    `).all(sessionId) as any[];
    return rows.map(row => this.rowToMessage(row));
  }

  private rowToMessage(row: any): ConversationMessage {
    return {
      id: row.id,
      role: row.role as ConversationMessage['role'],
      content: row.content,
      timestamp: row.timestamp,
      sessionId: row.session_id,
      importance: row.importance ?? 0,
      searchResults: row.search_results ? JSON.parse(row.search_results) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}
