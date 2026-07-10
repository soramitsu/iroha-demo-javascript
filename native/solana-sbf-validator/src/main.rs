use solana_sbpf::{
    declare_builtin_function,
    elf::Executable,
    memory_region::MemoryMapping,
    program::{BuiltinFunctionDefinition, BuiltinProgram, SBPFVersion},
    verifier::RequisiteVerifier,
    vm::{Config, ContextObject},
};
use std::{
    io::{self, Read, Write},
    ptr::NonNull,
    sync::Arc,
};

const MAX_SBF_BYTES: u64 = 10 * 1024 * 1024;

#[cfg(target_os = "linux")]
fn apply_process_limits() -> Result<(), ()> {
    let limits = [
        (libc::RLIMIT_CPU, 20 as libc::rlim_t),
        (libc::RLIMIT_AS, 1024 * 1024 * 1024 as libc::rlim_t),
        (libc::RLIMIT_CORE, 0 as libc::rlim_t),
        (libc::RLIMIT_FSIZE, 64 * 1024 as libc::rlim_t),
        (libc::RLIMIT_NOFILE, 16 as libc::rlim_t),
    ];
    for (resource, value) in limits {
        let limit = libc::rlimit {
            rlim_cur: value,
            rlim_max: value,
        };
        // SAFETY: `limit` is a valid immutable rlimit structure and every
        // resource constant is provided by libc for this Unix target.
        if unsafe { libc::setrlimit(resource, &limit) } != 0 {
            return Err(());
        }
    }
    Ok(())
}

#[cfg(not(target_os = "linux"))]
fn apply_process_limits() -> Result<(), ()> {
    Ok(())
}

const RELEVANT_SOLANA_V0_SYSCALLS: &[&str] = &[
    "abort",
    "sol_curve_validate_point",
    "sol_get_sysvar",
    "sol_invoke_signed_rust",
    "sol_keccak256",
    "sol_log_",
    "sol_memcmp_",
    "sol_memcpy_",
    "sol_memset_",
    "sol_panic_",
    "sol_sha256",
    "sol_try_find_program_address",
];

struct ValidatorContext;

impl ContextObject for ValidatorContext {
    fn consume(&mut self, _amount: u64) {}

    fn get_remaining(&self) -> u64 {
        u64::MAX
    }

    fn active_mapping_ptr(&mut self) -> NonNull<MemoryMapping> {
        unreachable!("the validation-only context is never executed")
    }
}

declare_builtin_function!(
    RelocationOnlySyscall,
    fn rust(
        _context: &mut ValidatorContext,
        _arg_a: u64,
        _arg_b: u64,
        _arg_c: u64,
        _arg_d: u64,
        _arg_e: u64,
    ) -> Result<u64, io::Error> {
        Ok(0)
    }
);

fn read_stdin() -> Result<Vec<u8>, ()> {
    let mut bytes = Vec::new();
    io::stdin()
        .lock()
        .take(MAX_SBF_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ())?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_SBF_BYTES {
        return Err(());
    }
    Ok(bytes)
}

fn build_loader() -> Result<Arc<BuiltinProgram<ValidatorContext>>, ()> {
    let config = Config {
        reject_broken_elfs: true,
        enabled_sbpf_versions: SBPFVersion::V0..=SBPFVersion::V0,
        ..Config::default()
    };
    let mut loader = BuiltinProgram::new_loader(config);
    for name in RELEVANT_SOLANA_V0_SYSCALLS {
        RelocationOnlySyscall::register(&mut loader, name).map_err(|_| ())?;
    }
    Ok(Arc::new(loader))
}

fn validate(bytes: &[u8]) -> Result<&'static str, ()> {
    let loader = build_loader()?;
    let executable = Executable::<ValidatorContext>::from_elf(bytes, loader).map_err(|_| ())?;
    if executable.get_sbpf_version() != SBPFVersion::V0
        || !executable.get_config().reject_broken_elfs
    {
        return Err(());
    }
    executable.verify::<RequisiteVerifier>().map_err(|_| ())?;

    #[cfg(all(not(target_os = "windows"), target_arch = "x86_64"))]
    {
        executable.jit_compile().map_err(|_| ())?;
        Ok(concat!(
            "{\"schema\":\"iroha-demo-solana-sbf-validator-result/v2\",",
            "\"valid\":true,",
            "\"validationScope\":\"local-solana-sbpf-structural-preflight\",",
            "\"exactClusterAdmission\":false,",
            "\"validatorId\":\"agave-solana-sbpf-requisite-verifier\",",
            "\"validatorVersion\":\"0.21.0\",",
            "\"solanaSbpf\":\"0.21.0\",\"sbpfVersion\":\"V0\",",
            "\"rejectBrokenElfs\":true,\"requisiteVerifier\":true,",
            "\"helperTargetTriple\":\"",
            env!("IROHA_SBF_VALIDATOR_TARGET"),
            "\",\"jitOutcome\":\"compiled\",",
            "\"buildProfile\":\"",
            env!("IROHA_SBF_VALIDATOR_PROFILE"),
            "\",\"validatorSourceBundleSha256\":\"",
            env!("IROHA_SBF_VALIDATOR_SOURCE_BUNDLE_SHA256"),
            "\",\"cargoLockSha256\":\"",
            env!("IROHA_SBF_VALIDATOR_CARGO_LOCK_SHA256"),
            "\",\"rustcIdentity\":\"",
            env!("IROHA_SBF_VALIDATOR_RUSTC_IDENTITY"),
            "\",\"rustcIdentitySha256\":\"",
            env!("IROHA_SBF_VALIDATOR_RUSTC_IDENTITY_SHA256"),
            "\",\"resourceLimits\":\"",
            env!("IROHA_SBF_VALIDATOR_RESOURCE_LIMITS"),
            "\"}"
        ))
    }

    #[cfg(not(all(not(target_os = "windows"), target_arch = "x86_64")))]
    {
        Ok(concat!(
            "{\"schema\":\"iroha-demo-solana-sbf-validator-result/v2\",",
            "\"valid\":true,",
            "\"validationScope\":\"local-solana-sbpf-structural-preflight\",",
            "\"exactClusterAdmission\":false,",
            "\"validatorId\":\"agave-solana-sbpf-requisite-verifier\",",
            "\"validatorVersion\":\"0.21.0\",",
            "\"solanaSbpf\":\"0.21.0\",\"sbpfVersion\":\"V0\",",
            "\"rejectBrokenElfs\":true,\"requisiteVerifier\":true,",
            "\"helperTargetTriple\":\"",
            env!("IROHA_SBF_VALIDATOR_TARGET"),
            "\",\"jitOutcome\":\"unsupported-on-this-host\",",
            "\"buildProfile\":\"",
            env!("IROHA_SBF_VALIDATOR_PROFILE"),
            "\",\"validatorSourceBundleSha256\":\"",
            env!("IROHA_SBF_VALIDATOR_SOURCE_BUNDLE_SHA256"),
            "\",\"cargoLockSha256\":\"",
            env!("IROHA_SBF_VALIDATOR_CARGO_LOCK_SHA256"),
            "\",\"rustcIdentity\":\"",
            env!("IROHA_SBF_VALIDATOR_RUSTC_IDENTITY"),
            "\",\"rustcIdentitySha256\":\"",
            env!("IROHA_SBF_VALIDATOR_RUSTC_IDENTITY_SHA256"),
            "\",\"resourceLimits\":\"",
            env!("IROHA_SBF_VALIDATOR_RESOURCE_LIMITS"),
            "\"}"
        ))
    }
}

fn run() -> Result<(), ()> {
    apply_process_limits()?;
    if std::env::args_os().len() != 1 {
        return Err(());
    }
    let bytes = read_stdin()?;
    let result = validate(&bytes)?;
    io::stdout()
        .lock()
        .write_all(result.as_bytes())
        .map_err(|_| ())
}

fn main() {
    std::panic::set_hook(Box::new(|_| {
        let _ = io::stderr().write_all(b"SBF validation failed.\n");
    }));
    let outcome = std::panic::catch_unwind(run);
    if !matches!(outcome, Ok(Ok(()))) {
        if matches!(outcome, Ok(Err(()))) {
            let _ = io::stderr().write_all(b"SBF validation failed.\n");
        }
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loader_is_exactly_v0_and_rejects_broken_elfs() {
        let loader = build_loader().expect("loader");
        assert_eq!(
            loader.get_config().enabled_sbpf_versions,
            SBPFVersion::V0..=SBPFVersion::V0
        );
        assert!(loader.get_config().reject_broken_elfs);
    }

    #[test]
    fn magic_prefixed_junk_is_rejected() {
        let mut junk = b"\x7fELF".to_vec();
        junk.extend_from_slice(&[0; 256]);
        assert!(validate(&junk).is_err());
    }

    #[test]
    fn relevant_syscalls_are_unique_and_bounded() {
        let mut names = RELEVANT_SOLANA_V0_SYSCALLS.to_vec();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), RELEVANT_SOLANA_V0_SYSCALLS.len());
        assert!(names
            .iter()
            .all(|name| *name == "abort" || name.starts_with("sol_")));
    }
}
