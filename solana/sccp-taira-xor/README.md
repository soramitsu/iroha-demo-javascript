# TAIRA XOR SCCP Solana route program

This standalone SBF crate is the exact first-release value-moving program for
the `taira_sol_xor` Solana-testnet route. The same reviewed source produces two
different compile-time role-gated ELFs at different program addresses: the
destination ELF accepts only TAIRA-to-Solana initialization/finalization, and
the source ELF accepts only Solana-to-TAIRA initialization/burn. Their code
hashes must differ and may not be substituted for one another.
Their immutable states name each other and must match every governed route,
mint, native-verifier, key, configuration, lane, and revision field.

Before creating any mint, material, route state, or proof account, deploy the
destination, source, and native-verifier programs, pin their reviewed ELF
hashes, and remove all three Loader-v3 upgrade authorities. Finalized RPC
evidence must prove those immutable ProgramData slots precede every subsequent
initialization transaction. Post-hoc finalization is not equivalent: mutable
code could otherwise forge a sealed account that the reviewed executable never
created.

Only after all three programs are immutable may the operator create the fresh
classic SPL XOR mint and initialize native-verifier material. Those two actions
must share one atomic transaction: mint account creation, nine-decimal mint
initialization, and material initialization. The fresh mint key signs that
transaction, so an observer cannot pre-create or substitute the reviewed mint.
The mint starts with zero supply and uses
`["sccp-mint-authority-v1", destination_state]` under the destination program
as its authority.

Route states are not operator keypairs. They are deterministic program-derived
addresses:

- destination: `["sccp-route-state-v1", 1, mint]` under the destination
  program;
- source: `["sccp-route-state-v1", 2, mint]` under the source program.

Material is uploaded and sealed in bounded chunks before either route PDA is
created. Once it is sealed, anyone may fund an exact route initialization, but
the program creates only the canonical PDA and accepts only the complete sealed
configuration. A competing exact initialization is harmless; a divergent one
cannot pass. Source, destination, and native-verifier program addresses must
all be distinct. This first-release ABI accepts route revision `1` only.
The route program also checks the material's exact account length, magic,
sealed status, zeroed upload authority, full VK length, key hash, config hash,
source and destination program identities, destination state, mint, token
program, route commitments, and directed lanes; neither route role can
initialize against writing or substituted material.
Initialization data is
`[1, 1, role, revision:u32le, destination_state[32], destination_binding[32], route_config[32], verifier_key_keccak[32], verifier_config_sha256[32]]`.
Its exact eight accounts are writable signing payer, writable uninitialized
route-state PDA (not a signer), writable mint, executable peer program,
executable native verifier, verifier-owned material PDA, executable classic SPL
Token program, and executable System program. Role is `1` for destination and
`2` for source.

## Destination settlement

`finalize_from_taira` data is the compact fixed wire
`[1, 2, message_id[32], spl_amount:u64le]`. It takes exactly:

1. writable payer, signer, payload recipient, and SPL owner;
2. writable destination route state;
3. writable governed SPL XOR mint;
4. writable destination SPL token account;
5. read-only sealed verifier-material PDA;
6. read-only sealed message-proof PDA;
7. executable native-verifier program;
8. read-only bridge verifier-authority PDA;
9. read-only mint-authority PDA;
10. writable destination replay-receipt PDA;
11. executable classic SPL Token program; and
12. executable System program.

The material PDA is
`["sccp-vk-v1", verifier_key_keccak, verifier_config_sha256]` under the
native verifier. The proof PDA is
`["sccp-proof-v1", material, message_id, payer]`. The route validates both
owners and derivations, then signs the verifier's exact seven-account CPI with
`["sccp-verify-authority-v1", route_state]`. CPI data is
`[1, 6, message_id[32], spl_amount:u64le]`.

The verifier owns all proof parsing and enforces the canonical directed lane,
revision, codec-6 raw Solana recipient, payload, governed configuration, and
`taira_scale_9_mantissa == spl_base_units`. Only after verification may the
route create `["sccp-destination-receipt-v1", state, message_id]` and mint the
9-decimal SPL amount. Transaction atomicity rolls back the receipt if the mint
fails.

## Source settlement

`burn_to_taira` data is
`[1, 3, spl_amount:u64le, nonce:u64le, recipient_len:u16le, recipient]`. It
takes exactly:

1. writable SPL owner, signer, and receipt payer;
2. writable source route state;
3. read-only peer destination route state;
4. writable governed SPL XOR mint;
5. writable source SPL token account;
6. writable source receipt PDA;
7. executable classic SPL Token program; and
8. executable System program.

The positive SPL base-unit amount is copied exactly into the canonical SCCP
payload as the TAIRA scale-9 mantissa; there is no Solana decimal conversion
factor. Sender bytes are the raw 32-byte signer under codec 6. The recipient
must be a checksum-valid TAIRA network-369 I105 single-key Ed25519 address in the prime-order subgroup;
aliases, alternate networks, mixed-torsion keys, weak keys, and textual
lookalikes fail closed.

The program burns before creating
`["sccp-source-receipt-v1", source_state, message_id]`. The fixed receipt and
binary event log commit the exact Solana-testnet-to-TAIRA lane hash, canonical
payload, lane-bound message ID, payload hash, source-event digest, both economic
amounts, route revision, source/destination states, mint, owner, source token,
nonce, and slot. This path emits no fabricated TAIRA hub commitment, finality
proof, or Merkle bundle.

The state records lifetime minted and burned base-unit totals as operational
telemetry. Those counters saturate at `u64::MAX` (which means "at least this
much") so recycled bridge volume can never disable an otherwise valid
settlement. The operation counter remains checked and fails closed on overflow.

Both settlement handlers rederive their expected route-state PDAs from the
governed mint and role before trusting state bytes. The source path also
rederives and validates its destination peer PDA. Passing a same-owner account
with copied or hostile state bytes is therefore rejected.

## Verification

```sh
cargo test --manifest-path solana/sccp-taira-xor/Cargo.toml
cargo clippy --manifest-path solana/sccp-taira-xor/Cargo.toml --all-targets -- -D warnings
cargo build-sbf --manifest-path solana/sccp-taira-xor/Cargo.toml -- --locked --no-default-features --features destination-program
cargo build-sbf --manifest-path solana/sccp-taira-xor/Cargo.toml -- --locked --no-default-features --features source-program
```

The repository packaging wrapper remains the release path:

```sh
npm run sccp:solana:build-program
```

After governance has reviewed the immutable program evidence, route hashes,
and 1,216-byte verification key, the resumable production initializer is:

```sh
npm run sccp:solana:exact-initialize -- \
  --input reviewed-solana-initializer-input.json \
  --expected-input-sha256 0x... \
  --journal public-solana-initializer-journal.json \
  --evidence solana-ordered-initialization-evidence.json \
  --payer-env SCCP_SOLANA_INITIALIZER_SIGNER \
  --submit true
```

The payer secret is accepted only at runtime through the named environment
variable (`hex:` or `base64:` form); the journal contains no secret key. The
initializer persists the signed atomic bootstrap wire before submission,
performs finalized readback after every stage, resumes safely across process
failure, and emits ordered transaction evidence only after all exact account
inspectors and RPC action checks pass.

The program is only one deployment component. The public route must remain
inactive until governance publishes the exact immutable source/destination
program identities, sealed verifier material, reviewed circuit commitments,
and successful live bidirectional evidence.
