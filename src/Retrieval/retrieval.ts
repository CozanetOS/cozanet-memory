/**
 * RetrievalEngine — Unified search across all memory layers.
 * Priority: Working → Conversation (recent) → LongTerm FTS → Semantic
 */

import { MemoryRecord } from '../types.js';
import { WorkingMemory } from '../Working/working.js';
import { LongTermMemory } from '../LongTerm/longterm.js';
import { SemanticMemory } from '../Semantic/semantic.js';
import { ConversationMemory } from '../Conversation/conversation.js';

export class RetrievalEngine {
  static readonly id = 'memory:retrieval';

  constructor(
    private workingMemory: WorkingMemory,
    private longTermMemory: LongTermMemory,
    private semanticMemory: SemanticMemory,
    private conversationMemory: ConversationMemory
  ) {}

  /**
   * Query all memory layers and return ranked results.
   */
  async query(q: string, sessionId?: string): Promise<MemoryRecord[]> {
    const results: MemoryRecord[] = [];
    const seen = new Set<string>();

    const add = (record: MemoryRecord) => {
      if (!seen.has(record.id)) {
        seen.add(record.id);
        results.push(record);
      }
    };

    // 1. Working memory (fastest, current session context)
    const workingState = this.workingMemory.getAll();
    for (const [key, val] of Object.entries(workingState)) {
      const valStr = typeof val === 'string' ? val : JSON.stringify(val);
      if (key.toLowerCase().includes(q.toLowerCase()) || valStr.toLowerCase().includes(q.toLowerCase())) {
        add({
          id: `working:${key}`,
          type: 'working',
          content: val,
          tags: ['working'],
          timestamp: Date.now(),
        });
      }
    }

    // 2. Long-term FTS search (persistent, cross-session)
    const ltmResults = this.longTermMemory.search(q, 5);
    for (const r of ltmResults) add(r);

    // 3. Semantic memory
    const semanticResults = this.semanticMemory.search(q, 5);
    for (const sem of semanticResults) {
      add({
        id: `semantic:${sem.concept}`,
        type: 'semantic',
        content: sem,
        tags: sem.relations,
        timestamp: sem.updatedAt,
      });
    }

    return results;
  }

  /**
   * Check if memory contains relevant info for a query.
   * Returns true if we have enough context to answer without searching.
   */
  async hasRelevantMemory(q: string, sessionId?: string): Promise<boolean> {
    const results = await this.query(q, sessionId);
    return results.length > 0;
  }
}
