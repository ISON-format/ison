/**
 * @file test_isonantic.cpp
 * @brief Tests for ISONantic C++ validation library
 *
 * Compile and run:
 *   g++ -std=c++17 -Wall -Wextra -Wpedantic -I../include test_isonantic.cpp -o test_isonantic
 *   ./test_isonantic
 *
 * Or with CMake:
 *   mkdir build && cd build
 *   cmake .. && make
 *   ctest --output-on-failure
 */

#include "isonantic.hpp"
#include <cstdint>
#include <iostream>
#include <map>
#include <string>
#include <vector>

using namespace isonantic;

// Document type accepted by TableSchema::validate
using Doc = std::map<std::string, std::vector<std::map<std::string, Value>>>;

// Test counters
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
    if (!((a) == (b))) throw std::runtime_error("Assertion failed: " #a " == " #b); \
} while(0)

// Helper: expect a ValidationError whose first error message contains `needle`
template<typename Fn>
static void expect_error(Fn fn, const std::string& needle) {
    try {
        fn();
    } catch (const ValidationError& e) {
        ASSERT(!e.errors.empty());
        if (e.errors[0].message.find(needle) == std::string::npos) {
            throw std::runtime_error(
                "Expected error containing '" + needle + "' but got '" + e.errors[0].message + "'");
        }
        return;
    }
    throw std::runtime_error("Expected ValidationError containing '" + needle + "' but nothing was thrown");
}

// =============================================================================
// Value Helper Tests
// =============================================================================

TEST(value_get_as_and_is_null) {
    Value s = std::string("hello");
    Value i = int64_t{42};
    Value d = 3.5;
    Value b = true;
    Value n = nullptr;

    ASSERT_EQ(*get_as<std::string>(s), "hello");
    ASSERT_EQ(*get_as<int64_t>(i), int64_t{42});
    ASSERT_EQ(*get_as<double>(d), 3.5);
    ASSERT_EQ(*get_as<bool>(b), true);

    ASSERT(!get_as<int64_t>(s).has_value());
    ASSERT(!get_as<std::string>(i).has_value());

    ASSERT(is_null(n));
    ASSERT(!is_null(s));
}

TEST(reference_to_ison) {
    Reference plain("42");
    ASSERT_EQ(plain.to_ison(), ":42");
    ASSERT(!plain.type.has_value());

    Reference typed("42", "users");
    ASSERT_EQ(typed.to_ison(), ":users:42");
    ASSERT_EQ(*typed.type, "users");
}

// =============================================================================
// String Field Tests
// =============================================================================

TEST(string_field_accepts_valid) {
    auto field = string().min(1).max(10).build("name");
    Value result = field.validate(Value(std::string("Alice")));
    ASSERT_EQ(*get_as<std::string>(result), "Alice");
}

TEST(string_field_rejects_wrong_type) {
    auto field = string().build("name");
    expect_error([&] { field.validate(Value(int64_t{7})); }, "Expected string");
}

TEST(string_field_min_length) {
    auto field = string().min(3).build("code");
    field.validate(Value(std::string("abc")));  // exactly at min: ok
    expect_error([&] { field.validate(Value(std::string("ab"))); }, "at least 3");
}

TEST(string_field_max_length) {
    auto field = string().max(5).build("code");
    field.validate(Value(std::string("12345")));  // exactly at max: ok
    expect_error([&] { field.validate(Value(std::string("123456"))); }, "at most 5");
}

TEST(string_field_email) {
    auto field = string().email().build("email");
    field.validate(Value(std::string("alice@example.com")));
    expect_error([&] { field.validate(Value(std::string("not-an-email"))); }, "Invalid email");
}

TEST(string_field_default_value) {
    auto field = string().default_value("N/A").build("status");
    Value result = field.validate(std::nullopt);
    ASSERT_EQ(*get_as<std::string>(result), "N/A");

    // Explicit null also falls back to the default
    Value result2 = field.validate(Value(nullptr));
    ASSERT_EQ(*get_as<std::string>(result2), "N/A");
}

// =============================================================================
// Required / Optional Tests
// =============================================================================

TEST(required_field_missing_throws) {
    auto field = string().required().build("name");
    try {
        field.validate(std::nullopt);
        throw std::runtime_error("Expected ValidationError for missing required field");
    } catch (const ValidationError& e) {
        ASSERT_EQ(e.errors.size(), size_t{1});
        ASSERT_EQ(e.errors[0].field, "name");
        ASSERT_EQ(e.errors[0].message, "Field is required");
    }
}

TEST(optional_field_missing_yields_null) {
    auto field = string().build("nickname");
    Value result = field.validate(std::nullopt);
    ASSERT(is_null(result));
}

TEST(required_with_default_uses_default) {
    // Default takes precedence over the required check when the value is missing
    auto field = integer().required().default_value(5).build("count");
    Value result = field.validate(std::nullopt);
    ASSERT_EQ(*get_as<int64_t>(result), int64_t{5});
}

// =============================================================================
// Integer Field Tests
// =============================================================================

TEST(integer_field_bounds) {
    auto field = integer().min(0).max(100).build("age");
    ASSERT_EQ(*get_as<int64_t>(field.validate(Value(int64_t{0}))), int64_t{0});
    ASSERT_EQ(*get_as<int64_t>(field.validate(Value(int64_t{100}))), int64_t{100});
    expect_error([&] { field.validate(Value(int64_t{-1})); }, "must be >=");
    expect_error([&] { field.validate(Value(int64_t{101})); }, "must be <=");
}

TEST(integer_field_rejects_wrong_type) {
    auto field = integer().build("age");
    expect_error([&] { field.validate(Value(3.5)); }, "Expected integer");
    expect_error([&] { field.validate(Value(std::string("42"))); }, "Expected integer");
}

TEST(integer_field_positive) {
    auto field = integer().positive().build("qty");
    field.validate(Value(int64_t{1}));
    expect_error([&] { field.validate(Value(int64_t{0})); }, "must be positive");
    expect_error([&] { field.validate(Value(int64_t{-5})); }, "must be positive");
}

TEST(integer_field_default_value) {
    auto field = integer().default_value(10).build("retries");
    ASSERT_EQ(*get_as<int64_t>(field.validate(std::nullopt)), int64_t{10});
}

// =============================================================================
// Float Field Tests
// =============================================================================

TEST(float_field_bounds) {
    auto field = floating().min(0.0).max(1.0).build("ratio");
    ASSERT_EQ(*get_as<double>(field.validate(Value(0.5))), 0.5);
    expect_error([&] { field.validate(Value(-0.1)); }, "must be >=");
    expect_error([&] { field.validate(Value(1.5)); }, "must be <=");
}

TEST(float_field_promotes_integer) {
    // An integer value is accepted by a float field and normalized to double
    auto field = floating().build("total");
    Value result = field.validate(Value(int64_t{42}));
    ASSERT(get_as<double>(result).has_value());
    ASSERT_EQ(*get_as<double>(result), 42.0);
}

TEST(float_field_rejects_wrong_type) {
    auto field = floating().positive().build("total");
    expect_error([&] { field.validate(Value(std::string("3.14"))); }, "Expected number");
    expect_error([&] { field.validate(Value(0.0)); }, "must be positive");
}

// =============================================================================
// Boolean Field Tests
// =============================================================================

TEST(boolean_field_valid_and_mismatch) {
    auto field = boolean().build("active");
    ASSERT_EQ(*get_as<bool>(field.validate(Value(true))), true);
    ASSERT_EQ(*get_as<bool>(field.validate(Value(false))), false);
    expect_error([&] { field.validate(Value(std::string("true"))); }, "Expected boolean");
}

TEST(boolean_field_default_value) {
    auto field = boolean().default_value(true).build("active");
    ASSERT_EQ(*get_as<bool>(field.validate(std::nullopt)), true);
}

// =============================================================================
// Reference Field Tests
// =============================================================================

TEST(reference_field_valid_and_mismatch) {
    auto field = reference().required().build("user_id");
    Value result = field.validate(Value(Reference("42", "users")));
    auto ref = get_as<Reference>(result);
    ASSERT(ref.has_value());
    ASSERT_EQ(ref->id, "42");
    ASSERT_EQ(*ref->type, "users");
    expect_error([&] { field.validate(Value(std::string("42"))); }, "Expected reference");
}

// =============================================================================
// Table Schema Tests
// =============================================================================

TEST(table_validate_success) {
    auto schema = table("users")
        .field("id", integer().required())
        .field("name", string().min(1).max(100))
        .field("email", string().email())
        .field("score", floating().min(0.0))
        .field("active", boolean().default_value(true));

    Doc doc;
    doc["users"] = {
        {
            {"id", Value(int64_t{1})},
            {"name", Value(std::string("Alice"))},
            {"email", Value(std::string("alice@example.com"))},
            {"score", Value(9.5)},
            {"active", Value(false)}
        },
        {
            {"id", Value(int64_t{2})},
            {"name", Value(std::string("Bob"))},
            {"email", Value(std::string("bob@example.com"))},
            {"score", Value(int64_t{7})}
            // "active" omitted: default_value(true) applies
        }
    };

    ValidatedTable users = schema.validate(doc);
    ASSERT_EQ(users.name, "users");
    ASSERT_EQ(users.size(), size_t{2});
    ASSERT(!users.empty());

    ASSERT_EQ(*users[0].get_int("id"), int64_t{1});
    ASSERT_EQ(*users[0].get_string("name"), "Alice");
    ASSERT_EQ(*users[0].get_bool("active"), false);
    ASSERT_EQ(*users[0].get_float("score"), 9.5);

    ASSERT_EQ(*users[1].get_string("email"), "bob@example.com");
    ASSERT_EQ(*users[1].get_bool("active"), true);   // default applied
    ASSERT_EQ(*users[1].get_float("score"), 7.0);    // int promoted by float field
}

TEST(table_missing_table_throws) {
    auto schema = table("users").field("id", integer().required());
    Doc doc;
    doc["orders"] = {};
    try {
        schema.validate(doc);
        throw std::runtime_error("Expected ValidationError for missing table");
    } catch (const ValidationError& e) {
        ASSERT_EQ(e.errors.size(), size_t{1});
        ASSERT(e.errors[0].message.find("Missing table: users") != std::string::npos);
    }
}

TEST(table_collects_errors_across_rows) {
    auto schema = table("users")
        .field("id", integer().required())
        .field("email", string().email());

    Doc doc;
    doc["users"] = {
        {
            {"id", Value(int64_t{1})},
            {"email", Value(std::string("bad-email"))}   // row 0: invalid email
        },
        {
            // row 1: missing required id
            {"email", Value(std::string("ok@example.com"))}
        }
    };

    try {
        schema.validate(doc);
        throw std::runtime_error("Expected ValidationError with collected errors");
    } catch (const ValidationError& e) {
        ASSERT_EQ(e.errors.size(), size_t{2});
        ASSERT_EQ(e.errors[0].field, "[0].email");
        ASSERT(e.errors[0].message.find("Invalid email") != std::string::npos);
        ASSERT_EQ(e.errors[1].field, "[1].id");
        ASSERT_EQ(e.errors[1].message, "Field is required");
        // Aggregate what() mentions the error count
        ASSERT(std::string(e.what()).find("Validation failed with 2 error(s)") != std::string::npos);
    }
}

TEST(table_ignores_extra_fields) {
    auto schema = table("items").field("sku", string().required());

    Doc doc;
    doc["items"] = {
        {
            {"sku", Value(std::string("A-1"))},
            {"unexpected", Value(int64_t{99})}   // not in schema: ignored
        }
    };

    ValidatedTable items = schema.validate(doc);
    ASSERT_EQ(items.size(), size_t{1});
    ASSERT_EQ(*items[0].get_string("sku"), "A-1");
    ASSERT(!items[0].get("unexpected").has_value());
}

TEST(table_empty_rows_ok) {
    auto schema = table("logs").field("msg", string().required());
    Doc doc;
    doc["logs"] = {};
    ValidatedTable logs = schema.validate(doc);
    ASSERT(logs.empty());
    ASSERT_EQ(logs.size(), size_t{0});
}

TEST(table_iteration) {
    auto schema = table("nums").field("n", integer().required());
    Doc doc;
    doc["nums"] = {
        { {"n", Value(int64_t{1})} },
        { {"n", Value(int64_t{2})} },
        { {"n", Value(int64_t{3})} }
    };

    ValidatedTable nums = schema.validate(doc);
    int64_t sum = 0;
    for (const auto& row : nums) {
        sum += *row.get_int("n");
    }
    ASSERT_EQ(sum, int64_t{6});
}

TEST(validated_row_typed_getters) {
    ValidatedRow row;
    row.fields["name"] = Value(std::string("Widget"));
    row.fields["count"] = Value(int64_t{3});
    row.fields["price"] = Value(4.5);
    row.fields["ok"] = Value(true);

    ASSERT_EQ(*row.get_string("name"), "Widget");
    ASSERT_EQ(*row.get_int("count"), int64_t{3});
    ASSERT_EQ(*row.get_float("price"), 4.5);
    ASSERT_EQ(*row.get_float("count"), 3.0);  // int readable as float
    ASSERT_EQ(*row.get_bool("ok"), true);

    // Wrong-type and missing lookups return nullopt
    ASSERT(!row.get_int("name").has_value());
    ASSERT(!row.get_string("count").has_value());
    ASSERT(!row.get("missing").has_value());
    ASSERT(!row.get_bool("missing").has_value());
}

TEST(validation_error_single_message_format) {
    ValidationError e("age", "Expected integer");
    ASSERT_EQ(std::string(e.what()), "age: Expected integer");
    ASSERT_EQ(e.errors.size(), size_t{1});
    ASSERT_EQ(e.errors[0].field, "age");
}

// =============================================================================
// Main
// =============================================================================

int main() {
    std::cout << "ISONantic C++ Tests (v" << VERSION << ")" << std::endl;
    std::cout << "========================================" << std::endl;

    RUN_TEST(value_get_as_and_is_null);
    RUN_TEST(reference_to_ison);

    RUN_TEST(string_field_accepts_valid);
    RUN_TEST(string_field_rejects_wrong_type);
    RUN_TEST(string_field_min_length);
    RUN_TEST(string_field_max_length);
    RUN_TEST(string_field_email);
    RUN_TEST(string_field_default_value);

    RUN_TEST(required_field_missing_throws);
    RUN_TEST(optional_field_missing_yields_null);
    RUN_TEST(required_with_default_uses_default);

    RUN_TEST(integer_field_bounds);
    RUN_TEST(integer_field_rejects_wrong_type);
    RUN_TEST(integer_field_positive);
    RUN_TEST(integer_field_default_value);

    RUN_TEST(float_field_bounds);
    RUN_TEST(float_field_promotes_integer);
    RUN_TEST(float_field_rejects_wrong_type);

    RUN_TEST(boolean_field_valid_and_mismatch);
    RUN_TEST(boolean_field_default_value);

    RUN_TEST(reference_field_valid_and_mismatch);

    RUN_TEST(table_validate_success);
    RUN_TEST(table_missing_table_throws);
    RUN_TEST(table_collects_errors_across_rows);
    RUN_TEST(table_ignores_extra_fields);
    RUN_TEST(table_empty_rows_ok);
    RUN_TEST(table_iteration);

    RUN_TEST(validated_row_typed_getters);
    RUN_TEST(validation_error_single_message_format);

    std::cout << "========================================" << std::endl;
    std::cout << "Passed: " << tests_passed << ", Failed: " << tests_failed << std::endl;

    return tests_failed == 0 ? 0 : 1;
}
