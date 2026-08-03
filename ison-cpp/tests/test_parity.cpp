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

// Order independence: every permutation of the same logical document must
// serialize to identical canonical bytes.
//
// The top-level corpus cannot express this -- a single input has one row order,
// so its output is deterministic whether or not the row sort is total. Variants
// are probed by letter rather than listed, keeping this C++11 (no <filesystem>).
void check_permuted(const std::string& name) {
    const std::string base = "permuted/" + name + "/";

    std::string canonical, canonical_isonl;
    const bool has_canonical = read_file(base + "canonical.expected", canonical);
    const bool has_isonl = read_file(base + "canonical_isonl.expected", canonical_isonl);

    int variants = 0;
    const std::string letters = "abcdef";
    for (std::string::size_type i = 0; i < letters.size(); ++i) {
        const std::string variant = letters.substr(i, 1) + ".ison";
        std::string src;
        if (!read_file(base + variant, src)) continue;
        ++variants;

        ison::Document doc;
        try {
            doc = ison::loads(src);
        } catch (const std::exception& e) {
            std::cerr << "[FAIL] " << base << variant << ": parse threw: " << e.what() << std::endl;
            ++failures;
            ++checks;
            continue;
        }

        if (has_canonical) {
            expect_eq(base + variant + ".canonical", canonical, ison::dumps_canonical(doc));
        }
        if (has_isonl) {
            expect_eq(base + variant + ".canonical_isonl", canonical_isonl,
                      ison::dumps_canonical_isonl(doc));
        }
    }

    if (variants < 2) {
        std::cerr << "[FAIL] " << base << ": needs at least two variants, found "
                  << variants << std::endl;
        ++failures;
        ++checks;
    }
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

    // permuted/ carries its own manifest, same convention as cases.txt.
    std::string permuted_manifest;
    if (read_file("permuted/cases.txt", permuted_manifest)) {
        std::istringstream plines(permuted_manifest);
        std::string pline;
        while (std::getline(plines, pline)) {
            while (!pline.empty() &&
                   (pline[pline.size() - 1] == '\r' || pline[pline.size() - 1] == ' ')) {
                pline.erase(pline.size() - 1);
            }
            if (!pline.empty()) check_permuted(pline);
        }
    }

    std::cout << "parity: " << (checks - failures) << "/" << checks
              << " checks passed across " << cases.size() << " cases\n";
    return failures == 0 ? 0 : 1;
}
