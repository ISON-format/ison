#!/usr/bin/env python3
"""Reference runner for the extended parity shapes.

The original corpus is one `<name>.ison` input mapped to one expected output
per mode. That shape can only pin a byte string, which is enough for emission
parity but cannot express two properties ISONCS actually promises:

  permuted/  many inputs, one expected - canonical form is order-independent
  built/     a Document constructed in code, never parsed from text

Both live in subdirectories so the existing runners, which glob `*.ison` at the
top level without recursing, are unaffected.

Run:  python benchmark/parity/run_extended_parity.py
Exit: 0 all passed, 1 any failed, 2 corpus missing
"""
from __future__ import annotations

import io
import json
import pathlib
import sys

# Cases carry astral characters on purpose (the UTF-8 vs UTF-16 sentinels), and
# a Windows console defaults to cp1252, which cannot encode them. Without this
# the runner dies inside its own failure report rather than reporting the
# failure.
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(
        sys.stdout.buffer, encoding="utf-8", errors="backslashreplace", line_buffering=True
    )
    sys.stderr = io.TextIOWrapper(
        sys.stderr.buffer, encoding="utf-8", errors="backslashreplace", line_buffering=True
    )

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "ison-py" / "src"))

from ison_parser import (  # noqa: E402
    dumps_canonical,
    dumps_canonical_isonl,
    from_dict,
    loads,
)

CORPUS = pathlib.Path(__file__).resolve().parent

MODES = {
    "canonical": dumps_canonical,
    "canonical_isonl": dumps_canonical_isonl,
}

#: Neutral tokens for `.expect-error` files. Implementations map their own
#: exception types onto these - the corpus cannot share class names across
#: seven languages.
ERROR_TOKENS = {"INVALID_FIELD_NAME", "INVALID_BLOCK_NAME"}

passed: list[str] = []
failed: list[tuple[str, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    (passed.append(label) if ok else failed.append((label, detail)))


def read(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8").replace("\r\n", "\n")


def classify(exc: Exception) -> str:
    """Map a raised exception onto a neutral corpus token.

    Each implementation supplies its own version of this; only the token
    vocabulary is shared.
    """
    text = str(exc).lower()
    if "field" in text:
        return "INVALID_FIELD_NAME"
    if "block" in text:
        return "INVALID_BLOCK_NAME"
    return f"UNCLASSIFIED({type(exc).__name__})"


# ---------------------------------------------------------------------------
# permuted/ - every variant must serialize to the one shared expected
# ---------------------------------------------------------------------------
def run_permuted() -> None:
    root = CORPUS / "permuted"
    if not root.is_dir():
        return
    names = [n for n in read(root / "cases.txt").split("\n") if n.strip()]

    for name in names:
        case = root / name
        variants = sorted(case.glob("*.ison"))
        if len(variants) < 2:
            check(f"permuted/{name}", False, "needs at least two variants")
            continue

        for mode, dump in MODES.items():
            expected_path = case / f"{mode}.expected"
            if not expected_path.exists():
                continue
            expected = read(expected_path)

            for variant in variants:
                label = f"permuted/{name}/{variant.stem}.{mode}"
                try:
                    actual = dump(loads(read(variant)))
                except Exception as exc:  # noqa: BLE001
                    check(label, False, f"raised {type(exc).__name__}: {exc}")
                    continue
                check(
                    label,
                    actual == expected,
                    f"expected {expected!r}\n           got      {actual!r}",
                )


# ---------------------------------------------------------------------------
# built/ - Document built from data JSON; expects output or rejection
# ---------------------------------------------------------------------------
def run_built() -> None:
    root = CORPUS / "built"
    if not root.is_dir():
        return
    names = [n for n in read(root / "cases.txt").split("\n") if n.strip()]

    for name in names:
        data = json.loads(read(root / f"{name}.build.json"))

        for mode, dump in MODES.items():
            expected_path = root / f"{name}.{mode}.expected"
            error_path = root / f"{name}.{mode}.expect-error"
            label = f"built/{name}.{mode}"

            if expected_path.exists() and error_path.exists():
                check(label, False, "declares both .expected and .expect-error")
                continue

            if error_path.exists():
                want = read(error_path).strip()
                if want not in ERROR_TOKENS:
                    check(label, False, f"unknown error token {want!r}")
                    continue
                try:
                    dump(from_dict(data))
                except Exception as exc:  # noqa: BLE001
                    got = classify(exc)
                    check(label, got == want, f"expected {want}, raised {got}")
                else:
                    check(label, False, f"expected {want}, but serialization succeeded")

            elif expected_path.exists():
                want = read(expected_path)
                try:
                    got = dump(from_dict(data))
                except Exception as exc:  # noqa: BLE001
                    check(label, False, f"raised {type(exc).__name__}: {exc}")
                else:
                    check(label, got == want, f"expected {want!r}\n           got      {got!r}")


def main() -> int:
    if not CORPUS.is_dir():
        print("parity corpus not found")
        return 2

    run_permuted()
    run_built()

    for label, detail in failed:
        print(f"[FAIL] {label}")
        if detail:
            print(f"       {detail}")

    total = len(passed) + len(failed)
    print("=" * 60)
    print(f"Extended parity: {total} checks | passed {len(passed)} | failed {len(failed)}")
    print("=" * 60)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
