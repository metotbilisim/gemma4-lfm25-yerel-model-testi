```php
<?php

class LruCache implements \Countable {
    private int $capacity;
    private ?Closure $clock;
    private ?Node $head = null;
    private ?Node $tail = null;
    private array $map = [];

    private class Node {
        public string $key;
        public mixed $value;
        public float $expiry;
        public ?Node $prev;
        public ?Node $next;

        public function __construct(string $key, mixed $value, float $expiry) {
            $this->key = $key;
            $this->value = $value;
            $this->expiry = $expiry;
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

    private function getClock(): float {
        return $this->clock !== null ? ($this->clock()) : microtime(true);
    }

    // LRU list operations
    private function addToTail(Node $node): void {
        if ($this->tail === null) {
            $this->head = $this->tail = $node;
        } else {
            $this->tail->next = $node;
            $node->prev = $this->tail;
            $node->next = null;
            $this->tail = $node;
        }
    }

    private function moveToTail(Node $node): void {
        if ($node === $this->tail) {
            return;
        }
        // Unlink node
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
        // Add to tail
        $this->addToTail($node);
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
        $node->prev = null;
        $node->next = null;
    }

    private function enforceCapacity(float $currentTime): void {
        // Remove expired entries first
        $this->removeExpired($currentTime);
        // If still over capacity, evict LRU
        while ($this->countNonExpired() > $this->capacity) {
            if ($this->head === null) {
                break;
            }
            $nodeToRemove = $this->head;
            $keyToRemove = $nodeToRemove->key;
            $this->removeNode($nodeToRemove);
            unset($this->map[$keyToRemove]);
        }
    }

    private function removeExpired(float $currentTime): void {
        foreach (array_keys($this->map) as $key => $node) {
            if ($node->expiry <= $currentTime) {
                $this->removeNode($node);
                unset($this->map[$key]);
            }
        }
    }

    private function countNonExpired(): int {
        $currentTime = $this->getClock();
        $count = 0;
        foreach ($this->map as $node) {
            if ($node->expiry > $currentTime) {
                $count++;
            }
        }
        return $count;
    }

    public function set(string $key, mixed $value, ?float $ttl = null): void {
        $currentTime = $this->getClock();

        if (isset($this->map[$key])) {
            $node = &$this->map[$key];
            $node->value = $value;
            if ($ttl !== null) {
                if ($ttl <= 0) {
                    throw new \InvalidArgumentException('TTL must be greater than zero');
                }
                $node->expiry = $currentTime + $ttl;
            } else {
                $node->expiry = PHP_INT_MAX;
            }
            $this->moveToTail($node);
        } else {
            if ($ttl !== null) {
                if ($ttl <= 0) {
                    throw new \InvalidArgumentException('TTL must be greater than zero');
                }
                $expiry = $currentTime + $ttl;
            } else {
                $expiry = PHP_INT_MAX;
            }
            $node = new Node($key, $value, $expiry);
            $this->map[$key] = $node;
            $this->addToTail($node);
        }

        // Enforce capacity
        $this->enforceCapacity($currentTime);
    }

    public function get(string $key, mixed $default = null): mixed {
        $currentTime = $this->getClock();
        if (!isset($this->map[$key])) {
            return $default;
        }
        $node = &$this->map[$key];
        if ($node->expiry <= $currentTime) {
            // Expired: remove
            $this->removeNode($node);
            unset($this->map[$key]);
            return $default;
        }
        // Not expired: move to MRU
        $this->moveToTail($node);
        return $node->value;
    }

    public function has(string $key): bool {
        $currentTime = $this->getClock();
        if (!isset($this->map[$key])) {
            return false;
        }
        $node = $this->map[$key];
        if ($node->expiry <= $currentTime) {
            return false;
        }
        return true;
    }

    public function delete(string $key): bool {
        $currentTime = $this->getClock();
        if (!isset($this->map[$key])) {
            return false;
        }
        $node = &$this->map[$key];
        if ($node->expiry <= $currentTime) {
            // Expired entry: treat as missing
            return false;
        }
        $this->removeNode($node);
        unset($this->map[$key]);
        return true;
    }

    public function count(): int {
        return $this->countNonExpired();
    }

    public function keys(): array {
        $currentTime = $this->getClock();
        $result = [];
        $node = $this->head;
        while ($node !== null) {
            if ($node->expiry > $currentTime) {
                $result[] = $node->key;
            }
            $node = $node->next;
        }
        return $result;
    }
}
```