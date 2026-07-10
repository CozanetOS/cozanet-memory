import { MemoryRecord } from '../types.js';
import { WorkingMemory } from '../Working/working.js';
import { LongTermMemory } from '../LongTerm/longterm.js';
import { SemanticMemory } from '../Semantic/semantic.js';

export class RetrievalEngine {
  static readonly id = 'memory:retrieval';

  constructor(
    private workingMemory: WorkingMemory,
    private longTermMemory: LongTermMemory,
    private semanticMemory: SemanticMemory
  ) {}

  async query(q: string): Promise<MemoryRecord[]> {
    const results: MemoryRecord[] = [];

    // Query Semantic Memory for concept lookups or searches
    const semanticResults = this.semanticMemory.search(q);
    for (const sem of semanticResults) {
      results.push({
        id: `semantic:${sem.concept}`,
        type: 'semantic',
        content: sem,
        tags: sem.relations,
        timestamp: Date.now()
      });
    }

    // Query Working Memory
    const workingState = this.workingMemory.getAll();
    for (const [key, val] of Object.entries(workingState)) {
      if (key.includes(q) || (typeof val === 'string' && val.includes(q))) {
        results.push({
          id: `working:${key}`,
          type: 'working',
          content: val,
          tags: ['working'],
          timestamp: Date.now()
        });
      }
    }

    // Query Long Term Memory
    try {
      const ltmResults = await this.longTermMemory.retrieve({
        tags: [q]
      });
      results.push(...ltmResults);
    } catch {
      // Ignore if store file read fails
    }

    return results;
  }
}
