using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace IsonParser
{
    /// <summary>
    /// A single token together with whether it was quoted in the source.
    /// Quoting matters: a quoted token is always a string and is never
    /// treated as an inline comment.
    /// </summary>
    public readonly struct Token
    {
        public string Value { get; }
        public bool WasQuoted { get; }

        public Token(string value, bool wasQuoted)
        {
            Value = value;
            WasQuoted = wasQuoted;
        }
    }

    /// <summary>
    /// Tokenizes a single line into ISON values.
    /// </summary>
    public sealed class Tokenizer
    {
        private readonly string _line;
        private readonly int _lineNum;
        private int _pos;

        public Tokenizer(string line, int lineNum = 0)
        {
            _line = line ?? string.Empty;
            _lineNum = lineNum;
            _pos = 0;
        }

        /// <summary>Tokenize into values only, discarding quoting information.</summary>
        public List<string> Tokenize()
        {
            var result = new List<string>();
            foreach (var t in TokenizeWithFlags())
            {
                result.Add(t.Value);
            }
            return result;
        }

        /// <summary>
        /// Tokenize into values plus their quoted flags.
        /// </summary>
        public List<Token> TokenizeWithFlags()
        {
            var tokens = new List<Token>();
            _pos = 0;

            while (_pos < _line.Length)
            {
                SkipWhitespace();
                if (_pos >= _line.Length) break;

                if (_line[_pos] == '"')
                {
                    tokens.Add(new Token(ReadQuotedString(), true));
                }
                else
                {
                    tokens.Add(new Token(ReadUnquotedToken(), false));
                }
            }

            return tokens;
        }

        private void SkipWhitespace()
        {
            while (_pos < _line.Length && (_line[_pos] == ' ' || _line[_pos] == '\t'))
            {
                _pos++;
            }
        }

        private string ReadQuotedString()
        {
            int startPos = _pos;
            _pos++; // skip opening quote
            var sb = new StringBuilder();

            while (_pos < _line.Length)
            {
                char c = _line[_pos];

                if (c == '"')
                {
                    _pos++; // skip closing quote
                    return sb.ToString();
                }

                if (c == '\\')
                {
                    _pos++;
                    if (_pos >= _line.Length)
                    {
                        throw new IsonSyntaxException(
                            "Unexpected end of line after backslash", _lineNum, _pos);
                    }

                    char esc = _line[_pos];
                    switch (esc)
                    {
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case 'n': sb.Append('\n'); break;
                        case 't': sb.Append('\t'); break;
                        case 'r': sb.Append('\r'); break;
                        case '|': sb.Append('|'); break;
                        default: sb.Append(esc); break; // unknown escape kept as-is
                    }
                }
                else
                {
                    sb.Append(c);
                }

                _pos++;
            }

            throw new IsonSyntaxException("Unterminated quoted string", _lineNum, startPos);
        }

        private string ReadUnquotedToken()
        {
            int start = _pos;
            while (_pos < _line.Length && _line[_pos] != ' ' && _line[_pos] != '\t')
            {
                _pos++;
            }
            return _line.Substring(start, _pos - start);
        }
    }

    /// <summary>
    /// Infers runtime types from ISON tokens according to the spec rules.
    /// </summary>
    public static class TypeInferrer
    {
        /// <summary>
        /// Infer the type of a token and return the typed value.
        ///
        /// Rules, in order:
        ///   1. quoted        -> string
        ///   2. true / false  -> bool
        ///   3. null          -> null
        ///   4. integer       -> long
        ///   5. float         -> double
        ///   6. leading ':'   -> Reference
        ///   7. otherwise     -> string
        /// </summary>
        public static object? Infer(string token, bool wasQuoted = false)
        {
            // Quoted strings are always strings.
            if (wasQuoted) return token;

            if (string.Equals(token, "true", StringComparison.Ordinal)) return true;
            if (string.Equals(token, "false", StringComparison.Ordinal)) return false;
            if (string.Equals(token, "null", StringComparison.Ordinal)) return null;

            if (IsIntegerLiteral(token))
            {
                if (long.TryParse(token, NumberStyles.AllowLeadingSign,
                                  CultureInfo.InvariantCulture, out long l))
                {
                    return l;
                }
                // Outside Int64 range: keep the literal text rather than lose precision.
                return token;
            }

            if (IsFloatLiteral(token))
            {
                if (double.TryParse(token, NumberStyles.Float,
                                    CultureInfo.InvariantCulture, out double d))
                {
                    return d;
                }
                return token;
            }

            if (token.Length > 1 && token[0] == ':')
            {
                string refValue = token.Substring(1);
                int idx = refValue.IndexOf(':');
                if (idx >= 0)
                {
                    return new Reference(refValue.Substring(idx + 1), refValue.Substring(0, idx));
                }
                return new Reference(refValue);
            }

            return token;
        }

        /// <summary>Matches the reference pattern ^-?[0-9]+$.</summary>
        private static bool IsIntegerLiteral(string s)
        {
            if (s.Length == 0) return false;
            int i = (s[0] == '-') ? 1 : 0;
            if (i >= s.Length) return false;
            for (; i < s.Length; i++)
            {
                if (s[i] < '0' || s[i] > '9') return false;
            }
            return true;
        }

        /// <summary>Matches the reference pattern ^-?[0-9]+\.[0-9]+$.</summary>
        private static bool IsFloatLiteral(string s)
        {
            int i = (s.Length > 0 && s[0] == '-') ? 1 : 0;
            int digitsBefore = 0;
            while (i < s.Length && s[i] >= '0' && s[i] <= '9') { i++; digitsBefore++; }
            if (digitsBefore == 0) return false;
            if (i >= s.Length || s[i] != '.') return false;
            i++;
            int digitsAfter = 0;
            while (i < s.Length && s[i] >= '0' && s[i] <= '9') { i++; digitsAfter++; }
            return digitsAfter > 0 && i == s.Length;
        }
    }
}
