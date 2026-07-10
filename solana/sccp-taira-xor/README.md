# TAIRA XOR SCCP Solana Program

This standalone Solana SBF crate builds the testnet verifier surface used by
the `taira_sol_xor` operator workflow. It is not, by itself, sufficient for a
production-ready TAIRA route.

It parses the `borsh_instruction_v1` envelope emitted by the Iroha SCCP SDK for
`submit_sccp_message_proof` and validates the envelope shape plus proof-context
hash arguments. Submit envelopes must also bind to the canonical
`taira_sol_xor` destination binding hash before the verifier branch is reached.
Destination proof submission fails closed until `configure_native_recursive_verifier`
stores a governed native verifier program id plus reviewed material/config
hashes in the program state. Configuration is one-shot and immediately locked;
both this bridge and the configured verifier must already be immutable
upgradeable-loader programs whose ProgramData accounts have no upgrade
authority. The submit path then calls that verifier over CPI
with the `SCCP_SOLANA_NATIVE_RECURSIVE_VERIFIER_CPI_V1` marker before any state
mutation or SPL XOR mint. Submit calls parse the canonical transfer bundle,
recompute its message id, require its recipient to be the signing SPL owner,
validate the exact mint and destination token account, and bind all of those
fields plus the amount into the proof context passed to the native verifier.
After verification they atomically create a writable per-message PDA receipt;
the PDA is the transaction-level nullifier, so exact or concurrent replay can
never mint twice. It must not record destination submissions or mint SPL XOR
from shape-only proof envelopes. The crate is intentionally outside the
Iroha Cargo workspace so the workspace `Cargo.lock` is not touched by Solana
toolchain builds.

The reverse `burn_to_taira` instruction is also fail-closed. Its three envelope
arguments are the positive SPL amount as an eight-byte little-endian `u64`, a
canonical TAIRA I105 recipient, and a positive nonce in the same canonical
eight-byte form. For this first release the recipient must be a current,
checksum-valid TAIRA (`test...`, network discriminant 369) single-key Ed25519
I105 address; aliases, Minamoto literals, numeric/non-canonical sentinels,
Unicode lookalikes, weak keys, and checksum mutations are rejected on-chain.
The source and mint must be classic SPL Token accounts for the exact route
mint; the source must be initialized, owned by the signer, funded for the full
amount, and unfrozen, while the mint must retain the route PDA mint authority,
use nine decimals, and have no freeze authority.
The instruction takes exactly these accounts, in order:

1. writable signing SPL owner and receipt payer;
2. writable program-owned route state;
3. writable SPL source token account;
4. writable route SPL mint;
5. executable SPL Token program;
6. writable burn-receipt PDA; and
7. executable System program.

The burn-receipt PDA uses seeds
`["sccp-source-burn-receipt", state, owner, nonce_le_u64]`. It makes each nonce
one-time for an owner within a route state, including concurrent submissions
and attempts to reuse the nonce with a substituted source, recipient, or
amount. The receipt records the exact state/mint/owner/source, recipient hash,
amount, nonce, slot, and the domain-separated event digest. That digest binds
`program_id`, state, mint, owner, source token, length-delimited canonical
recipient bytes, amount, nonce, and slot under
`sccp:solana:source-burn:v1`. A pre-funded zero-data System-owned PDA is valid;
any already program-owned or data-bearing receipt is a replay/error.

Build:

```sh
npm run sccp:solana:build-program
```

Use the repository wrapper, which builds both Solana programs without allowing
`cargo-build-sbf` to generate its automatic deployment keypair. The bridge ELF
is written to
`output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so`; the native
recursive verifier ELF is written alongside it under `native-verifier/`.
Both crates have committed lockfiles and pinned Rust toolchain manifests. The
wrapper requires the reviewed `cargo-build-sbf 4.1.0` + platform-tools `v1.54`
toolchain, builds SBF arch `v0` with `--locked`, rejects build-metadata drift,
and strips operator/wallet secrets from the Cargo child environment.

The resulting `sccp_taira_xor.so` can be deployed with:

```sh
npm run sccp:solana:deploy -- all --program-so output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so --template <manifest-template>
```

Do not mark a public TAIRA route `production_ready` until the deployed Solana
program and browser proof modules verify the governed proof family required by
the route manifest. Production manifests must advertise
`destinationProofAdmission.admissionMode = "governed-zk-verifier-v1"`; the
Solana SBF must be immutable, free of the old unlinked-verifier sentinel, and
must contain the native-verifier CPI marker above. The current draft deployment
rejects destination proof submissions and must stay fail-closed until those
conditions and the governed proof-material ceremony pass.
