import logger from "./logger";

/**
 * Cache entry structure with TTL and metadata
 */
interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  key: string;
  tags: string[];
}

/**
 * Cache metrics for monitoring
 */
interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  invalidations: number;
  evictions: number;
}

/**
 * Cache configuration per endpoint/group
 */
interface CacheConfig {
  ttl: number; // Time to live in milliseconds
  tags?: string[]; // Tags for group invalidation
}

/**
 * Comprehensive in-memory caching service with automatic invalidation
 * 
 * Features:
 * - Configurable TTL per cache key
 * - Tag-based cache invalidation
 * - Cache hit/miss metrics
 * - Thread-safe operations
 * - Automatic cleanup of expired entries
 * - Memory-efficient storage
 */
class CacheService {
  private cache: Map<string, CacheEntry>;
  private metrics: CacheMetrics;
  private cleanupInterval: NodeJS.Timeout | null;
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly CLEANUP_INTERVAL = 60 * 1000; // 1 minute
  private readonly MAX_CACHE_SIZE = 10000; // Maximum number of entries

  constructor() {
    this.cache = new Map();
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      invalidations: 0,
      evictions: 0,
    };
    this.cleanupInterval = null;
    this.startCleanupInterval();
  }

  /**
   * Start automatic cleanup of expired entries
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, this.CLEANUP_INTERVAL);

    // Prevent the interval from keeping the process alive
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Stop the cleanup interval (useful for testing or shutdown)
   */
  public stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Remove expired entries from cache
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry, now)) {
        this.cache.delete(key);
        evicted++;
      }
    }

    if (evicted > 0) {
      this.metrics.evictions += evicted;
      logger.debug(`[Cache] Cleaned up ${evicted} expired entries`);
    }
  }

  /**
   * Check if a cache entry is expired
   */
  private isExpired(entry: CacheEntry, now: number = Date.now()): boolean {
    return now - entry.timestamp > entry.ttl;
  }

  /**
   * Enforce cache size limit using LRU strategy
   */
  private enforceSizeLimit(): void {
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest 10% of entries
      const toRemove = Math.floor(this.MAX_CACHE_SIZE * 0.1);
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, toRemove);

      for (const [key] of entries) {
        this.cache.delete(key);
        this.metrics.evictions++;
      }

      logger.warn(`[Cache] Size limit reached. Evicted ${toRemove} oldest entries`);
    }
  }

  /**
   * Get a value from cache
   * @param key Cache key
   * @returns Cached value or null if not found/expired
   */
  public get<T = any>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.metrics.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.metrics.misses++;
      this.metrics.evictions++;
      return null;
    }

    this.metrics.hits++;
    return entry.data as T;
  }

  /**
   * Set a value in cache with optional TTL and tags
   * @param key Cache key
   * @param data Data to cache
   * @param config Cache configuration (TTL, tags)
   */
  public set<T = any>(key: string, data: T, config?: CacheConfig): void {
    this.enforceSizeLimit();

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: config?.ttl || this.DEFAULT_TTL,
      key,
      tags: config?.tags || [],
    };

    this.cache.set(key, entry);
    this.metrics.sets++;
  }

  /**
   * Delete a specific cache entry
   * @param key Cache key to delete
   * @returns true if deleted, false if not found
   */
  public delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.metrics.deletes++;
    }
    return deleted;
  }

  /**
   * Invalidate cache entries by tag
   * @param tag Tag to invalidate
   * @returns Number of entries invalidated
   */
  public invalidateByTag(tag: string): number {
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.includes(tag)) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      this.metrics.invalidations += count;
      logger.info(`[Cache] Invalidated ${count} entries with tag: ${tag}`);
    }

    return count;
  }

  /**
   * Invalidate cache entries by multiple tags
   * @param tags Array of tags to invalidate
   * @returns Number of entries invalidated
   */
  public invalidateByTags(tags: string[]): number {
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.some(tag => tags.includes(tag))) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      this.metrics.invalidations += count;
      logger.info(`[Cache] Invalidated ${count} entries with tags: ${tags.join(', ')}`);
    }

    return count;
  }

  /**
   * Invalidate cache entries by key pattern (regex)
   * @param pattern Regex pattern to match keys
   * @returns Number of entries invalidated
   */
  public invalidateByPattern(pattern: RegExp): number {
    let count = 0;

    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      this.metrics.invalidations += count;
      logger.info(`[Cache] Invalidated ${count} entries matching pattern: ${pattern}`);
    }

    return count;
  }

  /**
   * Clear all cache entries
   */
  public clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.metrics.invalidations += size;
    logger.info(`[Cache] Cleared all ${size} entries`);
  }

  /**
   * Get current cache metrics
   */
  public getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Get cache hit rate
   */
  public getHitRate(): number {
    const total = this.metrics.hits + this.metrics.misses;
    return total === 0 ? 0 : (this.metrics.hits / total) * 100;
  }

  /**
   * Get cache statistics
   */
  public getStats(): {
    size: number;
    metrics: CacheMetrics;
    hitRate: number;
    memoryUsage: string;
  } {
    // Estimate memory usage (rough approximation)
    const estimatedSize = Array.from(this.cache.values()).reduce((acc, entry) => {
      return acc + JSON.stringify(entry.data).length;
    }, 0);

    return {
      size: this.cache.size,
      metrics: this.getMetrics(),
      hitRate: this.getHitRate(),
      memoryUsage: `${(estimatedSize / 1024 / 1024).toFixed(2)} MB`,
    };
  }

  /**
   * Reset metrics (useful for testing)
   */
  public resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      invalidations: 0,
      evictions: 0,
    };
  }

  /**
   * Check if a key exists in cache (without affecting metrics)
   */
  public has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get all cache keys (useful for debugging)
   */
  public keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  public size(): number {
    return this.cache.size;
  }
}

// Export singleton instance
export const cacheService = new CacheService();

// Export types
export type { CacheConfig, CacheMetrics };
