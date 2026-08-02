/**
 * Byte-identity checks against the shared parity corpus in benchmark/parity.
 *
 * The .expected files are generated from the ison-py reference implementation,
 * so a diff here is a genuine cross-language incompatibility rather than a
 * TypeScript-only test failure.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  loads,
  dumps,
  dumpsCanonical,
  dumpsIsonl,
  dumpsCanonicalIsonl,
} from "./index";

const CORPUS = path.join(__dirname, "..", "..", "benchmark", "parity");

function read(caseName: string, suffix: string): string {
  return fs
    .readFileSync(path.join(CORPUS, `${caseName}.${suffix}`), "utf8")
    .replace(/\r\n/g, "\n");
}

function cases(): string[] {
  if (!fs.existsSync(CORPUS)) return [];
  return fs
    .readdirSync(CORPUS)
    .filter((f) => f.endsWith(".ison"))
    .map((f) => f.replace(/\.ison$/, ""))
    .sort();
}

describe("cross-language parity corpus", () => {
  const names = cases();

  it("corpus is present", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  for (const name of names) {
    describe(name, () => {
      it("canonical ISON matches reference", () => {
        expect(dumpsCanonical(loads(read(name, "ison")))).toBe(
          read(name, "canonical.expected")
        );
      });

      it("regular ISON matches reference", () => {
        expect(dumps(loads(read(name, "ison")))).toBe(read(name, "dumps.expected"));
      });

      it("ISONL matches reference", () => {
        expect(dumpsIsonl(loads(read(name, "ison")))).toBe(read(name, "isonl.expected"));
      });

      it("canonical ISONL matches reference", () => {
        expect(dumpsCanonicalIsonl(loads(read(name, "ison")))).toBe(
          read(name, "canonical_isonl.expected")
        );
      });

      // Canonicalizing already-canonical output must be a no-op, which is what
      // makes canonical form usable for content addressing.
      it("canonical form is idempotent", () => {
        const once = dumpsCanonical(loads(read(name, "ison")));
        expect(dumpsCanonical(loads(once))).toBe(once);
      });

      it("round-trips through dumps stably", () => {
        const once = dumps(loads(read(name, "ison")));
        expect(dumps(loads(once))).toBe(once);
      });
    });
  }
});
