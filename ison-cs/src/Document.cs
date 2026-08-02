using System;
using System.Collections.Generic;
using System.Linq;

namespace IsonParser
{
    /// <summary>
    /// Represents a complete ISON document.
    /// </summary>
    public class Document
    {
        /// <summary>
        /// List of blocks in this document.
        /// </summary>
        public List<Block> Blocks { get; set; }

        public Document()
        {
            Blocks = new List<Block>();
        }

        /// <summary>
        /// Get the first block with the given name, or null when absent.
        /// </summary>
        public Block? this[string name] =>
            Blocks.FirstOrDefault(b => string.Equals(b.Name, name, StringComparison.Ordinal));

        /// <summary>
        /// Get the first block with the given name.
        /// </summary>
        /// <returns>True when a block with that name exists.</returns>
        public bool TryGetBlock(string name, out Block? block)
        {
            block = this[name];
            return block != null;
        }

        /// <summary>
        /// Convert the whole document to a nested dictionary. Blocks of kind
        /// "object" holding exactly one row collapse to that row.
        /// </summary>
        public Dictionary<string, object?> ToDictionary()
        {
            var result = new Dictionary<string, object?>(StringComparer.Ordinal);
            foreach (var block in Blocks)
            {
                foreach (var kv in block.ToDictionary())
                {
                    result[kv.Key] = kv.Value;
                }
            }
            return result;
        }
    }

    /// <summary>
    /// Represents an ISON block (table, object, meta, etc.).
    /// </summary>
    public class Block
    {
        /// <summary>
        /// Block kind (e.g. "table", "object", "meta").
        /// </summary>
        public string Kind { get; set; }

        /// <summary>
        /// Block name.
        /// </summary>
        public string Name { get; set; }

        /// <summary>
        /// Field names (column headers), without type annotations.
        /// </summary>
        public List<string> Fields { get; set; }

        /// <summary>
        /// Rows, each a mapping of field name to value.
        /// </summary>
        public List<Dictionary<string, object?>> Rows { get; set; }

        /// <summary>
        /// Per-field metadata including type annotations. May be empty when the
        /// block was constructed without annotations.
        /// </summary>
        public List<FieldInfo> FieldInfos { get; set; }

        /// <summary>
        /// Optional summary line, emitted after a "---" separator.
        /// </summary>
        public string? Summary { get; set; }

        public Block()
        {
            Kind = string.Empty;
            Name = string.Empty;
            Fields = new List<string>();
            Rows = new List<Dictionary<string, object?>>();
            FieldInfos = new List<FieldInfo>();
        }

        public Block(string kind, string name) : this()
        {
            Kind = kind;
            Name = name;
        }

        /// <summary>
        /// Get the type annotation for a field, or null when untyped/unknown.
        /// </summary>
        public string? GetFieldType(string fieldName)
        {
            foreach (var fi in FieldInfos)
            {
                if (string.Equals(fi.Name, fieldName, StringComparison.Ordinal))
                {
                    return fi.Type;
                }
            }
            return null;
        }

        /// <summary>
        /// Names of all fields annotated as "computed".
        /// </summary>
        public List<string> GetComputedFields() =>
            FieldInfos.Where(fi => fi.IsComputed).Select(fi => fi.Name).ToList();

        /// <summary>
        /// Convert to a dictionary representation. An "object" block with
        /// exactly one row collapses to that row.
        /// </summary>
        public Dictionary<string, object?> ToDictionary()
        {
            var result = new Dictionary<string, object?>(StringComparer.Ordinal);

            if (string.Equals(Kind, "object", StringComparison.Ordinal) && Rows.Count == 1)
            {
                result[Name] = Rows[0];
            }
            else
            {
                result[Name] = Rows;
            }

            return result;
        }

        public override string ToString() => $"Block({Kind}.{Name}, {Rows.Count} rows)";
    }
}
