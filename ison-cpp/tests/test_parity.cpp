// Byte-identity checks against the shared parity corpus in benchmark/parity.
//
// The .expected files are generated from the ison-py reference implementation,
// so a diff here is a genuine cross-language incompatibility rather than a
// C++-only test failure.
//
// Kept to C++11: ison-cpp targets C++11, so this reads the case list from
// benchmark/parity/cases.txt rather than iterating the directory.

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

std::string path_for(const std::string& name) {
    return std::string(ISON_PARITY_DIR) + "/" + name;
}

bool read_file(const std::string& name, std::string& out) {
    std::ifstream in(path_for(name).c_str(), std::ios::binary);
    if (!in) return false;

    std::ostringstream ss;
    ss << in.rdbuf();
    const std::string text = ss.str();

    // Normalize CRLF so the comparison is line-ending agnostic.
    out.clear();
    out.reserve(text.size());
    for (std::string::size_type i = 0; i < text.size(); ++i) {
        if (text[i] == '\r' && i + 1 < text.size() && text[i + 1] == '\n') continue;
        out += text[i];
    }
    return true;
}

void expect_eq(const std::string& label, const std::string& expected, const std::string& actual) {
    ++checks;
    if (expected == actual) return;
    ++failures;
    std::cerr << "[FAIL] " << label << "\n"
              << "  expected: " << expected << "\n"
              << "  actual  : " << actual << "\n";
}

void check_case(const std::string& name) {
    std::string source;
    if (!read_file(name + ".ison", source)) {
        std::cerr << "[FAIL] " << name << ": cannot read input\n";
        ++failures;
        ++checks;
        return;
    }

    ison::Document doc;
    try {
        doc = ison::loads(source);
    } catch (const std::exception& e) {
        std::cerr << "[FAIL] " << name << ": parse threw: " << e.what() << "\n";
        ++failures;
        ++checks;
        return;
    }

    std::string expected;
    if (read_file(name + ".canonical.expected", expected)) {
        expect_eq(name + ".canonical", expected, ison::dumps_canonical(doc));
    }
    if (read_file(name + ".dumps.expected", expected)) {
        expect_eq(name + ".dumps", expected, ison::dumps(doc));
    }
    if (read_file(name + ".isonl.expected", expected)) {
        expect_eq(name + ".isonl", expected, ison::dumps_isonl(doc));
    }
    if (read_file(name + ".canonical_isonl.expected", expected)) {
        expect_eq(name + ".canonical_isonl", expected, ison::dumps_canonical_isonl(doc));
    }

    // Canonical form must be idempotent, which is what makes it usable for
    // content addressing.
    const std::string once = ison::dumps_canonical(doc);
    expect_eq(name + ".canonical_idempotent", once, ison::dumps_canonical(ison::loads(once)));
}

}  // namespace

int main() {
    std::string manifest;
    if (!read_file("cases.txt", manifest)) {
        std::cerr << "parity corpus manifest not found at "
                  << path_for("cases.txt") << "; skipping\n";
        return 0;
    }

    std::vector<std::string> cases;
    std::istringstream lines(manifest);
    std::string line;
    while (std::getline(lines, line)) {
        while (!line.empty() && (line[line.size() - 1] == '\r' || line[line.size() - 1] == ' ')) {
            line.erase(line.size() - 1);
        }
        if (!line.empty()) cases.push_back(line);
    }

    if (cases.empty()) {
        std::cerr << "parity corpus is empty\n";
        return 1;
    }

    for (std::vector<std::string>::const_iterator it = cases.begin(); it != cases.end(); ++it) {
        check_case(*it);
    }

    std::cout << "parity: " << (checks - failures) << "/" << checks
              << " checks passed across " << cases.size() << " cases\n";
    return failures == 0 ? 0 : 1;
}
