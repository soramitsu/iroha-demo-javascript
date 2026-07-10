# Pinned Solana Loader-v3 SBF validator

This standalone host helper performs local structural preflight on exact program
bytes supplied through standard input. It never accepts a file path and never
performs RPC or another network operation. The loader is pinned to
`solana-sbpf` 0.21.0, permits only SBPF V0, sets `reject_broken_elfs = true`,
resolves the syscalls used by the reviewed bridge and native-verifier artifacts,
and runs `RequisiteVerifier`. This is not exact-cluster admission: the signed
rollback-sentinel simulation against Solana testnet remains authoritative before
any checked extension or Loader-v3 upgrade.

Production evidence accepts only the release x86_64 Linux helper with successful
JIT compilation and Unix process limits. Build it from the checked-in lock file:

```sh
cargo build --release --locked --offline \
  --manifest-path native/solana-sbf-validator/Cargo.toml
```

Independently hash the exact release helper before evidence generation. The
wrapper authenticates that hash, copies those bytes into an operator-private
directory, rehashes the copy, and executes only that immutable copy with a
fail-closed timeout:

```sh
helper_sha="0x$(sha256sum native/solana-sbf-validator/target/release/iroha-demo-solana-sbf-validator | awk '{print $1}')"
printf '%s\n' "$helper_sha"
```

Generate canonical public evidence. Both expected hashes must come from an
independent review, not from the evidence command itself:

```sh
node scripts/solana-sbf-validation-evidence.mjs \
  --artifact output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so \
  --artifact-root output/sccp-solana-program-artifacts \
  --expected-artifact-sha256 0xcc2c7a8b91dd15fd561d9d9841546bace247e6967a4051137cb7ebd40f88b47c \
  --expected-validator-sha256 "$helper_sha" \
  > reviewed-bridge-sbf-validation-evidence.json
```

The wrapper writes the one canonical JSON byte sequence with no trailing
newline. The operator must independently hash those exact evidence bytes and
record the resulting lowercase `0x` SHA-256 in the reviewed Loader-v3 plan as
`target.sbfValidationEvidenceSha256`:

```sh
evidence_sha="0x$(shasum -a 256 reviewed-bridge-sbf-validation-evidence.json | awk '{print $1}')"
test "$(wc -c < reviewed-bridge-sbf-validation-evidence.json | tr -d ' ')" -gt 0
printf '%s\n' "$evidence_sha"
```

Review the evidence file and the independently calculated hash before plan
sign-off. It canonically binds the helper binary SHA-256, target triple, JIT
outcome, release profile, validator source-bundle and Cargo.lock hashes, embedded
rustc identity/hash, and local-only validation scope. The reviewed plan pins all
of this transitively through `target.sbfValidationEvidenceSha256`. Do not use a
signer, keypair, mnemonic, or credential path as an artifact path; the wrapper
rejects secret-like paths before opening them.

On x86_64 Linux, the complete mandatory release check builds both reviewed SBF
programs and the release helper, runs Rust and adversarial integration tests, and
fails if any prerequisite is missing:

```sh
npm run verify:sccp-solana-sbf-validator-production
```
