"""ison-py against the shared cross-language parity corpus.

Every other implementation has a parity test; the reference did not, because it
generates the expected files. That is exactly why it needs one: if ison-py's
behaviour drifts, the goldens silently become stale and the only signal is some
*other* language failing, which points at the wrong implementation.

Covers benchmark/parity/*.ison (one input, four renderings) and
benchmark/parity/permuted/ (many inputs, one shared expected -- the order
independence ISONCS promises).

benchmark/parity/built/ is deliberately excluded: those cases assert that
unrepresentable field and block names are rejected, which is not implemented
yet. Run benchmark/parity/run_extended_parity.py to see their status.
"""

from __future__ import annotations

import pathlib

import pytest

from ison_parser import (
    ISONLSerializer,
    dumps,
    dumps_canonical,
    dumps_isonl,
    loads,
)

CORPUS = pathlib.Path(__file__).resolve().parents[2] / "benchmark" / "parity"

RENDERINGS = {
    "canonical": dumps_canonical,
    "dumps": dumps,
    "isonl": dumps_isonl,
    "canonical_isonl": ISONLSerializer.dumps_canonical,
}


def _read(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8").replace("\r\n", "\n")


def _flat_cases() -> list[str]:
    if not CORPUS.exists():
        return []
    return sorted(p.stem for p in CORPUS.glob("*.ison"))


def _permuted_cases() -> list[str]:
    permuted = CORPUS / "permuted"
    if not permuted.exists():
        return []
    return sorted(d.name for d in permuted.iterdir() if d.is_dir())


@pytest.mark.skipif(not _flat_cases(), reason="parity corpus not available")
@pytest.mark.parametrize("case", _flat_cases())
@pytest.mark.parametrize("mode", sorted(RENDERINGS))
def test_flat_case_matches_expected(case: str, mode: str) -> None:
    expected_path = CORPUS / f"{case}.{mode}.expected"
    if not expected_path.exists():
        pytest.skip(f"{case} has no {mode} expectation")

    doc = loads(_read(CORPUS / f"{case}.ison"))
    assert RENDERINGS[mode](doc) == _read(expected_path)


@pytest.mark.skipif(not _permuted_cases(), reason="permuted corpus not available")
@pytest.mark.parametrize("case", _permuted_cases())
def test_every_permutation_yields_the_same_bytes(case: str) -> None:
    """Order independence: a one-input case cannot express this.

    Its output is deterministic whether or not the row sort is total, so ties
    resolved by input order stay invisible until two permutations are compared.
    """
    case_dir = CORPUS / "permuted" / case
    variants = sorted(case_dir.glob("*.ison"))
    assert len(variants) > 1, f"{case}: a permuted case needs at least two variants"

    for mode in ("canonical", "canonical_isonl"):
        expected_path = case_dir / f"{mode}.expected"
        if not expected_path.exists():
            continue
        expected = _read(expected_path)

        for variant in variants:
            doc = loads(_read(variant))
            assert RENDERINGS[mode](doc) == expected, f"{case}/{variant.name} {mode}"


@pytest.mark.skipif(not _flat_cases(), reason="parity corpus not available")
@pytest.mark.parametrize("case", _flat_cases())
def test_canonical_is_idempotent(case: str) -> None:
    """Re-canonicalizing must change nothing, or content addressing is unusable."""
    once = dumps_canonical(loads(_read(CORPUS / f"{case}.ison")))
    assert dumps_canonical(loads(once)) == once
