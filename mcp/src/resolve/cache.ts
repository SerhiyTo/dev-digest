export interface TtlCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  clear(): void;
}

export interface TtlCacheOptions {
  ttlMs: number;
  now: () => number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export function createTtlCache<T>(options: TtlCacheOptions): TtlCache<T> {
  const { ttlMs, now } = options;
  const store = new Map<string, CacheEntry<T>>();

  return {
    get(key) {
      const entry = store.get(key);
      if (entry === undefined) return undefined;
      if (now() >= entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      store.set(key, { value, expiresAt: now() + ttlMs });
    },
    clear() {
      store.clear();
    },
  };
}
