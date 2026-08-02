using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;

namespace IsonParser
{
    /// <summary>
    /// A single ISONL record (one line).
    /// </summary>
    public sealed class IsonlRecord
    {
        public string Kind { get; }
        public string Name { get; }
        public List<string> Fields { get; }
        public Dictionary<string, object?> Values { get; }
        public List<FieldInfo> FieldInfos { get; }

        public IsonlRecord(string kind, string name, List<string> fields,
                           Dictionary<string, object?> values,
                           List<FieldInfo>? fieldInfos = null)
        {
            Kind = kind;
            Name = name;
            Fields = fields;
            Values = values;
            FieldInfos = fieldInfos ?? new List<FieldInfo>();
        }

        /// <summary>Block identifier used for grouping records.</summary>
        public string ToBlockKey() => $"{Kind}.{Name}";

        public override string ToString() => $"IsonlRecord({Kind}.{Name}, {Values.Count} values)";
    }

    /// <summary>
    /// Parser for ISONL (ISON Lines): one record per line, shaped as
    /// kind.name|field1 field2|value1 value2
    /// </summary>
    public sealed class IsonlParser
    {
        /// <summary>
        /// Parse a single ISONL line. Returns null for blank lines and comments.
        /// </summary>
        public IsonlRecord? ParseLine(string line, int lineNum = 0)
        {
            line = (line ?? string.Empty).Trim();

            if (line.Length == 0 || line.StartsWith("#", StringComparison.Ordinal))
            {
                return null;
            }

            var sections = SplitByPipe(line);
            if (sections.Count != 3)
            {
                throw new IsonSyntaxException(
                    $"ISONL line must have exactly 3 pipe-separated sections, got {sections.Count}",
                    lineNum, 0);
            }

            string header = sections[0];
            string fieldsStr = sections[1];
            string valuesStr = sections[2];

            int dot = header.IndexOf('.');
            if (dot < 0)
            {
                throw new IsonSyntaxException(
                    $"Invalid ISONL header: '{header}' (expected 'kind.name')", lineNum, 0);
            }

            string kind = header.Substring(0, dot);
            string name = header.Substring(dot + 1);

            // Parse fields, including any type annotations. Without this an
            // annotated envelope written by another implementation would be
            // read as fields literally named "id:int", corrupting row keys.
            var rawFields = new Tokenizer(fieldsStr, lineNum).Tokenize();
            var fieldInfos = rawFields.Select(FieldInfo.Parse).ToList();
            var fields = fieldInfos.Select(fi => fi.Name).ToList();

            var valueTokens = new Tokenizer(valuesStr, lineNum).TokenizeWithFlags();

            var typedValues = valueTokens
                .Select(t => TypeInferrer.Infer(t.Value, t.WasQuoted))
                .ToList();

            // An unquoted token starting with '#' begins an inline comment.
            int keep = valueTokens.Count;
            for (int i = 0; i < valueTokens.Count; i++)
            {
                if (!valueTokens[i].WasQuoted &&
                    valueTokens[i].Value.StartsWith("#", StringComparison.Ordinal))
                {
                    keep = i;
                    break;
                }
            }

            if (keep > fields.Count)
            {
                throw new IsonSyntaxException(
                    $"Row has {keep} values but only {fields.Count} fields " +
                    $"(extra value: '{valueTokens[fields.Count].Value}')",
                    lineNum, 0);
            }

            var values = new Dictionary<string, object?>(StringComparer.Ordinal);
            for (int i = 0; i < fields.Count; i++)
            {
                values[fields[i]] = i < keep ? typedValues[i] : null;
            }

            return new IsonlRecord(kind, name, fields, values, fieldInfos);
        }

        /// <summary>
        /// Split a line on unquoted pipes. Escape pairs inside quotes are
        /// consumed whole, so a value ending in an escaped backslash cannot
        /// desync the quote tracking.
        /// </summary>
        private static List<string> SplitByPipe(string line)
        {
            var sections = new List<string>();
            var current = new StringBuilder();
            bool inQuotes = false;
            int i = 0;

            while (i < line.Length)
            {
                char c = line[i];

                if (inQuotes && c == '\\' && i + 1 < line.Length)
                {
                    current.Append(c).Append(line[i + 1]);
                    i += 2;
                    continue;
                }

                if (c == '"')
                {
                    inQuotes = !inQuotes;
                    current.Append(c);
                }
                else if (c == '|' && !inQuotes)
                {
                    sections.Add(current.ToString().Trim());
                    current.Clear();
                }
                else
                {
                    current.Append(c);
                }

                i++;
            }

            sections.Add(current.ToString().Trim());
            return sections;
        }

        /// <summary>Parse multiple ISONL lines from a string.</summary>
        public List<IsonlRecord> ParseString(string text)
        {
            var records = new List<IsonlRecord>();
            string[] lines = (text ?? string.Empty).Split('\n');

            for (int i = 0; i < lines.Length; i++)
            {
                var record = ParseLine(lines[i], i + 1);
                if (record != null) records.Add(record);
            }

            return records;
        }

        /// <summary>Parse an ISONL string into a Document, grouping records by block.</summary>
        public Document ParseToDocument(string text) => RecordsToDocument(ParseString(text));

        /// <summary>Stream records from a reader, one line at a time.</summary>
        public IEnumerable<IsonlRecord> Stream(TextReader reader)
        {
            int lineNum = 0;
            string? line;
            while ((line = reader.ReadLine()) != null)
            {
                lineNum++;
                var record = ParseLine(line, lineNum);
                if (record != null) yield return record;
            }
        }

        private static Document RecordsToDocument(List<IsonlRecord> records)
        {
            var order = new List<string>();
            var grouped = new Dictionary<string, List<IsonlRecord>>(StringComparer.Ordinal);

            foreach (var record in records)
            {
                string key = record.ToBlockKey();
                if (!grouped.TryGetValue(key, out var list))
                {
                    list = new List<IsonlRecord>();
                    grouped[key] = list;
                    order.Add(key);
                }
                list.Add(record);
            }

            var doc = new Document();
            foreach (string key in order)
            {
                var recs = grouped[key];
                int dot = key.IndexOf('.');
                string kind = key.Substring(0, dot);
                string name = key.Substring(dot + 1);

                doc.Blocks.Add(new Block(kind, name)
                {
                    Fields = recs[0].Fields,
                    Rows = recs.Select(r => r.Values).ToList(),
                    FieldInfos = recs[0].FieldInfos
                });
            }

            return doc;
        }
    }

    /// <summary>
    /// Serializes documents to ISONL.
    /// </summary>
    public static class IsonlSerializer
    {
        // Characters that would corrupt the line structure if they appeared raw
        // in the envelope (kind, name, or field names).
        private const string EnvelopeForbidden = "|\"\\ \t\n\r";

        private static void ValidateEnvelope(Block block)
        {
            ValidateEnvelopePart("kind", block.Kind);
            ValidateEnvelopePart("name", block.Name);

            if (block.Kind.IndexOf('.') >= 0)
            {
                throw new IsonException($"ISONL block kind '{block.Kind}' must not contain '.'");
            }
            if (block.Kind.StartsWith("#", StringComparison.Ordinal))
            {
                throw new IsonException($"ISONL block kind '{block.Kind}' must not start with '#'");
            }

            foreach (string field in block.Fields)
            {
                if (string.IsNullOrEmpty(field))
                {
                    throw new IsonException("ISONL field names must be non-empty");
                }
                if (field.Any(c => EnvelopeForbidden.IndexOf(c) >= 0))
                {
                    throw new IsonException(
                        $"ISONL field name '{field}' contains characters that cannot be " +
                        "serialized (pipe, quote, backslash, or whitespace)");
                }
            }
        }

        private static void ValidateEnvelopePart(string label, string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                throw new IsonException($"ISONL block {label} must be non-empty");
            }
            if (value.Any(c => EnvelopeForbidden.IndexOf(c) >= 0))
            {
                throw new IsonException(
                    $"ISONL block {label} '{value}' contains characters that cannot be " +
                    "serialized (pipe, quote, backslash, or whitespace)");
            }
        }

        /// <summary>
        /// Build the ISONL field section, preserving type annotations.
        ///
        /// Dropping annotations makes an ISON -> ISONL -> ISON round trip lossy
        /// and diverges from the rest of the family.
        /// </summary>
        private static string FieldsHeader(Block block, List<string> fieldNames)
        {
            if (block.FieldInfos.Count == 0)
            {
                return string.Join(" ", fieldNames);
            }

            var parts = fieldNames.Select(name =>
            {
                var fi = block.FieldInfos.FirstOrDefault(
                    f => string.Equals(f.Name, name, StringComparison.Ordinal));
                return fi != null ? fi.ToFieldString() : name;
            });

            return string.Join(" ", parts);
        }

        /// <summary>Serialize a Document to ISONL, one line per row.</summary>
        public static string Dumps(Document doc)
        {
            var lines = new List<string>();

            foreach (var block in doc.Blocks)
            {
                ValidateEnvelope(block);
                string header = $"{block.Kind}.{block.Name}";
                string fieldsStr = FieldsHeader(block, block.Fields);

                foreach (var row in block.Rows)
                {
                    lines.Add(BuildLine(header, fieldsStr, block.Fields, row));
                }
            }

            return string.Join("\n", lines);
        }

        /// <summary>
        /// Serialize a Document to canonical ISONL: blocks sorted
        /// ordinal-string by "kind.name" and rows sorted ordinal-string by the
        /// first column's value.
        /// </summary>
        public static string DumpsCanonical(Document doc)
        {
            var lines = new List<string>();

            var sortedBlocks = doc.Blocks
                .OrderBy(b => $"{b.Kind}.{b.Name}", StringComparer.Ordinal)
                .ToList();

            foreach (var block in sortedBlocks)
            {
                ValidateEnvelope(block);
                string header = $"{block.Kind}.{block.Name}";

                // Canonical form normalizes field order here too, exactly as
                // canonical ISON does — otherwise a document built from an
                // unordered Dictionary emits whatever order iteration produced.
                var sortedFields = Serializer.SortFieldsCanonical(block.Fields);
                string fieldsStr = FieldsHeader(block, sortedFields);

                List<Dictionary<string, object?>> sortedRows;
                if (sortedFields.Count > 0)
                {
                    string keyField = sortedFields[0];
                    sortedRows = block.Rows
                        .OrderBy(r => r.TryGetValue(keyField, out var v) && v != null ? 0 : 1)
                        .ThenBy(r =>
                        {
                            r.TryGetValue(keyField, out var v);
                            return v == null ? string.Empty : Serializer.RowKeyToString(v);
                        }, StringComparer.Ordinal)
                        .ToList();
                }
                else
                {
                    sortedRows = block.Rows;
                }

                foreach (var row in sortedRows)
                {
                    lines.Add(BuildLine(header, fieldsStr, sortedFields, row));
                }
            }

            return string.Join("\n", lines);
        }

        private static string BuildLine(string header, string fieldsStr,
                                        List<string> fields, Dictionary<string, object?> row)
        {
            var values = new List<string>();
            foreach (string field in fields)
            {
                row.TryGetValue(field, out object? value);
                values.Add(ValueToIsonl(value));
            }
            return $"{header}|{fieldsStr}|{string.Join(" ", values)}";
        }

        private static string ValueToIsonl(object? value)
        {
            switch (value)
            {
                case null: return "null";
                case bool b: return b ? "true" : "false";
                case Reference r: return r.ToIson();
                case string s: return QuoteIfNeeded(s);
                case long l: return l.ToString(CultureInfo.InvariantCulture);
                case int i: return i.ToString(CultureInfo.InvariantCulture);
                case double d: return Serializer.FormatDouble(d);
                case float f: return Serializer.FormatDouble(f);
                case decimal m: return m.ToString(CultureInfo.InvariantCulture);
            }

            if (value is IDictionary || (value is IEnumerable && !(value is string)))
            {
                return QuoteIfNeeded(Json.Encode(value));
            }

            return QuoteIfNeeded(Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty);
        }

        /// <summary>
        /// Quote for ISONL. Same rules as ISON plus the pipe, which is the
        /// section separator.
        /// </summary>
        private static string QuoteIfNeeded(string s)
        {
            if (string.IsNullOrEmpty(s)) return "\"\"";

            bool needsQuote =
                s.IndexOf(' ') >= 0 ||
                s.IndexOf('\t') >= 0 ||
                s.IndexOf('"') >= 0 ||
                s.IndexOf('\n') >= 0 ||
                s.IndexOf('\r') >= 0 ||
                s.IndexOf('\\') >= 0 ||
                s.IndexOf('|') >= 0 ||
                s.StartsWith("#", StringComparison.Ordinal) ||
                string.Equals(s, "true", StringComparison.Ordinal) ||
                string.Equals(s, "false", StringComparison.Ordinal) ||
                string.Equals(s, "null", StringComparison.Ordinal) ||
                string.Equals(s, "~", StringComparison.Ordinal) ||
                s.StartsWith(":", StringComparison.Ordinal) ||
                Serializer.LooksLikeNumber(s);

            if (!needsQuote) return s;

            var escaped = s
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\n", "\\n")
                .Replace("\t", "\\t")
                .Replace("\r", "\\r")
                .Replace("|", "\\|");

            return $"\"{escaped}\"";
        }
    }
}
