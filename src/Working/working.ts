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
}
