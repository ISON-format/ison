"""Names that cannot be written and read back unchanged are rejected.

The parity corpus asserts the eight canonical cases. These tests assert the
*boundaries* around them: that the rule is character-specific rather than a
blanket ban, that it fires on every serialization path rather than just the
canonical one, and that legal-but-suspicious names keep working.

The failure this prevents is silent. Serializing a field named 'first name'
used to emit a header reading `first name`, which parses back as two fields --
so a document written by one program became different data when read by
another, with no error at either end.
"""

from __future__ import annotations

import pytest

from ison_parser import (
    Block,
    Document,
    ISONNameError,
    ISONLSerializer,
    dumps,
    dumps_canonical,
    dumps_isonl,
    loads,
)


def _doc(field: str = "id", kind: str = "table", name: str = "t") -> Document:
    return Document(blocks=[Block(kind=kind, name=name,
                                  fields=[field], rows=[{field: 1}])])


ALL_MODES = pytest.mark.parametrize("dump", [
    dumps, dumps_canonical, dumps_isonl, ISONLSerializer.dumps_canonical,
], ids=["dumps", "canonical", "isonl", "canonical_isonl"])


# --- rejected --------------------------------------------------------------

@ALL_MODES
@pytest.mark.parametrize("field", [
    "first name",   # header is whitespace-separated
    "a\tb",
    "a\nb",
    "a\rb",
    "a:b",          # ':' separates name from type
    "a|b",          # ISONL delimiter
    "#flag",        # line-initial '#' is a comment
    "",
], ids=["space", "tab", "newline", "cr", "colon", "pipe", "hash-prefix", "empty"])
def test_unwritable_field_name_is_rejected(dump, field: str) -> None:
    with pytest.raises(ISONNameError, match="field"):
        dump(_doc(field=field))


@ALL_MODES
@pytest.mark.parametrize("kind,name", [
    ("table", "my table"),
    ("my kind", "t"),
    ("table", "a\tb"),
    ("a.b", "t"),      # header splits on the first '.', so a dot in the kind moves the boundary
    ("", "t"),
    ("table", ""),
], ids=["name-space", "kind-space", "name-tab", "kind-dot", "kind-empty", "name-empty"])
def test_unwritable_block_name_is_rejected(dump, kind: str, name: str) -> None:
    with pytest.raises(ISONNameError, match="block"):
        dump(_doc(kind=kind, name=name))


# --- still legal -----------------------------------------------------------

@ALL_MODES
@pytest.mark.parametrize("field", [
    "a.b",       # dotted keys address nested values; flat dotted keys round-trip
    "a#b",       # '#' only starts a comment line-initially
    "a-b",
    "a_b",
    "ünïcode",
    "1st",
], ids=["dot", "hash-infix", "dash", "underscore", "unicode", "leading-digit"])
def test_legal_field_name_still_serializes(dump, field: str) -> None:
    assert dump(_doc(field=field))


@ALL_MODES
def test_dot_in_block_name_is_legal(dump) -> None:
    """Only the kind is constrained -- the header splits on the first dot, so
    everything after it is the name and a further dot survives."""
    assert dump(_doc(kind="table", name="a.b"))


# --- the invariant the rule exists to protect ------------------------------

@pytest.mark.parametrize("field", ["a.b", "a#b", "a-b", "ünïcode"])
def test_every_accepted_name_round_trips(field: str) -> None:
    """Acceptance is only meaningful if the accepted name reads back."""
    once = dumps_canonical(_doc(field=field))
    assert loads(once).blocks[0].fields == [field]


def test_parsed_documents_are_never_rejected() -> None:
    """Names from loads() are safe by construction; validation must not fire
    on the round trip, or reading a file would make it unwritable."""
    source = "table.users\nid:int name:string\n1 Alice\n2 Bob"
    doc = loads(source)
    for dump in (dumps, dumps_canonical, dumps_isonl,
                 ISONLSerializer.dumps_canonical):
        assert dump(doc)
