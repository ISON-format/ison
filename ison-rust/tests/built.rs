//! The benchmark/parity/built corpus: Documents constructed, not parsed.
//!
//! Everything in the flat corpus arrives via `loads`, so its names are safe by
//! construction -- the parser could not have produced an unwritable one. These
//! cases feed a plain data JSON through `json_to_document` instead, which is
//! the only path that can put a name like "first name" or "a:b" into a
//! Document.
//!
//! A case declares either an output or a rejection, never both.

#![cfg(feature = "serde")]

use std::fs;
use std::path::{Path, PathBuf};

use ison_rs::{dumps_canonical, dumps_canonical_isonl, json_to_document, ISONError};

fn built_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("workspace root")
        .join("benchmark")
        .join("parity")
        .join("built")
}

fn read(file: &str) -> Option<String> {
    fs::read_to_string(built_dir().join(file))
        .ok()
        .map(|s| s.replace("\r\n", "\n"))
}

fn cases() -> Vec<String> {
    match read("cases.txt") {
        Some(text) => text
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .map(str::to_owned)
            .collect(),
        None => Vec::new(),
    }
}

/// Map an error onto the corpus's neutral token. Error types are not shared
/// across seven languages, so the corpus holds a token and each implementation
/// supplies this shim.
fn classify(err: &ISONError) -> String {
    let text = err.message.to_lowercase();
    if text.contains("field") {
        "INVALID_FIELD_NAME".to_string()
    } else if text.contains("block") {
        "INVALID_BLOCK_NAME".to_string()
    } else {
        format!("UNCLASSIFIED({})", err.message)
    }
}

fn run_mode(name: &str, mode: &str, dump: fn(&ison_rs::Document) -> Result<String, ISONError>) {
    let want_err = read(&format!("{name}.{mode}.expect-error"));
    let want_out = read(&format!("{name}.{mode}.expected"));

    assert!(
        !(want_err.is_some() && want_out.is_some()),
        "{name}.{mode} declares both an output and a rejection"
    );

    let build = read(&format!("{name}.build.json"))
        .unwrap_or_else(|| panic!("missing {name}.build.json"));

    // A rejection may surface while building the Document or while serializing
    // it; the corpus only asserts that it surfaces.
    let result = json_to_document(&build).and_then(|doc| dump(&doc));

    match (want_err, want_out) {
        (Some(token), _) => match result {
            Err(e) => assert_eq!(token.trim(), classify(&e), "{name}.{mode}"),
            Ok(out) => panic!("{name}.{mode} serialized instead of being rejected: {out:?}"),
        },
        (None, Some(expected)) => match result {
            Ok(out) => assert_eq!(expected, out, "{name}.{mode}"),
            Err(e) => panic!("{name}.{mode} unexpected error: {e}"),
        },
        (None, None) => {}
    }
}

/// A corpus-driven loop over an empty list passes exactly like one that
/// checked everything, so assert the corpus was actually found.
fn require_cases() -> Vec<String> {
    let names = cases();
    assert!(
        !names.is_empty(),
        "built corpus not found at {} - this test would otherwise pass vacuously",
        built_dir().display()
    );
    names
}

#[test]
fn built_corpus_canonical() {
    for name in require_cases() {
        run_mode(&name, "canonical", |doc| dumps_canonical(doc));
    }
}

#[test]
fn built_corpus_canonical_isonl() {
    for name in require_cases() {
        run_mode(&name, "canonical_isonl", |doc| {
            dumps_canonical_isonl(doc).map(|s| s.trim_end_matches('\n').to_string())
        });
    }
}
