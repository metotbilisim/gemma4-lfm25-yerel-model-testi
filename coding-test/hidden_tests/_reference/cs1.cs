using System.Globalization;

namespace Bench;

public static class ExpressionEvaluator
{
    public static double Evaluate(string expression)
    {
        if (expression == null || string.IsNullOrWhiteSpace(expression)) throw new FormatException("empty");
        var p = new Parser(expression);
        var v = p.ParseExpr();
        p.SkipWs();
        if (p.Pos != expression.Length) throw new FormatException("unexpected " + expression[p.Pos]);
        return v;
    }

    private sealed class Parser(string s)
    {
        public int Pos;
        public void SkipWs() { while (Pos < s.Length && char.IsWhiteSpace(s[Pos])) Pos++; }
        char Peek() { SkipWs(); return Pos < s.Length ? s[Pos] : '\0'; }

        public double ParseExpr()
        {
            var v = ParseTerm();
            while (true)
            {
                var c = Peek();
                if (c == '+') { Pos++; v += ParseTerm(); }
                else if (c == '-') { Pos++; v -= ParseTerm(); }
                else return v;
            }
        }

        double ParseTerm()
        {
            var v = ParseUnary();
            while (true)
            {
                var c = Peek();
                if (c == '*') { Pos++; v *= ParseUnary(); }
                else if (c == '/') { Pos++; var d = ParseUnary(); if (d == 0) throw new DivideByZeroException(); v /= d; }
                else return v;
            }
        }

        double ParseUnary()
        {
            var c = Peek();
            if (c == '-') { Pos++; return -ParseUnary(); }
            if (c == '+') { Pos++; return ParseUnary(); }
            return ParsePower();
        }

        double ParsePower()
        {
            var b = ParsePrimary();
            if (Peek() == '^') { Pos++; return Math.Pow(b, ParseUnary()); }
            return b;
        }

        double ParsePrimary()
        {
            var c = Peek();
            if (c == '(')
            {
                Pos++;
                var v = ParseExpr();
                if (Peek() != ')') throw new FormatException("missing )");
                Pos++;
                return v;
            }
            if (char.IsDigit(c) || c == '.')
            {
                int start = Pos; bool dot = false;
                while (Pos < s.Length && (char.IsDigit(s[Pos]) || s[Pos] == '.'))
                {
                    if (s[Pos] == '.') { if (dot) throw new FormatException("bad number"); dot = true; }
                    Pos++;
                }
                var t = s[start..Pos];
                if (t == ".") throw new FormatException("bad number");
                return double.Parse(t, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture);
            }
            throw new FormatException("unexpected token");
        }
    }
}
