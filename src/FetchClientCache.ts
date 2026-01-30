/**
 * Represents a cache key used in the FetchClientCache.
 */
export type CacheKey = string[] | string;

/**
 * Represents a cache tag used for grouping and invalidating cache entries.
 */
export type CacheTag = string;

/**
 * Represents an entry in the FetchClientCache.
 */
type CacheEntry = {
  key: CacheKey;
  tags: CacheTag[];
  lastAccess: Date;
  expires: Date;
  response: Response;
};

/**
 * Represents a cache for storing responses from the FetchClient.
 */
export class FetchClientCache {
  private cache = new Map<string, CacheEntry>();
  private tagIndex = new Map<CacheTag, Set<string>>();

  /**
   * Sets a response in the cache with the specified key.
   * @param key - The cache key.
   * @param response - The response to be cached.
   * @param cacheDuration - The duration for which the response should be cached (in milliseconds).
   * @param tags - Optional tags for grouping and invalidating cache entries.
   */
  public set(
    key: CacheKey,
    response: Response,
    cacheDuration?: number,
    tags?: CacheTag[],
  ): void {
    const hash = this.getHash(key);
    const normalizedTags = tags ?? [];

    // Remove old tag associations if entry exists
    const existingEntry = this.cache.get(hash);
    if (existingEntry) {
      this.removeTagAssociations(hash, existingEntry.tags);
    }

    this.cache.set(hash, {
      key,
      tags: normalizedTags,
      lastAccess: new Date(),
      expires: new Date(Date.now() + (cacheDuration ?? 60000)),
      response,
    });

    // Add new tag associations
    for (const tag of normalizedTags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(hash);
    }
  }

  /**
   * Retrieves a response from the cache with the specified key.
   * @param key - The cache key.
   * @returns The cached response, or null if the response is not found or has expired.
   */
  public get(key: CacheKey): Response | null {
    const hash = this.getHash(key);
    const cacheEntry = this.cache.get(hash);

    if (!cacheEntry) {
      return null;
    }

    if (cacheEntry.expires < new Date()) {
      this.removeTagAssociations(hash, cacheEntry.tags);
      this.cache.delete(hash);
      return null;
    }

    cacheEntry.lastAccess = new Date();
    return cacheEntry.response;
  }

  /**
   * Deletes a response from the cache with the specified key.
   * @param key - The cache key.
   * @returns True if the response was successfully deleted, false otherwise.
   */
  public delete(key: CacheKey): boolean {
    const hash = this.getHash(key);
    const entry = this.cache.get(hash);

    if (entry) {
      this.removeTagAssociations(hash, entry.tags);
    }

    return this.cache.delete(hash);
  }

  /**
   * Deletes all responses from the cache that have keys beginning with the specified key.
   * @param prefix - The cache key prefix.
   * @returns The number of responses that were deleted.
   */
  public deleteAll(prefix: CacheKey): number {
    let count = 0;
    const prefixHash = this.getHash(prefix);

    for (const [hash, entry] of this.cache.entries()) {
      if (hash.startsWith(prefixHash)) {
        this.removeTagAssociations(hash, entry.tags);
        if (this.cache.delete(hash)) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Deletes all responses from the cache that have the specified tag.
   * @param tag - The cache tag.
   * @returns The number of responses that were deleted.
   */
  public deleteByTag(tag: CacheTag): number {
    const hashes = this.tagIndex.get(tag);
    if (!hashes) {
      return 0;
    }

    let count = 0;
    for (const hash of hashes) {
      const entry = this.cache.get(hash);
      if (entry) {
        // Remove this entry's associations from all its tags
        this.removeTagAssociations(hash, entry.tags);
        if (this.cache.delete(hash)) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Gets all tags currently in use in the cache.
   * @returns An array of all cache tags.
   */
  public getTags(): CacheTag[] {
    return Array.from(this.tagIndex.keys()).filter((tag) =>
      this.tagIndex.get(tag)!.size > 0
    );
  }

  /**
   * Gets the tags associated with a cache entry.
   * @param key - The cache key.
   * @returns The tags associated with the entry, or an empty array if not found.
   */
  public getEntryTags(key: CacheKey): CacheTag[] {
    const entry = this.cache.get(this.getHash(key));
    return entry?.tags ?? [];
  }

  /**
   * Checks if a response exists in the cache with the specified key.
   * @param key - The cache key.
   * @returns True if the response exists in the cache, false otherwise.
   */
  public has(key: CacheKey): boolean {
    return this.cache.has(this.getHash(key));
  }

  /**
   * Returns an iterator for the cache entries.
   * @returns An iterator for the cache entries.
   */
  public values(): IterableIterator<CacheEntry> {
    return this.cache.values();
  }

  /**
   * Clears all entries from the cache.
   */
  public clear(): void {
    this.cache.clear();
    this.tagIndex.clear();
  }

  private getHash(key: CacheKey): string {
    if (key instanceof Array) {
      return key.join(":");
    }

    return key;
  }

  private removeTagAssociations(hash: string, tags: CacheTag[]): void {
    for (const tag of tags) {
      const hashes = this.tagIndex.get(tag);
      if (hashes) {
        hashes.delete(hash);
        if (hashes.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
  }
}
