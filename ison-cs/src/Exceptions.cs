using System;

namespace IsonParser
{
    /// <summary>
    /// Base exception for ISON errors.
    /// </summary>
    public class IsonException : Exception
    {
        public IsonException(string message) : base(message) { }
        public IsonException(string message, Exception inner) : base(message, inner) { }
    }

    /// <summary>
    /// Syntax error in an ISON or ISONL document.
    /// </summary>
    public class IsonSyntaxException : IsonException
    {
        /// <summary>1-based line number where the error occurred (0 if unknown).</summary>
        public int Line { get; }

        /// <summary>0-based column where the error occurred.</summary>
        public int Col { get; }

        public IsonSyntaxException(string message, int line = 0, int col = 0)
            : base($"Line {line}, Col {col}: {message}")
        {
            Line = line;
            Col = col;
        }
    }

    /// <summary>
    /// Type inference error.
    /// </summary>
    public class IsonTypeException : IsonException
    {
        public IsonTypeException(string message) : base(message) { }
    }

    /// <summary>
    /// A block or field name has no unambiguous ISON encoding.
    /// </summary>
    /// <remarks>
    /// Thrown at serialization, not construction: a Document may hold any name
    /// in memory, but writing one that cannot be read back would produce a file
    /// that silently parses as different data.
    /// </remarks>
    public class IsonNameException : IsonException
    {
        public IsonNameException(string message) : base(message) { }
    }
}
