<?php
final class RomanNumerals
{
    public static function toRoman(int $n): string
    {
        if ($n < 1 || $n > 3999) {
            throw new \InvalidArgumentException('Number must be between 1 and 3999');
        }
        $values = [
            1000 => 'M',
            900 => 'CM',
            500 => 'D',
            400 => 'CD',
            100 => 'C',
            90 => 'XC',
            50 => 'L',
            40 => 'XL',
            10 => 'X',
            9 => 'IX',
            5 => 'V',
            4 => 'IV',
            1 => 'I',
        ];
        $result = '';
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
            throw new \InvalidArgumentException('Empty string');
        }
        // Validate canonical form using a regex that matches only proper Roman numerals 1-3999
        if (!preg_match('/^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/', $s)) {
            throw new \InvalidArgumentException('Invalid Roman numeral');
        }
        $map = [
            'I' => 1,
            'V' => 5,
            'X' => 10,
            'L' => 50,
            'C' => 100,
            'D' => 500,
            'M' => 1000,
        ];
        $n = 0;
        $len = strlen($s);
        for ($i = 0; $i < $len; $i++) {
            $char = $s[$i];
            $curr = $map[$char] ?? null;
            if ($curr === null) {
                // Should not happen due to regex validation
                throw new \InvalidArgumentException('Invalid character');
            }
            if (isset($s[$i + 1])) {
                $next = $map[$s[$i + 1]];
                if ($curr < $next) {
                    $n -= $curr;
                    continue;
                }
            }
            $n += $curr;
        }
        if ($n < 1 || $n > 3999) {
            throw new \InvalidArgumentException('Out of range');
        }
        return $n;
    }

    public static function add(string $a, string $b): string
    {
        try {
            $valA = RomanNumerals::fromRoman($a);
            $valB = RomanNumerals::fromRoman($b);
        } catch (\InvalidArgumentException $e) {
            throw $e;
        }
        $sum = $valA + $valB;
        if ($sum < 1 || $sum > 3999) {
            throw new \InvalidArgumentException('Sum out of range');
        }
        return RomanNumerals::toRoman($sum);
    }
}
?>
