export interface MemoryRecord {
  id: string;
  type: 'working' | 'longterm' | 'episodic' | 'semantic' | 'conversation';
  content: any;
  tags: string[];
  timestamp: number;
  ttl?: number;
  sessionId?: string;
}

export interface MemoryQuery {
  type?: MemoryRecord['type'];
  tags?: string[];
  limit?: number;
  sessionId?: string;
  search?: string;
}

export interface Episode {
  id: string;
  label: string;
  events: EpisodeEvent[];
  startTime: number;
  endTime?: number;
  sessionId?: string;
}

export interface EpisodeEvent {
  type: string;
  data: any;
  timestamp: number;
}

export interface SemanticEntry {
  concept: string;
  definition: string;
  relations: string[];
  updatedAt: number;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sessionId: string;
}
