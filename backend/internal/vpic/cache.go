package vpic

import (
	"sync"
	"time"
)

type cacheEntry[V any] struct {
	value     V
	expiresAt time.Time
}

// ttlCache is a concurrency-safe in-memory cache whose entries expire after a
// fixed TTL. It holds at most maxEntries; when full, expired entries are
// dropped first and then the entry closest to expiring.
type ttlCache[V any] struct {
	mu         sync.Mutex
	entries    map[string]cacheEntry[V]
	ttl        time.Duration
	maxEntries int
	now        func() time.Time
}

func newTTLCache[V any](ttl time.Duration, maxEntries int) *ttlCache[V] {
	return &ttlCache[V]{
		entries:    make(map[string]cacheEntry[V]),
		ttl:        ttl,
		maxEntries: maxEntries,
		now:        time.Now,
	}
}

func (c *ttlCache[V]) get(key string) (V, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	entry, ok := c.entries[key]

	if !ok || !c.now().Before(entry.expiresAt) {
		var zero V
		return zero, false
	}

	return entry.value, true
}

func (c *ttlCache[V]) set(key string, value V) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := c.now()

	if _, exists := c.entries[key]; !exists && len(c.entries) >= c.maxEntries {
		c.evict(now)
	}

	c.entries[key] = cacheEntry[V]{value: value, expiresAt: now.Add(c.ttl)}
}

// evict makes room for one entry. The caller must hold c.mu.
func (c *ttlCache[V]) evict(now time.Time) {
	for key, entry := range c.entries {
		if !now.Before(entry.expiresAt) {
			delete(c.entries, key)
		}
	}

	if len(c.entries) < c.maxEntries {
		return
	}

	var oldestKey string
	var oldest time.Time
	found := false

	for key, entry := range c.entries {
		if !found || entry.expiresAt.Before(oldest) {
			oldestKey = key
			oldest = entry.expiresAt
			found = true
		}
	}

	delete(c.entries, oldestKey)
}
