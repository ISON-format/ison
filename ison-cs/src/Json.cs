using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using System.Text.Json;

namespace IsonParser
{
    /// <summary>
    /// JSON interop for ISON documents.
    ///
    /// The encoder deliberately reproduces Python's json.dumps defaults —
    /// ", " and ": " separators and ensure_ascii escaping — because embedded
    /// arrays and objects are JSON-encoded into ISON values, and canonical
    /// output must stay byte-identical across implementations.
    /// </summary>
    public static class Json
    {
        // =====================================================================
        // Encoding
        // =====================================================================

        /// <summary>Encode a value as JSON, matching Python's json.dumps defaults.</summary>
        public static string Encode(object? value)
        {
            var sb = new StringBuilder();
            EncodeValue(value, sb);
            return sb.ToString();
        }

        private static void EncodeValue(object? value, StringBuilder sb)
        {
            switch (value)
            {
                case null:
                    sb.Append("null");
                    return;
                case bool b:
                    sb.Append(b ? "true" : "false");
                    return;
                case string s:
                    EncodeString(s, sb);
                    return;
                case Reference r:
                    EncodeString(r.ToIson(), sb);
                    return;
                case long l:
                    sb.Append(l.ToString(CultureInfo.InvariantCulture));
                    return;
                case int i:
                    sb.Append(i.ToString(CultureInfo.InvariantCulture));
                    return;
                case short sh:
                    sb.Append(sh.ToString(CultureInfo.InvariantCulture));
                    return;
                case byte by:
                    sb.Append(by.ToString(CultureInfo.InvariantCulture));
                    return;
                case double d:
                    sb.Append(Serializer.FormatDouble(d));
                    return;
                case float f:
                    sb.Append(Serializer.FormatDouble(f));
                    return;
                case decimal m:
                    sb.Append(m.ToString(CultureInfo.InvariantCulture));
                    return;
            }

            if (value is IDictionary dict)
            {
                sb.Append('{');
                bool first = true;
                foreach (DictionaryEntry entry in dict)
                {
                    if (!first) sb.Append(", ");
                    first = false;
                    EncodeString(Convert.ToString(entry.Key, CultureInfo.InvariantCulture) ?? string.Empty, sb);
                    sb.Append(": ");
                    EncodeValue(entry.Value, sb);
                }
                sb.Append('}');
                return;
            }

            if (value is IEnumerable seq)
            {
                sb.Append('[');
                bool first = true;
                foreach (object? item in seq)
                {
                    if (!first) sb.Append(", ");
                    first = false;
                    EncodeValue(item, sb);
                }
                sb.Append(']');
                return;
            }

            EncodeString(Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty, sb);
        }

        /// <summary>
        /// Encode a JSON string literal with ensure_ascii semantics: every
        /// non-ASCII character becomes a \uXXXX escape, with non-BMP characters
        /// emitted as a surrogate pair, exactly as Python does.
        /// </summary>
        private static void EncodeString(string s, StringBuilder sb)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    default:
                        if (c < 0x20 || c > 0x7E)
                        {
                            // Chars above the BMP already arrive as surrogate
                            // halves here, so emitting each as \uXXXX yields the
                            // surrogate pair Python produces.
                            sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            sb.Append(c);
                        }
                        break;
                }
            }
            sb.Append('"');
        }

        // =====================================================================
        // Decoding
        // =====================================================================

        /// <summary>
        /// Build a Document from a JSON string.
        ///
        /// The root must be an object. Each property becomes a block: an array
        /// of objects becomes a "table" block, a single object becomes an
        /// "object" block with one row.
        /// </summary>
        public static Document FromJson(string json)
        {
            using var jsonDoc = JsonDocument.Parse(json);
            return FromJsonElement(jsonDoc.RootElement);
        }

        /// <summary>Build a Document from an already-parsed JSON element.</summary>
        public static Document FromJsonElement(JsonElement root)
        {
            var doc = new Document();

            if (root.ValueKind != JsonValueKind.Object)
            {
                throw new IsonException("JSON root must be an object to convert to an ISON document");
            }

            foreach (JsonProperty property in root.EnumerateObject())
            {
                string blockName = property.Name;
                JsonElement value = property.Value;

                if (value.ValueKind == JsonValueKind.Array)
                {
                    var rows = new List<Dictionary<string, object?>>();
                    var fields = new List<string>();
                    var seen = new HashSet<string>(StringComparer.Ordinal);

                    foreach (JsonElement item in value.EnumerateArray())
                    {
                        if (item.ValueKind != JsonValueKind.Object) continue;

                        var row = new Dictionary<string, object?>(StringComparer.Ordinal);
                        foreach (JsonProperty field in item.EnumerateObject())
                        {
                            row[field.Name] = ToObject(field.Value);
                            if (seen.Add(field.Name)) fields.Add(field.Name);
                        }
                        rows.Add(row);
                    }

                    doc.Blocks.Add(new Block("table", blockName) { Fields = fields, Rows = rows });
                }
                else if (value.ValueKind == JsonValueKind.Object)
                {
                    var fields = new List<string>();
                    var row = new Dictionary<string, object?>(StringComparer.Ordinal);

                    foreach (JsonProperty field in value.EnumerateObject())
                    {
                        row[field.Name] = ToObject(field.Value);
                        fields.Add(field.Name);
                    }

                    doc.Blocks.Add(new Block("object", blockName)
                    {
                        Fields = fields,
                        Rows = new List<Dictionary<string, object?>> { row }
                    });
                }
            }

            return doc;
        }

        /// <summary>Serialize a Document to JSON.</summary>
        public static string ToJson(Document doc) => Encode(doc.ToDictionary());

        private static object? ToObject(JsonElement element)
        {
            switch (element.ValueKind)
            {
                case JsonValueKind.String:
                    return element.GetString();
                case JsonValueKind.Number:
                    return element.TryGetInt64(out long l) ? l : (object)element.GetDouble();
                case JsonValueKind.True:
                    return true;
                case JsonValueKind.False:
                    return false;
                case JsonValueKind.Null:
                case JsonValueKind.Undefined:
                    return null;
                case JsonValueKind.Array:
                    {
                        var list = new List<object?>();
                        foreach (JsonElement item in element.EnumerateArray())
                        {
                            list.Add(ToObject(item));
                        }
                        return list;
                    }
                case JsonValueKind.Object:
                    {
                        var map = new Dictionary<string, object?>(StringComparer.Ordinal);
                        foreach (JsonProperty prop in element.EnumerateObject())
                        {
                            map[prop.Name] = ToObject(prop.Value);
                        }
                        return map;
                    }
                default:
                    return element.GetRawText();
            }
        }
    }
}
