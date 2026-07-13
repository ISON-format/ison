/**
 * @file basic.cpp
 * @brief Basic usage example for ISONantic C++ validation
 *
 * Demonstrates:
 *   1. Defining a table schema with the fluent builder API
 *   2. Validating good data and reading typed values back
 *   3. Handling validation errors with detailed messages
 *
 * Note: TableSchema::validate takes a plain document map
 * (std::map<std::string, std::vector<std::map<std::string, Value>>>).
 * If you parse ISON text with ison-cpp, convert its document into this
 * shape before validating.
 */

#include "isonantic.hpp"
#include <iostream>
#include <map>
#include <string>
#include <vector>

using namespace isonantic;

// Document type accepted by TableSchema::validate
using Doc = std::map<std::string, std::vector<std::map<std::string, Value>>>;

int main() {
    // -------------------------------------------------------------------
    // 1. Define a schema
    // -------------------------------------------------------------------
    auto user_schema = table("users")
        .field("id", integer().required().positive())
        .field("name", string().min(1).max(100).required())
        .field("email", string().email())
        .field("active", boolean().default_value(true));

    // -------------------------------------------------------------------
    // 2. Validate good data
    // -------------------------------------------------------------------
    Doc doc;
    doc["users"] = {
        {
            {"id", Value(int64_t{1})},
            {"name", Value(std::string("Alice"))},
            {"email", Value(std::string("alice@example.com"))},
            {"active", Value(false)}
        },
        {
            {"id", Value(int64_t{2})},
            {"name", Value(std::string("Bob"))},
            {"email", Value(std::string("bob@example.com"))}
            // "active" omitted -> defaults to true
        }
    };

    try {
        ValidatedTable users = user_schema.validate(doc);

        std::cout << "Validated " << users.size() << " users:" << std::endl;
        for (const auto& user : users) {
            std::cout << "  " << user.get_int("id").value()
                      << ": " << user.get_string("name").value()
                      << " <" << user.get_string("email").value() << ">"
                      << (user.get_bool("active").value() ? " [active]" : " [inactive]")
                      << std::endl;
        }
    } catch (const ValidationError& e) {
        std::cerr << "Unexpected validation failure: " << e.what() << std::endl;
        return 1;
    }

    // -------------------------------------------------------------------
    // 3. Validation errors
    // -------------------------------------------------------------------
    Doc bad_doc;
    bad_doc["users"] = {
        {
            {"id", Value(int64_t{-3})},                  // violates positive()
            {"name", Value(std::string("Carol"))},
            {"email", Value(std::string("not-an-email"))} // invalid email
        },
        {
            // missing required "id" and "name"
            {"email", Value(std::string("dave@example.com"))}
        }
    };

    std::cout << std::endl << "Validating bad data..." << std::endl;
    try {
        user_schema.validate(bad_doc);
        std::cerr << "Expected validation to fail!" << std::endl;
        return 1;
    } catch (const ValidationError& e) {
        std::cout << "Validation failed with " << e.errors.size()
                  << " error(s):" << std::endl;
        for (const auto& err : e.errors) {
            std::cout << "  " << err.field << ": " << err.message << std::endl;
        }
    }

    return 0;
}
