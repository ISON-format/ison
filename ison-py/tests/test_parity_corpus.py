"""ison-py against the shared cross-language parity corpus.

Every other implementation has a parity test; the reference did not, because it
generates the expected files. That is exactly why it needs one: if ison-py's
behaviour drifts, the goldens silently become stale and the only signal is some
*other* language failing, which points at the wrong implementation.

Covers benchmark/parity/*.ison (one input, four renderings) and
benchmark/parity/permuted/ (many inputs, one shared expected -- the order
independence ISONCS promises).

benchmark/parity/built/ covers the third shape: a Document constructed rather
than parsed. Names arriving from loads() are safe by construction, so the only
way to hold an unwritable one is to build it in code -- which is exactly the
path those cases exercise.
"""

from __future__ import annotations

import json
import pathlib

import pytest

from ison_parser import (
    ISONError,
    ISONLSerializer,
    dumps,
    dumps_canonical,
    dumps_isonl,
    from_dict,
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


# ---------------------------------------------------------------------------
# built/ - Document constructed, not parsed
# ---------------------------------------------------------------------------

BUILT = CORPUS / "built"

BUILT_MODES = {
    "canonical": dumps_canonical,
    "canonical_isonl": ISONLSerializer.dumps_canonical,
}


def _built_cases() -> list[str]:
    manifest = BUILT / "cases.txt"
    if not manifest.exists():
        return []
    return [line.strip() for line in _read(manifest).split("\n") if line.strip()]


def _classify(exc: Exception) -> str:
    """Map an exception onto the corpus's neutral token.

    Exception class names are not shared across seven languages, so the corpus
    holds a token and each implementation supplies this shim.
    """
    text = str(exc).lower()
    if "field" in text:
        return "INVALID_FIELD_NAME"
    if "block" in text:
        return "INVALID_BLOCK_NAME"
    return f"UNCLASSIFIED({type(exc).__name__})"


@pytest.mark.skipif(not _built_cases(), reason="built corpus not available")
@pytest.mark.parametrize("case", _built_cases())
@pytest.mark.parametrize("mode", sorted(BUILT_MODES))
def test_built_case_matches_verdict(case: str, mode: str) -> None:
    """A case declares either an output or a rejection, never both."""
    err_path = BUILT / f"{case}.{mode}.expect-error"
    out_path = BUILT / f"{case}.{mode}.expected"

    assert not (err_path.exists() and out_path.exists()), (
        f"{case}.{mode} declares both an output and a rejection"
    )
    if not err_path.exists() and not out_path.exists():
        pytest.skip(f"{case} has no {mode} verdict")

    data = json.loads(_read(BUILT / f"{case}.build.json"))
    dump = BUILT_MODES[mode]

    if err_path.exists():
        with pytest.raises(ISONError) as excinfo:
            dump(from_dict(data))
        assert _classify(excinfo.value) == _read(err_path).strip()
    else:
        assert dump(from_dict(data)).rstrip("\n") == _read(out_path).rstrip("\n")
