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
            ison_rs::dumps_canonical(&doc),
            "{case}: canonical ISON"
        );

        assert_eq!(
            read(case, "dumps.expected"),
            ison_rs::dumps(&doc, false),
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
        let once = ison_rs::dumps_canonical(&doc);
        let reparsed = ison_rs::parse(&once).expect("reparse canonical");
        assert_eq!(once, ison_rs::dumps_canonical(&reparsed), "{case}");
    }
}
