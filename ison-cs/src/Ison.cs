using System.IO;
using System.Text;

namespace IsonParser
{
    /// <summary>
    /// Public entry point for the ISON format.
    ///
    /// Method names mirror the other implementations in the ISON family
    /// (Loads/Dumps), with Parse/Stringify provided as .NET-idiomatic aliases.
    /// </summary>
    public static class Ison
    {
        private static readonly UTF8Encoding Utf8NoBom = new UTF8Encoding(false);

        // =====================================================================
        // ISON
        // =====================================================================

        /// <summary>Parse an ISON string into a Document.</summary>
        public static Document Loads(string text) => new Parser(text).Parse();

        /// <summary>Parse an ISON string into a Document (alias for Loads).</summary>
        public static Document Parse(string text) => Loads(text);

        /// <summary>Read and parse an ISON file.</summary>
        public static Document Load(string path) => Loads(File.ReadAllText(path, Encoding.UTF8));

        /// <summary>Serialize a Document to an ISON string.</summary>
        public static string Dumps(Document doc, bool alignColumns = false, string delimiter = " ") =>
            Serializer.Dumps(doc, alignColumns, delimiter);

        /// <summary>Serialize a Document to an ISON string (alias for Dumps).</summary>
        public static string Stringify(Document doc, bool alignColumns = false, string delimiter = " ") =>
            Dumps(doc, alignColumns, delimiter);

        /// <summary>
        /// Serialize a Document to canonical ISON (ISONCS): deterministic,
        /// byte-identical across every implementation in the family.
        /// </summary>
        public static string DumpsCanonical(Document doc) => Serializer.DumpsCanonical(doc);

        /// <summary>Write a Document to an ISON file.</summary>
        public static void Dump(Document doc, string path, bool alignColumns = false, string delimiter = " ") =>
            File.WriteAllText(path, Dumps(doc, alignColumns, delimiter), Utf8NoBom);

        // =====================================================================
        // ISONL
        // =====================================================================

        /// <summary>Parse an ISONL string into a Document.</summary>
        public static Document LoadsIsonl(string text) => new IsonlParser().ParseToDocument(text);

        /// <summary>Read and parse an ISONL file.</summary>
        public static Document LoadIsonl(string path) => LoadsIsonl(File.ReadAllText(path, Encoding.UTF8));

        /// <summary>Serialize a Document to an ISONL string.</summary>
        public static string DumpsIsonl(Document doc) => IsonlSerializer.Dumps(doc);

        /// <summary>Serialize a Document to canonical ISONL.</summary>
        public static string DumpsCanonicalIsonl(Document doc) => IsonlSerializer.DumpsCanonical(doc);

        /// <summary>Write a Document to an ISONL file.</summary>
        public static void DumpIsonl(Document doc, string path) =>
            File.WriteAllText(path, DumpsIsonl(doc), Utf8NoBom);

        // =====================================================================
        // Conversion
        // =====================================================================

        /// <summary>Convert an ISON string to ISONL.</summary>
        public static string IsonToIsonl(string isonText) => DumpsIsonl(Loads(isonText));

        /// <summary>Convert an ISONL string to ISON.</summary>
        public static string IsonlToIson(string isonlText) => Dumps(LoadsIsonl(isonlText));

        /// <summary>Build a Document from a JSON string.</summary>
        public static Document FromJson(string json) => Json.FromJson(json);

        /// <summary>Serialize a Document to JSON.</summary>
        public static string ToJson(Document doc) => Json.ToJson(doc);
    }
}
