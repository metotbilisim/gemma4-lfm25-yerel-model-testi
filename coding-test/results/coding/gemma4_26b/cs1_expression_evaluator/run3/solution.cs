using System;
using System.Globalization;

namespace Bench
{
    public static class ExpressionEvaluator
    {
        public static double Evaluate(string expression)
        {
            if (string.IsNullOrWhiteSpace(expression))
            {
                throw new FormatException("Expression cannot be empty or whitespace.");
            }

            var lexer = new Lexer(expression);
            var parser = new Parser(lexer);
            double result = parser.ParseExpression();

            if (parser.PeekToken().Type != TokenType.EOF)
            {
                throw new FormatException("Unexpected tokens at the end of the expression.");
            }

            return result;
        }

        private enum TokenType
        {
            Number,
            Plus,
            Minus,
            Multiply,
            Divide,
            Power,
            LParen,
            RParen,
            EOF
        }

        private readonly struct Token
        {
            public readonly TokenType Type;
            public readonly double Value;

            public Token(TokenType type, double value = 0)
            {
                Type = type;
                Value = value;
            }
        }

        private class Lexer
        {
            private readonly string _input;
            private int _pos;

            public Lexer(string input)
            {
                _input = input;
                _pos = 0;
            }

            public Token NextToken()
            {
                while (_pos < _input.Length && char.IsWhiteSpace(_input[_pos]))
                {
                    _pos++;
                }

                if (_pos >= _input.Length)
                {
                    return new Token(TokenType.EOF);
                }

                char c = _input[_pos];

                if (char.IsDigit(c) || c == '.')
                {
                    int start = _pos;
                    while (_pos < _input.Length && (char.IsDigit(_input[_pos]) || _input[_pos] == '.'))
                    {
                        _pos++;
                    }

                    string s = _input.Substring(start, _pos - start);
                    if (!double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out double val))
                    {
                        throw new FormatException($"Malformed number: '{s}'");
                    }
                    return new Token(TokenType.Number, val);
                }

                _pos++;
                return c switch
                {
                    '+' => new Token(TokenType.Plus),
                    '-' => new Token(TokenType.Minus),
                    '*' => new Token(TokenType.Multiply),
                    '/' => new Token(TokenType.Divide),
                    '^' => new Token(TokenType.Power),
                    '(' => new Token(TokenType.LParen),
                    ')' => new Token(TokenType.RParen),
                    _ => throw new FormatException($"Unknown character: '{c}'")
                };
            }
        }

        private class Parser
        {
            private readonly Lexer _lexer;
            private Token _currentToken;

            public Parser(Lexer lexer)
            {
                _lexer = lexer;
                _currentToken = _lexer.NextToken();
            }

            public Token PeekToken() => _currentToken;

            private void Eat(TokenType type)
            {
                if (_currentToken.Type == type)
                {
                    _currentToken = _lexer.NextToken();
                }
                else
                {
                    throw new FormatException($"Expected {type} but found {_currentToken.Type}");
                }
            }

            // Expression -> Term { (+|-) Term }
            public double ParseExpression()
            {
                double left = ParseTerm();
                while (_currentToken.Type == TokenType.Plus || _currentToken.Type == TokenType.Minus)
                {
                    TokenType op = _currentToken.Type;
                    Eat(op);
                    double right = ParseTerm();
                    if (op == TokenType.Plus) left += right;
                    else left -= right;
                }
                return left;
            }

            // Term -> Unary { (*|/) Unary }
            private double ParseTerm()
            {
                double left = ParseUnary();
                while (_currentToken.Type == TokenType.Multiply || _currentToken.Type == TokenType.Divide)
                {
                    TokenType op = _currentToken.Type;
                    Eat(op);
                    double right = ParseUnary();
                    if (op == TokenType.Multiply)
                    {
                        left *= right;
                    }
                    else
                    {
                        if (right == 0) throw new DivideByZeroException();
                        left /= right;
                    }
                }
                return left;
            }

            // Unary -> (+|-) Unary | Power
            private double ParseUnary()
            {
                if (_currentToken.Type == TokenType.Plus)
                {
                    Eat(TokenType.Plus);
                    return ParseUnary();
                }
                if (_currentToken.Type == TokenType.Minus)
                {
                    Eat(TokenType.Minus);
                    return -ParseUnary();
                }
                return ParsePower();
            }

            // Power -> Primary [ ^ Unary ]
            // This structure ensures right-associativity and allows unary signs in exponents.
            private double ParsePower()
            {
                double left = ParsePrimary();
                if (_currentToken.Type == TokenType.Power)
                {
                    Eat(TokenType.Power);
                    double right = ParseUnary();
                    return Math.Pow(left, right);
                }
                return left;
            }

            // Primary -> Number | ( Expression )
            private double ParsePrimary()
            {
                if (_currentToken.Type == TokenType.Number)
                {
                    double val = _currentToken.Value;
                    Eat(TokenType.Number);
                    return val;
                }
                if (_currentToken.Type == TokenType.LParen)
                {
                    Eat(TokenType.LParen);
                    double val = ParseExpression();
                    Eat(TokenType.RParen);
                    return val;
                }

                throw new FormatException($"Unexpected token: {_currentToken.Type}");
            }
        }
    }
}
