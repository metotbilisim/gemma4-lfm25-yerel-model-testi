using System;
using System.Collections.Generic;
using System.Globalization;

namespace Bench
{
    public static class ExpressionEvaluator
    {
        private enum TokenType
        {
            Number,
            BinaryOp,
            UnaryOp,
            LeftParen,
            RightParen
        }

        private struct Token
        {
            public TokenType Type;
            public double Value;
            public char Op;
        }

        public static double Evaluate(string expression)
        {
            if (string.IsNullOrWhiteSpace(expression))
                throw new FormatException("Expression is empty or whitespace.");

            List<Token> tokens = Tokenize(expression);
            return EvaluateRPN(tokens);
        }

        private static List<Token> Tokenize(string expression)
        {
            var tokens = new List<Token>();
            int i = 0;

            // Expected state tracking to validate syntax during tokenization
            // States: 0: Start/AfterUnary/AfterLeftParen, 1: AfterNumber/AfterRightParen, 2: AfterBinaryOp
            int state = 0; 

            while (i < expression.Length)
            {
                char c = expression[i];

                if (char.IsWhiteSpace(c))
                {
                    i++;
                    continue;
                }

                if (char.IsDigit(c) || c == '.')
                {
                    if (state != 0) throw new FormatException("Unexpected number.");
                    
                    int start = i;
                    bool hasDecimal = false;
                    while (i < expression.Length && (char.IsDigit(expression[i]) || expression[i] == '.'))
                    {
                        if (expression[i] == '.')
                        {
                            if (hasDecimal) throw new FormatException("Malformed number: multiple decimal points.");
                            hasDecimal = true;
                        }
                        i++;
                    }

                    string numStr = expression.Substring(start, i - start);
                    if (!double.TryParse(numStr, NumberStyles.Any, CultureInfo.InvariantCulture, out double val))
                        throw new FormatException("Invalid number format.");

                    tokens.Add(new Token { Type = TokenType.Number, Value = val });
                    state = 1;
                }
                else if (c == '(')
                {
                    if (state != 0) throw new FormatException("Unexpected parenthesis.");
                    tokens.Add(new Token { Type = TokenType.LeftParen });
                    i++;
                    state = 0;
                }
                else if (c == ')')
                {
                    if (state != 1) throw new FormatException("Unexpected parenthesis or missing operand.");
                    tokens.Add(new Token { Type = TokenType.RightParen });
                    i++;
                    state = 1;
                }
                else if (c == '+' || c == '-' || c == '*' || c == '/' || c == '^')
                {
                    if (c == '+' || c == '-')
                    {
                        if (state == 0) // Unary
                        {
                            tokens.Add(new Token { Type = TokenType.UnaryOp, Op = c });
                            i++;
                            state = 0;
                        }
                        else if (state == 1) // Binary
                        {
                            tokens.Add(new Token { Type = TokenType.BinaryOp, Op = c });
                            i++;
                            state = 2;
                        }
                        else // state 2 (AfterBinaryOp)
                        {
                            // In state 2, we expect a number, unary, or (
                            // But if it's + or -, it's a unary operator.
                            tokens.Add(new Token { Type = TokenType.UnaryOp, Op = c });
                            i++;
                            state = 0;
                        }
                    }
                    else // *, /, ^ (Binary only)
                    {
                        if (state != 1) throw new FormatException("Expected operand before operator.");
                        tokens.Add(new Token { Type = TokenType.BinaryOp, Op = c });
                        i++;
                        state = 2;
                    }
                }
                else
                {
                    throw new FormatException($"Unknown character: {c}");
                }
            }

            if (state != 1) throw new FormatException("Expression ended prematurely.");

            return tokens;
        }

        private static double EvaluateRPN(List<Token> tokens)
        {
            var values = new Stack<double>();
            var operators = new Stack<Token>();

            foreach (var token in tokens)
            {
                switch (token.Type)
                {
                    case TokenType.Number:
                        values.Push(token.Value);
                        break;

                    case TokenType.LeftParen:
                        operators.Push(token);
                        break;

                    case TokenType.RightParen:
                        while (operators.Count > 0 && operators.Peek().Type != TokenType.LeftParen)
                        {
                            ApplyOperator(operators.Pop(), values);
                        }
                        if (operators.Count == 0) throw new FormatException("Mismatched parentheses.");
                        operators.Pop(); // Pop '('
                        break;

                    case TokenType.UnaryOp:
                        // Unary operators are right-associative and do not pop binary operators in this specific precedence model
                        operators.Push(token);
                        break;

                    case TokenType.BinaryOp:
                        while (operators.Count > 0 && operators.Peek().Type != TokenType.LeftParen)
                        {
                            var top = operators.Peek();
                            if (top.Type == TokenType.UnaryOp) break; // Unary is weaker than ^ but we handle it via the "never pop" rule

                            int precTop = GetPrecedence(top.Op);
                            int precNew = GetPrecedence(token.Op);

                            if (precTop > precNew || (precTop == precNew && IsLeftAssociative(token.Op)))
                            {
                                ApplyOperator(operators.Pop(), values);
                            }
                            else
                            {
                                break;
                            }
                        }
                        operators.Push(token);
                        break;
                }
            }

            while (operators.Count > 0)
            {
                var op = operators.Pop();
                if (op.Type == TokenType.LeftParen) throw new FormatException("Mismatched parentheses.");
                ApplyOperator(op, values);
            }

            if (values.Count != 1) throw new FormatException("Invalid expression structure.");
            return values.Pop();
        }

        private static void ApplyOperator(Token op, Stack<double> values)
        {
            if (op.Type == TokenType.UnaryOp)
            {
                if (values.Count < 1) throw new FormatException("Missing operand for unary operator.");
                double val = values.Pop();
                values.Push(op.Op == '-' ? -val : val);
            }
            else if (op.Type == TokenType.BinaryOp)
            {
                if (values.Count < 2) throw new FormatException("Missing operand for binary operator.");
                double right = values.Pop();
                double left = values.Pop();

                switch (op.Op)
                {
                    case '+': values.Push(left + right); break;
                    case '-': values.Push(left - right); break;
                    case '*': values.Push(left * right); break;
                    case '/':
                        if (right == 0) throw new DivideByZeroException();
                        values.Push(left / right);
                        break;
                    case '^': values.Push(Math.Pow(left, right)); break;
                    default: throw new FormatException("Unknown operator.");
                }
            }
        }

        private static int GetPrecedence(char op)
        {
            return op switch
            {
                '^' => 4,
                '+' or '-' when IsUnary(op) => 3, // This is handled by the "never pop" logic in the loop
                '*' or '/' => 2,
                '+' or '-' => 1,
                _ => 0
            };
        }

        private static bool IsUnary(char op) => false; // Logic handled by TokenType

        private static bool IsLeftAssociative(char op) => op == '*' || op == '/' || op == '+' || op == '-';
    }
}
