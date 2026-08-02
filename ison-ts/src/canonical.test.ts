/**
 * Regression tests for ISONCS canonical serialization.
 *
 * These cover the two defects ison-ts shipped with: canonical ordering that
 * used locale-aware comparison, and field sorting that was never implemented
 * at all. The parity corpus catches both indirectly; these pin the specific
 * behaviours so a failure names the cause.
 */

import { describe, it, expect } from "vitest";
import { loads, dumpsCanonical, dumpsCanonicalIsonl, Document, Block } from "./index";

describe("ISONCS field sorting", () => {
  it("hoists id first, then sorts remaining fields", () => {
    const doc = loads(
      ["table.t", "score active id email name", "95.5 true 1 a@example.com Alice"].join("\n")
    );
    expect(dumpsCanonical(doc).split("\n")[1]).toBe("id active email name score");
  });

  it("sorts by UTF-8 bytes, not UTF-16 code units", () => {
    // Ａfield  U+FF21  -> UTF-8 EF BF A1
    // 😀field U+1F600 -> UTF-8 F0 9F 98 80
    // EF < F0, so Ａfield sorts first. Comparing UTF-16 code units reverses
    // them, because the emoji's leading surrogate D83D sorts below FF21.
    const doc = new Document();
    const block = new Block("table", "utf16");
    block.fields = ["id", "😀field", "Ａfield"];
    block.rows = [{ id: 101, "😀field": "emoji", "Ａfield": "fullwidth" }];
    doc.blocks.push(block);

    expect(dumpsCanonical(doc).split("\n")[1]).toBe("id Ａfield 😀field");
  });

  it("produces the same output regardless of input field order", () => {
    const a = loads(["table.t", "id email name", "1 a@example.com Alice"].join("\n"));
    const b = loads(["table.t", "name id email", "Alice 1 a@example.com"].join("\n"));
    expect(dumpsCanonical(a)).toBe(dumpsCanonical(b));
  });

  it("preserves type annotations in canonical field order", () => {
    const doc = loads(["table.users", "id:int name:string active:bool", "1 Alice true"].join("\n"));
    expect(dumpsCanonical(doc)).toContain("id:int active:bool name:string");
  });
});

describe("ISONCS ordering is ordinal, not locale-aware", () => {
  it("orders punctuation by code unit", () => {
    // localeCompare treats '-' and '_' as ignorable and yields
    // co_op, co-op, coop. Ordinal gives '-' (0x2D) < '_' (0x5F) < 'o' (0x6F).
    const doc = loads(["table.t", "id name", "coop c1", "co-op c2", "co_op c3"].join("\n"));
    const lines = dumpsCanonical(doc).split("\n");
    expect(lines.slice(2)).toEqual(["co-op c2", "co_op c3", "coop c1"]);
  });

  it("orders rows ordinally, not numerically", () => {
    const doc = loads(["table.t", "id name", "10 ten", "2 two", "1 one"].join("\n"));
    const lines = dumpsCanonical(doc).split("\n");
    expect(lines.slice(2)).toEqual(["1 one", "10 ten", "2 two"]);
  });

  it("sorts blocks ordinally by kind.name", () => {
    const doc = loads(["table.users", "id", "1", "", "table.edges", "id", "1"].join("\n"));
    expect(dumpsCanonical(doc).startsWith("table.edges")).toBe(true);
  });

  it("sorts rows with a null key last", () => {
    const doc = loads(["table.t", "id name", "null nokey", "b bee", "a ay"].join("\n"));
    const lines = dumpsCanonical(doc).split("\n");
    expect(lines.slice(2)).toEqual(["a ay", "b bee", "null nokey"]);
  });
});

describe("canonical ISONL", () => {
  it("normalizes field order like canonical ISON", () => {
    const doc = loads(["table.t", "score id name", "95.5 1 Alice"].join("\n"));
    expect(dumpsCanonicalIsonl(doc)).toBe("table.t|id name score|1 Alice 95.5");
  });

  it("preserves type annotations", () => {
    const doc = loads(["table.users", "id:int name:string", "1 Alice"].join("\n"));
    expect(dumpsCanonicalIsonl(doc)).toBe("table.users|id:int name:string|1 Alice");
  });

  it("sorts rows by the first canonical column", () => {
    const doc = loads(["table.t", "id name", "2 Bob", "1 Alice"].join("\n"));
    expect(dumpsCanonicalIsonl(doc).split("\n")).toEqual([
      "table.t|id name|1 Alice",
      "table.t|id name|2 Bob",
    ]);
  });
});

describe("canonical form is idempotent", () => {
  it("re-canonicalizing changes nothing", () => {
    const source = ["table.users", "score active id name", "95.5 true 2 Bob", "87.3 false 1 Alice"].join("\n");
    const once = dumpsCanonical(loads(source));
    expect(dumpsCanonical(loads(once))).toBe(once);
  });
});
