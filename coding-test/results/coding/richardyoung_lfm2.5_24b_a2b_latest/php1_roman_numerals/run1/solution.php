<?php
final class RomanNumerals
{
    private static array $canonicalMap = [];

    public static function toRoman(int $n): string
    {
        if ($n < 1 || $n > 3999) {
            throw new \InvalidArgumentException('Number must be between 1 and 3999');
        }

        $result = '';
        $values = [
            1000 => 'M',
            900  => 'CM',
            500  => 'D',
            400  => 'CD',
            100  => 'C',
            90   => 'XC',
            50   => 'L',
            40   => 'XL',
            10   => 'X',
            9    => 'IX',
            5    => 'V',
            4    => 'IV',
            1    => 'I',
        ];

        foreach ($values as $value => $symbol) {
            while ($n >= $value) {
                $result .= $symbol;
                $n -= $value;
            }
        }

        return $result;
    }

    public static function fromRoman(string $s): int
    {
        if ($s === '') {
            throw new \InvalidArgumentException('Empty Roman numeral');
        }

        // Check for surrounding whitespace
        if (preg_match('/^\s/', $s) || preg_match('/\s$/', $s)) {
            throw new \InvalidArgumentException('Roman numeral contains surrounding whitespace');
        }

        // Ensure only valid characters
        if (!preg_match('/^[IVXLCDM]+$/', $s)) {
            throw new \InvalidArgumentException('Invalid characters in Roman numeral');
        }

        // Build canonical map lazily
        if (empty(self::$canonicalMap)) {
            for ($i = 1; $i <= 3999; $i++) {
                self::$canonicalMap[self::toRoman($i)] = $i;
            }
        }

        if (!isset(self::$canonicalMap[$s])) {
            throw new \InvalidArgumentException('Non-canonical Roman numeral');
        }

        return self::$canonicalMap[$s];
    }

    public static function add(string $a, string $b): string
    {
        try {
            $valA = self::fromRoman($a);
            $valB = self::fromRoman($b);
        } catch (\InvalidArgumentException $e) {
            throw $e;
        }

        $sum = $valA + $valB;

        if ($sum < 1 || $sum > 3999) {
            throw new \InvalidArgumentException('Sum out of range');
        }

        return self::toRoman($sum);
    }
}
