

```csharp
using System;
using System.Collections.Generic;
using System.Globalization;

namespace Bench
{
    public static class ExpressionEvaluator
    {
        /// <summary>
        /// Evaluates a simple arithmetic expression containing numbers,
        /// binary operators (+, -, *, /, ^), parentheses and unary plus/minus.
        /// The evaluation follows the precedence rules:
        ///   ^  (highest)
        ///   unary +/-
        ///   * /
        ///   + -
        /// Whitespace is ignored. Numbers are parsed with invariant culture.
        /// </summary>
        public static double Evaluate(string expression)
        {
            if (string.IsNullOrWhiteSpace(expression))
                throw new FormatException("Empty or whitespace-only expression");

            // ---------- Tokenization ----------
            List<Token> tokens = new List<Token>();
            int i = 0;
            int n = expression.Length;
            while (i < n)
            {
                char c = expression[i];
                if (char.IsWhiteSpace(c))
                {
                    i++;
                    continue;
                }

                // Numbers (integer or decimal, e.g. "3.14", ".5")
                if (char.IsDigit(c) || c == '.')
                {
                    int start = i;
                    bool dotSeen = false;
                    while (i < n)
                    {
                        char ch = expression[i];
                        if (char.IsDigit(ch))
                        {
                            i++;
                        }
                        else if (ch == '.')
                        {
                            if (dotSeen) break;
                            dotSeen = true;
                            i++;
                        }
                        else break;
                    }
                    string numStr = expression.Substring(start, i - start);
                    if (string.IsNullOrEmpty(numStr) || numStr == ".")
                        throw new FormatException("Invalid number format");
                    try
                    {
                        double value = double.Parse(numStr, CultureInfo.InvariantCulture);
                        tokens.Add(new Token(TokenType.Number, value));
                    }
                    catch (FormatException)
                    {
                        throw new FormatException("Invalid number format");
                    }
                    continue;
                }

                // Operators and parentheses
                switch (c)
                {
                    case '+':
                        tokens.Add(new Token(TokenType.Plus, null));
                        i++;
                        break;
                    case '-':
                        tokens.Add(new Token(TokenType.Minus, null));
                        i++;
                        break;
                    case '*':
                        tokens.Add(new Token(TokenType.Multiply, null));
                        i++;
                        break;
                    case '/':
                        tokens.Add(new Token(TokenType.Divide, null));
                        i++;
                        break;
                    case '^':
                        tokens.Add(new Token(TokenType.Power, null));
                        i++;
                        break;
                    case '(':
                        tokens.Add(new Token(TokenType.LeftParen, null));
                        i++;
                        break;
                    case ')':
                        tokens.Add(new Token(TokenType.RightParen, null));
                        i++;
                        break;
                    default:
                        throw new FormatException($"Unknown character '{c}'");
                }
            }

            // ---------- Parentheses balance check ----------
            int parenCount = 0;
            foreach (var t in tokens)
            {
                if (t.type == TokenType.LeftParen) parenCount++;
                else if (t.type == TokenType.RightParen) parenCount--;
                if (parenCount < 0) throw new FormatException("Mismatched parentheses");
            }
            if (parenCount != 0) throw new FormatException("Mismatched parentheses");

            // ---------- Parsing & evaluation ----------
            Parser parser = new Parser(tokens);
            try
            {
                double result = parser.ParseExpression();
                if (parser.pos != parser.tokens.Count)
                    throw new FormatException("Unexpected tokens after valid expression");
                return result;
            }
            catch (DivideByZeroException)
            {
                // Re‑throw the specific exception required by the spec
                throw;
            }
        }
    }

    // ---------- Token definitions ----------
    enum TokenType
    {
        Number,
        Plus,
        Minus,
        Multiply,
        Divide,
        Power,
        LeftParen,
        RightParen
    }

    class Token
    {
        public TokenType type;
        public double value;
        public Token(TokenType type, double value)
        {
            this.type = type;
            this.value = value;
        }
    }

    // ---------- Recursive‑descent parser ----------
    class Parser
    {
        List<Token> tokens;
        int pos;

        public Parser(List<Token> tokens)
        {
            this.tokens = tokens;
            pos = 0;
        }

        private Token Peek()
        {
            if (pos >= tokens.Count) return null;
            return tokens[pos];
        }

        private void Consume()
        {
            if (pos < tokens.Count) pos++;
        }

        private bool IsType(TokenType type)
        {
            if (pos >= tokens.Count) return false;
            return tokens[pos].type == type;
        }

        /// <summary>
        /// Parses an expression according to the required precedence and associativity.
        /// Handles leading unary +/-
        /// </summary>
        public double ParseExpression()
        {
            // Leading unary operators
            double result = 0;
            int sign = 1;

            if (IsType(TokenType.Plus) || IsType(TokenType.Minus))
            {
                while (pos < tokens.Count && (IsType(TokenType.Plus) || IsType(TokenType.Minus)))
                {
                    if (tokens[pos].type == TokenType.Minus)
                        sign *= -1;
                    Consume();
                }
                result = sign * ParseTerm();
            }
            else
            {
                result = ParseTerm();
            }

            // Binary operators + and -
            while (true)
            {
                if (IsType(TokenType.Plus))
                {
                    Consume();
                    double rhs = ParseTerm();
                    result += rhs;
                }
                else if (IsType(TokenType.Minus))
                {
                    Consume();
                    double rhs = ParseTerm();
                    result -= rhs;
                }
                else
                    break;
            }

            return result;
        }

        public double ParseTerm()
        {
            // * and / have the same precedence, left‑associative
            double result = ParsePower();
            while (true)
            {
                if (IsType(TokenType.Multiply))
                {
                    Consume();
                    double rhs = ParsePower();
                    result *= rhs;
                }
                else if (IsType(TokenType.Divide))
                {
                    Consume();
                    double rhs = ParsePower();
                    if (rhs == 0)
                        throw new DivideByZeroException();
                    result /= rhs;
                }
                else
                    break;
            }
            return result;
        }

        public double ParsePower()
        {
            // ^ has the highest precedence and is right‑associative
            double left = ParseFactor();
            if (IsType(TokenType.Power))
            {
                Consume(); // consume '^'
                double right = ParsePower(); // right‑associative recursion
                return Math.Pow(left, right);
            }
            else
            {
                return left;
            }
        }

        public double ParseFactor()
        {
            // Unary + and - have lower precedence than exponent but are handled here
            int sign = 1;
            while (pos < tokens.Count && (IsType(TokenType.Plus) || IsType(TokenType.Minus)))
            {
                if (tokens[pos].type == TokenType.Minus)
                    sign *= -1;
                Consume();
            }

            if (pos >= tokens.Count)
                throw new FormatException("Missing operand");

            Token cur = tokens[pos];
            if (cur.type == TokenType.Number)
            {
                double value = cur.value;
                Consume();
                return sign * value;
            }
            else if (cur.type == TokenType.LeftParen)
            {
                Consume(); // '('
                double inside = ParseExpression();
                if (pos >= tokens.Count || !IsType(TokenType.RightParen))
                    throw new FormatException("Mismatched parentheses");
                Consume(); // ')'
                return inside;
            }
            else
            {
                throw new FormatException("Unexpected token in factor");
            }
        }
    }
}
```