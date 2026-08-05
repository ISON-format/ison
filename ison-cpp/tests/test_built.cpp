// The benchmark/parity/built corpus: Documents constructed, not parsed.
//
// Everything in the flat corpus arrives via loads(), so its names are safe by
// construction -- the parser could not have produced an unwritable one. These
// cases cover the other path: a Document built in code, whose names never had
// to survive a parse.
//
// ison-cpp has no JSON reader, so unlike the other six implementations this
// cannot consume <name>.build.json directly. The Documents are constructed here
// instead, and only the verdicts (.expected / .expect-error) are read from the
// corpus. To keep that from drifting, cases.txt drives the loop: a case listed
// there with no constructor below is a FAILURE, not a silent skip.
//
// A case declares either an output or a rejection, never both.

#include "../include/ison_parser.hpp"

#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#ifndef ISON_PARITY_DIR
#define ISON_PARITY_DIR "../benchmark/parity"
#endif

namespace {

int failures = 0;
int checks = 0;

std::string built_path(const std::string& name) {
    return std::string(ISON_PARITY_DIR) + "/built/" + name;
}

bool read_file(const std::string& name, std::string& out) {
    std::ifstream in(built_path(name).c_str(), std::ios::binary);
    if (!in) return false;

    std::ostringstream ss;
    ss << in.rdbuf();
    const std::string text = ss.str();

    out.clear();
    out.reserve(text.size());
    for (std::string::size_type i = 0; i < text.size(); ++i) {
        if (text[i] == '\r' && i + 1 < text.size() && text[i + 1] == '\n') continue;
        out += text[i];
    }
    return true;
}

std::string trimmed(const std::string& s) {
    std::string::size_type b = s.find_first_not_of(" \t\r\n");
    if (b == std::string::npos) return "";
    std::string::size_type e = s.find_last_not_of(" \t\r\n");
    return s.substr(b, e - b + 1);
}

void fail(const std::string& label, const std::string& detail) {
    ++failures;
    std::cout << "[FAIL] " << label << "\n       " << detail << "\n";
}

// Map an exception onto the corpus's neutral token. Exception class names are
// not shared across seven languages, so the corpus holds a token and each
// implementation supplies this shim.
std::string classify(const ison::ISONError& e) {
    std::string text(e.what());
    for (std::string::size_type i = 0; i < text.size(); ++i) {
        text[i] = static_cast<char>(std::tolower(static_cast<unsigned char>(text[i])));
    }
    if (text.find("field") != std::string::npos) return "INVALID_FIELD_NAME";
    if (text.find("block") != std::string::npos) return "INVALID_BLOCK_NAME";
    return std::string("UNCLASSIFIED(") + e.what() + ")";
}

// Build the Document a case's build.json describes. Returns false when the case
// name is unknown, which the caller reports as a failure.
bool build_case(const std::string& name, ison::Document& doc) {
    // Every case is one block holding one row. The field carrying the name
    // under test is paired with a second field so the canonical field sort has
    // something to order against.
    std::string kind = "table";
    std::string block_name = "t";
    std::string field;       // the name under test
    std::string other = "id";

    if (name == "block_name_space")        { block_name = "my table"; field = ""; }
    else if (name == "field_name_colon")      field = "a:b";
    else if (name == "field_name_dot_flat")   field = "a.b";
    else if (name == "field_name_hash")     { field = "#flag"; other = "zz"; }
    else if (name == "field_name_hash_infix") field = "a#b";
    else if (name == "field_name_pipe")       field = "a|b";
    else if (name == "field_name_space")      field = "first name";
    else if (name == "field_name_tab")        field = "a\tb";
    else return false;

    ison::Block block(kind, block_name);
    ison::Row row;

    if (field.empty()) {
        block.fields.push_back(other);
        row[other] = ison::Value(1);
    } else {
        // Canonical order is 'id' first then UTF-8 byte order; the serializer
        // sorts, so insertion order here is deliberately not the sorted one.
        block.fields.push_back(field);
        block.fields.push_back(other);
        row[field] = ison::Value(std::string("v"));
        row[other] = ison::Value(1);
    }

    block.rows.push_back(row);
    doc.blocks.push_back(block);
    return true;
}

void check_mode(const std::string& name, const std::string& mode) {
    std::string want_err, want_out;
    const bool has_err = read_file(name + "." + mode + ".expect-error", want_err);
    const bool has_out = read_file(name + "." + mode + ".expected", want_out);

    const std::string label = "built/" + name + "." + mode;

    if (has_err && has_out) {
        ++checks;
        fail(label, "declares both an output and a rejection");
        return;
    }
    if (!has_err && !has_out) return;

    ++checks;

    ison::Document doc;
    if (!build_case(name, doc)) {
        fail(label, "no constructor for this case in test_built.cpp - "
                    "it was added to cases.txt without a C++ counterpart");
        return;
    }

    std::string got;
    bool threw = false;
    std::string token;
    try {
        got = (mode == "canonical") ? ison::dumps_canonical(doc)
                                    : ison::dumps_canonical_isonl(doc);
    } catch (const ison::ISONError& e) {
        threw = true;
        token = classify(e);
    }

    if (has_err) {
        const std::string want = trimmed(want_err);
        if (!threw) {
            fail(label, "serialized instead of being rejected");
        } else if (token != want) {
            fail(label, "expected " + want + ", got " + token);
        }
        return;
    }

    // Trailing newline differs between ISON and ISONL emitters; the corpus
    // stores neither, so compare trimmed of a single trailing newline.
    while (!got.empty() && got[got.size() - 1] == '\n') got.erase(got.size() - 1);
    std::string want = want_out;
    while (!want.empty() && want[want.size() - 1] == '\n') want.erase(want.size() - 1);

    if (threw) {
        fail(label, "unexpected rejection: " + token);
    } else if (got != want) {
        fail(label, "expected \"" + want + "\", got \"" + got + "\"");
    }
}

}  // namespace

int main() {
    std::string manifest;
    if (!read_file("cases.txt", manifest)) {
        std::cout << "built corpus not available at " << built_path("") << " - skipping\n";
        return 0;
    }

    std::vector<std::string> cases;
    std::istringstream lines(manifest);
    std::string line;
    while (std::getline(lines, line)) {
        const std::string name = trimmed(line);
        if (!name.empty()) cases.push_back(name);
    }

    if (cases.empty()) {
        std::cout << "built/cases.txt is empty - this test would pass vacuously\n";
        return 1;
    }

    for (std::vector<std::string>::size_type i = 0; i < cases.size(); ++i) {
        check_mode(cases[i], "canonical");
        check_mode(cases[i], "canonical_isonl");
    }

    std::cout << "built: " << (checks - failures) << "/" << checks
              << " checks passed across " << cases.size() << " cases\n";
    return failures == 0 ? 0 : 1;
}
