using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace IsonParser
{
    /// <summary>
    /// Serializes ISON documents, in both regular and canonical (ISONCS) form.
    /// </summary>
    public static class Serializer
    {
        private static readonly Regex HeaderPartPattern =
            new Regex(@"^[a-zA-Z_][a-zA-Z0-9_-]*$", RegexOptions.Compiled);

        // =====================================================================
        // Regular serialization
        // =====================================================================

        /// <summary>
        /// Serialize a Document to an ISON string.
        /// </summary>
        /// <param name="doc">Document to serialize.</param>
        /// <param name="alignColumns">Pad columns to a common width.</param>
        /// <param name="delimiter">Column separator (default single space).</param>
        public static string Dumps(Document doc, bool alignColumns = false, string delimiter = " ")
        {
            var blocksOutput = new List<string>();
            foreach (var block in doc.Blocks)
            {
                blocksOutput.Add(SerializeBlock(block, alignColumns, delimiter));
            }
            return string.Join("\n\n", blocksOutput);
        }

        private static string SerializeBlock(Block block, bool alignColumns, string delimiter)
        {
            var lines = new List<string> { $"{block.Kind}.{block.Name}" };

            // Field line, with type annotations when known.
            if (block.FieldInfos.Count > 0)
            {
                lines.Add(string.Join(delimiter, block.FieldInfos.Select(fi => fi.ToFieldString())));
            }
            else
            {
                lines.Add(string.Join(delimiter, block.Fields));
            }

            int[]? colWidths = (alignColumns && block.Rows.Count > 0)
                ? CalculateColumnWidths(block)
                : null;

            foreach (var row in block.Rows)
            {
                var values = new List<string>();
                for (int i = 0; i < block.Fields.Count; i++)
                {
                    string strValue = ValueToIson(GetNestedValue(row, block.Fields[i]));
                    if (colWidths != null)
                    {
                        strValue = strValue.PadRight(colWidths[i]);
                    }
                    values.Add(strValue);
                }
                lines.Add(string.Join(delimiter, values).TrimEnd());
            }

            if (!string.IsNullOrEmpty(block.Summary))
            {
                lines.Add("---");
                lines.Add(block.Summary!);
            }

            return string.Join("\n", lines);
        }

        private static int[] CalculateColumnWidths(Block block)
        {
            var widths = new int[block.Fields.Count];
            for (int i = 0; i < block.Fields.Count; i++)
            {
                widths[i] = block.Fields[i].Length;
            }

            foreach (var row in block.Rows)
            {
                for (int i = 0; i < block.Fields.Count; i++)
                {
                    int len = ValueToIson(GetNestedValue(row, block.Fields[i])).Length;
                    if (len > widths[i]) widths[i] = len;
                }
            }

            return widths;
        }

        // =====================================================================
        // Canonical serialization (ISONCS)
        // =====================================================================

        /// <summary>
        /// Serialize a Document to canonical ISON.
        ///
        /// Canonical form produces byte-identical output across all
        /// implementations for the same logical data: blocks sorted
        /// ordinal-string by "kind.name", fields sorted with "id" first then by
        /// UTF-8 byte order, and rows sorted ordinal-string by the first
        /// column's value. Blocks with no fields are omitted.
        /// </summary>
        public static string DumpsCanonical(Document doc)
        {
            var sortedBlocks = doc.Blocks
                .Where(b => b.Fields != null && b.Fields.Count > 0)
                .OrderBy(b => $"{b.Kind}.{b.Name}", StringComparer.Ordinal)
                .ToList();

            var blocksOutput = new List<string>();
            foreach (var block in sortedBlocks)
            {
                blocksOutput.Add(SerializeBlockCanonical(block));
            }

            return string.Join("\n\n", blocksOutput);
        }

        private static string SerializeBlockCanonical(Block block)
        {
            var lines = new List<string> { $"{block.Kind}.{block.Name}" };

            var sortedFields = SortFieldsCanonical(block.Fields);

            // Field line, preserving type annotations in canonical field order.
            if (block.FieldInfos.Count > 0)
            {
                var fieldStrs = new List<string>();
                foreach (string fieldName in sortedFields)
                {
                    var fi = block.FieldInfos.FirstOrDefault(
                        f => string.Equals(f.Name, fieldName, StringComparison.Ordinal));
                    fieldStrs.Add(fi != null ? fi.ToFieldString() : fieldName);
                }
                lines.Add(string.Join(" ", fieldStrs));
            }
            else
            {
                lines.Add(string.Join(" ", sortedFields));
            }

            foreach (var row in SortRowsByKeyCanonical(block, sortedFields))
            {
                var values = sortedFields.Select(f => ValueToIson(GetNestedValue(row, f)));
                lines.Add(string.Join(" ", values).TrimEnd());
            }

            if (!string.IsNullOrEmpty(block.Summary))
            {
                lines.Add("---");
                lines.Add(block.Summary!);
            }

            return string.Join("\n", lines);
        }

        /// <summary>
        /// Sort fields for canonical form: "id" first, then by UTF-8 byte order.
        ///
        /// C# strings are UTF-16 internally, so this must compare the UTF-8
        /// encoding explicitly. Using CompareOrdinal here would compare UTF-16
        /// code units and diverge from every other implementation for non-BMP
        /// field names (e.g. "Ａfield" U+FF21 must sort before "😀field" U+1F600,
        /// because 0xEF &lt; 0xF0 in UTF-8 while the UTF-16 order is reversed).
        /// </summary>
        internal static List<string> SortFieldsCanonical(List<string> fields)
        {
            var idFields = fields.Where(f => string.Equals(f, "id", StringComparison.Ordinal)).ToList();
            var otherFields = fields.Where(f => !string.Equals(f, "id", StringComparison.Ordinal)).ToList();

            var sortedOthers = otherFields
                .OrderBy(Encoding.UTF8.GetBytes, new ByteArrayComparer())
                .ToList();

            var result = new List<string>(idFields);
            result.AddRange(sortedOthers);
            return result;
        }

        /// <summary>
        /// Order rows on the FULL canonical field tuple.
        ///
        /// Keying on the first column alone left ties resolved by input order,
        /// so the same logical data serialized to different bytes depending on
        /// how the rows were built — which defeats content addressing and
        /// prefix stability.
        ///
        /// Values compare as UTF-8 bytes, reusing the same ByteArrayComparer as
        /// SortFieldsCanonical. C# strings are UTF-16, so StringComparer.Ordinal
        /// would order astral values differently from every other
        /// implementation: "Ａ" (U+FF21) encodes to EF BF A1 and must precede
        /// "😀" (U+1F600) at F0 9F 98 80, while UTF-16 puts the emoji's lead
        /// surrogate D83D first. Nulls sort last at every position.
        /// </summary>
        internal static List<Dictionary<string, object?>> SortRowsByKeyCanonical(
            Block block, List<string> sortedFields)
        {
            if (block.Rows.Count == 0 || sortedFields.Count == 0)
            {
                return block.Rows;
            }

            var byteComparer = new ByteArrayComparer();

            var sorted = new List<Dictionary<string, object?>>(block.Rows);
            sorted.Sort((a, b) =>
            {
                foreach (string field in sortedFields)
                {
                    object? va = GetNestedValue(a, field);
                    object? vb = GetNestedValue(b, field);

                    if (va == null && vb == null) continue;
                    if (va == null) return 1;
                    if (vb == null) return -1;

                    int cmp = byteComparer.Compare(
                        Encoding.UTF8.GetBytes(RowKeyToString(va)),
                        Encoding.UTF8.GetBytes(RowKeyToString(vb)));
                    if (cmp != 0) return cmp;
                }
                return 0;
            });

            return sorted;
        }

        /// <summary>
        /// Stringify a row key the same way the reference implementation does,
        /// so ordinal row ordering agrees across languages.
        /// </summary>
        internal static string RowKeyToString(object value)
        {
            switch (value)
            {
                case string s: return s;
                case bool b: return b ? "True" : "False";
                case Reference r: return r.ToString();
                case double d: return FormatDouble(d);
                case float f: return FormatDouble(f);
                case long l: return l.ToString(CultureInfo.InvariantCulture);
                case int i: return i.ToString(CultureInfo.InvariantCulture);
                case decimal m: return m.ToString(CultureInfo.InvariantCulture);
                default: return Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty;
            }
        }

        /// <summary>Lexicographic byte-array comparison.</summary>
        private sealed class ByteArrayComparer : IComparer<byte[]>
        {
            public int Compare(byte[]? a, byte[]? b)
            {
                if (ReferenceEquals(a, b)) return 0;
                if (a == null) return -1;
                if (b == null) return 1;

                int minLen = Math.Min(a.Length, b.Length);
                for (int i = 0; i < minLen; i++)
                {
                    if (a[i] != b[i])
                    {
                        // Cast to int via byte keeps this an unsigned comparison.
                        return a[i] < b[i] ? -1 : 1;
                    }
                }

                return a.Length.CompareTo(b.Length);
            }
        }

        // =====================================================================
        // Value formatting
        // =====================================================================

        internal static object? GetNestedValue(Dictionary<string, object?> row, string path)
        {
            if (path.IndexOf('.') < 0)
            {
                return row.TryGetValue(path, out object? direct) ? direct : null;
            }

            string[] parts = path.Split('.');
            object? current = row;

            foreach (string part in parts)
            {
                if (current is Dictionary<string, object?> dict && dict.TryGetValue(part, out object? next))
                {
                    current = next;
                }
                else
                {
                    return null;
                }
            }

            return current;
        }

        /// <summary>Convert a value to its ISON textual representation.</summary>
        internal static string ValueToIson(object? value)
        {
            switch (value)
            {
                case null: return "null";
                case bool b: return b ? "true" : "false";
                case Reference r: return r.ToIson();
                case string s: return QuoteIfNeeded(s);
                case long l: return l.ToString(CultureInfo.InvariantCulture);
                case int i: return i.ToString(CultureInfo.InvariantCulture);
                case short sh: return sh.ToString(CultureInfo.InvariantCulture);
                case byte by: return by.ToString(CultureInfo.InvariantCulture);
                case double d: return FormatDouble(d);
                case float f: return FormatDouble(f);
                case decimal m: return m.ToString(CultureInfo.InvariantCulture);
            }

            // Arrays and objects are JSON-encoded, then quoted as a single value.
            if (value is IDictionary || (value is IEnumerable && !(value is string)))
            {
                return QuoteIfNeeded(Json.Encode(value));
            }

            return QuoteIfNeeded(Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty);
        }

        /// <summary>
        /// Format a double the way the reference implementation does, so that
        /// numeric output is byte-identical across languages: integral values
        /// keep a trailing ".0", exponents use a lowercase 'e', and the
        /// non-finite spellings are "inf", "-inf" and "nan".
        /// </summary>
        internal static string FormatDouble(double d)
        {
            if (double.IsNaN(d)) return "nan";
            if (double.IsPositiveInfinity(d)) return "inf";
            if (double.IsNegativeInfinity(d)) return "-inf";

            string s = d.ToString("R", CultureInfo.InvariantCulture);

            if (s.IndexOf('E') >= 0)
            {
                return s.Replace("E", "e");
            }

            if (s.IndexOf('.') < 0)
            {
                s += ".0";
            }

            return s;
        }

        /// <summary>
        /// Quote a string when emitting it bare would not survive a round-trip.
        ///
        /// '\r' and '\\' would be emitted raw and corrupt on re-parse; a leading
        /// '#' would turn into a comment and silently drop data; a value shaped
        /// like "kind.name" alone on a line would be re-read as a block header;
        /// and anything that looks like a literal (number, bool, null, or a
        /// leading ':') would come back with the wrong type.
        /// </summary>
        internal static string QuoteIfNeeded(string s)
        {
            if (string.IsNullOrEmpty(s)) return "\"\"";

            bool needsQuote =
                s.IndexOf(' ') >= 0 ||
                s.IndexOf('\t') >= 0 ||
                s.IndexOf('"') >= 0 ||
                s.IndexOf('\n') >= 0 ||
                s.IndexOf('\r') >= 0 ||
                s.IndexOf('\\') >= 0 ||
                s.StartsWith("#", StringComparison.Ordinal) ||
                string.Equals(s, "true", StringComparison.Ordinal) ||
                string.Equals(s, "false", StringComparison.Ordinal) ||
                string.Equals(s, "null", StringComparison.Ordinal) ||
                string.Equals(s, "~", StringComparison.Ordinal) ||
                s.StartsWith(":", StringComparison.Ordinal) ||
                LooksLikeNumber(s) ||
                LooksLikeBlockHeader(s);

            if (!needsQuote) return s;

            var escaped = s
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\n", "\\n")
                .Replace("\t", "\\t")
                .Replace("\r", "\\r");

            return $"\"{escaped}\"";
        }

        /// <summary>
        /// Whether a string would parse as a number. Mirrors Python's float()
        /// acceptance, including the "inf"/"nan" spellings that .NET does not
        /// parse by default.
        /// </summary>
        internal static bool LooksLikeNumber(string s)
        {
            if (s.Length == 0) return false;

            string body = s;
            if (body[0] == '+' || body[0] == '-') body = body.Substring(1);

            if (body.Equals("inf", StringComparison.OrdinalIgnoreCase) ||
                body.Equals("infinity", StringComparison.OrdinalIgnoreCase) ||
                body.Equals("nan", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            return double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out _);
        }

        /// <summary>
        /// Whether a string would be mistaken for a "kind.name" block header if
        /// emitted unquoted as the only token on a line.
        /// </summary>
        internal static bool LooksLikeBlockHeader(string s)
        {
            string[] parts = s.Split('.');
            if (parts.Length != 2) return false;
            return HeaderPartPattern.IsMatch(parts[0]) && HeaderPartPattern.IsMatch(parts[1]);
        }
    }
}
