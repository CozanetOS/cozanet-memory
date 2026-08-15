export interface MemoryRecord {
  id: string;
  type: 'working' | 'longterm' | 'episodic' | 'semantic' | 'conversation';
  content: any;
  tags: string[];
  timestamp: number;
  ttl?: number;
  sessionId?: string;
  importance?: number;     // 0-10, higher = more important
  accessCount?: number;    // how many times retrieved
  lastAccessed?: number;    // last retrieval timestamp
  decayScore?: number;      // computed from importance + recency + accessCount
  embedding?: number[];     // vector embedding for semantic search
  source?: string;          // where this memory came from
  confidence?: number;       // 0-1, how confident we are in this memory
}

export interface MemoryQuery {
  type?: MemoryRecord['type'];
  tags?: string[];
  limit?: number;
  sessionId?: string;
  search?: string;
  minImportance?: number;
  maxAge?: number;           // max age in milliseconds
  sortBy?: 'timestamp' | 'importance' | 'relevance' | 'decay';
}

export interface Episode {
  id: string;
  label: string;
  events: EpisodeEvent[];
  startTime: number;
  endTime?: number;
  sessionId?: string;
  importance?: number;
  tags?: string[];
}

export interface EpisodeEvent {
  type: string;
  data: any;
  timestamp: number;
  importance?: number;
}

export interface SemanticEntry {
  concept: string;
  definition: string;
  relations: string[];
  updatedAt: number;
  confidence?: number;
  embedding?: number[];
  source?: string;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sessionId: string;
  importance?: number;
  searchResults?: { title: string; url: string }[];
  metadata?: Record<string, any>;
}

// ── NEW: User Profile Memory ─────────────────────────────

export interface UserProfile {
  id: string;
  key: string;              // e.g. "name", "timezone", "preference:theme"
  value: any;
  category: 'identity' | 'preference' | 'fact' | 'skill' | 'goal' | 'relationship';
  confidence: number;        // 0-1
  updatedAt: number;
  source: string;           // how we learned this
  verified: boolean;         // user confirmed this
}

// ── NEW: Memory Consolidation ─────────────────────────────

export interface ConsolidationRule {
  sourceType: MemoryRecord['type'];
  targetType: MemoryRecord['type'];
  threshold: number;         // importance threshold for promotion
  minAccessCount: number;   // min times accessed before promotion
  maxAge?: number;           // max age (ms) for eligible memories
}

// ── NEW: Memory Export/Import ─────────────────────────────

export interface MemoryExport {
  version: string;
  exportedAt: number;
  records: MemoryRecord[];
  conversations: ConversationMessage[];
  episodes: Episode[];
  semanticEntries: SemanticEntry[];
  userProfile: UserProfile[];
}
