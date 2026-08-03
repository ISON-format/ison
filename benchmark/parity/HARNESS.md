# Extended parity shapes

The original corpus maps one `<name>.ison` input to one expected output per
mode. That pins a byte string, which is what emission parity needs, but it
cannot express two properties ISONCS promises:

- **Order independence.** A single input has one row order, so its canonical
  output is deterministic and every implementation reproduces it. The bug where
  tied key values leave row order dependent on input order is invisible to a
  one-input case — it would pass before and after the fix.
- **Names that cannot be parsed into existence.** A header `id first name`
  parses to `['id', 'first', 'name']`, so a field name containing a space never
  survives `loads()`. It exists only in a Document built in code, which is the
  path the corpus never exercises.

Two subdirectories add those shapes. Both are additive: the existing runners
glob `*.ison` at the top level and do not recurse, so they see nothing new.

## `permuted/` — many inputs, one expected

```
permuted/
  cases.txt                     one case name per line
  <name>/
    a.ison   b.ison   c.ison    permutations of the same logical document
    canonical.expected          shared by every variant
    canonical_isonl.expected
```

Every variant must serialize to the **same** expected bytes. Checking variants
only against each other would let them agree while all being wrong, so the
shared `.expected` asserts equality and correctness in one comparison.

The expected files are generated from the variant already in full
canonical-tuple order. On such input the current first-column sort and the
intended full-tuple sort agree, so the golden is valid for the fixed
implementation even though the fix is not written yet.

Existing cases: `tied_keys` (ties on the key column), `tied_keys_total` (every
row shares a key value, so ordering rests entirely on later columns — the case
a first-column sort cannot order at all).

## `built/` — Document constructed, not parsed

```
built/
  cases.txt
  <name>.build.json                 data JSON, fed to from_dict / FromJson
  <name>.<mode>.expected            OR
  <name>.<mode>.expect-error        never both
```

The input is a plain data JSON, so no new machinery is required — every
implementation already has `from_dict` / `FromJson`, and the C# corpus test
already uses it for the golden fixture. The convention is what is new.

A case declares **either** an output **or** a rejection, never both. Declaring
both is itself a failure.

### `.expect-error` tokens

Exception class names are not shared across seven languages, so the file holds
a neutral token and each implementation maps its own exception onto it:

| Token | Meaning |
| --- | --- |
| `INVALID_FIELD_NAME` | Field name has no unambiguous ISON encoding |
| `INVALID_BLOCK_NAME` | Block name has no unambiguous ISON encoding |

Add a `classify(exception) -> token` shim per implementation; see
`run_extended_parity.py` for the reference version.

## Expected state today

`run_extended_parity.py` against ison-py 1.0.4:

```
Extended parity: 20 checks | passed 7 | failed 13
```

**The failures are the point.** A harness that passed today would not be
testing anything. The split is diagnostic:

- Permuted variants in canonical order pass; permuted variants out of order
  fail. That is bug #1.
- `built/*` ISONL cases largely pass because ISONL already rejects these names;
  the ISON cases fail because ISON does not. That is the ISON/ISONL asymmetry,
  and it shows the fix direction is making ISON as strict as ISONL rather than
  loosening ISONL.
- `field_name_colon` fails in both forms — `:b` is consumed as a type
  annotation by both readers, so neither form currently rejects it.

Once ison-py is fixed, regenerate nothing: the expecteds are already the
post-fix values. The suite going green is the verification.
