<?php

final class RomanNumerals
{
    /**
     * Converts an integer between 1 and 3999 to a Roman numeral.
     *
     * @param int $n
     * @return string
     * @throws \InvalidArgumentException if $n is out of the range 1..3999.
     */
    public static function toRoman(int $n): string
    {
        if ($n < 1 || $n > 3999) {
            throw new \InvalidArgumentException("Number must be between 1 and 3999.");
        }

        $map = [
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

        $result = '';
        foreach ($map as $roman => $value) {
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
     * @throws \InvalidArgumentException if the string is not a canonical Roman numeral.
     */
    public static function fromRoman(string $s): int
    {
        // Validate characters, case, and empty string via regex.
        // This handles empty strings, lowercase, whitespace, and invalid characters.
        if (!preg_match('/^[IVXLCDM]+$/', $s)) {
            throw new \InvalidArgumentException("Invalid Roman numeral string.");
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

        $total = 0;
        $len = strlen($s);

        for ($i = 0; $i < $len; $i++) {
            $current = $map[$s[$i]];
            $next = ($i + 1 < $len) ? $map[$s[$i + 1]] : 0;

            if ($current < $next) {
                $total -= $current;
            } else {
                $total += $current;
            }
        }

        // To ensure the numeral is canonical (e.g., rejecting "IIII" or "IC"),
        // we convert the resulting integer back to Roman and compare it to the input.
        // This also implicitly handles numbers out of the 1..3999 range via toRoman.
        if (self::toRoman($total) !== $s) {
            throw new \InvalidArgumentException("Non-canonical Roman numeral provided.");
        }

        return $total;
    }

    /**
     * Adds two Roman numerals and returns the result as a Roman numeral.
     *
     * @param string $a
     * @param string $b
     * @return string
     * @throws \InvalidArgumentException if inputs are invalid or the sum is out of range.
     */
    public static function add(string $a, string $b): string
    {
        $valA = self::fromRoman($a);
        $valB = self::fromRoman($b);

        return self::toRoman($valA + $valB);
    }
}
