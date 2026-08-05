/**
 * The benchmark/parity/built corpus: Documents constructed, not parsed.
 *
 * Everything in the flat corpus arrives via loads(), so its names are safe by
 * construction -- the parser could not have produced an unwritable one. These
 * cases feed a plain data JSON through fromDict() instead, which is the only
 * path that can put a name like "first name" or "a:b" into a Document.
 *
 * A case declares either an output or a rejection, never both.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fromDict, dumpsCanonical, dumpsCanonicalIsonl } from "./index";

const BUILT = path.join(__dirname, "..", "..", "benchmark", "parity", "built");

const MODES: Record<string, (d: any) => string> = {
  canonical: dumpsCanonical,
  canonical_isonl: dumpsCanonicalIsonl,
};

function read(file: string): string {
  return fs.readFileSync(path.join(BUILT, file), "utf8").replace(/\r\n/g, "\n");
}

function cases(): string[] {
  if (!fs.existsSync(BUILT)) return [];
  return read("cases.txt").split("\n").filter((s) => s.trim());
}

/**
 * Map an exception onto the corpus's neutral token. Class names are not shared
 * across seven languages, so the corpus holds a token and each implementation
 * supplies this shim.
 */
function classify(err: unknown): string {
  const text = String((err as Error)?.message).toLowerCase();
  if (text.includes("field")) return "INVALID_FIELD_NAME";
  if (text.includes("block")) return "INVALID_BLOCK_NAME";
  return `UNCLASSIFIED(${(err as Error)?.name})`;
}

describe("built/ corpus", () => {
  const names = cases();

  for (const name of names) {
    describe(name, () => {
      const data = JSON.parse(read(`${name}.build.json`));

      for (const [mode, dump] of Object.entries(MODES)) {
        const errFile = path.join(BUILT, `${name}.${mode}.expect-error`);
        const okFile = path.join(BUILT, `${name}.${mode}.expected`);

        if (fs.existsSync(errFile) && fs.existsSync(okFile)) {
          it(`${mode} declares one verdict`, () => {
            expect.fail(`${name}.${mode} declares both an output and a rejection`);
          });
          continue;
        }

        if (fs.existsSync(errFile)) {
          const want = read(`${name}.${mode}.expect-error`).trim();
          it(`${mode} is rejected as ${want}`, () => {
            let raised: unknown = null;
            try {
              dump(fromDict(data));
            } catch (e) {
              raised = e;
            }
            expect(raised, `${name}.${mode} serialized instead of being rejected`).not.toBeNull();
            expect(classify(raised)).toBe(want);
          });
        } else if (fs.existsSync(okFile)) {
          it(`${mode} matches reference`, () => {
            expect(dump(fromDict(data))).toBe(read(`${name}.${mode}.expected`));
          });
        }
      }
    });
  }
});
