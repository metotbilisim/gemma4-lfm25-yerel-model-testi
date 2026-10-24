```csharp
using System;
using System.Globalization;

namespace Bench
{
    public static class ExpressionEvaluator
    {
        private class Parser
        {
            private readonly string _input;
            private int _pos;

            public Parser(string input)
            {
                _input = input;
                _pos = 0;
            }

            private char Peek() => _pos < _input.Length ? _input[_pos] : '\0';

            private char Consume() => _input[_pos++];

            private void SkipWhitespace()
            {
                while (_pos < _input.Length && char.IsWhiteSpace(_input[_pos]))
                {
                    _pos++;
                }
            }

            public double Parse()
            {
                SkipWhitespace();
                if (_pos >= _input.Length)
                    throw new FormatException("Expression is empty.");

                double result = ParseExpression();
                SkipWhitespace();
                if (_pos < _input.Length)
                    throw new FormatException("Unexpected characters at end of expression.");
                return result;
            }

            // Expression -> Term { ('+' | '-') Term }
            private double ParseExpression()
            {
                double left = ParseTerm();
                SkipWhitespace();
                while (Peek() == '+' || Peek() == '-')
                {
                    char op = Consume();
                    double right = ParseTerm();
                    if (op == '+') left += right;
                    else left -= right;
                    SkipWhitespace();
                }
                return left;
            }

            // Term -> Unary { ('*' | '/') Unary }
            private double ParseTerm()
            {
                double left = ParseUnary();
                SkipWhitespace();
                while (Peek() == '*' || Peek() == '/')
                {
                    char op = Consume();
                    double right = ParseUnary();
                    if (op == '*')
                    {
                        left *= right;
                    }
                    else
                    {
                        if (right == 0) throw new DivideByZeroException();
                        left /= right;
                    }
                    SkipWhitespace();
                }
                return left;
            }

            // Unary -> ('+' | '-') Unary | Power
            private double ParseUnary()
            {
                SkipWhitespace();
                if (Peek() == '+' || Peek() == '-')
                {
                    char op = Consume();
                    double val = ParseUnary();
                    return op == '+' ? val : -val;
                }
                return ParsePower();
            }

            // Power -> Primary [ '^' Power ]
            private double ParsePower()
            {
                double left = ParsePrimary();
                SkipWhitespace();
                if (Peek() == '^')
                {
                    Consume(); // '^'
                    double right = ParsePower();
                    return Math.Pow(left, right);
                }
                return left;
            }

            // Primary -> Number | '(' Expression ')' | Unary
            private double ParsePrimary()
            {
                SkipWhitespace();
                char c = Peek();

                if (char.IsDigit(c) || c == '.')
                {
                    return ParseNumber();
                }
                else if (c == '(')
                {
                    Consume(); // '('
                    double val = ParseExpression();
                    SkipWhitespace();
                    if (Peek() != ')') throw new FormatException("Mismatched parentheses.");
                    Consume(); // ')'
                    return val;
                }
                else if (c == '+' || c == '-' || char.IsLetter(c))
                {
                    // This allows Unary to be part of Power (e.g., 2^-1)
                    // without creating an infinite loop, because Primary 
                    // eventually hits a Number or '(' via Unary -> Power -> Primary.
                    return ParseUnary();
                }
                else
                {
                    throw new FormatException($"Unexpected character: {c}");
                }
            }

            private double ParseNumber()
            {
                int start = _pos;
                bool hasDecimal = false;

                while (_pos < _input.Length && (char.IsDigit(_input[_pos]) || _input[_pos] == '.'))
                {
                    if (_input[_pos] == '.')
                    {
                        if (hasDecimal) throw new FormatException("Malformed number: multiple decimal points.");
                        hasDecimal = true;
                    }
                    _pos++;
                }

                string numStr = _input.Substring(start, _pos - start);
                if (!double.TryParse(numStr, NumberStyles.Any, CultureInfo.InvariantCulture, out double result))
                {
                    throw new FormatException($"Invalid number format: {numStr}");
                }
                return result;
            }
        }

        public static double Evaluate(string expression)
        {
            if (string.IsNullOrWhiteSpace(expression))
                throw new FormatException("Expression cannot be empty.");

            return new Parser(expression).Parse();
        }
    }
}
```