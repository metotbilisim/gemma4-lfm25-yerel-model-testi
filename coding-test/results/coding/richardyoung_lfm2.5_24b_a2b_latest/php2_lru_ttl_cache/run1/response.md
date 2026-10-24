

```php
<?php

class LruCache implements Countable
{
    private int $capacity;
    private ?\Closure $clock;
    private array $cache = [];
    private ?Node $head = null;
    private ?Node $tail = null;

    private class Node
    {
        public string $key;
        public mixed $value;
        public ?float $ttl;
        public float $expiry; // INF if no TTL
        public ?Node $prev;
        public ?Node $next;

        public function __construct(string $key, mixed $value, ?float $ttl, float $expiry)
        {
            $this->key = $key;
            $this->value = $value;
            $this->ttl = $ttl;
            $this->expiry = $expiry;
            $this->prev = null;
            $this->next = null;
        }

        public function isExpired(float $time): bool
        {
            return $this->expiry <= $time;
        }
    }

    public function __construct(int $capacity, ?\Closure $clock = null)
    {
        if ($capacity < 1) {
            throw new \InvalidArgumentException('Capacity must be at least 1');
        }
        $this->capacity = $capacity;
        $this->clock = $clock ?? function () {
            return microtime(true);
        };
    }

    public function set(string $key, mixed $value, ?float $ttl = null): void
    {
        if ($ttl !== null && $ttl <= 0) {
            throw new \InvalidArgumentException('TTL must be greater than zero');
        }

        $currentTime = $this->clock();
        $expiry = $ttl !== null ? $currentTime + $ttl : \PHP_INT_MAX;

        if (isset($this->cache[$key])) {
            // Replace existing entry
            $node = &$this->cache[$key];
            $node->value = $value;
            $node->ttl = $ttl;
            $node->expiry = $expiry;
            $this->moveToTail($node);
        } else {
            // New entry
            $node = new self::Node($key, $value, $ttl, $expiry);
            $this->cache[$key] = $node;
            $this->addToTail($node);
        }

        $this->enforceCapacity();
    }

    public function get(string $key, mixed $default = null): mixed
    {
        $node = $this->cache[$key] ?? null;
        if ($node === null) {
            return $default;
        }
        $currentTime = $this->clock();
        if ($node->isExpired($currentTime)) {
            $this->removeNode($node);
            unset($this->cache[$key]);
            return $default;
        }
        // Not expired: make most recently used
        $this->moveToTail($node);
        return $node->value;
    }

    public function has(string $key): bool
    {
        $node = $this->cache[$key] ?? null;
        if ($node === null) {
            return false;
        }
        $currentTime = $this->clock();
        if ($node->isExpired($currentTime)) {
            $this->removeNode($node);
            unset($this->cache[$key]);
            return false;
        }
        return true;
    }

    public function delete(string $key): bool
    {
        $node = $this->cache[$key] ?? null;
        if ($node === null) {
            return false;
        }
        $currentTime = $this->clock();
        if ($node->isExpired($currentTime)) {
            $this->removeNode($node);
            unset($this->cache[$key]);
            return false;
        }
        $this->removeNode($node);
        unset($this->cache[$key]);
        return true;
    }

    public function count(): int
    {
        return $this->countNonExpired();
    }

    public function keys(): array
    {
        $currentTime = $this->clock();
        $result = [];
        $node = $this->head;
        while ($node !== null) {
            if (!$node->isExpired($currentTime)) {
                $result[] = $node->key;
            }
            $node = $node->next;
        }
        return $result;
    }

    // --- Private helper methods ---

    private function addToTail(self::Node $node): void
    {
        if ($this->tail === null) {
            $this->head = $this->tail = $node;
        } else {
            $this->tail->next = $node;
            $node->prev = $this->tail;
            $this->tail = $node;
        }
    }

    private function removeNode(self::Node $node): void
    {
        if ($node->prev !== null) {
            $node->prev->next = $node->next;
        } else {
            // node is head
            $this->head = $node->next;
        }
        if ($node->next !== null) {
            $node->next->prev = $node->prev;
        } else {
            // node is tail
            $this->tail = $node->prev;
        }
    }

    private function moveToTail(self::Node $node): void
    {
        if ($node === $this->tail) {
            return;
        }
        $this->removeNode($node);
        $this->addToTail($node);
    }

    private function countNonExpired(float $time = null): int
    {
        if ($time === null) {
            $time = $this->clock();
        }
        $count = 0;
        $node = $this->head;
        while ($node !== null) {
            if (!$node->isExpired($time)) {
                $count++;
            }
            $node = $node->next;
        }
        return $count;
    }

    private function expireAll(): void
    {
        $currentTime = $this->clock();
        $node = $this->head;
        while ($node !== null) {
            $next = $node->next;
            if ($node->isExpired($currentTime)) {
                $this->removeNode($node);
                unset($this->cache[$node->key]);
            }
            $node = $next;
        }
    }

    private function enforceCapacity(): void
    {
        // First remove expired entries
        $this->expireAll();

        // If still over capacity, evict LRU (head) until within limit
        while ($this->countNonExpired() > $this->capacity && $this->head !== null) {
            $oldest = $this->head;
            $this->removeNode($oldest);
            unset($this->cache[$oldest->key]);
        }
    }
}
```