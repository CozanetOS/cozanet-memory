import { SemanticEntry } from '../types.js';

export class SemanticMemory {
  static readonly id = 'memory:semantic';
  private store = new Map<string, SemanticEntry>();

  learn(concept: string, definition: string, relations: string[]): void {
    this.store.set(concept.toLowerCase(), {
      concept,
      definition,
      relations
    });
  }

  lookup(concept: string): SemanticEntry | null {
    return this.store.get(concept.toLowerCase()) || null;
  }

  search(query: string): SemanticEntry[] {
    const lowerQuery = query.toLowerCase();
    const results: SemanticEntry[] = [];
    for (const entry of this.store.values()) {
      if (
        entry.concept.toLowerCase().includes(lowerQuery) ||
        entry.definition.toLowerCase().includes(lowerQuery) ||
        entry.relations.some(r => r.toLowerCase().includes(lowerQuery))
      ) {
        results.push(entry);
      }
    }
    return results;
  }
}
