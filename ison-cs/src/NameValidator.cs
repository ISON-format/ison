using System;

namespace IsonParser
{
    /// <summary>
    /// Rejects block and field names that cannot be written and read back
    /// unchanged.
    /// </summary>
    /// <remarks>
    /// Names from <c>Loads</c> are safe by construction - the parser could not
    /// have produced them otherwise. These rules exist for the other path: a
    /// Document built in code, whose names never had to survive a parse.
    ///
    /// Each forbidden character is one the reader gives a meaning to:
    /// <list type="bullet">
    /// <item>space, tab - the field header is whitespace-separated, so
    /// "first name" reads back as two fields</item>
    /// <item>newline, CR - ends the header line</item>
    /// <item>':' - separates a field name from its type ("id:int")</item>
    /// <item>'|' - the ISONL field delimiter</item>
    /// <item>'#' - a comment, but only line-initial; "a#b" is unambiguous and
    /// stays legal, so that is a prefix rule rather than a listed character</item>
    /// </list>
    /// '.' is deliberately absent for field names: dotted keys address nested
    /// values and flat keys containing dots round-trip correctly.
    /// </remarks>
    internal static class NameValidator
    {
        private static readonly char[] NameForbidden = { ' ', '\t', '\n', '\r' };
        private static readonly char[] FieldForbidden = { ' ', '\t', '\n', '\r', ':', '|' };

        private static string Describe(char c)
        {
            switch (c)
            {
                case ' ': return "a space";
                case '\t': return "a tab";
                case '\n': return "a newline";
                case '\r': return "a carriage return";
                default: return "'" + c + "'";
            }
        }

        /// <summary>Reject a field name with no unambiguous ISON encoding.</summary>
        internal static void ValidateFieldName(string name)
        {
            int i = name.IndexOfAny(FieldForbidden);
            if (i >= 0)
            {
                throw new IsonNameException(
                    $"field name '{name}' contains {Describe(name[i])}, " +
                    "which has no unambiguous ISON encoding");
            }
            if (name.StartsWith("#", StringComparison.Ordinal))
            {
                throw new IsonNameException(
                    $"field name '{name}' starts with '#', which begins a comment; " +
                    "'#' elsewhere in a name is fine");
            }
            if (name.Length == 0)
            {
                throw new IsonNameException("field name is empty");
            }
        }

        /// <summary>Reject a block header with no unambiguous ISON encoding.</summary>
        internal static void ValidateBlockName(string kind, string name)
        {
            foreach (var part in new[] { ("kind", kind), ("name", name) })
            {
                int i = part.Item2.IndexOfAny(NameForbidden);
                if (i >= 0)
                {
                    throw new IsonNameException(
                        $"block {part.Item1} '{part.Item2}' contains {Describe(part.Item2[i])}, " +
                        "which has no unambiguous ISON encoding");
                }
                if (part.Item2.Length == 0)
                {
                    throw new IsonNameException($"block {part.Item1} is empty");
                }
            }

            // The header splits on the first '.', so a dot in the kind would
            // move the boundary and rename the block. A dot in the name survives.
            if (kind.IndexOf('.') >= 0)
            {
                throw new IsonNameException(
                    $"block kind '{kind}' contains '.', which separates kind from name");
            }
        }

        /// <summary>Validate every name a block will emit.</summary>
        internal static void ValidateBlockNames(Block block)
        {
            ValidateBlockName(block.Kind, block.Name);
            foreach (string field in block.Fields)
            {
                ValidateFieldName(field);
            }
        }

        // A reference emits as ":type:id" with no quoting. Every other value
        // type passes through the quoting rules, so a string holding a space is
        // quoted and survives; a reference has no such escape and the raw
        // characters land in the row. Whitespace therefore splits the row into
        // extra columns, and a newline ends it early - which truncates the
        // reference silently.
        //
        // Each form rejects exactly what it cannot parse, and nothing more.
        // That is what keeps the invariant that anything obtained by parsing
        // can be written back. '|' is absent from the ISON set on purpose:
        // ":p:a|b" parses there and reads back correctly, so refusing to write
        // it would make a valid file readable but not writable. ISONL cannot
        // parse one, so it rejects it.
        private static readonly char[] ReferenceForbiddenIson = { ' ', '\t', '\n', '\r' };
        private static readonly char[] ReferenceForbiddenIsonl = { ' ', '\t', '\n', '\r', '|' };

        /// <summary>Reject a reference that cannot be written and read back unchanged.</summary>
        internal static void ValidateReference(Reference reference, bool isonl)
        {
            char[] forbidden = isonl ? ReferenceForbiddenIsonl : ReferenceForbiddenIson;

            foreach (var part in new[] { ("id", reference.Id), ("type", reference.Type) })
            {
                if (part.Item2 == null) continue;
                int i = part.Item2.IndexOfAny(forbidden);
                if (i >= 0)
                {
                    throw new IsonNameException(
                        $"reference {part.Item1} '{part.Item2}' contains {Describe(part.Item2[i])}; " +
                        "a reference is written as ':type:id' with no quoting, so it has no " +
                        "unambiguous ISON encoding");
                }
            }

            if (string.IsNullOrEmpty(reference.Id))
            {
                throw new IsonNameException("reference id is empty");
            }
        }

        /// <summary>Check every reference a block will emit.</summary>
        internal static void ValidateRowReferences(Block block, bool isonl)
        {
            foreach (var row in block.Rows)
            {
                foreach (var value in row.Values)
                {
                    if (value is Reference reference)
                    {
                        ValidateReference(reference, isonl);
                    }
                }
            }
        }
    }
}
