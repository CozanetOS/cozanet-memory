/**
 * CozanetOS Memory — Unit Tests
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { LongTermMemory } from '../LongTerm/longterm.js';
import { WorkingMemory } from '../Working/working.js';
import { ConversationMemory } from '../Conversation/conversation.js';
import { SemanticMemory } from '../Semantic/semantic.js';
import { closeDB } from '../db/database.js';
import { v4 as uuidv4 } from 'uuid';

// Use test DB
process.env.MEMORY_DB_PATH = './data/test-memory.db';

describe('WorkingMemory', () => {
  let wm: WorkingMemory;

  beforeEach(() => { wm = new WorkingMemory(); });
  afterEach(() => { wm.clear(); });

  it('stores and retrieves values', () => {
    wm.set('key1', 'hello');
    expect(wm.get('key1')).toBe('hello');
  });

  it('returns undefined for missing keys', () => {
    expect(wm.get('nonexistent')).toBeUndefined();
  });

  it('respects TTL expiry', async () => {
    wm.set('expiring', 'value', 10); // 10ms TTL
    await new Promise(r => setTimeout(r, 50));
    expect(wm.get('expiring')).toBeUndefined();
  });

  it('clears all entries', () => {
    wm.set('a', 1); wm.set('b', 2);
    wm.clear();
    expect(wm.size()).toBe(0);
  });
});

describe('LongTermMemory', () => {
  let ltm: LongTermMemory;

  beforeEach(() => { ltm = new LongTermMemory(); });
  afterEach(() => { closeDB(); });

  it('stores and retrieves a record', () => {
    const id = uuidv4();
    ltm.store({ id, type: 'longterm', content: { fact: 'test' }, tags: ['test'] });
    const results = ltm.retrieve({ type: 'longterm' });
    expect(results.some(r => r.id === id)).toBe(true);
  });

  it('upserts existing records', () => {
    const id = uuidv4();
    ltm.store({ id, type: 'longterm', content: 'original', tags: [] });
    ltm.store({ id, type: 'longterm', content: 'updated', tags: [] });
    const results = ltm.retrieve();
    const record = results.find(r => r.id === id);
    expect(record?.content).toBe('updated');
  });

  it('deletes records', () => {
    const id = uuidv4();
    ltm.store({ id, type: 'longterm', content: 'to delete', tags: [] });
    ltm.forget(id);
    const results = ltm.retrieve();
    expect(results.some(r => r.id === id)).toBe(false);
  });

  it('searches by content', () => {
    ltm.store({ type: 'longterm', content: 'Cozanet is an AI OS', tags: ['ai'] });
    const results = ltm.search('Cozanet');
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('ConversationMemory', () => {
  let cm: ConversationMemory;
  const sessionId = `test-session-${uuidv4()}`;

  beforeEach(() => { cm = new ConversationMemory(); });
  afterEach(() => { cm.clearSession(sessionId); closeDB(); });

  it('saves and retrieves messages', () => {
    cm.saveMessage(sessionId, 'user', 'Hello');
    cm.saveMessage(sessionId, 'assistant', 'Hi there!');
    const history = cm.getHistory(sessionId);
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe('user');
    expect(history[1].role).toBe('assistant');
  });

  it('returns LLM-ready context format', () => {
    cm.saveMessage(sessionId, 'user', 'What is 2+2?');
    const ctx = cm.getLLMContext(sessionId);
    expect(ctx[0]).toEqual({ role: 'user', content: 'What is 2+2?' });
  });

  it('isolates sessions', () => {
    const otherSession = `other-${uuidv4()}`;
    cm.saveMessage(sessionId, 'user', 'session A');
    cm.saveMessage(otherSession, 'user', 'session B');
    const history = cm.getHistory(sessionId);
    expect(history.every(m => m.sessionId === sessionId)).toBe(true);
    cm.clearSession(otherSession);
  });
});

describe('SemanticMemory', () => {
  let sm: SemanticMemory;

  beforeEach(() => { sm = new SemanticMemory(); });
  afterEach(() => { closeDB(); });

  it('stores and retrieves concepts', () => {
    sm.set('CozanetOS', 'An AI-native operating system', ['AI', 'OS']);
    const entry = sm.get('CozanetOS');
    expect(entry?.definition).toContain('AI-native');
  });

  it('searches by definition', () => {
    sm.set('Memory', 'Stores information persistently', ['storage']);
    const results = sm.search('persistently');
    expect(results.length).toBeGreaterThan(0);
  });

  it('updates concepts', () => {
    sm.set('concept', 'v1', []);
    sm.set('concept', 'v2', ['updated']);
    expect(sm.get('concept')?.definition).toBe('v2');
  });
});
