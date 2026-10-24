```php
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

    /**
     * Converts an integer between 1 and 3999 to a Roman numeral.
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
        // Validate characters, case, and empty string
        if ($s === '' || !preg_match('/^[IVXLCDM]+$/', $s)) {
            throw new \InvalidArgumentException("Invalid Roman numeral string.");
        }

        $charMap = [
            'I' => 1,
            'V' => 5,
            'X' => 10,
            'L' => 50,
            'C' => 100,
            'D' => 500,
            'M' => 1000,
        ];

        $total = 0;
        $len = strlen($s);

        for ($i = 0; $i < $len; $i++) {
            $currentVal = $charMap[$s[$i]];
            $nextVal = ($i + 1 < $len) ? $charMap[$s[$i + 1]] : 0;

            if ($nextVal > $currentVal) {
                $total += ($nextVal - $currentVal);
                $i++;
            } else {
                $total += $currentVal;
            }
        }

        /**
         * Canonicality check:
         * The input string must be exactly what toRoman(total) produces.
         * This ensures that non-canonical forms like "IIII", "VV", "IC", "IIV", etc.,
         * and numbers out of the 1..3999 range are rejected.
         */
        if (self::toRoman($total) !== $s) {
            throw new \InvalidArgumentException("Non-canonical Roman numeral.");
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

        // toRoman will throw \InvalidArgumentException if sum is > 3999
        return self::toRoman($sum);
    }
}
```