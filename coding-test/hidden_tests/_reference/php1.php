<?php

final class RomanNumerals
{
    private const MAP = ['M' => 1000, 'CM' => 900, 'D' => 500, 'CD' => 400, 'C' => 100, 'XC' => 90,
        'L' => 50, 'XL' => 40, 'X' => 10, 'IX' => 9, 'V' => 5, 'IV' => 4, 'I' => 1];

    public static function toRoman(int $n): string
    {
        if ($n < 1 || $n > 3999) throw new \InvalidArgumentException('out of range');
        $out = '';
        foreach (self::MAP as $sym => $val) {
            while ($n >= $val) { $out .= $sym; $n -= $val; }
        }
        return $out;
    }

    public static function fromRoman(string $s): int
    {
        if (!preg_match('/^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/', $s) || $s === '') {
            throw new \InvalidArgumentException('invalid numeral');
        }
        $n = 0; $i = 0;
        while ($i < strlen($s)) {
            $two = substr($s, $i, 2);
            if (strlen($two) === 2 && isset(self::MAP[$two])) { $n += self::MAP[$two]; $i += 2; }
            else { $n += self::MAP[$s[$i]]; $i++; }
        }
        return $n;
    }

    public static function add(string $a, string $b): string
    {
        return self::toRoman(self::fromRoman($a) + self::fromRoman($b));
    }
}
