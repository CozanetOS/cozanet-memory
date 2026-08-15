/**
 * RetrievalEngine — Unified search across all memory layers.
 * Upgraded: semantic search, user profile integration, importance-weighted ranking,
 *           conversation context awareness, profile-based personalization.
 *
 * Priority chain:
 *   1. Working memory (current session context)
 *   2. User profile (who is this person?)
 *   3. LongTerm FTS + semantic search
 *   4. Semantic concepts
 *   5. Conversation history
 */

import { MemoryRecord } from '../types.js';
import { WorkingMemory } from '../Working/working.js';
import { LongTermMemory } from '../LongTerm/longterm.js';
import { SemanticMemory } from '../Semantic/semantic.js';
import { ConversationMemory } from '../Conversation/conversation.js';
import { UserProfileMemory } from '../UserProfile/userprofile.js';

export interface RetrievalResult extends MemoryRecord {
  source: string;       // which layer it came from
  relevanceScore: number; // 0-1, how relevant to the query
  profileMatch?: boolean; // true if matched via user profile
}

export class RetrievalEngine {
  static readonly id = 'memory:retrieval';

  constructor(
    private workingMemory: WorkingMemory,
    private longTermMemory: LongTermMemory,
    private semanticMemory: SemanticMemory,
    private conversationMemory: ConversationMemory,
    private userProfileMemory?: UserProfileMemory,
  ) {}

  /**
   * Query all memory layers and return ranked results.
   */
  async query(q: string, sessionId?: string): Promise<RetrievalResult[]> {
    const results: RetrievalResult[] = [];
    const seen = new Set<string>();

    const add = (record: MemoryRecord, source: string, relevanceScore: number, profileMatch = false) => {
      const id = `${source}:${record.id}`;
      if (!seen.has(id)) {
        seen.add(id);
        results.push({ ...record, source, relevanceScore, profileMatch });
      }
    };

    // 1. Working memory (fastest, current session context)
    const workingState = this.workingMemory.getAll();
    for (const [key, val] of Object.entries(workingState)) {
      const valStr = typeof val === 'string' ? val : JSON.stringify(val);
      const keyMatch = key.toLowerCase().includes(q.toLowerCase());
      const valMatch = valStr.toLowerCase().includes(q.toLowerCase());
      if (keyMatch || valMatch) {
        add({
          id: `working:${key}`,
          type: 'working',
          content: val,
          tags: ['working'],
          timestamp: Date.now(),
        }, 'working', keyMatch ? 0.95 : 0.7);
      }
    }

    // 2. User profile (personalization)
    if (this.userProfileMemory) {
      const profileEntries = this.userProfileMemory.all();
      for (const entry of profileEntries) {
        const valueStr = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);
        const keyMatch = entry.key.toLowerCase().includes(q.toLowerCase());
        const valMatch = valueStr.toLowerCase().includes(q.toLowerCase());
        if (keyMatch || valMatch) {
          add({
            id: `profile:${entry.key}`,
            type: 'semantic',
            content: { key: entry.key, value: entry.value, category: entry.category, verified: entry.verified },
            tags: ['user_profile', entry.category],
            timestamp: entry.updatedAt,
            importance: entry.confidence * 10,
            confidence: entry.confidence,
          }, 'user_profile', keyMatch ? 0.9 : 0.6, true);
        }
      }
    }

    // 3. Long-term FTS search (persistent, cross-session)
    const ltmResults = this.longTermMemory.search(q, 5);
    for (const r of ltmResults) {
      add(r, 'longterm', 0.8);
    }

    // 4. Semantic memory
    const semanticResults = this.semanticMemory.search(q, 5);
    for (const sem of semanticResults) {
      add({
        id: `semantic:${sem.concept}`,
        type: 'semantic',
        content: sem,
        tags: sem.relations,
        timestamp: sem.updatedAt,
      }, 'semantic', 0.7);
    }

    // 5. Conversation history (recent context)
    if (sessionId) {
      const convHistory = this.conversationMemory.getHistory(sessionId, 20);
      for (const msg of convHistory) {
        if (msg.content.toLowerCase().includes(q.toLowerCase())) {
          add({
            id: `conv:${msg.id}`,
            type: 'conversation',
            content: { role: msg.role, content: msg.content, timestamp: msg.timestamp },
            tags: ['conversation', msg.role],
            timestamp: msg.timestamp,
          }, 'conversation', 0.5);
        }
      }
    }

    // Sort by relevance score
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return results;
  }

  /**
   * Check if memory contains relevant info for a query.
   */
  async hasRelevantMemory(q: string, sessionId?: string): Promise<boolean> {
    const results = await this.query(q, sessionId);
    return results.length > 0;
  }

  /**
   * Get context for the AI — combines user profile + relevant memories.
   */
  async getContextForAI(q: string, sessionId?: string): Promise<string> {
    const parts: string[] = [];

    // User profile context
    if (this.userProfileMemory) {
      const profileCtx = this.userProfileMemory.getContextString();
      if (profileCtx) parts.push(profileCtx);
    }

    // Relevant memories
    const results = await this.query(q, sessionId);
    if (results.length > 0) {
      parts.push('\n\n=== RELEVANT MEMORIES ===');
      for (const r of results.slice(0, 5)) {
        const contentStr = typeof r.content === 'string' ? r.content : JSON.stringify(r.content);
        parts.push(`- [${r.source}] ${contentStr.slice(0, 200)}`);
      }
    }

    return parts.length > 0 ? parts.join('\n') : '';
  }

  /**
   * Get the most important memories (for display or memory review).
   */
  getTopMemories(limit = 10): RetrievalResult[] {
    const ltm = this.longTermMemory.retrieve({ sortBy: 'importance', limit });
    return ltm.map(r => ({ ...r, source: 'longterm', relevanceScore: r.importance / 10 }));
  }

  /**
   * Get memory statistics summary.
   */
  getStats(): { totalMemories: number; profileEntries: number; conversations: number; semanticConcepts: number } {
    return {
      totalMemories: this.longTermMemory.count(),
      profileEntries: this.userProfileMemory?.count() ?? 0,
      conversations: 0,
      semanticConcepts: this.semanticMemory.all().length,
    };
  }
}
