import * as fs from 'fs/promises';
import * as path from 'path';
import { MemoryRecord, MemoryQuery } from '../types.js';

export class LongTermMemory {
  static readonly id = 'memory:longterm';
  private filePath: string;

  constructor(filePath: string = './data/longterm.json') {
    this.filePath = filePath;
  }

  private async ensureFile(): Promise<MemoryRecord[]> {
    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });
      const content = await fs.readFile(this.filePath, 'utf-8');
      return JSON.parse(content) as MemoryRecord[];
    } catch {
      await fs.writeFile(this.filePath, JSON.stringify([]), 'utf-8');
      return [];
    }
  }

  async store(record: MemoryRecord): Promise<void> {
    const records = await this.ensureFile();
    const index = records.findIndex(r => r.id === record.id);
    if (index > -1) {
      records[index] = record;
    } else {
      records.push(record);
    }
    await fs.writeFile(this.filePath, JSON.stringify(records, null, 2), 'utf-8');
  }

  async retrieve(query: MemoryQuery): Promise<MemoryRecord[]> {
    const records = await this.ensureFile();
    let filtered = records;

    if (query.type) {
      filtered = filtered.filter(r => r.type === query.type);
    }
    if (query.tags && query.tags.length > 0) {
      filtered = filtered.filter(r => query.tags!.every(t => r.tags.includes(t)));
    }
    if (query.limit !== undefined) {
      filtered = filtered.slice(0, query.limit);
    }
    return filtered;
  }

  async forget(id: string): Promise<void> {
    const records = await this.ensureFile();
    const filtered = records.filter(r => r.id !== id);
    await fs.writeFile(this.filePath, JSON.stringify(filtered, null, 2), 'utf-8');
  }
}
