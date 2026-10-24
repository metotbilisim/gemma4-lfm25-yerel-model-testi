<?php

final class RomanNumerals
{
    private const MAP = [
        'M' => 1000,
        'CM' => 900,
        'D' => 500,
        'CD' => 400,
        'C' => 100,
        'XC' => 90,
        'L' => 50,
        'XL' => 40,
        'X' => 10,
        'IX' => 9,
        'V' => 5,
        'IV' => 4,
        'I' => 1,
    ];

    private const REVERSE_MAP = [
        'I' => 1,
        'V' => 5,
        'X' => 10,
        'L' => 50,
        'C' => 100,
        'D' => 500,
        'M' => 1000,
    ];

    /**
     * Converts an integer from 1 to 3999 to a Roman numeral.
     *
     * @param int $n
     * @return string
     * @throws \InvalidArgumentException
     */
    public static function toRoman(int $n): string
    {
        if ($n < 1 || $n > 3999) {
            throw new \InvalidArgumentException("Number must be between 1 and 3999.");
        }

        $result = '';
        foreach (self::MAP as $roman => $value) {
            while ($n >= $value) {
                $result .= $roman;
                $n -= $value;
            }
        }

        return $result;
    }

    /**
     * Converts a canonical Roman numeral string back to an integer.
     *
     * @param string $s
     * @return int
     * @throws \InvalidArgumentException
     */
    public static function fromRoman(string $s): int
    {
        // Regex validates canonical Roman numerals (1-3999) strictly:
        // ^(?=[MDCLXVI]) ensures the string is not empty and contains valid characters.
        // M{0,3} - Thousands (0 to 3000)
        // (CM|CD|D?C{0,3}) - Hundreds (900, 400, or 0-300/500-800)
        // (XC|XL|L?X{0,3}) - Tens (90, 40, or 0-30/50-80)
        // (IX|IV|V?I{0,3}) - Ones (9, 4, or 0-3/5-8)
        $pattern = '/^(?=[MDCLXVI])M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/';

        if (!preg_match($pattern, $s)) {
            throw new \InvalidArgumentException("Invalid or non-canonical Roman numeral.");
        }

        $total = 0;
        $length = strlen($s);
        for ($i = 0; $i < $length; $i++) {
            $currentVal = self::REVERSE_MAP[$s[$i]];
            $nextVal = ($i + 1 < $length) ? self::REVERSE_MAP[$s[$i + 1]] : 0;

            if ($currentVal < $nextVal) {
                $total -= $currentVal;
            } else {
                $total += $currentVal;
            }
        }

        return $total;
    }

    /**
     * Adds two Roman numerals and returns the result as a Roman numeral.
     *
     * @param string $a
     * @param string $b
     * @return string
     * @throws \InvalidArgumentException
     */
    public static function add(string $a, string $b): string
    {
        $valA = self::fromRoman($a);
        $valB = self::fromRoman($b);
        $sum = $valA + $valB;

        // toRoman will throw InvalidArgumentException if sum is out of 1..3999 range
        return self::toRoman($sum);
    }
}
