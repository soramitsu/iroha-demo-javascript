# TAIRA XOR SCCP Solana Program

This standalone Solana SBF crate builds the testnet verifier surface used by
the `taira_sol_xor` operator workflow. It is not, by itself, sufficient for a
production-ready TAIRA route.

It accepts the `borsh_instruction_v1` envelope emitted by the Iroha SCCP SDK for
`submit_sccp_message_proof`, validates the envelope shape and proof-context
hash arguments, and records accepted submissions into a program-owned state
account. The crate is intentionally outside the Iroha Cargo workspace so the
workspace `Cargo.lock` is not touched by Solana toolchain builds.

Build:

```sh
cargo build-sbf --manifest-path solana/sccp-taira-xor/Cargo.toml --sbf-out-dir output/sccp-solana-build
```

The resulting `sccp_taira_xor.so` can be deployed with:

```sh
npm run sccp:solana:deploy -- all --program-so output/sccp-solana-build/sccp_taira_xor.so --template <manifest-template>
```

Do not mark a public TAIRA route `production_ready` until the deployed Solana
program and browser proof modules verify the governed proof family required by
the route manifest. Production manifests must advertise
`destinationProofAdmission.admissionMode = "governed-zk-verifier-v1"`; the
current envelope-recorder deployment must stay fail-closed.
