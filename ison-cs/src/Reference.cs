using System;

namespace IsonParser
{
    /// <summary>
    /// Represents a reference to another record.
    ///
    /// Syntax variants:
    ///   :10           - Simple reference (id only)
    ///   :user:101     - Namespaced reference (type:id)
    ///   :MEMBER_OF:10 - Relationship-typed reference (relationship:target)
    ///
    /// The Type field can be a namespace (e.g. "user") or a relationship
    /// type (e.g. "MEMBER_OF"). Relationship types are distinguished by
    /// being entirely uppercase.
    /// </summary>
    public sealed class Reference : IEquatable<Reference>
    {
        public string Id { get; }

        public string? Type { get; }

        public Reference(string id, string? type = null)
        {
            Id = id ?? throw new ArgumentNullException(nameof(id));
            Type = type;
        }

        /// <summary>Convert back to ISON reference notation.</summary>
        public string ToIson() => Type != null ? $":{Type}:{Id}" : $":{Id}";

        /// <summary>
        /// True when this is a relationship-typed reference (uppercase type).
        /// Mirrors Python's str.isupper(): requires at least one cased
        /// character, and all cased characters must be uppercase.
        /// </summary>
        public bool IsRelationship() => Type != null && IsUpperPython(Type);

        /// <summary>The relationship type, or null when this is not a relationship reference.</summary>
        public string? RelationshipType => IsRelationship() ? Type : null;

        /// <summary>The namespace, or null when this is not a namespaced reference.</summary>
        public string? Namespace => (Type != null && !IsUpperPython(Type)) ? Type : null;

        /// <summary>
        /// Equivalent of Python's str.isupper(): true when the string contains
        /// at least one cased character and no lowercase characters.
        /// </summary>
        private static bool IsUpperPython(string s)
        {
            bool hasCased = false;
            foreach (char c in s)
            {
                if (char.IsLower(c)) return false;
                if (char.IsUpper(c)) hasCased = true;
            }
            return hasCased;
        }

        public override string ToString() =>
            Type != null ? $"Reference({Type}:{Id})" : $"Reference({Id})";

        public bool Equals(Reference? other) =>
            other != null &&
            string.Equals(Id, other.Id, StringComparison.Ordinal) &&
            string.Equals(Type, other.Type, StringComparison.Ordinal);

        public override bool Equals(object? obj) => Equals(obj as Reference);

        public override int GetHashCode()
        {
            unchecked
            {
                int h = StringComparer.Ordinal.GetHashCode(Id);
                if (Type != null) h = (h * 397) ^ StringComparer.Ordinal.GetHashCode(Type);
                return h;
            }
        }
    }

    /// <summary>
    /// Field metadata including an optional type annotation.
    ///
    /// Syntax: fieldName:type, or fieldName for an untyped field.
    /// Recognised types: int, float, string, bool, ref, computed, node, edge.
    /// </summary>
    public sealed class FieldInfo
    {
        public string Name { get; }

        public string? Type { get; }

        public bool IsComputed { get; }

        public FieldInfo(string name, string? type = null, bool isComputed = false)
        {
            Name = name;
            Type = type;
            IsComputed = isComputed;
        }

        /// <summary>Parse a field definition such as "name:string" or "total:computed".</summary>
        public static FieldInfo Parse(string fieldStr)
        {
            int idx = fieldStr.IndexOf(':');
            if (idx >= 0)
            {
                string name = fieldStr.Substring(0, idx);
                string typeHint = fieldStr.Substring(idx + 1).ToLowerInvariant();
                return new FieldInfo(name, typeHint, typeHint == "computed");
            }
            return new FieldInfo(fieldStr);
        }

        /// <summary>Render back to "name:type" or "name".</summary>
        public string ToFieldString() => Type != null ? $"{Name}:{Type}" : Name;

        public override string ToString() =>
            Type != null ? $"FieldInfo({Name}:{Type})" : $"FieldInfo({Name})";
    }
}
