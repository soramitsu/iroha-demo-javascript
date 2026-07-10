use sha2::{Digest, Sha256};
use std::{env, fs, path::Path, process::Command};

const SOURCE_BUNDLE_SCHEMA: &str = "iroha-demo-solana-sbf-validator-source-bundle/v1";
const SOURCE_FILES: &[&str] = &["Cargo.toml", "Cargo.lock", "build.rs", "src/main.rs"];

fn sha256(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut encoded = String::with_capacity(66);
    encoded.push_str("0x");
    for byte in digest {
        use std::fmt::Write as _;
        write!(&mut encoded, "{byte:02x}").expect("writing to String cannot fail");
    }
    encoded
}

fn source_bundle_hash(root: &Path) -> Result<(String, String), String> {
    let mut entries = Vec::with_capacity(SOURCE_FILES.len());
    let mut cargo_lock_hash = None;
    for relative in SOURCE_FILES {
        let bytes = fs::read(root.join(relative))
            .map_err(|_| format!("validator source file is missing: {relative}"))?;
        let file_hash = sha256(&bytes);
        if *relative == "Cargo.lock" {
            cargo_lock_hash = Some(file_hash.clone());
        }
        entries.push(format!(
            "{{\"path\":\"{relative}\",\"size\":{},\"sha256\":\"{file_hash}\"}}",
            bytes.len()
        ));
    }
    let manifest = format!(
        "{{\"schema\":\"{SOURCE_BUNDLE_SCHEMA}\",\"files\":[{}]}}",
        entries.join(",")
    );
    Ok((
        sha256(manifest.as_bytes()),
        cargo_lock_hash.ok_or_else(|| "validator Cargo.lock is missing".to_owned())?,
    ))
}

fn rustc_identity() -> Result<(String, String), String> {
    let rustc = env::var_os("RUSTC").ok_or_else(|| "RUSTC is not set".to_owned())?;
    let output = Command::new(rustc)
        .arg("-vV")
        .output()
        .map_err(|_| "rustc -vV could not be executed".to_owned())?;
    if !output.status.success() || !output.stderr.is_empty() {
        return Err("rustc -vV did not return clean identity output".to_owned());
    }
    let text = String::from_utf8(output.stdout)
        .map_err(|_| "rustc -vV output is not UTF-8".to_owned())?
        .replace("\r\n", "\n");
    let lines: Vec<_> = text
        .trim_end_matches('\n')
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    if lines.len() < 6
        || lines.iter().any(|line| {
            line.len() > 256
                || !line.is_ascii()
                || line
                    .bytes()
                    .any(|byte| byte < 0x20 || matches!(byte, b'"' | b'\\' | b';'))
        })
    {
        return Err("rustc -vV output is not a bounded canonical identity".to_owned());
    }
    let identity = lines.join(";");
    let identity_hash = sha256(identity.as_bytes());
    Ok((identity, identity_hash))
}

fn emit(name: &str, value: &str) {
    println!("cargo:rustc-env={name}={value}");
}

fn main() {
    for relative in SOURCE_FILES {
        println!("cargo:rerun-if-changed={relative}");
    }
    println!("cargo:rerun-if-env-changed=RUSTC");

    let root = env::var_os("CARGO_MANIFEST_DIR")
        .map(std::path::PathBuf::from)
        .expect("CARGO_MANIFEST_DIR must be set");
    let (source_bundle_hash, cargo_lock_hash) =
        source_bundle_hash(&root).expect("validator source bundle must be canonical");
    let (rustc_identity, rustc_identity_hash) =
        rustc_identity().expect("rustc identity must be canonical");
    let target = env::var("TARGET").expect("TARGET must be set");
    let profile = env::var("PROFILE").expect("PROFILE must be set");
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let resource_limits = if target_os == "linux" {
        "unix-rlimit-v1"
    } else {
        "wrapper-timeout-only"
    };

    emit("IROHA_SBF_VALIDATOR_TARGET", &target);
    emit("IROHA_SBF_VALIDATOR_PROFILE", &profile);
    emit("IROHA_SBF_VALIDATOR_RESOURCE_LIMITS", resource_limits);
    emit(
        "IROHA_SBF_VALIDATOR_SOURCE_BUNDLE_SHA256",
        &source_bundle_hash,
    );
    emit("IROHA_SBF_VALIDATOR_CARGO_LOCK_SHA256", &cargo_lock_hash);
    emit("IROHA_SBF_VALIDATOR_RUSTC_IDENTITY", &rustc_identity);
    emit(
        "IROHA_SBF_VALIDATOR_RUSTC_IDENTITY_SHA256",
        &rustc_identity_hash,
    );
}
