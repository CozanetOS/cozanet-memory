export interface MemoryRecord {
  id: string;
  type: 'working' | 'longterm' | 'episodic' | 'semantic';
  content: any;
  tags: string[];
  timestamp: number;
  ttl?: number;
}

export interface MemoryQuery {
  type?: string;
  tags?: string[];
  limit?: number;
}

export interface Episode {
  id: string;
  label: string;
  events: any[];
  startTime: number;
  endTime?: number;
}

export interface SemanticEntry {
  concept: string;
  definition: string;
  relations: string[];
}
