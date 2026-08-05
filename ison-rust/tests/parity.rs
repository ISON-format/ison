//! Byte-identity checks against the shared parity corpus in benchmark/parity.
//!
//! The .expected files are generated from the ison-py reference
//! implementation, so a diff here is a genuine cross-language incompatibility
//! rather than a Rust-only test failure.

use std::fs;
use std::path::{Path, PathBuf};

fn parity_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("workspace root")
        .join("benchmark")
        .join("parity")
}

fn read(case: &str, suffix: &str) -> String {
    let path = parity_dir().join(format!("{case}.{suffix}"));
    fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("reading {}: {e}", path.display()))
        .replace("\r\n", "\n")
}

fn cases() -> Vec<String> {
    let dir = parity_dir();
    if !dir.exists() {
        return Vec::new();
    }

    let mut names: Vec<String> = fs::read_dir(&dir)
        .expect("read parity dir")
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            name.strip_suffix(".ison").map(str::to_owned)
        })
        .collect();
    names.sort();
    names
}

#[test]
fn matches_reference_output() {
    let cases = cases();
    assert!(!cases.is_empty(), "parity corpus is empty");

    for case in &cases {
        let doc = ison_rs::parse(&read(case, "ison"))
            .unwrap_or_else(|e| panic!("{case}: parse failed: {e}"));

        assert_eq!(
            read(case, "canonical.expected"),
            ison_rs::dumps_canonical(&doc).unwrap(),
            "{case}: canonical ISON"
        );

        assert_eq!(
            read(case, "dumps.expected"),
            ison_rs::dumps(&doc, false).unwrap(),
            "{case}: regular ISON"
        );

        assert_eq!(
            read(case, "isonl.expected"),
            ison_rs::dumps_isonl(&doc).expect("dumps_isonl"),
            "{case}: ISONL"
        );

        assert_eq!(
            read(case, "canonical_isonl.expected"),
            ison_rs::dumps_canonical_isonl(&doc).expect("dumps_canonical_isonl"),
            "{case}: canonical ISONL"
        );
    }
}

/// Canonicalizing already-canonical output must be a no-op, which is what
/// makes canonical form usable for content addressing.
#[test]
fn canonical_is_idempotent() {
    for case in &cases() {
        let doc = ison_rs::parse(&read(case, "ison")).expect("parse");
        let once = ison_rs::dumps_canonical(&doc).unwrap();
        let reparsed = ison_rs::parse(&once).expect("reparse canonical");
        assert_eq!(once, ison_rs::dumps_canonical(&reparsed).unwrap(), "{case}");
    }
}

/// Order independence: every permutation of the same logical document must
/// serialize to identical canonical bytes.
///
/// The top-level corpus cannot express this — a single input has one row
/// order, so its output is deterministic whether or not the row sort is total.
/// Cases live in benchmark/parity/permuted/<name>/{a,b,c}.ison with one shared
/// expected output per mode.
#[test]
fn permutations_agree() {
    let dir = parity_dir().join("permuted");
    if !dir.exists() {
        return;
    }

    let mut cases: Vec<PathBuf> = fs::read_dir(&dir)
        .expect("read permuted dir")
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    cases.sort();
    assert!(!cases.is_empty(), "permuted corpus is empty");

    for case in &cases {
        let name = case.file_name().unwrap().to_string_lossy().into_owned();

        let expected = |mode: &str| -> Option<String> {
            let p = case.join(format!("{mode}.expected"));
            fs::read_to_string(p).ok().map(|s| s.replace("\r\n", "\n"))
        };
        let want_canonical = expected("canonical");
        let want_isonl = expected("canonical_isonl");

        let mut variants: Vec<PathBuf> = fs::read_dir(case)
            .expect("read case dir")
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("ison"))
            .collect();
        variants.sort();
        assert!(variants.len() > 1, "{name}: needs at least two variants");

        for v in &variants {
            let src = fs::read_to_string(v).expect("read variant").replace("\r\n", "\n");
            let doc = ison_rs::parse(&src).unwrap_or_else(|e| panic!("{name}: parse failed: {e}"));
            let label = v.file_name().unwrap().to_string_lossy();

            if let Some(ref want) = want_canonical {
                assert_eq!(*want, ison_rs::dumps_canonical(&doc).unwrap(), "{name}/{label} canonical");
            }
            if let Some(ref want) = want_isonl {
                assert_eq!(
                    *want,
                    ison_rs::dumps_canonical_isonl(&doc).expect("dumps_canonical_isonl"),
                    "{name}/{label} canonical ISONL"
                );
            }
        }
    }
}
