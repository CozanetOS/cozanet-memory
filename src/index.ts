export * from './types.js';
export { WorkingMemory } from './Working/working.js';
export { LongTermMemory } from './LongTerm/longterm.js';
export { EpisodicMemory } from './Episodic/episodic.js';
export { SemanticMemory } from './Semantic/semantic.js';
export { RetrievalEngine } from './Retrieval/retrieval.js';
export { ConversationMemory } from './Conversation/conversation.js';
export { getDB, closeDB } from './db/database.js';

// Convenience: create a fully wired memory system
import { WorkingMemory } from './Working/working.js';
import { LongTermMemory } from './LongTerm/longterm.js';
import { EpisodicMemory } from './Episodic/episodic.js';
import { SemanticMemory } from './Semantic/semantic.js';
import { RetrievalEngine } from './Retrieval/retrieval.js';
import { ConversationMemory } from './Conversation/conversation.js';

export function createMemorySystem() {
  const working = new WorkingMemory();
  const longTerm = new LongTermMemory();
  const episodic = new EpisodicMemory();
  const semantic = new SemanticMemory();
  const conversation = new ConversationMemory();
  const retrieval = new RetrievalEngine(working, longTerm, semantic, conversation);

  return { working, longTerm, episodic, semantic, conversation, retrieval };
}
