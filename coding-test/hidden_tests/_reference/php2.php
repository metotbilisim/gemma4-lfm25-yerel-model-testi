<?php

class LruCache implements \Countable
{
    /** @var array<string, array{0: mixed, 1: ?float, 2: string}> keyed by "k".$key to keep string keys */
    private array $items = [];
    private \Closure $clock;

    public function __construct(private int $capacity, ?\Closure $clock = null)
    {
        if ($capacity < 1) throw new \InvalidArgumentException('capacity');
        $this->clock = $clock ?? fn(): float => microtime(true);
    }

    private function now(): float { return ($this->clock)(); }

    private function alive(string $k): bool
    {
        if (!array_key_exists($k, $this->items)) return false;
        $exp = $this->items[$k][1];
        if ($exp !== null && $this->now() >= $exp) { unset($this->items[$k]); return false; }
        return true;
    }

    public function set(string $key, mixed $value, ?float $ttl = null): void
    {
        if ($ttl !== null && $ttl <= 0) throw new \InvalidArgumentException('ttl');
        $k = 'k' . $key;
        unset($this->items[$k]);
        $this->items[$k] = [$value, $ttl === null ? null : $this->now() + $ttl, $key];
        if (count($this->items) > $this->capacity) {
            foreach (array_keys($this->items) as $kk) $this->alive((string)$kk);
            while (count($this->items) > $this->capacity) unset($this->items[array_key_first($this->items)]);
        }
    }

    public function get(string $key, mixed $default = null): mixed
    {
        $k = 'k' . $key;
        if (!$this->alive($k)) return $default;
        $e = $this->items[$k];
        unset($this->items[$k]);
        $this->items[$k] = $e;
        return $e[0];
    }

    public function has(string $key): bool { return $this->alive('k' . $key); }

    public function delete(string $key): bool
    {
        $k = 'k' . $key;
        $was = $this->alive($k);
        unset($this->items[$k]);
        return $was;
    }

    public function count(): int
    {
        foreach (array_keys($this->items) as $kk) $this->alive((string)$kk);
        return count($this->items);
    }

    public function keys(): array
    {
        $this->count();
        return array_values(array_map(fn($e) => $e[2], $this->items));
    }
}
