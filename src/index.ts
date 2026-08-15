export * from './types';
export { WorkingMemory } from './Working/working';
export { LongTermMemory } from './LongTerm/longterm';
export { EpisodicMemory } from './Episodic/episodic';
export { SemanticMemory } from './Semantic/semantic';
export { RetrievalEngine } from './Retrieval/retrieval';
export { ConversationMemory } from './Conversation/conversation';
export { UserProfileMemory } from './UserProfile/userprofile';
export { getDB, closeDB } from './db/database';

// Convenience: create a fully wired memory system with user profile
import { WorkingMemory } from './Working/working';
import { LongTermMemory } from './LongTerm/longterm';
import { EpisodicMemory } from './Episodic/episodic';
import { SemanticMemory } from './Semantic/semantic';
import { RetrievalEngine } from './Retrieval/retrieval';
import { ConversationMemory } from './Conversation/conversation';
import { UserProfileMemory } from './UserProfile/userprofile';

export function createMemorySystem() {
  const working = new WorkingMemory();
  const longTerm = new LongTermMemory();
  const episodic = new EpisodicMemory();
  const semantic = new SemanticMemory();
  const conversation = new ConversationMemory();
  const userProfile = new UserProfileMemory();
  const retrieval = new RetrievalEngine(working, longTerm, semantic, conversation, userProfile);

  return { working, longTerm, episodic, semantic, conversation, userProfile, retrieval };
}
