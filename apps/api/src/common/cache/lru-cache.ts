import { LRUCache } from 'lru-cache';

/**
 * Thin, type-safe wrapper around the `lru-cache` npm package.
 *
 * Provides a simplified API surface and adds `deleteBy` for
 * bulk key-predicate invalidation. Reusable across any domain.
 *
 * @example
 * ```ts
 * const cache = new AppLruCache<string, UserProfile>({ maxSize: 100, ttlMs: 60_000 });
 * cache.set('user:123', profile);
 * const cached = cache.get('user:123'); // UserProfile | undefined
 * cache.deleteBy((key) => key.startsWith('user:')); // bulk invalidate
 * ```
 */
export interface AppLruCacheOptions {
  /** Maximum number of entries before eviction. */
  maxSize: number;
  /** Time-to-live in milliseconds. 0 or omitted = no expiry. */
  ttlMs?: number;
}

export class AppLruCache<K extends {}, V extends {}> {
  private readonly cache: LRUCache<K, V>;

  constructor(options: AppLruCacheOptions) {
    this.cache = new LRUCache<K, V>({
      max: options.maxSize,
      ...(options.ttlMs && options.ttlMs > 0 ? { ttl: options.ttlMs } : {}),
    });
  }

  /** Retrieve a value by key. Returns undefined if not found or expired. */
  get(key: K): V | undefined {
    return this.cache.get(key);
  }

  /** Store a value. Evicts LRU entry if cache is full. */
  set(key: K, value: V): void {
    this.cache.set(key, value);
  }

  /** Check if a key exists and is not expired. */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /** Remove a specific key. */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /** Remove all entries whose key matches the predicate. */
  deleteBy(predicate: (key: K) => boolean): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (predicate(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /** Remove all entries. */
  clear(): void {
    this.cache.clear();
  }

  /** Current number of (non-expired) entries. */
  get size(): number {
    return this.cache.size;
  }
}
