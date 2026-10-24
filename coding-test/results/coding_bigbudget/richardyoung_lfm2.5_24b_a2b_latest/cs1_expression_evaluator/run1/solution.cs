using System;
using System.Collections.Generic;
using System.Globalization;

namespace Bench
{
    public static class ExpressionEvaluator
    {
        /// <summary>
        /// Evaluates a simple arithmetic expression containing numbers, binary operators + - * / ^,
        /// parentheses and unary plus/minus. Whitespace is ignored.
        /// </summary>
        /// <param name="expression">The expression to evaluate.</param>
        /// <returns>The numeric result of the evaluation.</returns>
        /// <throws>FormatException for invalid input, DivideByZeroException on division by zero.</throws>
        public static double Evaluate(string expression)
        {
            if (string.IsNullOrWhiteSpace(expression))
                throw new FormatException("Empty or whitespace-only expression");

            List<Token> tokens = Tokenize(expression);

            // Check parentheses balance
            int parenCount = 0;
            foreach (var t in tokens)
            {
                if (t.Type == TokenType.LParen)
                    parenCount++;
                else if (t.Type == TokenType.RParen)
                {
                    parenCount--;
                    if (parenCount < 0)
                        throw new FormatException("Mismatched parentheses");
                }
            }
            if (parenCount != 0)
                throw new FormatException("Mismatched parentheses");

            if (tokens.Count == 0)
                throw new FormatException("Empty expression");

            List<object> rpn = ToRPN(tokens);
            return EvalRPN(rpn);
        }

        // --------------------------------------------------------------------
        // Token definitions
        // --------------------------------------------------------------------
        private enum TokenType
        {
            Number,
            LParen,
            RParen,
            Plus,
            Minus,
            Mul,
            Div,
            Pow,
            UnaryPlus,
            UnaryMinus
        }

        private class Token
        {
            public TokenType Type;
            public double Value; // for numbers
            public char Op;      // for operators

            public Token(TokenType type, double value = 0, char op = '\0')
            {
                Type = type;
                Value = value;
                Op = op;
            }
        }

        // --------------------------------------------------------------------
        // Tokenisation
        // --------------------------------------------------------------------
        private static List<Token> Tokenize(string expr)
        {
            var tokens = new List<Token>();
            int i = 0;
            int n = expr.Length;

            while (i < n)
            {
                char c = expr[i];

                if (char.IsWhiteSpace(c))
                {
                    i++;
                    continue;
                }

                // Number (integer or decimal)
                if (char.IsDigit(c) || c == '.')
                {
                    int start = i;
                    while (i < n && (char.IsDigit(expr[i]) || expr[i] == '.'))
                        i++;
                    string numStr = expr.Substring(start, i - start);

                    double val;
                    try
                    {
                        // Culture‑invariant parsing: '.' is always the decimal separator
                        val = double.Parse(numStr, NumberStyles.Float, CultureInfo.InvariantCulture);
                    }
                    catch (FormatException)
                    {
                        throw new FormatException($"Invalid number format: {numStr}");
                    }

                    tokens.Add(new Token(TokenType.Number, val));
                }
                else if (c == '(' || c == ')')
                {
                    TokenType type = (c == '(') ? TokenType.LParen : TokenType.RParen;
                    tokens.Add(new Token(type));
                    i++;
                }
                else if (c == '+' || c == '-' || c == '*' || c == '/' || c == '^')
                {
                    // Decide whether the operator is unary or binary
                    bool isUnary = false;
                    if (tokens.Count == 0)
                    {
                        isUnary = true;
                    }
                    else
                    {
                        TokenType prev = tokens[tokens.Count - 1].Type;
                        if (prev == TokenType.LParen ||
                            prev == TokenType.Plus ||
                            prev == TokenType.Minus ||
                            prev == TokenType.Mul ||
                            prev == TokenType.Div ||
                            prev == TokenType.Pow)
                        {
                            isUnary = true;
                        }
                    }

                    if (isUnary)
                    {
                        if (c == '+')
                        {
                            tokens.Add(new Token(TokenType.UnaryPlus, 0, '+'));
                        }
                        else if (c == '-')
                        {
                            tokens.Add(new Token(TokenType.UnaryMinus, 0, '-'));
                        }
                        else
                        {
                            throw new FormatException($"Invalid unary operator '{c}'");
                        }
                    }
                    else
                    {
                        TokenType binOp = c == '+' ? TokenType.Plus :
                                        c == '-' ? TokenType.Minus :
                                        c == '*' ? TokenType.Mul :
                                        c == '/' ? TokenType.Div : TokenType.Pow;
                        tokens.Add(new Token(binOp, 0, c));
                    }
                    i++;
                }
                else
                {
                    throw new FormatException($"Unknown character '{c}'");
                }
            }

            return tokens;
        }

        // --------------------------------------------------------------------
        // Shunting‑yard algorithm (infix → RPN)
        // --------------------------------------------------------------------
        private static List<object> ToRPN(List<Token> tokens)
        {
            // Precedence table
            var prec = new Dictionary<TokenType, int>
            {
                {TokenType.Pow, 4},
                {TokenType.Mul, 3},
                {TokenType.Div, 3},
                {TokenType.Plus, 2},
                {TokenType.Minus, 2},
                {TokenType.UnaryPlus, 1},
                {TokenType.UnaryMinus, 1}
            };

            Stack<Token> opStack = new Stack<Token>();
            List<object> output = new List<object>();

            foreach (var token in tokens)
            {
                if (token.Type == TokenType.Number)
                {
                    output.Add(token);
                }
                else if (token.Type == TokenType.LParen)
                {
                    opStack.Push(token);
                }
                else if (token.Type == TokenType.RParen)
                {
                    while (opStack.Count > 0 && opStack.Peek().Type != TokenType.LParen)
                    {
                        output.Add(opStack.Pop());
                    }
                    if (opStack.Count == 0)
                        throw new FormatException("Mismatched parentheses");
                    opStack.Pop(); // remove '('
                }
                else // operator
                {
                    Token cur = token;
                    bool rightAssoc = (cur.Type == TokenType.Pow);

                    while (opStack.Count > 0)
                    {
                        Token top = opStack.Peek();
                        if (top.Type == TokenType.LParen) break;

                        int curPrec = prec[cur.Type];
                        int topPrec = prec[top.Type];

                        // For right‑associative '^' we pop only when topPrec > curPrec
                        bool condition = rightAssoc ? (topPrec > curPrec) : (topPrec >= curPrec);
                        if (!condition) break;

                        output.Add(opStack.Pop());
                    }

                    // Unary operators are pushed without popping anything
                    opStack.Push(cur);
                }
            }

            while (opStack.Count > 0)
            {
                Token top = opStack.Pop();
                if (top.Type == TokenType.LParen)
                    throw new FormatException("Mismatched parentheses");
                output.Add(top);
            }

            return output;
        }

        // --------------------------------------------------------------------
        // RPN evaluation
        // --------------------------------------------------------------------
        private static double EvalRPN(List<object> rpn)
        {
            Stack<double> evalStack = new Stack<double>();

            foreach (var item in rpn)
            {
                if (item is Token t)
                {
                    switch (t.Type)
                    {
                        case TokenType.Number:
                            evalStack.Push(t.Value);
                            break;

                        case TokenType.Plus:
                        case TokenType.Minus:
                        case TokenType.Mul:
                        case TokenType.Div:
                        case TokenType.Pow:
                            if (evalStack.Count < 2)
                                throw new FormatException("Insufficient operands");
                            double b = evalStack.Pop();
                            double a = evalStack.Pop();
                            switch (t.Type)
                            {
                                case TokenType.Plus:
                                    evalStack.Push(a + b);
                                    break;
                                case TokenType.Minus:
                                    evalStack.Push(a - b);
                                    break;
                                case TokenType.Mul:
                                    evalStack.Push(a * b);
                                    break;
                                case TokenType.Div:
                                    if (b == 0)
                                        throw new DivideByZeroException();
                                    evalStack.Push(a / b);
                                    break;
                                case TokenType.Pow:
                                    evalStack.Push(Math.Pow(a, b));
                                    break;
                            }
                            break;

                        case TokenType.UnaryPlus:
                            // No effect
                            double v = evalStack.Pop();
                            evalStack.Push(v);
                            break;

                        case TokenType.UnaryMinus:
                            double neg = evalStack.Pop();
                            evalStack.Push(-neg);
                            break;

                        default:
                            throw new FormatException("Unknown token in RPN");
                    }
                }
                else
                {
                    throw new FormatException("Invalid RPN element");
                }
            }

            if (evalStack.Count != 1)
                throw new FormatException("Invalid expression");

            return evalStack.Pop();
        }
    }
}
