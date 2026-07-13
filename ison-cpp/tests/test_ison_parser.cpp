/**
 * @file test_ison_parser.cpp
 * @brief Tests for ISON C++ Parser
 *
 * Compile and run:
 *   g++ -std=c++17 -I../include test_ison_parser.cpp -o test_ison
 *   ./test_ison
 *
 * Or with CMake:
 *   mkdir build && cd build
 *   cmake .. && make
 *   ./test_ison_parser
 */

#include "ison_parser.hpp"
#include <iostream>
#include <cassert>
#include <cmath>

using namespace ison;

// Test counter
int tests_passed = 0;
int tests_failed = 0;

#define TEST(name) void test_##name()
#define RUN_TEST(name) do { \
    std::cout << "Running " << #name << "... "; \
    try { \
        test_##name(); \
        std::cout << "PASSED" << std::endl; \
        tests_passed++; \
    } catch (const std::exception& e) { \
        std::cout << "FAILED: " << e.what() << std::endl; \
        tests_failed++; \
    } \
} while(0)

#define ASSERT(cond) do { \
    if (!(cond)) throw std::runtime_error("Assertion failed: " #cond); \
} while(0)

#define ASSERT_EQ(a, b) do { \
    if ((a) != (b)) throw std::runtime_error("Assertion failed: " #a " == " #b); \
} while(0)

// =============================================================================
// Basic Parsing Tests
// =============================================================================

TEST(parse_simple_table) {
    std::string ison = R"(table.users
id name email
1 Alice alice@example.com
2 Bob bob@example.com)";

    auto doc = parse(ison);
    ASSERT_EQ(doc.size(), 1);

    auto& users = doc["users"];
    ASSERT_EQ(users.kind, "table");
    ASSERT_EQ(users.name, "users");
    ASSERT_EQ(users.size(), 2);
    ASSERT_EQ(users.fields.size(), 3);

    // Check first row
    ASSERT(is_int(users[0].at("id")));
    ASSERT_EQ(as_int(users[0].at("id")), 1);
    ASSERT_EQ(as_string(users[0].at("name")), "Alice");
    ASSERT_EQ(as_string(users[0].at("email")), "alice@example.com");
}

TEST(parse_object_block) {
    std::string ison = R"(object.config
name version debug
MyApp "1.0" true)";

    auto doc = parse(ison);
    auto& config = doc["config"];

    ASSERT_EQ(config.kind, "object");
    ASSERT_EQ(config.size(), 1);
    ASSERT_EQ(as_string(config[0].at("name")), "MyApp");
    ASSERT_EQ(as_string(config[0].at("version")), "1.0");
    ASSERT(is_bool(config[0].at("debug")));
    ASSERT_EQ(as_bool(config[0].at("debug")), true);
}

TEST(parse_multiple_blocks) {
    std::string ison = R"(table.users
id name
1 Alice
2 Bob

table.orders
id user_id product
101 :1 Widget
102 :2 Gadget)";

    auto doc = parse(ison);
    ASSERT_EQ(doc.size(), 2);
    ASSERT(doc.has("users"));
    ASSERT(doc.has("orders"));
}

// =============================================================================
// Type Inference Tests
// =============================================================================

TEST(type_inference_integer) {
    std::string ison = R"(table.test
value
42
-17
0)";

    auto doc = parse(ison);
    auto& test = doc["test"];

    ASSERT(is_int(test[0].at("value")));
    ASSERT_EQ(as_int(test[0].at("value")), 42);
    ASSERT_EQ(as_int(test[1].at("value")), -17);
    ASSERT_EQ(as_int(test[2].at("value")), 0);
}

TEST(type_inference_float) {
    std::string ison = R"(table.test
value
3.14
-2.5
0.0)";

    auto doc = parse(ison);
    auto& test = doc["test"];

    ASSERT(is_float(test[0].at("value")));
    ASSERT(std::abs(as_float(test[0].at("value")) - 3.14) < 0.001);
    ASSERT(std::abs(as_float(test[1].at("value")) - (-2.5)) < 0.001);
}

TEST(type_inference_boolean) {
    std::string ison = R"(table.test
active verified
true false)";

    auto doc = parse(ison);
    auto& test = doc["test"];

    ASSERT(is_bool(test[0].at("active")));
    ASSERT_EQ(as_bool(test[0].at("active")), true);
    ASSERT_EQ(as_bool(test[0].at("verified")), false);
}

TEST(type_inference_null) {
    std::string ison = R"(table.test
value1 value2
null ~)";

    auto doc = parse(ison);
    auto& test = doc["test"];

    ASSERT(is_null(test[0].at("value1")));
    ASSERT(is_null(test[0].at("value2")));
}

TEST(type_inference_string) {
    std::string ison = R"(table.test
name
hello
"quoted string"
"with spaces")";

    auto doc = parse(ison);
    auto& test = doc["test"];

    ASSERT(is_string(test[0].at("name")));
    ASSERT_EQ(as_string(test[0].at("name")), "hello");
    ASSERT_EQ(as_string(test[1].at("name")), "quoted string");
    ASSERT_EQ(as_string(test[2].at("name")), "with spaces");
}

// =============================================================================
// Reference Tests
// =============================================================================

TEST(parse_simple_reference) {
    std::string ison = R"(table.orders
id user_id
1 :42)";

    auto doc = parse(ison);
    auto& orders = doc["orders"];

    ASSERT(is_reference(orders[0].at("user_id")));
    const Reference& ref = as_reference(orders[0].at("user_id"));
    ASSERT_EQ(ref.id, "42");
    ASSERT(!ref.type.has_value());
}

TEST(parse_namespaced_reference) {
    std::string ison = R"(table.orders
id user
1 :user:101)";

    auto doc = parse(ison);
    auto& orders = doc["orders"];

    ASSERT(is_reference(orders[0].at("user")));
    const Reference& ref = as_reference(orders[0].at("user"));
    ASSERT_EQ(ref.id, "101");
    ASSERT_EQ(ref.type.value(), "user");
    ASSERT(!ref.is_relationship());
}

TEST(parse_relationship_reference) {
    std::string ison = R"(table.memberships
id relationship
1 :MEMBER_OF:10)";

    auto doc = parse(ison);
    auto& memberships = doc["memberships"];

    const Reference& ref = as_reference(memberships[0].at("relationship"));
    ASSERT_EQ(ref.id, "10");
    ASSERT_EQ(ref.type.value(), "MEMBER_OF");
    ASSERT(ref.is_relationship());
}

// =============================================================================
// Field Type Annotation Tests
// =============================================================================

TEST(parse_typed_fields) {
    std::string ison = R"(table.products
id:int name:string price:float active:bool
1 Widget 29.99 true)";

    auto doc = parse(ison);
    auto& products = doc["products"];

    ASSERT_EQ(products.field_info[0].type.value(), "int");
    ASSERT_EQ(products.field_info[1].type.value(), "string");
    ASSERT_EQ(products.field_info[2].type.value(), "float");
    ASSERT_EQ(products.field_info[3].type.value(), "bool");

    ASSERT_EQ(products.get_field_type("id").value(), "int");
    ASSERT_EQ(products.get_field_type("name").value(), "string");
}

TEST(parse_computed_field) {
    std::string ison = R"(table.cart
id quantity price total:computed
1 2 10.00 20.00)";

    auto doc = parse(ison);
    auto& cart = doc["cart"];

    ASSERT(cart.field_info[3].is_computed);
    auto computed = cart.get_computed_fields();
    ASSERT_EQ(computed.size(), 1);
    ASSERT_EQ(computed[0], "total");
}

// =============================================================================
// Escape Sequence Tests
// =============================================================================

TEST(parse_escape_sequences) {
    std::string ison = R"(table.test
content
"line1\nline2"
"tab\there"
"quote\"inside")";

    auto doc = parse(ison);
    auto& test = doc["test"];

    ASSERT_EQ(as_string(test[0].at("content")), "line1\nline2");
    ASSERT_EQ(as_string(test[1].at("content")), "tab\there");
    ASSERT_EQ(as_string(test[2].at("content")), "quote\"inside");
}

// =============================================================================
// Comments Tests
// =============================================================================

TEST(parse_with_comments) {
    std::string ison = R"(# This is a comment
table.users
# Field definitions
id name
# First user
1 Alice
# Second user
2 Bob)";

    auto doc = parse(ison);
    auto& users = doc["users"];
    ASSERT_EQ(users.size(), 2);
}

// =============================================================================
// Summary Row Tests
// =============================================================================

TEST(parse_summary_row) {
    std::string ison = R"(table.sales
region amount
North 1000
South 2000
---
Total 3000)";

    auto doc = parse(ison);
    auto& sales = doc["sales"];

    ASSERT_EQ(sales.size(), 2);  // Only data rows, not summary
    ASSERT(sales.summary.has_value());
    ASSERT_EQ(sales.summary.value(), "Total 3000");
}

// =============================================================================
// Serialization Tests
// =============================================================================

TEST(serialize_roundtrip) {
    std::string original = R"(table.users
id name email
1 Alice alice@example.com
2 Bob bob@example.com)";

    auto doc = parse(original);
    std::string serialized = dumps(doc);
    auto doc2 = parse(serialized);

    ASSERT_EQ(doc2["users"].size(), 2);
    ASSERT_EQ(as_string(doc2["users"][0].at("name")), "Alice");
}

TEST(serialize_with_quotes) {
    auto doc = Document();
    Block block("table", "test");
    block.fields = {"name"};
    block.field_info.push_back(FieldInfo("name"));

    Row row;
    row["name"] = std::string("hello world");  // Should be quoted
    block.rows.push_back(row);

    doc.blocks.push_back(block);

    std::string serialized = dumps(doc);
    ASSERT(serialized.find("\"hello world\"") != std::string::npos);
}

// =============================================================================
// ISONL Tests
// =============================================================================

TEST(parse_isonl) {
    std::string isonl = R"(table.users|id name email|1 Alice alice@example.com
table.users|id name email|2 Bob bob@example.com)";

    auto doc = loads_isonl(isonl);
    ASSERT_EQ(doc.size(), 1);
    ASSERT_EQ(doc["users"].size(), 2);
}

TEST(serialize_isonl) {
    std::string ison = R"(table.users
id name
1 Alice
2 Bob)";

    auto doc = parse(ison);
    std::string isonl = dumps_isonl(doc);

    ASSERT(isonl.find("table.users|") != std::string::npos);
    ASSERT(isonl.find("|1 Alice") != std::string::npos);
}

TEST(ison_to_isonl_conversion) {
    std::string ison = R"(table.test
id value
1 hello
2 world)";

    std::string isonl = ison_to_isonl(ison);
    std::string back_to_ison = isonl_to_ison(isonl);

    auto doc1 = parse(ison);
    auto doc2 = parse(back_to_ison);

    ASSERT_EQ(doc1["test"].size(), doc2["test"].size());
}

TEST(isonl_escaping_integrity) {
    // Regression: delimiter/escape chars in values must survive a round-trip
    std::vector<std::string> adversarial = {
        "C:\\path\\",             // trailing backslash used to desync quote tracking
        "\\",
        "a\\",
        "ends with backslash \\",
        "pipe|inside",
        "quote \" inside",
        "mix \\\" of both",
        "line1\nline2",
        "tab\there",
        "cr\rhere",
        "crlf\r\nend",
        "123",
        "true",
        ":ref",
        "",
        "\\|",
        " leading and trailing ",
    };

    Document doc;
    Block block("table", "adversarial");
    block.fields = {"v"};
    for (size_t i = 0; i < adversarial.size(); ++i) {
        Row row;
        row["v"] = adversarial[i];
        block.rows.push_back(row);
    }
    doc.blocks.push_back(block);

    auto parsed = loads_isonl(dumps_isonl(doc));
    ASSERT_EQ(parsed.size(), 1);
    ASSERT_EQ(parsed.blocks[0].rows.size(), adversarial.size());
    for (size_t i = 0; i < adversarial.size(); ++i) {
        const Value& v = parsed.blocks[0].rows[i].at("v");
        ASSERT(is_string(v));
        ASSERT_EQ(as_string(v), adversarial[i]);
    }

    // Compound case: a quoted value ending in an escaped backslash followed by
    // a pipe-bearing value on the same line — the exact shape that desynced
    // quote tracking and corrupted section splitting
    std::vector<Row> compound_rows;
    {
        Row row;
        row["a"] = std::string("x \\");
        row["b"] = std::string("y|z");
        compound_rows.push_back(row);
    }
    {
        Row row;
        row["a"] = std::string("x\\");
        row["b"] = std::string("y|z");
        compound_rows.push_back(row);
    }

    Document doc2;
    Block block2("table", "compound");
    block2.fields = {"a", "b"};
    block2.rows = compound_rows;
    doc2.blocks.push_back(block2);

    auto parsed2 = loads_isonl(dumps_isonl(doc2));
    ASSERT_EQ(parsed2.blocks[0].rows.size(), compound_rows.size());
    for (size_t i = 0; i < compound_rows.size(); ++i) {
        const Value& a = parsed2.blocks[0].rows[i].at("a");
        const Value& b = parsed2.blocks[0].rows[i].at("b");
        ASSERT(is_string(a));
        ASSERT(is_string(b));
        ASSERT_EQ(as_string(a), as_string(compound_rows[i].at("a")));
        ASSERT_EQ(as_string(b), as_string(compound_rows[i].at("b")));
    }
}

TEST(isonl_roundtrip_property) {
    // Property test: random strings over a hostile alphabet must round-trip.
    // Deterministic LCG so failures are reproducible without <random>.
    const char* alphabet[] = {
        "a", "b", " ", "|", "\"", "\\", "\n", "\r", "\t",
        ".", ":", "#", "0", "1", "true", "null"
    };
    const int alphabet_size = static_cast<int>(sizeof(alphabet) / sizeof(alphabet[0]));

    uint64_t state = 20260713ULL;
    auto next_int = [&state](int lo, int hi) -> int {
        state = (state * 1103515245ULL + 12345ULL) % 2147483648ULL;
        return lo + static_cast<int>(state % static_cast<uint64_t>(hi - lo + 1));
    };

    for (int trial = 0; trial < 300; ++trial) {
        int num_fields = next_int(1, 4);
        std::vector<std::string> fields;
        for (int i = 0; i < num_fields; ++i) {
            fields.push_back("f" + std::to_string(i));
        }

        int num_rows = next_int(1, 3);
        std::vector<Row> rows;
        for (int r = 0; r < num_rows; ++r) {
            Row row;
            for (int f = 0; f < num_fields; ++f) {
                int len = next_int(0, 12);
                std::string value;
                for (int k = 0; k < len; ++k) {
                    value += alphabet[next_int(0, alphabet_size - 1)];
                }
                row[fields[f]] = value;
            }
            rows.push_back(row);
        }

        Document doc;
        Block block("table", "t");
        block.fields = fields;
        block.rows = rows;
        doc.blocks.push_back(block);

        std::string out = dumps_isonl(doc);
        auto parsed = loads_isonl(out);

        ASSERT_EQ(parsed.size(), 1);
        ASSERT_EQ(parsed.blocks[0].rows.size(), rows.size());
        for (size_t r = 0; r < rows.size(); ++r) {
            for (size_t f = 0; f < fields.size(); ++f) {
                const Value& got = parsed.blocks[0].rows[r].at(fields[f]);
                const std::string& expected = as_string(rows[r].at(fields[f]));
                if (!is_string(got) || as_string(got) != expected) {
                    throw std::runtime_error(
                        "trial " + std::to_string(trial) + " row " + std::to_string(r) +
                        " field " + fields[f] + ": round-trip mismatch, line: " + out);
                }
            }
        }
    }
}

TEST(isonl_envelope_validation) {
    // Envelope values that can't be serialized must be rejected, not corrupted
    auto make_doc = [](const std::string& kind, const std::string& name,
                       const std::vector<std::string>& fields) {
        Document doc;
        Block block(kind, name);
        block.fields = fields;
        Row row;
        for (size_t i = 0; i < fields.size(); ++i) {
            row[fields[i]] = 1;
        }
        block.rows.push_back(row);
        doc.blocks.push_back(block);
        return doc;
    };

    struct EnvelopeCase {
        std::string kind;
        std::string name;
        std::vector<std::string> fields;
    };
    std::vector<EnvelopeCase> bad_cases = {
        {"ta|ble", "t", {"id"}},
        {"ta ble", "t", {"id"}},
        {"t.able", "t", {"id"}},
        {"#table", "t", {"id"}},
        {"",       "t", {"id"}},
        {"table", "na|me",  {"id"}},
        {"table", "na\nme", {"id"}},
        {"table", "na me",  {"id"}},
        {"table", "",       {"id"}},
        {"table", "t", {"bad field"}},
        {"table", "t", {"bad|field"}},
        {"table", "t", {""}},
    };

    for (size_t i = 0; i < bad_cases.size(); ++i) {
        const EnvelopeCase& c = bad_cases[i];
        bool threw = false;
        try {
            dumps_isonl(make_doc(c.kind, c.name, c.fields));
        } catch (const ISONError&) {
            threw = true;
        }
        if (!threw) {
            throw std::runtime_error(
                "should have rejected envelope kind='" + c.kind +
                "' name='" + c.name + "'");
        }
    }

    // Dots in the block NAME are legal — the parser splits on the first dot
    auto parsed = loads_isonl(dumps_isonl(make_doc("table", "v1.2", {"id"})));
    ASSERT_EQ(parsed.blocks[0].kind, "table");
    ASSERT_EQ(parsed.blocks[0].name, "v1.2");
}

// =============================================================================
// Row Integrity Tests
// =============================================================================

TEST(extra_values_rejected) {
    // Regression: rows with more values than fields must error, not truncate
    bool threw = false;
    try {
        parse("table.t\na b\n1 2 3");
    } catch (const ISONSyntaxError& e) {
        threw = true;
        ASSERT(std::string(e.what()).find("3 values") != std::string::npos);
    }
    ASSERT(threw);

    // A quoted token is data, never a comment
    threw = false;
    try {
        parse("table.t\na b\n1 2 \"#not-a-comment\"");
    } catch (const ISONSyntaxError&) {
        threw = true;
    }
    ASSERT(threw);

    // ISONL
    threw = false;
    try {
        loads_isonl("table.t|a b|1 2 3");
    } catch (const ISONSyntaxError& e) {
        threw = true;
        ASSERT(std::string(e.what()).find("3 values") != std::string::npos);
    }
    ASSERT(threw);
}

TEST(inline_trailing_comment) {
    // An unquoted token starting with '#' begins an inline comment
    auto doc = parse("table.t\na b\n1 2 # note ignored");
    ASSERT_EQ(as_int(doc["t"][0].at("a")), 1);
    ASSERT_EQ(as_int(doc["t"][0].at("b")), 2);

    auto doc2 = loads_isonl("table.t|a b|1 2 # note ignored");
    ASSERT_EQ(as_int(doc2["t"][0].at("a")), 1);
    ASSERT_EQ(as_int(doc2["t"][0].at("b")), 2);

    // Comment mid-row: remaining fields are missing (null), not data
    auto doc3 = parse("table.t\na b\n1 #tag");
    ASSERT_EQ(as_int(doc3["t"][0].at("a")), 1);
    ASSERT(is_null(doc3["t"][0].at("b")));

    // Quoted tokens are always data, never comments
    auto doc4 = parse("table.t\na b\n1 \"#tag\"");
    ASSERT_EQ(as_int(doc4["t"][0].at("a")), 1);
    ASSERT_EQ(as_string(doc4["t"][0].at("b")), "#tag");

    // Serializer quotes leading-'#' strings so they round-trip as data
    Document out_doc;
    Block block("table", "t");
    block.fields = {"a"};
    Row row;
    row["a"] = std::string("#tag");
    block.rows.push_back(row);
    out_doc.blocks.push_back(block);
    auto roundtrip = parse(dumps(out_doc));
    ASSERT_EQ(as_string(roundtrip["t"][0].at("a")), "#tag");
}

TEST(ison_roundtrip_property) {
    // Explicit regression: header-shaped string values ('kind.name') must be
    // quoted by the serializer, or a single-field row line like 'a.true'
    // would be re-parsed as a NEW block header and split the block
    {
        Document doc;
        Block block("table", "t");
        block.fields = {"v"};
        Row r1;
        r1["v"] = std::string("a.true");
        Row r2;
        r2["v"] = std::string("object.config");
        block.rows.push_back(r1);
        block.rows.push_back(r2);
        doc.blocks.push_back(block);

        auto parsed = parse(dumps(doc));
        ASSERT_EQ(parsed.size(), 1);
        ASSERT_EQ(parsed.blocks[0].rows.size(), 2);
        ASSERT_EQ(as_string(parsed.blocks[0].rows[0].at("v")), "a.true");
        ASSERT_EQ(as_string(parsed.blocks[0].rows[1].at("v")), "object.config");
    }

    // Regular-format twin of isonl_roundtrip_property: random strings over a
    // hostile alphabet must round-trip through dumps/parse.
    // Deterministic LCG so failures are reproducible without <random>.
    const char* alphabet[] = {
        "a", "b", " ", "|", "\"", "\\", "\n", "\r", "\t",
        ".", ":", "#", "0", "1", "true", "null"
    };
    const int alphabet_size = static_cast<int>(sizeof(alphabet) / sizeof(alphabet[0]));

    uint64_t state = 20260713ULL;
    auto next_int = [&state](int lo, int hi) -> int {
        state = (state * 1103515245ULL + 12345ULL) % 2147483648ULL;
        return lo + static_cast<int>(state % static_cast<uint64_t>(hi - lo + 1));
    };

    for (int trial = 0; trial < 300; ++trial) {
        int num_fields = next_int(1, 4);
        std::vector<std::string> fields;
        for (int i = 0; i < num_fields; ++i) {
            fields.push_back("f" + std::to_string(i));
        }

        int num_rows = next_int(1, 3);
        std::vector<Row> rows;
        for (int r = 0; r < num_rows; ++r) {
            Row row;
            for (int f = 0; f < num_fields; ++f) {
                int len = next_int(0, 12);
                std::string value;
                for (int k = 0; k < len; ++k) {
                    value += alphabet[next_int(0, alphabet_size - 1)];
                }
                row[fields[f]] = value;
            }
            rows.push_back(row);
        }

        Document doc;
        Block block("table", "t");
        block.fields = fields;
        block.rows = rows;
        doc.blocks.push_back(block);

        std::string out = dumps(doc);
        auto parsed = parse(out);

        ASSERT_EQ(parsed.size(), 1);
        ASSERT_EQ(parsed.blocks[0].rows.size(), rows.size());
        for (size_t r = 0; r < rows.size(); ++r) {
            for (size_t f = 0; f < fields.size(); ++f) {
                const Value& got = parsed.blocks[0].rows[r].at(fields[f]);
                const std::string& expected = as_string(rows[r].at(fields[f]));
                if (!is_string(got) || as_string(got) != expected) {
                    throw std::runtime_error(
                        "trial " + std::to_string(trial) + " row " + std::to_string(r) +
                        " field " + fields[f] + ": round-trip mismatch, doc: " + out);
                }
            }
        }
    }
}

// =============================================================================
// JSON Conversion Tests
// =============================================================================

TEST(to_json) {
    std::string ison = R"(table.users
id name active
1 Alice true
2 Bob false)";

    auto doc = parse(ison);
    std::string json = doc.to_json();

    ASSERT(json.find("\"users\"") != std::string::npos);
    ASSERT(json.find("\"Alice\"") != std::string::npos);
    ASSERT(json.find("true") != std::string::npos);
}

// =============================================================================
// Reference Class Tests
// =============================================================================

TEST(reference_to_ison) {
    Reference simple("42");
    ASSERT_EQ(simple.to_ison(), ":42");

    Reference namespaced("101", "user");
    ASSERT_EQ(namespaced.to_ison(), ":user:101");

    Reference relationship("10", "MEMBER_OF");
    ASSERT_EQ(relationship.to_ison(), ":MEMBER_OF:10");
    ASSERT(relationship.is_relationship());
}

// =============================================================================
// Error Handling Tests
// =============================================================================

TEST(error_invalid_header) {
    std::string ison = R"(invalid_header
id name
1 Alice)";

    try {
        parse(ison);
        ASSERT(false);  // Should have thrown
    } catch (const ISONSyntaxError& e) {
        ASSERT(std::string(e.what()).find("Invalid block header") != std::string::npos);
    }
}

TEST(error_missing_fields) {
    std::string ison = R"(table.users)";  // No field definitions

    try {
        parse(ison);
        ASSERT(false);
    } catch (const ISONSyntaxError& e) {
        ASSERT(std::string(e.what()).find("missing field definitions") != std::string::npos);
    }
}

TEST(error_unterminated_string) {
    std::string ison = R"(table.test
name
"unterminated)";

    try {
        parse(ison);
        ASSERT(false);
    } catch (const ISONSyntaxError& e) {
        ASSERT(std::string(e.what()).find("Unterminated") != std::string::npos);
    }
}

// =============================================================================
// Edge Cases
// =============================================================================

TEST(empty_document) {
    std::string ison = "";
    auto doc = parse(ison);
    ASSERT_EQ(doc.size(), 0);
}

TEST(only_comments) {
    std::string ison = R"(# Comment 1
# Comment 2
# Comment 3)";
    auto doc = parse(ison);
    ASSERT_EQ(doc.size(), 0);
}

TEST(empty_table) {
    std::string ison = R"(table.empty
id name)";  // No data rows

    auto doc = parse(ison);
    auto& empty = doc["empty"];
    ASSERT_EQ(empty.size(), 0);
    ASSERT_EQ(empty.fields.size(), 2);
}

TEST(special_characters_in_values) {
    std::string ison = R"(table.test
content
"hello\tworld"
"line1\nline2"
"path\\to\\file")";

    auto doc = parse(ison);
    auto& test = doc["test"];

    ASSERT_EQ(as_string(test[0].at("content")), "hello\tworld");
    ASSERT_EQ(as_string(test[1].at("content")), "line1\nline2");
    ASSERT_EQ(as_string(test[2].at("content")), "path\\to\\file");
}

// =============================================================================
// Main
// =============================================================================

int main() {
    std::cout << "=== ISON C++ Parser Tests ===" << std::endl;
    std::cout << "Version: " << ison::VERSION << std::endl;
    std::cout << std::endl;

    // Basic parsing
    RUN_TEST(parse_simple_table);
    RUN_TEST(parse_object_block);
    RUN_TEST(parse_multiple_blocks);

    // Type inference
    RUN_TEST(type_inference_integer);
    RUN_TEST(type_inference_float);
    RUN_TEST(type_inference_boolean);
    RUN_TEST(type_inference_null);
    RUN_TEST(type_inference_string);

    // References
    RUN_TEST(parse_simple_reference);
    RUN_TEST(parse_namespaced_reference);
    RUN_TEST(parse_relationship_reference);

    // Field types
    RUN_TEST(parse_typed_fields);
    RUN_TEST(parse_computed_field);

    // Escape sequences
    RUN_TEST(parse_escape_sequences);

    // Comments
    RUN_TEST(parse_with_comments);

    // Summary
    RUN_TEST(parse_summary_row);

    // Serialization
    RUN_TEST(serialize_roundtrip);
    RUN_TEST(serialize_with_quotes);

    // ISONL
    RUN_TEST(parse_isonl);
    RUN_TEST(serialize_isonl);
    RUN_TEST(ison_to_isonl_conversion);
    RUN_TEST(isonl_escaping_integrity);
    RUN_TEST(isonl_roundtrip_property);
    RUN_TEST(isonl_envelope_validation);

    // Row integrity
    RUN_TEST(extra_values_rejected);
    RUN_TEST(inline_trailing_comment);
    RUN_TEST(ison_roundtrip_property);

    // JSON
    RUN_TEST(to_json);

    // Reference class
    RUN_TEST(reference_to_ison);

    // Error handling
    RUN_TEST(error_invalid_header);
    RUN_TEST(error_missing_fields);
    RUN_TEST(error_unterminated_string);

    // Edge cases
    RUN_TEST(empty_document);
    RUN_TEST(only_comments);
    RUN_TEST(empty_table);
    RUN_TEST(special_characters_in_values);

    std::cout << std::endl;
    std::cout << "=== Results ===" << std::endl;
    std::cout << "Passed: " << tests_passed << std::endl;
    std::cout << "Failed: " << tests_failed << std::endl;

    return tests_failed > 0 ? 1 : 0;
}
