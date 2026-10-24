

```php
<?php
class LruCache {
    private int $capacity;
    private ?Closure $clock;
    private array $entries = [];
    private ?Node $head = null;
    private ?Node $tail = null;

    private class Node {
        public string $key;
        public mixed $value;
        public ?float $expireAt;
        public ?Node $prev;
        public ?Node $next;

        public function __construct(string $key, mixed $value, ?float $expireAt) {
            $this->key = $key;
            $this->value = $value;
            $this->expireAt = $expireAt;
            $this->prev = null;
            $this->next = null;
        }
    }

    public function __construct(int $capacity, ?Closure $clock = null) {
        if ($capacity < 1) {
            throw new \InvalidArgumentException('Capacity must be at least 1');
        }
        $this->capacity = $capacity;
        $this->clock = $clock;
    }

    private function currentTime(): float {
        return $this->clock !== null ? $this->clock() : microtime(true);
    }

    // linked list helpers
    private function addToTail(Node $node): void {
        if ($this->tail === null) {
            $this->head = $this->tail = $node;
        } else {
            $this->tail->next = $node;
            $node->prev = $this->tail;
            $this->tail = $node;
        }
    }

    private function removeNode(Node $node): void {
        if ($node->prev !== null) {
            $node->prev->next = $node->next;
        } else {
            $this->head = $node->next;
        }
        if ($node->next !== null) {
            $node->next->prev = $node->prev;
        } else {
            $this->tail = $node->prev;
        }
    }

    private function moveToTail(Node $node): void {
        if ($node->next === null) {
            return;
        }
        $this->removeNode($node);
        $this->addToTail($node);
    }

    private function isExpired(Node $node): bool {
        if ($node->expireAt === null) {
            return false;
        }
        return $this->currentTime() >= $node->expireAt;
    }

    private function cleanupExpired(): void {
        $curr = $this->head;
        while ($curr !== null) {
            $next = $curr->next;
            if ($this->isExpired($curr)) {
                $this->removeNode($curr);
                unset($this->entries[$curr->key]);
            } else {
                $curr = $next;
            }
        }
    }

    private function enforceCapacity(): void {
        while ($this->count() > $this->capacity) {
            if ($this->head === null) {
                break;
            }
            $lruNode = $this->head;
            $this->removeNode($lruNode);
            unset($this->entries[$lruNode->key]);
        }
    }

    public function set(string $key, mixed $value, ?float $ttl = null): void {
        if ($this->capacity < 1) {
            throw new \InvalidArgumentException('Capacity must be at least 1');
        }
        $time = $this->currentTime();
        if ($ttl !== null && $ttl <= 0) {
            throw new \InvalidArgumentException('TTL must be positive');
        }
        $expireAt = ($ttl !== null) ? $time + $ttl : null;

        $existingNode = $this->entries[$key] ?? null;
        if ($existingNode !== null) {
            // Update existing entry
            $existingNode->value = $value;
            $existingNode->expireAt = $expireAt;
            $this->moveToTail($existingNode);
        } else {
            // Insert new entry
            $node = new Node($key, $value, $expireAt);
            $this->entries[$key] = $node;
            $this->addToTail($node);
        }

        // Remove expired entries first
        $this->cleanupExpired();
        // Enforce capacity
        $this->enforceCapacity();
    }

    public function get(string $key, mixed $default = null): mixed {
        $node = $this->entries[$key] ?? null;
        if ($node === null) {
            return $default;
        }
        if ($this->isExpired($node)) {
            $this->delete($key);
            return $default;
        }
        // Not expired: make most recently used
        $this->moveToTail($node);
        return $node->value;
    }

    public function has(string $key): bool {
        $node = $this->entries[$key] ?? null;
        if ($node === null) {
            return false;
        }
        if ($this->isExpired($node)) {
            $this->delete($key);
            return false;
        }
        return true;
    }

    public function delete(string $key): bool {
        $node = $this->entries[$key] ?? null;
        if ($node === null) {
            return false;
        }
        $this->removeNode($node);
        unset($this->entries[$key]);
        return true;
    }

    public function count(): int {
        $count = 0;
        $curr = $this->head;
        while ($curr !== null) {
            if (!$this->isExpired($curr)) {
                $count++;
            }
            $curr = $curr->next;
        }
        return $count;
    }

    public function keys(): array {
        $keys = [];
        $curr = $this->head;
        while ($curr !== null) {
            if (!$this->isExpired($curr)) {
                $keys[] = $curr->key;
            }
            $curr = $curr->next;
        }
        return $keys;
    }
}
```