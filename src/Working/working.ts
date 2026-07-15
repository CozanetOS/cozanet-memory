/**
 * WorkingMemory — Fast in-session memory.
 * Volatile: cleared on restart (by design — it's "RAM").
 * Important values should be promoted to LongTermMemory for persistence.
 */

export class WorkingMemory {
  static readonly id = 'memory:working';
  private store = new Map<string, { value: any; expiresAt?: number }>();

  set(key: string, value: any, ttlMs?: number): void {
    const expiresAt = ttlMs !== undefined ? Date.now() + ttlMs : undefined;
    this.store.set(key, { value, expiresAt });
  }

  get(key: string): any {
    const item = this.store.get(key);
    if (!item) return undefined;
    if (item.expiresAt !== undefined && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return item.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  getAll(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, item] of this.store.entries()) {
      if (item.expiresAt === undefined || Date.now() <= item.expiresAt) {
        result[key] = item.value;
      } else {
        this.store.delete(key);
      }
    }
    return result;
  }

  size(): number {
    return this.store.size;
  }
}
