# SCCP native recursive verifier

This program verifies the TAIRA-to-Solana-testnet SCCP Groth16 proof once,
when a message-specific proof PDA is sealed. The bridge's final CPI contains
only the message id, SPL mint amount, and account references. There is no
inline proof, verification key, bundle, or payload compatibility path.

All instruction integers are little-endian and all instructions start with
`version = 1` followed by one opcode byte.

Production deployment order is security-critical. The destination, source,
and native-verifier Loader-v3 programs must first be deployed from the reviewed
ELFs, code-hash pinned, and made immutable by removing every upgrade authority.
Finalized transaction/slot evidence must prove all three finalization slots are
strictly earlier than material creation/sealing and both route-state
initializations. Never initialize under mutable code and finalize afterward;
mutable code could manufacture a forged sealed account. The exact V1 material
and payload ABI accepts route revision `1` only.

## PDA and instruction ABI

- Material PDA: `[b"sccp-vk-v1", verifier_key_keccak32, config_sha25632]`.
- Proof PDA: `[b"sccp-proof-v1", material_pubkey, message_id32, payer_pubkey]`.
- Bridge verifier authority: `[b"sccp-verify-authority-v1", bridge_state]`
  under the configured bridge program.
- Append payload for opcodes 1 and 4:
  `offset:u16 || length:u16 || bytes`. Length is 1 through 512 and offset must
  equal the account's current written length. Gaps, overlap, rewrites, trailing
  data, and writes after sealing are rejected.

| Opcode                | Data after version/opcode                                                                                                                                                                                                                                       | Accounts, in exact order                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 initialize material | `vk_sha256[32]`, `vk_keccak[32]`, `config_sha256[32]`, `route_revision:u32`, `asset_len:u8`, exact ASCII asset key `xor`, then seven hashes: destination binding, route config, SORA anchor, semantic profile, circuit, witness generator, public-signal schema | payer/material authority (signer, writable), material PDA (writable), native verifier Program, native verifier ProgramData, destination Program, destination ProgramData, source Program, source ProgramData, destination route-state PDA, destination verifier-authority PDA, fresh classic SPL mint (signer), classic SPL Token program, System program |
| 1 append material     | bounded append payload                                                                                                                                                                                                                                          | material authority (signer), material PDA (writable)                                                                                                                                                                                                                                                                                                      |
| 2 seal material       | empty                                                                                                                                                                                                                                                           | material authority (signer), material PDA (writable)                                                                                                                                                                                                                                                                                                      |
| 3 initialize proof    | `body_len:u16`, `body_sha256[32]`, `message_id[32]`, `payload_hash[32]`, `statement_hash[32]`, `destination_token[32]`, `spl_amount:u64`                                                                                                                        | payer (signer, writable), proof PDA (writable), sealed material PDA, destination token account, system program                                                                                                                                                                                                                                            |
| 4 append proof        | bounded append payload                                                                                                                                                                                                                                          | payer (signer), proof PDA (writable)                                                                                                                                                                                                                                                                                                                      |
| 5 seal proof          | empty                                                                                                                                                                                                                                                           | payer (signer), proof PDA (writable), sealed material PDA, destination token account                                                                                                                                                                                                                                                                      |
| 6 verify sealed proof | `message_id[32]`, `spl_amount:u64`                                                                                                                                                                                                                              | payer (signer, writable), bridge verifier authority (signer, read-only), bridge state, mint, destination token, material PDA, proof PDA                                                                                                                                                                                                                   |

The proof body is exactly:

```text
public_inputs[141]
statement_hash[32]
groth16_proof[384]
payload_len:u16
canonical_payload[payload_len <= 512]
```

The Solana XOR mint and canonical TAIRA payload both use nine decimal places.
The amount in the proof header and compact verify instruction is therefore the
exact canonical payload mantissa (`multiplier = 1`) expressed as an SPL `u64`.
Values outside the full SPL `u64` base-unit domain are rejected; there is no
legacy Solana `1_000_000_000` expansion path.

## Account layouts

Material accounts are 1,984 bytes: a 768-byte header and the 1,216-byte
canonical eleven-signal Groth16 verification key.

| Field                                                              |                Offset |
| ------------------------------------------------------------------ | --------------------: |
| status / bump / written                                            |           9 / 10 / 12 |
| route revision / asset length                                      |               16 / 20 |
| pre-seal authority                                                 |                    32 |
| VK SHA-256 / VK Keccak / config SHA-256                            |         64 / 96 / 128 |
| bridge program / authority / state                                 |       160 / 192 / 224 |
| mint / token program                                               |             256 / 288 |
| destination binding / route config / SORA anchor                   |       320 / 352 / 384 |
| semantic profile / circuit / witness generator / schema commitment | 416 / 448 / 480 / 512 |
| exact signal schema / source lane hash / destination lane hash     |       544 / 576 / 608 |
| asset / route id / source program / verification key               | 640 / 704 / 736 / 768 |

Proof accounts have a 448-byte header followed by their exact bounded body.

| Field                                           |           Offset |
| ----------------------------------------------- | ---------------: |
| status / bump / written / body length           | 9 / 10 / 12 / 14 |
| route revision / pre-seal authority / material  |     16 / 32 / 64 |
| body SHA-256 / sealed account SHA-256           |         96 / 128 |
| message / payload / statement hashes            |  160 / 192 / 224 |
| destination token / payer / SPL amount          |  256 / 288 / 320 |
| settlement context / config SHA-256 / VK Keccak |  328 / 360 / 392 |
| sealed slot / body                              |        424 / 448 |

Sealing zeroes the upload authority. No instruction can reopen, overwrite, or
close sealed material or proof accounts. Production remains fail-closed until
reviewed governed material is uploaded completely and passes key hashing,
curve/subgroup validation, and sealing; the deterministic key used by unit
tests is not deployment material.

Material initialization verifies the destination, source, and native verifier
as distinct immutable Loader-v3 programs and stores the exact source program at
header bytes 736 through 767. It also requires a fresh signer mint owned by the
classic SPL Token program, with nine decimals, zero supply, and authority
`["sccp-mint-authority-v1", destination_state]` under the destination program.
The destination state itself is the canonical uninitialized PDA
`["sccp-route-state-v1", 1, mint]`; it is not a signer or operator-selected
keypair. The mint signature plus atomic mint creation/initialization/material
initialization prevents deterministic material-PDA squatting, while subsequent
route initialization remains safe and permissionless because both programs
accept only the complete sealed binding.

The material config is SHA-256 over the exact V1 domain, wire version,
canonical SORA-Taira and Solana-testnet network bytes, route id, revision,
`xor`, multiplier `1`, verification-key Keccak hash, verifier program,
destination program, source program, destination state, mint, classic SPL
Token program, both lane hashes, and the governed
anchor/semantic/circuit/witness/schema commitments. The
destination-binding and route-configuration hashes are sealed in the material
but intentionally excluded from this preimage because both already commit the
config hash and material PDA; including either would require a cryptographic
fixed point. Every verify CPI compares the sealed hashes back to the exact
destination state. All G2 points additionally undergo an explicit prime-order
subgroup check because the underlying Agave BN254 syscalls only guarantee
on-curve deserialization. Proof sealing also recomputes the exact
TAIRA-to-Solana lane-bound message id from the canonical payload. The compact
verify CPI accepts only a proof sealed in the current Solana slot, so the
wallet's proof-seal and destination-finalize instructions must remain in one
atomic transaction and no historical pre-finalization proof PDA can be replayed.
