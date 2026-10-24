```php
<?php

/**
 * Represents an entry in the LRU cache.
 */
class Entry
{
    public function __construct(
        public string $key,
        public mixed $value,
        public ?float $expiry = null,
    ) {}
}

/**
 * An LRU (Least Recently Used) cache with optional per-entry time-to-live.
 */
class LruCache implements \Countable
{
    private readonly int $capacity;
    private readonly \Closure $clock;

    /**
     * @var array<string, Entry>
     */
    private array $data = [];

    /**
     * @param int $capacity Must be >= 1.
     * @param \Closure|null $clock A closure that returns the current time in seconds as a float.
     * @throws \InvalidArgumentException if capacity < 1.
     */
    public function __construct(int $capacity, ?\Closure $clock = null)
    {
        if ($capacity < 1) {
            throw new \InvalidArgumentException("Capacity must be at least 1.");
        }
        $this->capacity = $capacity;
        $this->clock = $clock ?? fn() => microtime(true);
    }

    /**
     * Inserts or replaces an entry and makes it the most recently used.
     *
     * @param string $key
     * @param mixed $value
     * @param float|null $ttl Time-to-live in seconds. null means it never expires.
     * @throws \InvalidArgumentException if ttl <= 0.
     */
    public function set(string $key, mixed $value, ?float $ttl = null): void
    {
        if ($ttl !== null && $ttl <= 0) {
            throw new \InvalidArgumentException("TTL must be positive.");
        }

        $now = ($this->clock)();
        $expiry = ($ttl !== null) ? ($now + $ttl) : null;

        // If key exists, remove it to update its position in the recency order.
        // We use array_key_exists because the value could be null.
        if (array_key_exists($key, $this->data)) {
            unset($this->data[$key]);
        }

        $this->data[$key] = new Entry($key, $value, $expiry);

        if (count($this->data) > $this->capacity) {
            // 1. First, remove all expired entries.
            foreach ($this->data as $k => $entry) {
                if ($entry->expiry !== null && $entry->expiry <= $now) {
                    unset($this->data[$k]);
                }
            }

            // 2. If still over capacity, evict the least recently used entry.
            // In PHP associative arrays, the first element is the least recently added/updated.
            while (count($this->data) > $this->capacity) {
                reset($this->data);
                $lruKey = key($this->data);
                unset($this->data[$lruKey]);
            }
        }
    }

    /**
     * Returns the value and makes the entry the most recently used.
     *
     * @param string $key
     * @param mixed $default Value to return if key is missing or expired.
     * @return mixed
     */
    public function get(string $key, mixed $default = null): mixed
    {
        if (!array_key_exists($key, $this->data)) {
            return $default;
        }

        $entry = $this->data[$key];
        $now = ($this->clock)();

        if ($entry->expiry !== null && $entry->expiry <= $now) {
            unset($this->data[$key]);
            return $default;
        }

        // Update recency: remove and re-insert to move to the end of the array.
        unset($this->data[$key]);
        $this->data[$key] = $entry;

        return $entry->value;
    }

    /**
     * True if the entry exists and is not expired. Does NOT change recency.
     *
     * @param string $key
     * @return bool
     */
    public function has(string $key): bool
    {
        if (!array_key_exists($key, $this->data)) {
            return false;
        }

        $entry = $this->data[$key];
        $now = ($this->clock)();

        if ($entry->expiry !== null && $entry->expiry <= $now) {
            unset($this->data[$key]);
            return false;
        }

        return true;
    }

    /**
     * Removes the entry.
     *
     * @param string $key
     * @return bool True if a non-expired entry existed and was removed.
     */
    public function delete(string $key): bool
    {
        if (!array_key_exists($key, $this->data)) {
            return false;
        }

        $entry = $this->data[$key];
        $now = ($this->clock)();

        if ($entry->expiry !== null && $entry->expiry <= $now) {
            unset($this->data[$key]);
            return false;
        }

        unset($this->data[$key]);
        return true;
    }

    /**
     * Returns the number of non-expired entries.
     *
     * @return int
     */
    public function count(): int
    {
        $now = ($this->clock)();
        $count = 0;
        foreach ($this->data as $entry) {
            if ($entry->expiry === null || $entry->expiry > $now) {
                $count++;
            }
        }
        return $count;
    }

    /**
     * Returns a list of non-expired keys, ordered from least recently used to most recently used.
     *
     * @return array<string>
     */
    public function keys(): array
    {
        $now = ($this->clock)();
        $keys = [];
        foreach ($this->data as $k => $entry) {
            if ($entry->expiry === null || $entry->expiry > $now) {
                $keys[] = (string)$k;
            }
        }
        return $keys;
    }
}
```