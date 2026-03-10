// Simple in-memory TTL cache

interface CacheEntry<T> {
    data: T
    expiresAt: number
}

const store = new Map<string, CacheEntry<unknown>>()

export function cacheGet<T>(key: string): T | null {
    const entry = store.get(key) as CacheEntry<T> | undefined
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
        store.delete(key)
        return null
    }
    return entry.data
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
    store.set(key, { data, expiresAt: Date.now() + ttlMs })
}

export const TTL = {
    NEWS: 10 * 60 * 1000,     // 10 minutes
    MARKETS: 5 * 60 * 1000,   // 5 minutes
    WEATHER: 15 * 60 * 1000,  // 15 minutes
    INTEL: 30 * 60 * 1000,    // 30 minutes
}
