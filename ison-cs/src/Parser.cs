using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace IsonParser
{
    /// <summary>
    /// Main ISON parser.
    /// </summary>
    public sealed class Parser
    {
        private static readonly Regex IdentifierPattern =
            new Regex(@"^[a-zA-Z_][a-zA-Z0-9_-]*$", RegexOptions.Compiled);

        private readonly string[] _lines;
        private int _lineNum;
        private readonly Document _document;

        public Parser(string text)
        {
            // Normalize CRLF first: splitting on '\n' alone leaves a trailing
            // '\r' on every line, which ends up inside block names, field names
            // and values - so a file saved on Windows parses as different data
            // rather than failing.
            _lines = (text ?? string.Empty).Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
            _lineNum = 0;
            _document = new Document();
        }

        /// <summary>Parse the entire document.</summary>
        public Document Parse()
        {
            while (_lineNum < _lines.Length)
            {
                SkipEmptyAndComments();
                if (_lineNum >= _lines.Length) break;

                var block = ParseBlock();
                if (block != null)
                {
                    _document.Blocks.Add(block);
                }
            }

            return _document;
        }

        private string CurrentLine() => _lineNum < _lines.Length ? _lines[_lineNum] : string.Empty;

        private void SkipEmptyAndComments()
        {
            while (_lineNum < _lines.Length)
            {
                string line = CurrentLine().Trim();
                if (line.Length == 0 || line.StartsWith("#", StringComparison.Ordinal))
                {
                    _lineNum++;
                }
                else
                {
                    break;
                }
            }
        }

        private Block ParseBlock()
        {
            // --- Header ---
            string headerLine = CurrentLine().Trim();
            int dot = headerLine.IndexOf('.');
            if (dot < 0)
            {
                throw new IsonSyntaxException(
                    $"Invalid block header: '{headerLine}' (expected 'kind.name')",
                    _lineNum + 1, 0);
            }

            string kind = headerLine.Substring(0, dot);
            string name = headerLine.Substring(dot + 1);
            _lineNum++;

            // --- Fields ---
            SkipEmptyAndComments();
            if (_lineNum >= _lines.Length)
            {
                throw new IsonSyntaxException(
                    $"Block '{kind}.{name}' missing field definitions", _lineNum + 1, 0);
            }

            string fieldsLine = CurrentLine();
            var rawFields = new Tokenizer(fieldsLine, _lineNum + 1).Tokenize();
            _lineNum++;

            var fieldInfos = new List<FieldInfo>();
            var fields = new List<string>();
            foreach (string rawField in rawFields)
            {
                var fi = FieldInfo.Parse(rawField);
                fieldInfos.Add(fi);
                fields.Add(fi.Name);
            }

            // --- Data rows ---
            var rows = new List<Dictionary<string, object?>>();
            string? summary = null;

            while (_lineNum < _lines.Length)
            {
                string line = CurrentLine();
                string stripped = line.Trim();

                // Blank line terminates the block.
                if (stripped.Length == 0) break;

                // Comment lines inside the data section are skipped.
                if (stripped.StartsWith("#", StringComparison.Ordinal))
                {
                    _lineNum++;
                    continue;
                }

                // Summary separator.
                if (stripped.StartsWith("---", StringComparison.Ordinal))
                {
                    _lineNum++;
                    while (_lineNum < _lines.Length)
                    {
                        string summaryLine = CurrentLine().Trim();
                        if (summaryLine.Length > 0 && !summaryLine.StartsWith("#", StringComparison.Ordinal))
                        {
                            summary = summaryLine;
                            _lineNum++;
                            break;
                        }
                        if (summaryLine.Length == 0) break;
                        _lineNum++;
                    }
                    continue;
                }

                // A bare "kind.name" token starts a new block.
                if (stripped.IndexOf('.') >= 0 && CountWhitespaceSeparatedTokens(stripped) == 1)
                {
                    if (LooksLikeHeader(stripped)) break;
                }

                rows.Add(ParseDataRow(fields, line));
                _lineNum++;
            }

            return new Block(kind, name)
            {
                Fields = fields,
                Rows = rows,
                FieldInfos = fieldInfos,
                Summary = summary
            };
        }

        /// <summary>Equivalent of Python's len(s.split()) for whitespace splitting.</summary>
        private static int CountWhitespaceSeparatedTokens(string s)
        {
            int count = 0;
            bool inToken = false;
            foreach (char c in s)
            {
                if (char.IsWhiteSpace(c))
                {
                    inToken = false;
                }
                else if (!inToken)
                {
                    inToken = true;
                    count++;
                }
            }
            return count;
        }

        private static bool LooksLikeHeader(string line)
        {
            if (line.IndexOf('.') < 0) return false;
            string[] parts = line.Split('.');
            if (parts.Length != 2) return false;
            return IdentifierPattern.IsMatch(parts[0]) && IdentifierPattern.IsMatch(parts[1]);
        }

        private Dictionary<string, object?> ParseDataRow(List<string> fields, string line)
        {
            var tokens = new Tokenizer(line, _lineNum + 1).TokenizeWithFlags();

            var values = new List<object?>();
            foreach (var token in tokens)
            {
                values.Add(TypeInferrer.Infer(token.Value, token.WasQuoted));
            }

            int keep = StripInlineComment(tokens);
            int tokenCount = keep;
            if (values.Count > keep) values.RemoveRange(keep, values.Count - keep);

            CheckExtraTokens(tokens, tokenCount, fields.Count, _lineNum + 1);

            var row = new Dictionary<string, object?>(StringComparer.Ordinal);
            for (int i = 0; i < fields.Count; i++)
            {
                object? value = i < values.Count ? values[i] : null;
                string fieldName = fields[i];

                if (fieldName.IndexOf('.') >= 0)
                {
                    SetNestedValue(row, fieldName, value);
                }
                else
                {
                    row[fieldName] = value;
                }
            }

            return row;
        }

        /// <summary>
        /// Number of leading tokens that are data. An unquoted token starting
        /// with '#' begins an inline comment; it and everything after it are
        /// discarded. Quoted tokens are always data.
        /// </summary>
        private static int StripInlineComment(List<Token> tokens)
        {
            for (int i = 0; i < tokens.Count; i++)
            {
                if (!tokens[i].WasQuoted && tokens[i].Value.StartsWith("#", StringComparison.Ordinal))
                {
                    return i;
                }
            }
            return tokens.Count;
        }

        /// <summary>
        /// Reject rows carrying more values than declared fields rather than
        /// silently truncating them.
        /// </summary>
        private static void CheckExtraTokens(List<Token> tokens, int tokenCount,
                                             int fieldCount, int lineNum)
        {
            if (tokenCount <= fieldCount) return;
            throw new IsonSyntaxException(
                $"Row has {tokenCount} values but only {fieldCount} fields " +
                $"(extra value: '{tokens[fieldCount].Value}')",
                lineNum, 0);
        }

        private static void SetNestedValue(Dictionary<string, object?> obj, string path, object? value)
        {
            string[] parts = path.Split('.');
            var current = obj;

            for (int i = 0; i < parts.Length - 1; i++)
            {
                if (!current.TryGetValue(parts[i], out object? next) ||
                    next is not Dictionary<string, object?> nested)
                {
                    nested = new Dictionary<string, object?>(StringComparer.Ordinal);
                    current[parts[i]] = nested;
                }
                current = nested;
            }

            current[parts[parts.Length - 1]] = value;
        }
    }
}
