//! Exact first-release Solana program for the bidirectional `taira_sol_xor`
//! SCCP route.
//!
//! Two reviewed, compile-time role-gated executables are built from this
//! source and deployed under different program addresses. One accepts only the
//! Solana destination route and the other only the Solana source emitter; each
//! names the independently governed peer deployment. Destination settlement consumes
//! an opaque, sealed proof PDA owned by the separately deployed native BN254
//! verifier.  Source settlement burns SPL XOR and records only the canonical
//! Solana-to-TAIRA payload, lane-bound message identity, and source event; it
//! never manufactures a TAIRA hub commitment or Merkle proof.

#![allow(unexpected_cfgs)]

#[cfg(all(feature = "destination-program", feature = "source-program"))]
compile_error!("SCCP Solana SBF builds must select exactly one route role");
#[cfg(all(
    target_os = "solana",
    not(any(feature = "destination-program", feature = "source-program"))
))]
compile_error!(
    "deployable SCCP Solana SBF builds must select destination-program or source-program"
);

use blake2::{
    digest::{Update, VariableOutput},
    Blake2bVar,
};
use solana_curve25519::{
    edwards::{add_edwards, multiply_edwards, validate_edwards, PodEdwardsPoint},
    scalar::PodScalar,
};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    instruction::{AccountMeta, Instruction},
    keccak::hashv as keccak_hashv,
    log::sol_log_data,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::Sysvar,
};
use solana_system_interface::{instruction as system_instruction, program as system_program};
use std::str;

entrypoint!(process_instruction);

const WIRE_VERSION: u8 = 1;
const OPCODE_INITIALIZE: u8 = 1;
const OPCODE_FINALIZE_FROM_TAIRA: u8 = 2;
const OPCODE_BURN_TO_TAIRA: u8 = 3;
const VERIFIER_OPCODE_VERIFY_SEALED_PROOF: u8 = 6;

const ROLE_DESTINATION: u8 = 1;
const ROLE_SOURCE: u8 = 2;
const ROUTE_REVISION: u32 = 1;

#[cfg(feature = "destination-program")]
const COMPILED_ROLE: u8 = ROLE_DESTINATION;
#[cfg(feature = "source-program")]
const COMPILED_ROLE: u8 = ROLE_SOURCE;
#[cfg(not(any(feature = "destination-program", feature = "source-program")))]
const COMPILED_ROLE: u8 = 0;

const STATE_MAGIC: &[u8; 8] = b"SCCPRT01";
const STATE_LEN: usize = 400;
const STATE_VERSION_OFFSET: usize = 8;
const STATE_ROLE_OFFSET: usize = 9;
const STATE_VERIFY_BUMP_OFFSET: usize = 10;
const STATE_MINT_BUMP_OFFSET: usize = 11;
const STATE_REVISION_OFFSET: usize = 12;
const STATE_MINT_OFFSET: usize = 16;
const STATE_PEER_PROGRAM_OFFSET: usize = 48;
const STATE_DESTINATION_STATE_OFFSET: usize = 80;
const STATE_VERIFIER_PROGRAM_OFFSET: usize = 112;
const STATE_MATERIAL_OFFSET: usize = 144;
const STATE_DESTINATION_BINDING_OFFSET: usize = 176;
const STATE_ROUTE_CONFIGURATION_OFFSET: usize = 208;
const STATE_VERIFIER_KEY_HASH_OFFSET: usize = 240;
const STATE_VERIFIER_CONFIG_HASH_OFFSET: usize = 272;
const STATE_SOURCE_LANE_HASH_OFFSET: usize = 304;
const STATE_DESTINATION_LANE_HASH_OFFSET: usize = 336;
// Lifetime volume is operational telemetry, not an admission invariant. A
// value of `u64::MAX` means that the corresponding counter has saturated.
const STATE_TOTAL_MINTED_OFFSET: usize = 368;
const STATE_TOTAL_BURNED_OFFSET: usize = 376;
const STATE_LAST_SLOT_OFFSET: usize = 384;
const STATE_OPERATION_COUNT_OFFSET: usize = 392;

const MATERIAL_MAGIC: &[u8; 8] = b"SCCPMAT1";
const MATERIAL_ACCOUNT_LEN: usize = 1_984;
const MATERIAL_STATUS_OFFSET: usize = 9;
const MATERIAL_WRITTEN_OFFSET: usize = 12;
const MATERIAL_ROUTE_REVISION_OFFSET: usize = 16;
const MATERIAL_ASSET_LEN_OFFSET: usize = 20;
const MATERIAL_AUTHORITY_OFFSET: usize = 32;
const MATERIAL_VK_KECCAK_OFFSET: usize = 96;
const MATERIAL_CONFIG_SHA256_OFFSET: usize = 128;
const MATERIAL_BRIDGE_PROGRAM_OFFSET: usize = 160;
const MATERIAL_BRIDGE_AUTHORITY_OFFSET: usize = 192;
const MATERIAL_BRIDGE_STATE_OFFSET: usize = 224;
const MATERIAL_MINT_OFFSET: usize = 256;
const MATERIAL_TOKEN_PROGRAM_OFFSET: usize = 288;
const MATERIAL_DESTINATION_BINDING_OFFSET: usize = 320;
const MATERIAL_ROUTE_CONFIGURATION_OFFSET: usize = 352;
const MATERIAL_SOURCE_LANE_HASH_OFFSET: usize = 576;
const MATERIAL_DESTINATION_LANE_HASH_OFFSET: usize = 608;
const MATERIAL_ASSET_OFFSET: usize = 640;
const MATERIAL_ROUTE_ID_OFFSET: usize = 704;
const MATERIAL_SOURCE_PROGRAM_OFFSET: usize = 736;
const MATERIAL_STATUS_SEALED: u8 = 2;
const MATERIAL_VERIFYING_KEY_LEN: u16 = 1_216;

const DESTINATION_RECEIPT_MAGIC: &[u8; 8] = b"SCCPDS01";
const DESTINATION_RECEIPT_LEN: usize = 272;
const SOURCE_RECEIPT_MAGIC: &[u8; 8] = b"SCCPSR01";
const SOURCE_RECEIPT_HEADER_LEN: usize = 384;
const SOURCE_RECEIPT_LEN: usize = SOURCE_RECEIPT_HEADER_LEN + MAX_CANONICAL_PAYLOAD_BYTES;

const VERIFY_AUTHORITY_SEED: &[u8] = b"sccp-verify-authority-v1";
const MINT_AUTHORITY_SEED: &[u8] = b"sccp-mint-authority-v1";
const ROUTE_STATE_SEED: &[u8] = b"sccp-route-state-v1";
const MATERIAL_PDA_SEED: &[u8] = b"sccp-vk-v1";
const PROOF_PDA_SEED: &[u8] = b"sccp-proof-v1";
const DESTINATION_RECEIPT_SEED: &[u8] = b"sccp-destination-receipt-v1";
const SOURCE_RECEIPT_SEED: &[u8] = b"sccp-source-receipt-v1";

const LANE_HASH_PREFIX: &[u8] = b"sccp:lane-id:v1";
const PAYLOAD_HASH_PREFIX: &[u8] = b"sccp:payload:v1";
const MESSAGE_ID_PREFIX: &[u8] = b"sccp:lane-message-id:v1";
const SOURCE_EVENT_PREFIX: &[u8] = b"sccp:source:event:v1";
const SOURCE_RECEIPT_HASH_PREFIX: &[u8] = b"sccp:solana:burn-receipt-state:v1";
const SOURCE_LOG_MARKER: &[u8] = b"SCCP_SOLANA_SOURCE_EVENT_V1";

const SCCP_DOMAIN_SORA: u32 = 0;
const SCCP_DOMAIN_SOLANA: u32 = 3;
const NETWORK_TAG_SORA_TAIRA: u8 = 1;
const NETWORK_TAG_SOLANA_TESTNET: u8 = 13;
const CODEC_CANONICAL_TEXT: u8 = 1;
const CODEC_SOLANA_PUBKEY32: u8 = 6;
const PAYLOAD_TRANSFER_DISCRIMINANT: u8 = 2;
const XOR_ASSET_KEY: &[u8] = b"xor";
const ROUTE_ID: &[u8] = b"taira_sol_xor";
// TAIRA XOR numeric mantissas and the wrapped SPL mint both use scale 9.
// Keeping their base units identical preserves the full governed u64 supply
// domain without a cross-chain decimal conversion.
const XOR_SPL_DECIMALS: u8 = 9;
pub const TAIRA_TO_SPL_MULTIPLIER: u64 = 1;
const MAX_TAIRA_ACCOUNT_BYTES: usize = 128;
const MAX_CANONICAL_PAYLOAD_BYTES: usize = 512;
const TAIRA_I105_SENTINEL: &str = "test";
const I105_CHECKSUM_LEN: usize = 6;
const I105_BASE: u32 = 105;
const BECH32M_CONST: u32 = 0x2bc8_30a3;
const I105_CURRENT_HEADER_SINGLE_KEY: u8 = 0b0000_0010;
const I105_CONTROLLER_SINGLE_KEY_TAG: u8 = 0;
const I105_CURVE_ED25519: u8 = 1;
const ED25519_PUBLIC_KEY_LEN: usize = 32;
const ED25519_FIELD_MODULUS: [u8; ED25519_PUBLIC_KEY_LEN] = {
    let mut modulus = [0xff; ED25519_PUBLIC_KEY_LEN];
    modulus[0] = 0xed;
    modulus[ED25519_PUBLIC_KEY_LEN - 1] = 0x7f;
    modulus
};
const ED25519_GROUP_ORDER_MINUS_ONE: PodScalar = PodScalar([
    0xec, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde, 0x14,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10,
]);
const ED25519_IDENTITY: PodEdwardsPoint = PodEdwardsPoint([
    1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);
const ED25519_SMALL_ORDER_POINTS: [[u8; ED25519_PUBLIC_KEY_LEN]; 8] = [
    [
        1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0,
    ],
    [
        199, 23, 106, 112, 61, 77, 216, 79, 186, 60, 11, 118, 13, 16, 103, 15, 42, 32, 83, 250, 44,
        57, 204, 198, 78, 199, 253, 119, 146, 172, 3, 122,
    ],
    [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 128,
    ],
    [
        38, 232, 149, 143, 194, 178, 39, 176, 69, 195, 244, 137, 242, 239, 152, 240, 213, 223, 172,
        5, 211, 198, 51, 57, 177, 56, 2, 136, 109, 83, 252, 5,
    ],
    [
        236, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
        255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 127,
    ],
    [
        38, 232, 149, 143, 194, 178, 39, 176, 69, 195, 244, 137, 242, 239, 152, 240, 213, 223, 172,
        5, 211, 198, 51, 57, 177, 56, 2, 136, 109, 83, 252, 133,
    ],
    [0; ED25519_PUBLIC_KEY_LEN],
    [
        199, 23, 106, 112, 61, 77, 216, 79, 186, 60, 11, 118, 13, 16, 103, 15, 42, 32, 83, 250, 44,
        57, 204, 198, 78, 199, 253, 119, 146, 172, 3, 250,
    ],
];

const SORA_TAIRA_CHAIN_ID_BYTES: [u8; 16] = [
    0xfc, 0x56, 0x98, 0x4b, 0x2b, 0xe7, 0x43, 0x1d, 0x84, 0x0e, 0x21, 0x51, 0x4d, 0x18, 0x83, 0xf0,
];
const SOLANA_TESTNET_GENESIS_HASH: [u8; 32] = [
    0x3a, 0x13, 0x2e, 0xce, 0x10, 0x30, 0x5e, 0xc1, 0x83, 0x07, 0x25, 0x50, 0x2f, 0xa2, 0xb7, 0xe7,
    0xeb, 0x81, 0x57, 0xe9, 0x12, 0x3d, 0x4c, 0x1f, 0x65, 0x4a, 0x71, 0x78, 0x71, 0x61, 0xdc, 0x21,
];

const TOKEN_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172, 28, 180, 133, 237,
    95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169,
]);
const TOKEN_INSTRUCTION_MINT_TO: u8 = 7;
const TOKEN_INSTRUCTION_BURN: u8 = 8;

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let (&version, rest) = instruction_data
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;
    let (&opcode, body) = rest
        .split_first()
        .ok_or(ProgramError::InvalidInstructionData)?;
    if version != WIRE_VERSION {
        msg!("unsupported SCCP Solana wire version");
        return Err(ProgramError::InvalidInstructionData);
    }
    match opcode {
        OPCODE_INITIALIZE => initialize(program_id, accounts, body),
        OPCODE_FINALIZE_FROM_TAIRA if COMPILED_ROLE != ROLE_SOURCE => {
            finalize_from_taira(program_id, accounts, body)
        }
        OPCODE_BURN_TO_TAIRA if COMPILED_ROLE != ROLE_DESTINATION => {
            burn_to_taira(program_id, accounts, body)
        }
        OPCODE_FINALIZE_FROM_TAIRA | OPCODE_BURN_TO_TAIRA => {
            msg!("SCCP opcode is disabled for this immutable program role");
            Err(ProgramError::InvalidInstructionData)
        }
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct InitializeArgs {
    role: u8,
    route_revision: u32,
    destination_state: Pubkey,
    destination_binding_hash: [u8; 32],
    route_configuration_hash: [u8; 32],
    verifier_key_hash: [u8; 32],
    verifier_config_hash: [u8; 32],
}

impl InitializeArgs {
    const LEN: usize = 1 + 4 + 32 * 5;

    fn parse(body: &[u8]) -> Result<Self, ProgramError> {
        if body.len() != Self::LEN {
            return Err(ProgramError::InvalidInstructionData);
        }
        let mut cursor = Cursor::new(body);
        let role = cursor.u8()?;
        let route_revision = cursor.u32()?;
        let destination_state = Pubkey::new_from_array(cursor.array32()?);
        let destination_binding_hash = cursor.array32()?;
        let route_configuration_hash = cursor.array32()?;
        let verifier_key_hash = cursor.array32()?;
        let verifier_config_hash = cursor.array32()?;
        if !cursor.finished()
            || !matches!(role, ROLE_DESTINATION | ROLE_SOURCE)
            || route_revision != ROUTE_REVISION
            || !hashes_nonzero_distinct(&[
                destination_binding_hash,
                route_configuration_hash,
                verifier_key_hash,
                verifier_config_hash,
            ])
        {
            return Err(ProgramError::InvalidInstructionData);
        }
        Ok(Self {
            role,
            route_revision,
            destination_state,
            destination_binding_hash,
            route_configuration_hash,
            verifier_key_hash,
            verifier_config_hash,
        })
    }
}

fn initialize(program_id: &Pubkey, accounts: &[AccountInfo], body: &[u8]) -> ProgramResult {
    let args = InitializeArgs::parse(body)?;
    if COMPILED_ROLE != 0 && args.role != COMPILED_ROLE {
        msg!("SCCP state role does not match this immutable program build");
        return Err(ProgramError::InvalidInstructionData);
    }
    require_account_count(accounts, 8)?;
    let mut iter = accounts.iter();
    let initializer = next_account_info(&mut iter)?;
    let state = next_account_info(&mut iter)?;
    let mint = next_account_info(&mut iter)?;
    let peer_program = next_account_info(&mut iter)?;
    let verifier_program = next_account_info(&mut iter)?;
    let material = next_account_info(&mut iter)?;
    let token_program = next_account_info(&mut iter)?;
    let system_program_account = next_account_info(&mut iter)?;

    require_signer(initializer)?;
    require_writable(initializer, "initializer")?;
    require_unused_system_account(state, "route state")?;
    require_key(token_program.key, &TOKEN_PROGRAM_ID, "token program")?;
    require_executable(token_program, "token program")?;
    require_key(
        system_program_account.key,
        &system_program::ID,
        "system program",
    )?;
    require_executable(system_program_account, "system program")?;
    require_key(mint.owner, &TOKEN_PROGRAM_ID, "mint owner")?;
    require_executable(peer_program, "peer route program")?;
    require_executable(verifier_program, "native verifier program")?;
    if peer_program.key == program_id
        || verifier_program.key == program_id
        || peer_program.key == verifier_program.key
    {
        msg!("source, destination, and verifier programs must be distinct");
        return Err(ProgramError::InvalidAccountData);
    }
    require_key(material.owner, verifier_program.key, "material owner")?;
    let expected_material = Pubkey::find_program_address(
        &[
            MATERIAL_PDA_SEED,
            &args.verifier_key_hash,
            &args.verifier_config_hash,
        ],
        verifier_program.key,
    )
    .0;
    require_key(material.key, &expected_material, "material PDA")?;
    let role_seed = [args.role];
    let (expected_state, state_bump) = route_state_address(program_id, args.role, mint.key);
    require_key(state.key, &expected_state, "route state PDA")?;
    let destination_program = if args.role == ROLE_DESTINATION {
        program_id
    } else {
        peer_program.key
    };
    let source_program = if args.role == ROLE_SOURCE {
        program_id
    } else {
        peer_program.key
    };
    let expected_destination_state =
        route_state_address(destination_program, ROLE_DESTINATION, mint.key).0;
    require_key(
        &args.destination_state,
        &expected_destination_state,
        "destination state PDA",
    )?;
    if args.role == ROLE_SOURCE && args.destination_state == *state.key {
        msg!("source and destination state roles must be distinct");
        return Err(ProgramError::InvalidInstructionData);
    }
    require_sealed_verifier_material(
        material,
        &SealedVerifierMaterialRoute {
            verifier_program: verifier_program.key,
            destination_program,
            source_program,
            destination_state: &args.destination_state,
            mint: mint.key,
            token_program: token_program.key,
        },
        &args,
    )?;

    let (verify_authority, verify_bump) =
        Pubkey::find_program_address(&[VERIFY_AUTHORITY_SEED, state.key.as_ref()], program_id);
    let (mint_authority, mint_bump) = destination_mint_authority(
        args.role,
        program_id,
        peer_program.key,
        &args.destination_state,
    );
    require_spl_mint(mint, &mint_authority)?;
    if verify_authority == mint_authority
        || [
            *mint.key,
            *peer_program.key,
            *verifier_program.key,
            *material.key,
        ]
        .contains(&verify_authority)
    {
        return Err(ProgramError::InvalidAccountData);
    }

    let source_lane_hash = source_lane_hash();
    let destination_lane_hash = destination_lane_hash();
    if !hashes_nonzero_distinct(&[
        source_lane_hash,
        destination_lane_hash,
        args.destination_binding_hash,
        args.route_configuration_hash,
        args.verifier_key_hash,
        args.verifier_config_hash,
    ]) {
        return Err(ProgramError::InvalidInstructionData);
    }

    create_pda_account(
        program_id,
        initializer,
        state,
        system_program_account,
        STATE_LEN,
        &[
            ROUTE_STATE_SEED,
            &role_seed,
            mint.key.as_ref(),
            &[state_bump],
        ],
    )?;
    let mut data = state.try_borrow_mut_data()?;
    if data.len() != STATE_LEN {
        return Err(ProgramError::InvalidAccountData);
    }
    if data.iter().any(|byte| *byte != 0) {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    data[0..8].copy_from_slice(STATE_MAGIC);
    data[STATE_VERSION_OFFSET] = WIRE_VERSION;
    data[STATE_ROLE_OFFSET] = args.role;
    data[STATE_VERIFY_BUMP_OFFSET] = verify_bump;
    data[STATE_MINT_BUMP_OFFSET] = mint_bump;
    put_u32(&mut data, STATE_REVISION_OFFSET, args.route_revision)?;
    put_pubkey(&mut data, STATE_MINT_OFFSET, mint.key)?;
    put_pubkey(&mut data, STATE_PEER_PROGRAM_OFFSET, peer_program.key)?;
    put_pubkey(
        &mut data,
        STATE_DESTINATION_STATE_OFFSET,
        &args.destination_state,
    )?;
    put_pubkey(
        &mut data,
        STATE_VERIFIER_PROGRAM_OFFSET,
        verifier_program.key,
    )?;
    put_pubkey(&mut data, STATE_MATERIAL_OFFSET, material.key)?;
    put_hash(
        &mut data,
        STATE_DESTINATION_BINDING_OFFSET,
        &args.destination_binding_hash,
    )?;
    put_hash(
        &mut data,
        STATE_ROUTE_CONFIGURATION_OFFSET,
        &args.route_configuration_hash,
    )?;
    put_hash(
        &mut data,
        STATE_VERIFIER_KEY_HASH_OFFSET,
        &args.verifier_key_hash,
    )?;
    put_hash(
        &mut data,
        STATE_VERIFIER_CONFIG_HASH_OFFSET,
        &args.verifier_config_hash,
    )?;
    put_hash(&mut data, STATE_SOURCE_LANE_HASH_OFFSET, &source_lane_hash)?;
    put_hash(
        &mut data,
        STATE_DESTINATION_LANE_HASH_OFFSET,
        &destination_lane_hash,
    )?;
    put_u64(&mut data, STATE_LAST_SLOT_OFFSET, Clock::get()?.slot)?;
    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct FinalizeArgs {
    message_id: [u8; 32],
    amount: u64,
}

impl FinalizeArgs {
    const LEN: usize = 40;

    fn parse(body: &[u8]) -> Result<Self, ProgramError> {
        if body.len() != Self::LEN {
            return Err(ProgramError::InvalidInstructionData);
        }
        let mut cursor = Cursor::new(body);
        let message_id = cursor.array32()?;
        let amount = cursor.u64()?;
        if !cursor.finished() || is_zero_hash(&message_id) || amount == 0 {
            return Err(ProgramError::InvalidInstructionData);
        }
        Ok(Self { message_id, amount })
    }

    fn verifier_wire(self) -> [u8; 42] {
        let mut wire = [0u8; 42];
        wire[0] = WIRE_VERSION;
        wire[1] = VERIFIER_OPCODE_VERIFY_SEALED_PROOF;
        wire[2..34].copy_from_slice(&self.message_id);
        wire[34..42].copy_from_slice(&self.amount.to_le_bytes());
        wire
    }
}

fn finalize_from_taira(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    body: &[u8],
) -> ProgramResult {
    let args = FinalizeArgs::parse(body)?;
    require_account_count(accounts, 12)?;
    let mut iter = accounts.iter();
    let payer = next_account_info(&mut iter)?;
    let state = next_account_info(&mut iter)?;
    let mint = next_account_info(&mut iter)?;
    let destination_token = next_account_info(&mut iter)?;
    let material = next_account_info(&mut iter)?;
    let proof = next_account_info(&mut iter)?;
    let verifier_program = next_account_info(&mut iter)?;
    let verifier_authority = next_account_info(&mut iter)?;
    let mint_authority = next_account_info(&mut iter)?;
    let receipt = next_account_info(&mut iter)?;
    let token_program = next_account_info(&mut iter)?;
    let system_program_account = next_account_info(&mut iter)?;

    require_signer(payer)?;
    require_writable(payer, "payer")?;
    require_writable_owned(state, program_id, "destination state")?;
    let config = StateConfig::read(state, ROLE_DESTINATION)?;
    require_route_state_pda_key(state.key, program_id, ROLE_DESTINATION, &config.mint)?;
    require_key(
        &config.destination_state,
        state.key,
        "destination state self binding",
    )?;
    require_key(mint.key, &config.mint, "mint")?;
    require_key(
        verifier_program.key,
        &config.verifier_program,
        "verifier program",
    )?;
    require_executable(verifier_program, "verifier program")?;
    require_key(material.key, &config.material, "material")?;
    require_key(material.owner, verifier_program.key, "material owner")?;
    require_key(proof.owner, verifier_program.key, "proof owner")?;
    require_key(token_program.key, &TOKEN_PROGRAM_ID, "token program")?;
    require_executable(token_program, "token program")?;
    require_key(
        system_program_account.key,
        &system_program::ID,
        "system program",
    )?;
    require_executable(system_program_account, "system program")?;

    let expected_material = Pubkey::find_program_address(
        &[
            MATERIAL_PDA_SEED,
            &config.verifier_key_hash,
            &config.verifier_config_hash,
        ],
        verifier_program.key,
    )
    .0;
    require_key(material.key, &expected_material, "material PDA")?;
    let expected_proof = Pubkey::find_program_address(
        &[
            PROOF_PDA_SEED,
            material.key.as_ref(),
            &args.message_id,
            payer.key.as_ref(),
        ],
        verifier_program.key,
    )
    .0;
    require_key(proof.key, &expected_proof, "proof PDA")?;

    let (expected_verify_authority, verify_bump) =
        Pubkey::find_program_address(&[VERIFY_AUTHORITY_SEED, state.key.as_ref()], program_id);
    require_key(
        verifier_authority.key,
        &expected_verify_authority,
        "verifier authority",
    )?;
    if verify_bump != config.verify_bump {
        return Err(ProgramError::InvalidSeeds);
    }
    let (expected_mint_authority, mint_bump) =
        Pubkey::find_program_address(&[MINT_AUTHORITY_SEED, state.key.as_ref()], program_id);
    require_key(
        mint_authority.key,
        &expected_mint_authority,
        "mint authority",
    )?;
    if mint_bump != config.mint_bump {
        return Err(ProgramError::InvalidSeeds);
    }
    require_spl_mint(mint, &expected_mint_authority)?;
    require_spl_token_account(destination_token, mint.key, payer.key, args.amount, false)?;

    let (expected_receipt, receipt_bump) = Pubkey::find_program_address(
        &[
            DESTINATION_RECEIPT_SEED,
            state.key.as_ref(),
            &args.message_id,
        ],
        program_id,
    );
    require_key(receipt.key, &expected_receipt, "destination receipt")?;
    require_unused_system_account(receipt, "destination receipt")?;

    // The verifier owns and parses material/proof accounts.  The bridge binds
    // their canonical PDAs, every runtime account, the message and the amount,
    // then signs the seven-account compact CPI.  No mint can occur before this
    // call succeeds.
    let verifier_instruction = Instruction {
        program_id: *verifier_program.key,
        accounts: vec![
            AccountMeta::new(*payer.key, true),
            AccountMeta::new_readonly(*verifier_authority.key, true),
            AccountMeta::new_readonly(*state.key, false),
            AccountMeta::new_readonly(*mint.key, false),
            AccountMeta::new_readonly(*destination_token.key, false),
            AccountMeta::new_readonly(*material.key, false),
            AccountMeta::new_readonly(*proof.key, false),
        ],
        data: args.verifier_wire().to_vec(),
    };
    let authority_bump = [verify_bump];
    let authority_seeds: &[&[u8]] = &[VERIFY_AUTHORITY_SEED, state.key.as_ref(), &authority_bump];
    verify_then_record_then_mint(
        || {
            invoke_signed(
                &verifier_instruction,
                &[
                    payer.clone(),
                    verifier_authority.clone(),
                    state.clone(),
                    mint.clone(),
                    destination_token.clone(),
                    material.clone(),
                    proof.clone(),
                    verifier_program.clone(),
                ],
                &[authority_seeds],
            )
        },
        || {
            create_destination_receipt(
                program_id,
                payer,
                state,
                mint,
                destination_token,
                material,
                proof,
                receipt,
                system_program_account,
                receipt_bump,
                args,
            )
        },
        || {
            invoke_signed(
                &token_mint_to_instruction(
                    mint.key,
                    destination_token.key,
                    mint_authority.key,
                    args.amount,
                ),
                &[
                    mint.clone(),
                    destination_token.clone(),
                    mint_authority.clone(),
                    token_program.clone(),
                ],
                &[&[MINT_AUTHORITY_SEED, state.key.as_ref(), &[mint_bump]]],
            )
        },
    )?;
    update_state_counter(state, STATE_TOTAL_MINTED_OFFSET, args.amount)?;
    Ok(())
}

fn verify_then_record_then_mint(
    verify: impl FnOnce() -> ProgramResult,
    record: impl FnOnce() -> ProgramResult,
    mint: impl FnOnce() -> ProgramResult,
) -> ProgramResult {
    verify()?;
    record()?;
    mint()
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct BurnArgs<'a> {
    amount: u64,
    nonce: u64,
    recipient: &'a [u8],
}

impl<'a> BurnArgs<'a> {
    fn parse(body: &'a [u8]) -> Result<Self, ProgramError> {
        let mut cursor = Cursor::new(body);
        let amount = cursor.u64()?;
        let nonce = cursor.u64()?;
        let recipient_len = usize::from(cursor.u16()?);
        let recipient = cursor.take(recipient_len)?;
        if !cursor.finished()
            || amount == 0
            || recipient.is_empty()
            || recipient.len() > MAX_TAIRA_ACCOUNT_BYTES
        {
            return Err(ProgramError::InvalidInstructionData);
        }
        require_canonical_taira_i105_account(recipient, "recipient")?;
        Ok(Self {
            amount,
            nonce,
            recipient,
        })
    }
}

fn burn_to_taira(program_id: &Pubkey, accounts: &[AccountInfo], body: &[u8]) -> ProgramResult {
    let args = BurnArgs::parse(body)?;
    require_account_count(accounts, 8)?;
    let mut iter = accounts.iter();
    let payer = next_account_info(&mut iter)?;
    let source_state = next_account_info(&mut iter)?;
    let destination_state = next_account_info(&mut iter)?;
    let mint = next_account_info(&mut iter)?;
    let source_token = next_account_info(&mut iter)?;
    let receipt = next_account_info(&mut iter)?;
    let token_program = next_account_info(&mut iter)?;
    let system_program_account = next_account_info(&mut iter)?;

    require_signer(payer)?;
    require_writable(payer, "payer")?;
    require_writable_owned(source_state, program_id, "source state")?;
    let source_config = StateConfig::read(source_state, ROLE_SOURCE)?;
    require_route_state_pda_key(
        source_state.key,
        program_id,
        ROLE_SOURCE,
        &source_config.mint,
    )?;
    require_route_state_pda_key(
        destination_state.key,
        &source_config.peer_program,
        ROLE_DESTINATION,
        &source_config.mint,
    )?;
    require_key(
        destination_state.key,
        &source_config.destination_state,
        "destination state",
    )?;
    require_key(
        destination_state.owner,
        &source_config.peer_program,
        "destination state owner",
    )?;
    let destination_config = StateConfig::read(destination_state, ROLE_DESTINATION)?;
    require_peer_configs(program_id, &source_config, &destination_config)?;

    require_key(mint.key, &source_config.mint, "mint")?;
    require_key(token_program.key, &TOKEN_PROGRAM_ID, "token program")?;
    require_executable(token_program, "token program")?;
    require_key(
        system_program_account.key,
        &system_program::ID,
        "system program",
    )?;
    require_executable(system_program_account, "system program")?;
    let (destination_mint_authority, expected_bump) = Pubkey::find_program_address(
        &[MINT_AUTHORITY_SEED, destination_state.key.as_ref()],
        destination_state.owner,
    );
    if expected_bump != destination_config.mint_bump {
        return Err(ProgramError::InvalidSeeds);
    }
    require_spl_mint(mint, &destination_mint_authority)?;
    require_spl_token_account(source_token, mint.key, payer.key, args.amount, true)?;

    let payload = canonical_source_payload(
        payer.key,
        args.recipient,
        args.amount,
        args.nonce,
        source_config.route_revision,
    )?;
    let payload_amount = taira_payload_amount(args.amount)?;
    let payload_hash = prefixed_blake2b(PAYLOAD_HASH_PREFIX, &payload);
    let message_id = lane_bound_message_id(&source_lane_bytes(), &payload);
    let lane_hash = source_lane_hash();
    let source_event_digest = source_event_digest(lane_hash, message_id, payload_hash)?;
    if !hashes_nonzero_distinct(&[lane_hash, message_id, payload_hash, source_event_digest]) {
        return Err(ProgramError::InvalidInstructionData);
    }

    let (expected_receipt, receipt_bump) = Pubkey::find_program_address(
        &[SOURCE_RECEIPT_SEED, source_state.key.as_ref(), &message_id],
        program_id,
    );
    require_key(receipt.key, &expected_receipt, "source receipt")?;
    require_unused_system_account(receipt, "source receipt")?;

    // The economic transition is first. Any failure prevents receipt creation;
    // any later failure rolls the CPI back atomically with the transaction.
    let receipt_hash = burn_then_record(
        || {
            invoke(
                &token_burn_instruction(source_token.key, mint.key, payer.key, args.amount),
                &[
                    source_token.clone(),
                    mint.clone(),
                    payer.clone(),
                    token_program.clone(),
                ],
            )
        },
        || {
            let slot = Clock::get()?.slot;
            let receipt_bytes = source_receipt_bytes(
                receipt_bump,
                source_state.key,
                destination_state.key,
                mint.key,
                payer.key,
                source_token.key,
                args.amount,
                payload_amount,
                args.nonce,
                source_config.route_revision,
                source_config.route_configuration_hash,
                lane_hash,
                message_id,
                payload_hash,
                source_event_digest,
                slot,
                &payload,
            )?;
            let receipt_hash = prefixed_blake2b(SOURCE_RECEIPT_HASH_PREFIX, &receipt_bytes);
            create_pda_account(
                program_id,
                payer,
                receipt,
                system_program_account,
                SOURCE_RECEIPT_LEN,
                &[
                    SOURCE_RECEIPT_SEED,
                    source_state.key.as_ref(),
                    &message_id,
                    &[receipt_bump],
                ],
            )?;
            receipt
                .try_borrow_mut_data()?
                .copy_from_slice(&receipt_bytes);
            update_state_counter(source_state, STATE_TOTAL_BURNED_OFFSET, args.amount)?;
            Ok(receipt_hash)
        },
    )?;

    sol_log_data(&[
        SOURCE_LOG_MARKER,
        &lane_hash,
        &message_id,
        &payload_hash,
        &source_event_digest,
        receipt.key.as_ref(),
        &receipt_hash,
        &payload,
    ]);
    Ok(())
}

fn burn_then_record<T>(
    burn: impl FnOnce() -> ProgramResult,
    record: impl FnOnce() -> Result<T, ProgramError>,
) -> Result<T, ProgramError> {
    burn()?;
    record()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct StateConfig {
    role: u8,
    verify_bump: u8,
    mint_bump: u8,
    route_revision: u32,
    mint: Pubkey,
    peer_program: Pubkey,
    destination_state: Pubkey,
    verifier_program: Pubkey,
    material: Pubkey,
    destination_binding_hash: [u8; 32],
    route_configuration_hash: [u8; 32],
    verifier_key_hash: [u8; 32],
    verifier_config_hash: [u8; 32],
    source_lane_hash: [u8; 32],
    destination_lane_hash: [u8; 32],
}

impl StateConfig {
    fn read(account: &AccountInfo, expected_role: u8) -> Result<Self, ProgramError> {
        let data = account.try_borrow_data()?;
        if data.len() != STATE_LEN
            || data.get(0..8) != Some(STATE_MAGIC)
            || data.get(STATE_VERSION_OFFSET).copied() != Some(WIRE_VERSION)
            || data.get(STATE_ROLE_OFFSET).copied() != Some(expected_role)
        {
            return Err(ProgramError::UninitializedAccount);
        }
        let config = Self {
            role: expected_role,
            verify_bump: data[STATE_VERIFY_BUMP_OFFSET],
            mint_bump: data[STATE_MINT_BUMP_OFFSET],
            route_revision: get_u32(&data, STATE_REVISION_OFFSET)?,
            mint: get_pubkey(&data, STATE_MINT_OFFSET)?,
            peer_program: get_pubkey(&data, STATE_PEER_PROGRAM_OFFSET)?,
            destination_state: get_pubkey(&data, STATE_DESTINATION_STATE_OFFSET)?,
            verifier_program: get_pubkey(&data, STATE_VERIFIER_PROGRAM_OFFSET)?,
            material: get_pubkey(&data, STATE_MATERIAL_OFFSET)?,
            destination_binding_hash: get_hash(&data, STATE_DESTINATION_BINDING_OFFSET)?,
            route_configuration_hash: get_hash(&data, STATE_ROUTE_CONFIGURATION_OFFSET)?,
            verifier_key_hash: get_hash(&data, STATE_VERIFIER_KEY_HASH_OFFSET)?,
            verifier_config_hash: get_hash(&data, STATE_VERIFIER_CONFIG_HASH_OFFSET)?,
            source_lane_hash: get_hash(&data, STATE_SOURCE_LANE_HASH_OFFSET)?,
            destination_lane_hash: get_hash(&data, STATE_DESTINATION_LANE_HASH_OFFSET)?,
        };
        if config.route_revision != ROUTE_REVISION
            || config.source_lane_hash != source_lane_hash()
            || config.destination_lane_hash != destination_lane_hash()
            || !hashes_nonzero_distinct(&[
                config.source_lane_hash,
                config.destination_lane_hash,
                config.destination_binding_hash,
                config.route_configuration_hash,
                config.verifier_key_hash,
                config.verifier_config_hash,
            ])
        {
            return Err(ProgramError::InvalidAccountData);
        }
        Ok(config)
    }
}

fn require_peer_configs(
    source_program_id: &Pubkey,
    source: &StateConfig,
    destination: &StateConfig,
) -> ProgramResult {
    if source.role != ROLE_SOURCE
        || destination.role != ROLE_DESTINATION
        || source.peer_program == *source_program_id
        || destination.peer_program != *source_program_id
        || source.destination_state != destination.destination_state
        || source.mint != destination.mint
        || source.verifier_program != destination.verifier_program
        || source.material != destination.material
        || source.route_revision != destination.route_revision
        || source.destination_binding_hash != destination.destination_binding_hash
        || source.route_configuration_hash != destination.route_configuration_hash
        || source.verifier_key_hash != destination.verifier_key_hash
        || source.verifier_config_hash != destination.verifier_config_hash
        || source.source_lane_hash != destination.source_lane_hash
        || source.destination_lane_hash != destination.destination_lane_hash
    {
        msg!("source and destination governed route states do not match");
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn create_destination_receipt<'a>(
    program_id: &Pubkey,
    payer: &AccountInfo<'a>,
    state: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    destination_token: &AccountInfo<'a>,
    material: &AccountInfo<'a>,
    proof: &AccountInfo<'a>,
    receipt: &AccountInfo<'a>,
    system_program_account: &AccountInfo<'a>,
    bump: u8,
    args: FinalizeArgs,
) -> ProgramResult {
    create_pda_account(
        program_id,
        payer,
        receipt,
        system_program_account,
        DESTINATION_RECEIPT_LEN,
        &[
            DESTINATION_RECEIPT_SEED,
            state.key.as_ref(),
            &args.message_id,
            &[bump],
        ],
    )?;
    let mut data = receipt.try_borrow_mut_data()?;
    if data.len() != DESTINATION_RECEIPT_LEN || data.iter().any(|byte| *byte != 0) {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    data[0..8].copy_from_slice(DESTINATION_RECEIPT_MAGIC);
    data[8] = WIRE_VERSION;
    data[9] = bump;
    put_pubkey(&mut data, 16, state.key)?;
    put_pubkey(&mut data, 48, mint.key)?;
    put_pubkey(&mut data, 80, payer.key)?;
    put_pubkey(&mut data, 112, destination_token.key)?;
    put_pubkey(&mut data, 144, material.key)?;
    put_pubkey(&mut data, 176, proof.key)?;
    put_hash(&mut data, 208, &args.message_id)?;
    put_u64(&mut data, 240, args.amount)?;
    put_u64(&mut data, 248, Clock::get()?.slot)?;
    // 256..272 is reserved zeroed space for this frozen V1 layout.
    Ok(())
}

fn create_pda_account<'a>(
    program_id: &Pubkey,
    payer: &AccountInfo<'a>,
    account: &AccountInfo<'a>,
    system_program_account: &AccountInfo<'a>,
    len: usize,
    signer_seeds: &[&[u8]],
) -> ProgramResult {
    let rent_lamports = Rent::get()?.minimum_balance(len);
    let funding = rent_lamports.saturating_sub(account.lamports());
    if funding != 0 {
        invoke(
            &system_instruction::transfer(payer.key, account.key, funding),
            &[
                payer.clone(),
                account.clone(),
                system_program_account.clone(),
            ],
        )?;
    }
    invoke_signed(
        &system_instruction::allocate(account.key, len as u64),
        &[account.clone(), system_program_account.clone()],
        &[signer_seeds],
    )?;
    invoke_signed(
        &system_instruction::assign(account.key, program_id),
        &[account.clone(), system_program_account.clone()],
        &[signer_seeds],
    )
}

#[allow(clippy::too_many_arguments)]
fn source_receipt_bytes(
    bump: u8,
    source_state: &Pubkey,
    destination_state: &Pubkey,
    mint: &Pubkey,
    payer: &Pubkey,
    source_token: &Pubkey,
    spl_burn_amount: u64,
    payload_amount: u64,
    nonce: u64,
    route_revision: u32,
    route_configuration_hash: [u8; 32],
    lane_hash: [u8; 32],
    message_id: [u8; 32],
    payload_hash: [u8; 32],
    source_event_digest: [u8; 32],
    slot: u64,
    payload: &[u8],
) -> Result<Vec<u8>, ProgramError> {
    if payload.is_empty() || payload.len() > MAX_CANONICAL_PAYLOAD_BYTES {
        return Err(ProgramError::InvalidInstructionData);
    }
    let payload_len =
        u16::try_from(payload.len()).map_err(|_| ProgramError::InvalidInstructionData)?;
    let mut data = vec![0u8; SOURCE_RECEIPT_LEN];
    data[0..8].copy_from_slice(SOURCE_RECEIPT_MAGIC);
    data[8] = WIRE_VERSION;
    data[9] = bump;
    put_pubkey(&mut data, 16, source_state)?;
    put_pubkey(&mut data, 48, destination_state)?;
    put_pubkey(&mut data, 80, mint)?;
    put_pubkey(&mut data, 112, payer)?;
    put_pubkey(&mut data, 144, source_token)?;
    put_u64(&mut data, 176, spl_burn_amount)?;
    put_u64(&mut data, 184, payload_amount)?;
    put_u64(&mut data, 192, nonce)?;
    put_u32(&mut data, 200, route_revision)?;
    put_hash(&mut data, 208, &route_configuration_hash)?;
    put_hash(&mut data, 240, &lane_hash)?;
    put_hash(&mut data, 272, &message_id)?;
    // The fixed header is followed by payload hash, event digest, slot, and
    // payload length. Keep offsets explicit to make circuit parsing stable.
    put_hash(&mut data, 304, &payload_hash)?;
    put_hash(&mut data, 336, &source_event_digest)?;
    put_u64(&mut data, 368, slot)?;
    data[376..378].copy_from_slice(&payload_len.to_le_bytes());
    data[384..384 + payload.len()].copy_from_slice(payload);
    Ok(data)
}

fn canonical_source_payload(
    sender: &Pubkey,
    recipient: &[u8],
    spl_amount: u64,
    nonce: u64,
    route_revision: u32,
) -> Result<Vec<u8>, ProgramError> {
    if route_revision != ROUTE_REVISION || recipient.len() > MAX_TAIRA_ACCOUNT_BYTES {
        return Err(ProgramError::InvalidInstructionData);
    }
    let payload_amount = taira_payload_amount(spl_amount)?;
    let mut out = Vec::with_capacity(128 + recipient.len());
    out.push(PAYLOAD_TRANSFER_DISCRIMINANT);
    out.push(WIRE_VERSION);
    out.extend_from_slice(&SCCP_DOMAIN_SOLANA.to_le_bytes());
    out.extend_from_slice(&SCCP_DOMAIN_SORA.to_le_bytes());
    out.extend_from_slice(&nonce.to_le_bytes());
    out.extend_from_slice(&route_revision.to_le_bytes());
    out.extend_from_slice(&SCCP_DOMAIN_SORA.to_le_bytes());
    out.push(CODEC_CANONICAL_TEXT);
    push_vec_u32(&mut out, XOR_ASSET_KEY)?;
    out.extend_from_slice(&u128::from(payload_amount).to_le_bytes());
    out.push(CODEC_SOLANA_PUBKEY32);
    push_vec_u32(&mut out, sender.as_ref())?;
    out.push(CODEC_CANONICAL_TEXT);
    push_vec_u32(&mut out, recipient)?;
    out.push(CODEC_CANONICAL_TEXT);
    push_vec_u32(&mut out, ROUTE_ID)?;
    if out.len() > MAX_CANONICAL_PAYLOAD_BYTES {
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(out)
}

fn taira_payload_amount(spl_amount: u64) -> Result<u64, ProgramError> {
    if spl_amount == 0 {
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(spl_amount)
}

fn source_lane_bytes() -> Vec<u8> {
    canonical_lane_bytes(false)
}

fn destination_lane_bytes() -> Vec<u8> {
    canonical_lane_bytes(true)
}

fn canonical_lane_bytes(destination: bool) -> Vec<u8> {
    let sora = canonical_sora_network_bytes();
    let solana = canonical_solana_network_bytes();
    let (source, target) = if destination {
        (&sora, &solana)
    } else {
        (&solana, &sora)
    };
    let mut out = Vec::with_capacity(1 + 8 + source.len() + target.len());
    out.push(WIRE_VERSION);
    out.extend_from_slice(&(source.len() as u32).to_le_bytes());
    out.extend_from_slice(source);
    out.extend_from_slice(&(target.len() as u32).to_le_bytes());
    out.extend_from_slice(target);
    out
}

fn canonical_sora_network_bytes() -> Vec<u8> {
    let mut out = Vec::with_capacity(22);
    out.push(WIRE_VERSION);
    out.push(NETWORK_TAG_SORA_TAIRA);
    out.extend_from_slice(&SCCP_DOMAIN_SORA.to_le_bytes());
    out.extend_from_slice(&SORA_TAIRA_CHAIN_ID_BYTES);
    out
}

fn canonical_solana_network_bytes() -> Vec<u8> {
    let mut out = Vec::with_capacity(38);
    out.push(WIRE_VERSION);
    out.push(NETWORK_TAG_SOLANA_TESTNET);
    out.extend_from_slice(&SCCP_DOMAIN_SOLANA.to_le_bytes());
    out.extend_from_slice(&SOLANA_TESTNET_GENESIS_HASH);
    out
}

fn source_lane_hash() -> [u8; 32] {
    prefixed_blake2b(LANE_HASH_PREFIX, &source_lane_bytes())
}

fn destination_lane_hash() -> [u8; 32] {
    prefixed_blake2b(LANE_HASH_PREFIX, &destination_lane_bytes())
}

fn lane_bound_message_id(lane_bytes: &[u8], payload: &[u8]) -> [u8; 32] {
    let mut version = [0u8; 1];
    version[0] = WIRE_VERSION;
    let lane_len = (lane_bytes.len() as u32).to_le_bytes();
    let payload_len = (payload.len() as u32).to_le_bytes();
    keccak_hashv(&[
        MESSAGE_ID_PREFIX,
        &version,
        &lane_len,
        lane_bytes,
        &payload_len,
        payload,
    ])
    .to_bytes()
}

fn source_event_digest(
    lane_hash: [u8; 32],
    message_id: [u8; 32],
    payload_hash: [u8; 32],
) -> Result<[u8; 32], ProgramError> {
    if !hashes_nonzero_distinct(&[lane_hash, message_id, payload_hash]) {
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(keccak_hashv(&[
        SOURCE_EVENT_PREFIX,
        &[WIRE_VERSION],
        &lane_hash,
        &message_id,
        &payload_hash,
    ])
    .to_bytes())
}

fn prefixed_blake2b(prefix: &[u8], payload: &[u8]) -> [u8; 32] {
    let mut hasher = Blake2bVar::new(32).expect("fixed Blake2b output length");
    hasher.update(prefix);
    hasher.update(payload);
    let mut out = [0u8; 32];
    hasher
        .finalize_variable(&mut out)
        .expect("fixed Blake2b output length");
    out
}

fn token_mint_to_instruction(
    mint: &Pubkey,
    destination: &Pubkey,
    authority: &Pubkey,
    amount: u64,
) -> Instruction {
    let mut data = Vec::with_capacity(9);
    data.push(TOKEN_INSTRUCTION_MINT_TO);
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction {
        program_id: TOKEN_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(*mint, false),
            AccountMeta::new(*destination, false),
            AccountMeta::new_readonly(*authority, true),
        ],
        data,
    }
}

fn token_burn_instruction(
    source: &Pubkey,
    mint: &Pubkey,
    authority: &Pubkey,
    amount: u64,
) -> Instruction {
    let mut data = Vec::with_capacity(9);
    data.push(TOKEN_INSTRUCTION_BURN);
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction {
        program_id: TOKEN_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(*source, false),
            AccountMeta::new(*mint, false),
            AccountMeta::new_readonly(*authority, true),
        ],
        data,
    }
}

fn destination_mint_authority(
    role: u8,
    program_id: &Pubkey,
    peer_program: &Pubkey,
    destination_state: &Pubkey,
) -> (Pubkey, u8) {
    let destination_program = if role == ROLE_DESTINATION {
        program_id
    } else {
        peer_program
    };
    Pubkey::find_program_address(
        &[MINT_AUTHORITY_SEED, destination_state.as_ref()],
        destination_program,
    )
}

fn route_state_address(program_id: &Pubkey, role: u8, mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[ROUTE_STATE_SEED, &[role], mint.as_ref()], program_id)
}

fn require_route_state_pda_key(
    actual: &Pubkey,
    program_id: &Pubkey,
    role: u8,
    mint: &Pubkey,
) -> ProgramResult {
    require_key(
        actual,
        &route_state_address(program_id, role, mint).0,
        "route state PDA",
    )
}

fn require_spl_mint(mint: &AccountInfo, expected_authority: &Pubkey) -> ProgramResult {
    require_writable(mint, "mint")?;
    require_key(mint.owner, &TOKEN_PROGRAM_ID, "mint owner")?;
    let data = mint.try_borrow_data()?;
    if data.len() != 82
        || data.get(0..4) != Some(&1u32.to_le_bytes())
        || data.get(4..36) != Some(expected_authority.as_ref())
        || data.get(44).copied() != Some(XOR_SPL_DECIMALS)
        || data.get(45).copied() != Some(1)
        || data.get(46..50) != Some(&0u32.to_le_bytes())
    {
        msg!("invalid governed SPL XOR mint");
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn require_spl_token_account(
    account: &AccountInfo,
    expected_mint: &Pubkey,
    expected_owner: &Pubkey,
    amount: u64,
    require_balance: bool,
) -> ProgramResult {
    require_writable(account, "SPL token")?;
    require_key(account.owner, &TOKEN_PROGRAM_ID, "SPL token owner program")?;
    let data = account.try_borrow_data()?;
    if data.len() != 165
        || data.get(0..32) != Some(expected_mint.as_ref())
        || data.get(32..64) != Some(expected_owner.as_ref())
        || data.get(108).copied() != Some(1)
    {
        return Err(ProgramError::InvalidAccountData);
    }
    if require_balance && get_u64(&data, 64)? < amount {
        return Err(ProgramError::InsufficientFunds);
    }
    Ok(())
}

struct SealedVerifierMaterialRoute<'a> {
    verifier_program: &'a Pubkey,
    destination_program: &'a Pubkey,
    source_program: &'a Pubkey,
    destination_state: &'a Pubkey,
    mint: &'a Pubkey,
    token_program: &'a Pubkey,
}

fn require_sealed_verifier_material(
    material: &AccountInfo,
    route: &SealedVerifierMaterialRoute<'_>,
    args: &InitializeArgs,
) -> ProgramResult {
    require_key(material.owner, route.verifier_program, "material owner")?;
    let data = material.try_borrow_data()?;
    let expected_bridge_authority = Pubkey::find_program_address(
        &[VERIFY_AUTHORITY_SEED, route.destination_state.as_ref()],
        route.destination_program,
    )
    .0;
    if data.len() != MATERIAL_ACCOUNT_LEN
        || data.get(..8) != Some(MATERIAL_MAGIC)
        || data.get(8).copied() != Some(WIRE_VERSION)
        || data.get(MATERIAL_STATUS_OFFSET).copied() != Some(MATERIAL_STATUS_SEALED)
        || get_u16(&data, MATERIAL_WRITTEN_OFFSET)? != MATERIAL_VERIFYING_KEY_LEN
        || get_u32(&data, MATERIAL_ROUTE_REVISION_OFFSET)? != args.route_revision
        || data.get(MATERIAL_ASSET_LEN_OFFSET).copied() != Some(XOR_ASSET_KEY.len() as u8)
        || data[MATERIAL_AUTHORITY_OFFSET..MATERIAL_AUTHORITY_OFFSET + 32]
            .iter()
            .any(|byte| *byte != 0)
        || get_hash(&data, MATERIAL_VK_KECCAK_OFFSET)? != args.verifier_key_hash
        || get_hash(&data, MATERIAL_CONFIG_SHA256_OFFSET)? != args.verifier_config_hash
        || get_hash(&data, MATERIAL_BRIDGE_PROGRAM_OFFSET)? != route.destination_program.to_bytes()
        || get_hash(&data, MATERIAL_BRIDGE_AUTHORITY_OFFSET)?
            != expected_bridge_authority.to_bytes()
        || get_hash(&data, MATERIAL_BRIDGE_STATE_OFFSET)? != route.destination_state.to_bytes()
        || get_hash(&data, MATERIAL_MINT_OFFSET)? != route.mint.to_bytes()
        || get_hash(&data, MATERIAL_TOKEN_PROGRAM_OFFSET)? != route.token_program.to_bytes()
        || get_hash(&data, MATERIAL_DESTINATION_BINDING_OFFSET)? != args.destination_binding_hash
        || get_hash(&data, MATERIAL_ROUTE_CONFIGURATION_OFFSET)? != args.route_configuration_hash
        || get_hash(&data, MATERIAL_SOURCE_LANE_HASH_OFFSET)? != source_lane_hash()
        || get_hash(&data, MATERIAL_DESTINATION_LANE_HASH_OFFSET)? != destination_lane_hash()
        || data.get(MATERIAL_ASSET_OFFSET..MATERIAL_ASSET_OFFSET + XOR_ASSET_KEY.len())
            != Some(XOR_ASSET_KEY)
        || data.get(MATERIAL_ROUTE_ID_OFFSET..MATERIAL_ROUTE_ID_OFFSET + ROUTE_ID.len())
            != Some(ROUTE_ID)
        || get_hash(&data, MATERIAL_SOURCE_PROGRAM_OFFSET)? != route.source_program.to_bytes()
    {
        msg!("native verifier material does not exactly bind this sealed route");
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn update_state_counter(state: &AccountInfo, counter_offset: usize, amount: u64) -> ProgramResult {
    let slot = Clock::get()?.slot;
    let mut data = state.try_borrow_mut_data()?;
    let total = telemetry_total_after_settlement(get_u64(&data, counter_offset)?, amount);
    let operations = get_u64(&data, STATE_OPERATION_COUNT_OFFSET)?
        .checked_add(1)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    put_u64(&mut data, counter_offset, total)?;
    put_u64(&mut data, STATE_LAST_SLOT_OFFSET, slot)?;
    put_u64(&mut data, STATE_OPERATION_COUNT_OFFSET, operations)
}

fn telemetry_total_after_settlement(current: u64, amount: u64) -> u64 {
    current.saturating_add(amount)
}

fn require_unused_system_account(account: &AccountInfo, label: &str) -> ProgramResult {
    require_writable(account, label)?;
    if account.owner != &system_program::ID || !account.data_is_empty() {
        msg!("{} is already initialized or has the wrong owner", label);
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    Ok(())
}

fn require_account_count(accounts: &[AccountInfo], expected: usize) -> ProgramResult {
    if accounts.len() != expected {
        msg!("noncanonical SCCP account count");
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    Ok(())
}

fn require_signer(account: &AccountInfo) -> ProgramResult {
    if !account.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    Ok(())
}

fn require_writable(account: &AccountInfo, label: &str) -> ProgramResult {
    if !account.is_writable {
        msg!("{} must be writable", label);
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn require_writable_owned(account: &AccountInfo, owner: &Pubkey, label: &str) -> ProgramResult {
    require_writable(account, label)?;
    require_key(account.owner, owner, label)
}

fn require_key(actual: &Pubkey, expected: &Pubkey, label: &str) -> ProgramResult {
    if actual != expected {
        msg!("{} account mismatch", label);
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn require_executable(account: &AccountInfo, label: &str) -> ProgramResult {
    if !account.executable {
        msg!("{} is not executable", label);
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn hashes_nonzero_distinct(values: &[[u8; 32]]) -> bool {
    values
        .iter()
        .enumerate()
        .all(|(index, value)| !is_zero_hash(value) && !values[..index].contains(value))
}

fn is_zero_hash(value: &[u8; 32]) -> bool {
    value.iter().all(|byte| *byte == 0)
}

fn push_vec_u32(out: &mut Vec<u8>, value: &[u8]) -> Result<(), ProgramError> {
    let len = u32::try_from(value.len()).map_err(|_| ProgramError::InvalidInstructionData)?;
    out.extend_from_slice(&len.to_le_bytes());
    out.extend_from_slice(value);
    Ok(())
}

fn put_hash(data: &mut [u8], offset: usize, value: &[u8; 32]) -> ProgramResult {
    let end = offset
        .checked_add(32)
        .ok_or(ProgramError::AccountDataTooSmall)?;
    data.get_mut(offset..end)
        .ok_or(ProgramError::AccountDataTooSmall)?
        .copy_from_slice(value);
    Ok(())
}

fn put_pubkey(data: &mut [u8], offset: usize, value: &Pubkey) -> ProgramResult {
    put_hash(data, offset, &value.to_bytes())
}

fn put_u32(data: &mut [u8], offset: usize, value: u32) -> ProgramResult {
    let end = offset
        .checked_add(4)
        .ok_or(ProgramError::AccountDataTooSmall)?;
    data.get_mut(offset..end)
        .ok_or(ProgramError::AccountDataTooSmall)?
        .copy_from_slice(&value.to_le_bytes());
    Ok(())
}

fn put_u64(data: &mut [u8], offset: usize, value: u64) -> ProgramResult {
    let end = offset
        .checked_add(8)
        .ok_or(ProgramError::AccountDataTooSmall)?;
    data.get_mut(offset..end)
        .ok_or(ProgramError::AccountDataTooSmall)?
        .copy_from_slice(&value.to_le_bytes());
    Ok(())
}

fn get_hash(data: &[u8], offset: usize) -> Result<[u8; 32], ProgramError> {
    data.get(offset..offset + 32)
        .ok_or(ProgramError::AccountDataTooSmall)?
        .try_into()
        .map_err(|_| ProgramError::InvalidAccountData)
}

fn get_pubkey(data: &[u8], offset: usize) -> Result<Pubkey, ProgramError> {
    Ok(Pubkey::new_from_array(get_hash(data, offset)?))
}

fn get_u32(data: &[u8], offset: usize) -> Result<u32, ProgramError> {
    Ok(u32::from_le_bytes(
        data.get(offset..offset + 4)
            .ok_or(ProgramError::AccountDataTooSmall)?
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    ))
}

fn get_u16(data: &[u8], offset: usize) -> Result<u16, ProgramError> {
    Ok(u16::from_le_bytes(
        data.get(offset..offset + 2)
            .ok_or(ProgramError::AccountDataTooSmall)?
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    ))
}

fn get_u64(data: &[u8], offset: usize) -> Result<u64, ProgramError> {
    Ok(u64::from_le_bytes(
        data.get(offset..offset + 8)
            .ok_or(ProgramError::AccountDataTooSmall)?
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    ))
}

struct Cursor<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> Cursor<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, offset: 0 }
    }

    fn take(&mut self, len: usize) -> Result<&'a [u8], ProgramError> {
        let end = self
            .offset
            .checked_add(len)
            .ok_or(ProgramError::InvalidInstructionData)?;
        let value = self
            .bytes
            .get(self.offset..end)
            .ok_or(ProgramError::InvalidInstructionData)?;
        self.offset = end;
        Ok(value)
    }

    fn u8(&mut self) -> Result<u8, ProgramError> {
        Ok(self.take(1)?[0])
    }

    fn u16(&mut self) -> Result<u16, ProgramError> {
        Ok(u16::from_le_bytes(
            self.take(2)?
                .try_into()
                .map_err(|_| ProgramError::InvalidInstructionData)?,
        ))
    }

    fn u32(&mut self) -> Result<u32, ProgramError> {
        Ok(u32::from_le_bytes(
            self.take(4)?
                .try_into()
                .map_err(|_| ProgramError::InvalidInstructionData)?,
        ))
    }

    fn u64(&mut self) -> Result<u64, ProgramError> {
        Ok(u64::from_le_bytes(
            self.take(8)?
                .try_into()
                .map_err(|_| ProgramError::InvalidInstructionData)?,
        ))
    }

    fn array32(&mut self) -> Result<[u8; 32], ProgramError> {
        self.take(32)?
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)
    }

    fn finished(&self) -> bool {
        self.offset == self.bytes.len()
    }
}

fn require_canonical_taira_i105_account(value: &[u8], label: &str) -> ProgramResult {
    let literal = str::from_utf8(value).map_err(|_| ProgramError::InvalidInstructionData)?;
    let payload = literal.strip_prefix(TAIRA_I105_SENTINEL).ok_or_else(|| {
        msg!("TAIRA {} must use the test I105 sentinel", label);
        ProgramError::InvalidInstructionData
    })?;
    let digits = i105_payload_digits(payload)?;
    if digits.len() <= I105_CHECKSUM_LEN {
        return Err(ProgramError::InvalidInstructionData);
    }
    let split = digits.len() - I105_CHECKSUM_LEN;
    let canonical = decode_base_105(&digits[..split])?;
    if digits[split..] != i105_checksum_digits(&canonical)
        || encode_base_105(&canonical)? != digits[..split]
    {
        return Err(ProgramError::InvalidInstructionData);
    }
    require_canonical_ed25519_account_payload(&canonical, label)
}

fn require_canonical_ed25519_account_payload(canonical: &[u8], label: &str) -> ProgramResult {
    if canonical.len() != 4 + ED25519_PUBLIC_KEY_LEN
        || canonical[0] != I105_CURRENT_HEADER_SINGLE_KEY
        || canonical[1] != I105_CONTROLLER_SINGLE_KEY_TAG
        || canonical[2] != I105_CURVE_ED25519
        || usize::from(canonical[3]) != ED25519_PUBLIC_KEY_LEN
    {
        msg!(
            "TAIRA {} is not a current single Ed25519 I105 account",
            label
        );
        return Err(ProgramError::InvalidInstructionData);
    }
    let key_bytes: [u8; ED25519_PUBLIC_KEY_LEN] = canonical[4..]
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)?;
    if !ed25519_compressed_y_is_canonical(&key_bytes)
        || !ed25519_is_prime_order(&key_bytes)
        || ED25519_SMALL_ORDER_POINTS.contains(&key_bytes)
    {
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(())
}

fn ed25519_is_prime_order(bytes: &[u8; 32]) -> bool {
    let point = PodEdwardsPoint(*bytes);
    if point == ED25519_IDENTITY || !validate_edwards(&point) {
        return false;
    }
    // `l - 1` is a canonical Ed25519 scalar. A point is in the prime-order
    // subgroup exactly when `(l - 1)P + P == lP == identity`; mixed-torsion
    // points that merely decompress fail because gcd(l, 8) = 1.
    multiply_edwards(&ED25519_GROUP_ORDER_MINUS_ONE, &point)
        .and_then(|product| add_edwards(&product, &point))
        == Some(ED25519_IDENTITY)
}

fn ed25519_compressed_y_is_canonical(bytes: &[u8; ED25519_PUBLIC_KEY_LEN]) -> bool {
    let mut y = *bytes;
    y[ED25519_PUBLIC_KEY_LEN - 1] &= 0x7f;
    for index in (0..ED25519_PUBLIC_KEY_LEN).rev() {
        if y[index] < ED25519_FIELD_MODULUS[index] {
            return true;
        }
        if y[index] > ED25519_FIELD_MODULUS[index] {
            return false;
        }
    }
    false
}

fn i105_payload_digits(payload: &str) -> Result<Vec<u8>, ProgramError> {
    payload
        .chars()
        .map(|symbol| i105_digit(symbol).ok_or(ProgramError::InvalidInstructionData))
        .collect()
}

fn i105_digit(symbol: char) -> Option<u8> {
    const BASE58: [char; 58] = [
        '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J',
        'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'a', 'b', 'c',
        'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v',
        'w', 'x', 'y', 'z',
    ];
    const KANA: [char; 47] = [
        'ｲ', 'ﾛ', 'ﾊ', 'ﾆ', 'ﾎ', 'ﾍ', 'ﾄ', 'ﾁ', 'ﾘ', 'ﾇ', 'ﾙ', 'ｦ', 'ﾜ', 'ｶ', 'ﾖ', 'ﾀ', 'ﾚ', 'ｿ',
        'ﾂ', 'ﾈ', 'ﾅ', 'ﾗ', 'ﾑ', 'ｳ', 'ヰ', 'ﾉ', 'ｵ', 'ｸ', 'ﾔ', 'ﾏ', 'ｹ', 'ﾌ', 'ｺ', 'ｴ', 'ﾃ', 'ｱ',
        'ｻ', 'ｷ', 'ﾕ', 'ﾒ', 'ﾐ', 'ｼ', 'ヱ', 'ﾋ', 'ﾓ', 'ｾ', 'ｽ',
    ];
    if let Some(index) = BASE58.iter().position(|candidate| *candidate == symbol) {
        return u8::try_from(index).ok();
    }
    KANA.iter()
        .position(|candidate| *candidate == symbol)
        .and_then(|index| u8::try_from(BASE58.len() + index).ok())
}

fn decode_base_105(digits: &[u8]) -> Result<Vec<u8>, ProgramError> {
    if digits.is_empty() {
        return Err(ProgramError::InvalidInstructionData);
    }
    let leading_zeros = digits.iter().take_while(|digit| **digit == 0).count();
    let mut value = digits.to_vec();
    let mut bytes = Vec::new();
    let mut start = leading_zeros;
    while start < value.len() {
        let mut remainder = 0u32;
        for digit in &mut value[start..] {
            if u32::from(*digit) >= I105_BASE {
                return Err(ProgramError::InvalidInstructionData);
            }
            let accumulator = remainder
                .checked_mul(I105_BASE)
                .and_then(|part| part.checked_add(u32::from(*digit)))
                .ok_or(ProgramError::ArithmeticOverflow)?;
            *digit = u8::try_from(accumulator / 256)
                .map_err(|_| ProgramError::InvalidInstructionData)?;
            remainder = accumulator % 256;
        }
        bytes.push(u8::try_from(remainder).map_err(|_| ProgramError::InvalidInstructionData)?);
        while start < value.len() && value[start] == 0 {
            start += 1;
        }
    }
    bytes.resize(bytes.len() + leading_zeros, 0);
    bytes.reverse();
    Ok(bytes)
}

fn encode_base_105(bytes: &[u8]) -> Result<Vec<u8>, ProgramError> {
    if bytes.is_empty() {
        return Ok(vec![0]);
    }
    let leading_zeros = bytes.iter().take_while(|byte| **byte == 0).count();
    let mut value = bytes.to_vec();
    let mut digits = Vec::new();
    let mut start = leading_zeros;
    while start < value.len() {
        let mut remainder = 0u32;
        for byte in &mut value[start..] {
            let accumulator = (remainder << 8) | u32::from(*byte);
            *byte = u8::try_from(accumulator / I105_BASE)
                .map_err(|_| ProgramError::InvalidInstructionData)?;
            remainder = accumulator % I105_BASE;
        }
        digits.push(u8::try_from(remainder).map_err(|_| ProgramError::InvalidInstructionData)?);
        while start < value.len() && value[start] == 0 {
            start += 1;
        }
    }
    digits.resize(digits.len() + leading_zeros, 0);
    if digits.is_empty() {
        digits.push(0);
    }
    digits.reverse();
    Ok(digits)
}

fn i105_checksum_digits(canonical: &[u8]) -> [u8; I105_CHECKSUM_LEN] {
    let data = convert_to_base32(canonical);
    let mut values = expand_hrp(b"snx");
    values.extend_from_slice(&data);
    values.extend([0u8; I105_CHECKSUM_LEN]);
    let polymod = bech32_polymod(values.iter().copied()) ^ BECH32M_CONST;
    let mut result = [0u8; I105_CHECKSUM_LEN];
    for (index, slot) in result.iter_mut().enumerate() {
        let shift = 5 * (I105_CHECKSUM_LEN - 1 - index);
        *slot = ((polymod >> shift) & 0x1f) as u8;
    }
    result
}

fn convert_to_base32(data: &[u8]) -> Vec<u8> {
    let mut acc = 0u32;
    let mut bits = 0u32;
    let mut out = Vec::with_capacity((data.len() * 8).div_ceil(5));
    for byte in data {
        acc = (acc << 8) | u32::from(*byte);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            out.push(((acc >> bits) & 0x1f) as u8);
        }
    }
    if bits != 0 {
        out.push(((acc << (5 - bits)) & 0x1f) as u8);
    }
    out
}

fn expand_hrp(hrp: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(hrp.len() * 2 + 1);
    out.extend(hrp.iter().map(|byte| byte >> 5));
    out.push(0);
    out.extend(hrp.iter().map(|byte| byte & 0x1f));
    out
}

fn bech32_polymod<I>(values: I) -> u32
where
    I: Iterator<Item = u8>,
{
    const GENERATORS: [u32; 5] = [
        0x3b6a_57b2,
        0x2650_8e6d,
        0x1ea1_19fa,
        0x3d42_33dd,
        0x2a14_62b3,
    ];
    let mut checksum = 1u32;
    for value in values {
        let top = checksum >> 25;
        checksum = ((checksum & 0x1ff_ffff) << 5) ^ u32::from(value);
        for (index, generator) in GENERATORS.iter().enumerate() {
            if (top >> index) & 1 == 1 {
                checksum ^= generator;
            }
        }
    }
    checksum
}

#[cfg(test)]
mod tests {
    use super::*;

    const TAIRA_ACCOUNT: &str = "testuﾛ1Nヱﾐﾚﾗﾗﾁ9SHyｾｼF2ﾚbヱAｦiﾇｺﾂpﾆWyｿﾛWﾍ7ｾA7ﾋヰｿUJEKNX";
    const MIXED_TORSION_TAIRA_ACCOUNT: &str =
        "testuﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB";

    fn hash(byte: u8) -> [u8; 32] {
        [byte; 32]
    }

    fn finalize_body(message: [u8; 32], amount: u64) -> Vec<u8> {
        let mut body = Vec::new();
        body.extend_from_slice(&message);
        body.extend_from_slice(&amount.to_le_bytes());
        body
    }

    fn initialize_body(role: u8) -> Vec<u8> {
        let mut body = Vec::new();
        body.push(role);
        body.extend_from_slice(&1u32.to_le_bytes());
        body.extend_from_slice(Pubkey::new_unique().as_ref());
        body.extend_from_slice(&hash(0x31));
        body.extend_from_slice(&hash(0x32));
        body.extend_from_slice(&hash(0x33));
        body.extend_from_slice(&hash(0x34));
        body
    }

    fn burn_body(amount: u64, nonce: u64, recipient: &[u8]) -> Vec<u8> {
        let mut body = Vec::new();
        body.extend_from_slice(&amount.to_le_bytes());
        body.extend_from_slice(&nonce.to_le_bytes());
        body.extend_from_slice(&(recipient.len() as u16).to_le_bytes());
        body.extend_from_slice(recipient);
        body
    }

    #[test]
    fn public_entrypoint_rejects_empty_truncated_and_unknown_wires() {
        let program = Pubkey::new_unique();
        assert_eq!(
            process_instruction(&program, &[], &[]),
            Err(ProgramError::InvalidInstructionData)
        );
        assert_eq!(
            process_instruction(&program, &[], &[1]),
            Err(ProgramError::InvalidInstructionData)
        );
        assert_eq!(
            process_instruction(&program, &[], &[2, 1]),
            Err(ProgramError::InvalidInstructionData)
        );
        assert_eq!(
            process_instruction(&program, &[], &[1, u8::MAX]),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn public_finalize_wire_is_closed_before_accounts_are_read() {
        let program = Pubkey::new_unique();
        let mut wire = vec![1, 2];
        wire.extend_from_slice(&[0x11; 32]);
        wire.extend_from_slice(&1u64.to_le_bytes());
        assert_eq!(
            process_instruction(&program, &[], &wire),
            if COMPILED_ROLE == ROLE_SOURCE {
                Err(ProgramError::InvalidInstructionData)
            } else {
                Err(ProgramError::NotEnoughAccountKeys)
            }
        );
        wire.push(0);
        assert_eq!(
            process_instruction(&program, &[], &wire),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[cfg(feature = "destination-program")]
    #[test]
    fn destination_build_rejects_source_initialization_and_burn_dispatch() {
        let program = Pubkey::new_unique();
        let mut source_initialize = vec![WIRE_VERSION, OPCODE_INITIALIZE];
        source_initialize.extend_from_slice(&initialize_body(ROLE_SOURCE));
        assert_eq!(
            process_instruction(&program, &[], &source_initialize),
            Err(ProgramError::InvalidInstructionData)
        );

        let mut burn = vec![WIRE_VERSION, OPCODE_BURN_TO_TAIRA];
        burn.extend_from_slice(&burn_body(1, 0, TAIRA_ACCOUNT.as_bytes()));
        assert_eq!(
            process_instruction(&program, &[], &burn),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[cfg(feature = "source-program")]
    #[test]
    fn source_build_rejects_destination_initialization_and_finalize_dispatch() {
        let program = Pubkey::new_unique();
        let mut destination_initialize = vec![WIRE_VERSION, OPCODE_INITIALIZE];
        destination_initialize.extend_from_slice(&initialize_body(ROLE_DESTINATION));
        assert_eq!(
            process_instruction(&program, &[], &destination_initialize),
            Err(ProgramError::InvalidInstructionData)
        );

        let mut finalize = vec![WIRE_VERSION, OPCODE_FINALIZE_FROM_TAIRA];
        finalize.extend_from_slice(&finalize_body([0x11; 32], 1));
        assert_eq!(
            process_instruction(&program, &[], &finalize),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn public_burn_wire_rejects_non_i105_recipient_before_accounts_are_read() {
        let program = Pubkey::new_unique();
        let recipient = b"alice@taira";
        let mut wire = vec![1, 3];
        wire.extend_from_slice(&1u64.to_le_bytes());
        wire.extend_from_slice(&0u64.to_le_bytes());
        wire.extend_from_slice(&(recipient.len() as u16).to_le_bytes());
        wire.extend_from_slice(recipient);
        assert_eq!(
            process_instruction(&program, &[], &wire),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn exact_lane_hashes_match_shared_rust_javascript_vectors() {
        assert_eq!(
            source_lane_hash(),
            hex32("13079550946920d8670fb700cf4f2ba13fd5a12d34b49072f46016433b2208c3")
        );
        assert_eq!(
            destination_lane_hash(),
            hex32("890f8fdecb5770da0a8bc2119508a48cba6d0f908a4af559daa7bdba4c4b21db")
        );
        assert_ne!(source_lane_hash(), destination_lane_hash());
    }

    #[test]
    fn lane_bytes_bind_exact_profiles_genesis_and_taira_chain() {
        let source = source_lane_bytes();
        assert!(source
            .windows(32)
            .any(|window| window == SOLANA_TESTNET_GENESIS_HASH));
        assert!(source
            .windows(16)
            .any(|window| window == SORA_TAIRA_CHAIN_ID_BYTES));
        assert_ne!(source, destination_lane_bytes());
        let mut changed = source.clone();
        *changed.last_mut().unwrap() ^= 1;
        assert_ne!(
            prefixed_blake2b(LANE_HASH_PREFIX, &changed),
            source_lane_hash()
        );
    }

    #[test]
    fn initialization_wire_is_closed_and_rejects_hash_role_aliases() {
        for role in [ROLE_DESTINATION, ROLE_SOURCE] {
            let body = initialize_body(role);
            assert_eq!(InitializeArgs::parse(&body).unwrap().role, role);
            let mut trailing = body.clone();
            trailing.push(0);
            assert_eq!(
                InitializeArgs::parse(&trailing),
                Err(ProgramError::InvalidInstructionData)
            );
        }
        for role in [0, 3, u8::MAX] {
            let mut body = initialize_body(role);
            assert_eq!(
                InitializeArgs::parse(&body),
                Err(ProgramError::InvalidInstructionData)
            );
            body[0] = ROLE_DESTINATION;
        }
        for unsupported_revision in [0, 2, u32::MAX] {
            let mut unsupported = initialize_body(ROLE_DESTINATION);
            unsupported[1..5].copy_from_slice(&unsupported_revision.to_le_bytes());
            assert_eq!(
                InitializeArgs::parse(&unsupported),
                Err(ProgramError::InvalidInstructionData)
            );
        }
        for target in [69usize, 101, 133] {
            let mut aliased = initialize_body(ROLE_DESTINATION);
            let baseline = aliased[37..69].to_vec();
            aliased[target..target + 32].copy_from_slice(&baseline);
            assert_eq!(
                InitializeArgs::parse(&aliased),
                Err(ProgramError::InvalidInstructionData)
            );
        }
    }

    #[test]
    fn route_initialization_requires_exact_sealed_native_material() {
        let material_key = Pubkey::new_unique();
        let verifier_owner = Pubkey::new_unique();
        let destination_program = Pubkey::new_unique();
        let source_program = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let destination_state =
            route_state_address(&destination_program, ROLE_DESTINATION, &mint).0;
        let args = InitializeArgs {
            role: ROLE_DESTINATION,
            route_revision: ROUTE_REVISION,
            destination_state,
            destination_binding_hash: hash(0x31),
            route_configuration_hash: hash(0x32),
            verifier_key_hash: hash(0x35),
            verifier_config_hash: hash(0x36),
        };
        let bridge_authority = Pubkey::find_program_address(
            &[VERIFY_AUTHORITY_SEED, destination_state.as_ref()],
            &destination_program,
        )
        .0;
        let mut lamports = 1;
        let mut data = vec![0; MATERIAL_ACCOUNT_LEN];
        data[..8].copy_from_slice(MATERIAL_MAGIC);
        data[8] = WIRE_VERSION;
        data[MATERIAL_STATUS_OFFSET] = MATERIAL_STATUS_SEALED;
        data[MATERIAL_WRITTEN_OFFSET..MATERIAL_WRITTEN_OFFSET + 2]
            .copy_from_slice(&MATERIAL_VERIFYING_KEY_LEN.to_le_bytes());
        data[MATERIAL_ROUTE_REVISION_OFFSET..MATERIAL_ROUTE_REVISION_OFFSET + 4]
            .copy_from_slice(&ROUTE_REVISION.to_le_bytes());
        data[MATERIAL_ASSET_LEN_OFFSET] = XOR_ASSET_KEY.len() as u8;
        for (offset, value) in [
            (MATERIAL_VK_KECCAK_OFFSET, args.verifier_key_hash),
            (MATERIAL_CONFIG_SHA256_OFFSET, args.verifier_config_hash),
            (
                MATERIAL_BRIDGE_PROGRAM_OFFSET,
                destination_program.to_bytes(),
            ),
            (
                MATERIAL_BRIDGE_AUTHORITY_OFFSET,
                bridge_authority.to_bytes(),
            ),
            (MATERIAL_BRIDGE_STATE_OFFSET, destination_state.to_bytes()),
            (MATERIAL_MINT_OFFSET, mint.to_bytes()),
            (MATERIAL_TOKEN_PROGRAM_OFFSET, TOKEN_PROGRAM_ID.to_bytes()),
            (
                MATERIAL_DESTINATION_BINDING_OFFSET,
                args.destination_binding_hash,
            ),
            (
                MATERIAL_ROUTE_CONFIGURATION_OFFSET,
                args.route_configuration_hash,
            ),
            (MATERIAL_SOURCE_LANE_HASH_OFFSET, source_lane_hash()),
            (
                MATERIAL_DESTINATION_LANE_HASH_OFFSET,
                destination_lane_hash(),
            ),
            (MATERIAL_SOURCE_PROGRAM_OFFSET, source_program.to_bytes()),
        ] {
            put_hash(&mut data, offset, &value).unwrap();
        }
        data[MATERIAL_ASSET_OFFSET..MATERIAL_ASSET_OFFSET + XOR_ASSET_KEY.len()]
            .copy_from_slice(XOR_ASSET_KEY);
        data[MATERIAL_ROUTE_ID_OFFSET..MATERIAL_ROUTE_ID_OFFSET + ROUTE_ID.len()]
            .copy_from_slice(ROUTE_ID);
        {
            let account = AccountInfo::new(
                &material_key,
                false,
                false,
                &mut lamports,
                &mut data,
                &verifier_owner,
                false,
            );
            require_sealed_verifier_material(
                &account,
                &SealedVerifierMaterialRoute {
                    verifier_program: &verifier_owner,
                    destination_program: &destination_program,
                    source_program: &source_program,
                    destination_state: &destination_state,
                    mint: &mint,
                    token_program: &TOKEN_PROGRAM_ID,
                },
                &args,
            )
            .expect("sealed exact material");
        }
        for offset in [
            MATERIAL_STATUS_OFFSET,
            MATERIAL_VK_KECCAK_OFFSET,
            MATERIAL_CONFIG_SHA256_OFFSET,
            MATERIAL_SOURCE_PROGRAM_OFFSET,
            MATERIAL_BRIDGE_STATE_OFFSET,
            MATERIAL_MINT_OFFSET,
            MATERIAL_TOKEN_PROGRAM_OFFSET,
            MATERIAL_SOURCE_LANE_HASH_OFFSET,
        ] {
            let original = data[offset];
            data[offset] ^= 1;
            let account = AccountInfo::new(
                &material_key,
                false,
                false,
                &mut lamports,
                &mut data,
                &verifier_owner,
                false,
            );
            assert!(require_sealed_verifier_material(
                &account,
                &SealedVerifierMaterialRoute {
                    verifier_program: &verifier_owner,
                    destination_program: &destination_program,
                    source_program: &source_program,
                    destination_state: &destination_state,
                    mint: &mint,
                    token_program: &TOKEN_PROGRAM_ID,
                },
                &args,
            )
            .is_err());
            drop(account);
            data[offset] = original;
        }
    }

    #[test]
    fn finalize_wire_is_exact_and_packet_small() {
        let message = hash(0x41);
        let amount = u64::MAX;
        let args = FinalizeArgs::parse(&finalize_body(message, amount)).unwrap();
        assert_eq!(args.message_id, message);
        assert_eq!(args.amount, amount);
        let verifier_wire = args.verifier_wire();
        assert_eq!(&verifier_wire[..2], &[1, 6]);
        assert_eq!(&verifier_wire[2..34], &message);
        assert_eq!(&verifier_wire[34..], &amount.to_le_bytes());
        assert_eq!(verifier_wire.len(), 42);
    }

    #[test]
    fn finalize_rejects_truncation_trailing_zero_message_and_zero_amount() {
        let valid = finalize_body(hash(0x42), 1);
        for len in 0..valid.len() {
            assert_eq!(
                FinalizeArgs::parse(&valid[..len]),
                Err(ProgramError::InvalidInstructionData)
            );
        }
        let mut trailing = valid.clone();
        trailing.push(0);
        assert_eq!(
            FinalizeArgs::parse(&trailing),
            Err(ProgramError::InvalidInstructionData)
        );
        assert_eq!(
            FinalizeArgs::parse(&finalize_body([0; 32], 1)),
            Err(ProgramError::InvalidInstructionData)
        );
        assert_eq!(
            FinalizeArgs::parse(&finalize_body(hash(1), 0)),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn proof_and_material_pdas_bind_every_runtime_role() {
        let verifier = Pubkey::new_unique();
        let payer = Pubkey::new_unique();
        let message = hash(0x51);
        let key_hash = hash(0x52);
        let config_hash = hash(0x53);
        let material =
            Pubkey::find_program_address(&[MATERIAL_PDA_SEED, &key_hash, &config_hash], &verifier)
                .0;
        let proof = Pubkey::find_program_address(
            &[PROOF_PDA_SEED, material.as_ref(), &message, payer.as_ref()],
            &verifier,
        )
        .0;
        let attacks = [
            Pubkey::find_program_address(
                &[MATERIAL_PDA_SEED, &hash(0x54), &config_hash],
                &verifier,
            )
            .0,
            Pubkey::find_program_address(&[MATERIAL_PDA_SEED, &key_hash, &hash(0x55)], &verifier).0,
        ];
        assert!(attacks.iter().all(|attack| *attack != material));
        for (attack_material, attack_message, attack_payer, attack_program) in [
            (Pubkey::new_unique(), message, payer, verifier),
            (material, hash(0x56), payer, verifier),
            (material, message, Pubkey::new_unique(), verifier),
            (material, message, payer, Pubkey::new_unique()),
        ] {
            assert_ne!(
                Pubkey::find_program_address(
                    &[
                        PROOF_PDA_SEED,
                        attack_material.as_ref(),
                        &attack_message,
                        attack_payer.as_ref(),
                    ],
                    &attack_program,
                )
                .0,
                proof
            );
        }
    }

    #[test]
    fn destination_receipt_pda_prevents_cross_state_and_message_replay() {
        let program = Pubkey::new_unique();
        let state = Pubkey::new_unique();
        let message = hash(0x61);
        let receipt = Pubkey::find_program_address(
            &[DESTINATION_RECEIPT_SEED, state.as_ref(), &message],
            &program,
        )
        .0;
        assert_ne!(
            receipt,
            Pubkey::find_program_address(
                &[
                    DESTINATION_RECEIPT_SEED,
                    Pubkey::new_unique().as_ref(),
                    &message,
                ],
                &program,
            )
            .0
        );
        assert_ne!(
            receipt,
            Pubkey::find_program_address(
                &[DESTINATION_RECEIPT_SEED, state.as_ref(), &hash(0x62)],
                &program,
            )
            .0
        );
    }

    #[test]
    fn canonical_source_payload_is_exact_codec6_and_lane_bound() {
        let sender = Pubkey::new_from_array(hash(0x71));
        let payload =
            canonical_source_payload(&sender, TAIRA_ACCOUNT.as_bytes(), 25, 0, 1).unwrap();
        assert!(payload.len() <= MAX_CANONICAL_PAYLOAD_BYTES);
        let mut cursor = Cursor::new(&payload);
        assert_eq!(cursor.u8().unwrap(), PAYLOAD_TRANSFER_DISCRIMINANT);
        assert_eq!(cursor.u8().unwrap(), 1);
        assert_eq!(cursor.u32().unwrap(), SCCP_DOMAIN_SOLANA);
        assert_eq!(cursor.u32().unwrap(), SCCP_DOMAIN_SORA);
        assert_eq!(cursor.u64().unwrap(), 0);
        assert_eq!(cursor.u32().unwrap(), 1);
        assert_eq!(cursor.u32().unwrap(), SCCP_DOMAIN_SORA);
        assert_eq!(cursor.u8().unwrap(), CODEC_CANONICAL_TEXT);
        let asset_len = cursor.u32().unwrap() as usize;
        assert_eq!(cursor.take(asset_len).unwrap(), XOR_ASSET_KEY);
        assert_eq!(
            u128::from_le_bytes(cursor.take(16).unwrap().try_into().unwrap()),
            25
        );
        assert_eq!(cursor.u8().unwrap(), CODEC_SOLANA_PUBKEY32);
        let sender_len = cursor.u32().unwrap() as usize;
        assert_eq!(cursor.take(sender_len).unwrap(), sender.as_ref());
        assert_eq!(cursor.u8().unwrap(), CODEC_CANONICAL_TEXT);
        let recipient_len = cursor.u32().unwrap() as usize;
        assert_eq!(
            cursor.take(recipient_len).unwrap(),
            TAIRA_ACCOUNT.as_bytes()
        );
        assert_eq!(cursor.u8().unwrap(), CODEC_CANONICAL_TEXT);
        let route_len = cursor.u32().unwrap() as usize;
        assert_eq!(cursor.take(route_len).unwrap(), ROUTE_ID);
        assert!(cursor.finished());
        let payload_hash = prefixed_blake2b(PAYLOAD_HASH_PREFIX, &payload);
        let message_id = lane_bound_message_id(&source_lane_bytes(), &payload);
        let event = source_event_digest(source_lane_hash(), message_id, payload_hash).unwrap();
        assert_eq!(
            payload_hash,
            hex32("c1a0063666ad8fd5a3c6e3215b326a1671a5b77e4d0b9b24fc1eea116012a5c2")
        );
        assert_eq!(
            message_id,
            hex32("511503e6e6eaa81a805c8eb0f14143ac9b378ccd5b99b14a347e88f9194d9660")
        );
        assert_eq!(
            event,
            hex32("917b4fc0bc760f78ddf3e35acc8366eefd405a3f23e03c15235d7199828f28aa")
        );
    }

    #[test]
    fn nonce_amount_sender_and_recipient_mutations_change_identity_and_revision_is_v1_only() {
        let sender = Pubkey::new_from_array(hash(0x72));
        let baseline = canonical_source_payload(
            &sender,
            TAIRA_ACCOUNT.as_bytes(),
            9 * TAIRA_TO_SPL_MULTIPLIER,
            7,
            1,
        )
        .unwrap();
        let baseline_id = lane_bound_message_id(&source_lane_bytes(), &baseline);
        let other_sender = Pubkey::new_from_array(hash(0x73));
        let variants = [
            canonical_source_payload(
                &sender,
                TAIRA_ACCOUNT.as_bytes(),
                10 * TAIRA_TO_SPL_MULTIPLIER,
                7,
                1,
            )
            .unwrap(),
            canonical_source_payload(
                &sender,
                TAIRA_ACCOUNT.as_bytes(),
                9 * TAIRA_TO_SPL_MULTIPLIER,
                8,
                1,
            )
            .unwrap(),
            canonical_source_payload(
                &other_sender,
                TAIRA_ACCOUNT.as_bytes(),
                9 * TAIRA_TO_SPL_MULTIPLIER,
                7,
                1,
            )
            .unwrap(),
        ];
        for variant in variants {
            assert_ne!(
                lane_bound_message_id(&source_lane_bytes(), &variant),
                baseline_id
            );
        }
        assert_ne!(
            lane_bound_message_id(&destination_lane_bytes(), &baseline),
            baseline_id
        );
        assert!(canonical_source_payload(
            &sender,
            TAIRA_ACCOUNT.as_bytes(),
            9 * TAIRA_TO_SPL_MULTIPLIER,
            7,
            2,
        )
        .is_err());
    }

    #[test]
    fn burn_wire_accepts_full_nonce_domain_but_rejects_noncanonical_text_and_trailing_data() {
        let max = burn_body(1, u64::MAX, TAIRA_ACCOUNT.as_bytes());
        assert_eq!(BurnArgs::parse(&max).unwrap().nonce, u64::MAX);
        for bad in [
            b"alice@taira".as_slice(),
            b"test111111".as_slice(),
            b"testuinvalid0".as_slice(),
            MIXED_TORSION_TAIRA_ACCOUNT.as_bytes(),
        ] {
            assert!(BurnArgs::parse(&burn_body(1, 0, bad)).is_err());
        }
        let mut checksum = TAIRA_ACCOUNT.as_bytes().to_vec();
        *checksum.last_mut().unwrap() = b'1';
        assert!(BurnArgs::parse(&burn_body(1, 0, &checksum)).is_err());
        let mut trailing = max;
        trailing.push(0);
        assert_eq!(
            BurnArgs::parse(&trailing),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn source_economics_use_exact_scale_9_base_unit_identity() {
        assert_eq!(TAIRA_TO_SPL_MULTIPLIER, 1);
        for amount in [1, 25, u64::MAX] {
            assert_eq!(taira_payload_amount(amount).unwrap(), amount);
        }
        assert_eq!(
            taira_payload_amount(0),
            Err(ProgramError::InvalidInstructionData)
        );
        assert!(
            canonical_source_payload(&Pubkey::new_unique(), TAIRA_ACCOUNT.as_bytes(), 0, 0, 1,)
                .is_err()
        );
    }

    #[test]
    fn lifetime_volume_telemetry_saturates_without_rejecting_settlement() {
        let amount = 25;
        let near_limit = u64::MAX - amount + 1;
        assert_eq!(
            telemetry_total_after_settlement(near_limit, amount),
            u64::MAX
        );
        assert_eq!(telemetry_total_after_settlement(u64::MAX, 1), u64::MAX);
    }

    #[test]
    fn source_event_digest_binds_lane_message_and_payload_without_hub_material() {
        let lane = source_lane_hash();
        let message = hash(0x81);
        let payload = hash(0x82);
        let baseline = source_event_digest(lane, message, payload).unwrap();
        assert_ne!(
            baseline,
            source_event_digest(destination_lane_hash(), message, payload).unwrap()
        );
        assert_ne!(
            baseline,
            source_event_digest(lane, hash(0x83), payload).unwrap()
        );
        assert_ne!(
            baseline,
            source_event_digest(lane, message, hash(0x84)).unwrap()
        );
        assert!(source_event_digest(lane, lane, payload).is_err());
        assert!(source_event_digest(lane, message, message).is_err());
    }

    #[test]
    fn source_receipt_is_fixed_bounded_and_commits_every_economic_role() {
        let keys: Vec<Pubkey> = (0..5).map(|_| Pubkey::new_unique()).collect();
        let payload = canonical_source_payload(
            &keys[3],
            TAIRA_ACCOUNT.as_bytes(),
            17 * TAIRA_TO_SPL_MULTIPLIER,
            u64::MAX,
            1,
        )
        .unwrap();
        let lane = source_lane_hash();
        let message = lane_bound_message_id(&source_lane_bytes(), &payload);
        let payload_hash = prefixed_blake2b(PAYLOAD_HASH_PREFIX, &payload);
        let event = source_event_digest(lane, message, payload_hash).unwrap();
        let baseline = source_receipt_bytes(
            9,
            &keys[0],
            &keys[1],
            &keys[2],
            &keys[3],
            &keys[4],
            17 * TAIRA_TO_SPL_MULTIPLIER,
            17,
            u64::MAX,
            1,
            hash(0x91),
            lane,
            message,
            payload_hash,
            event,
            10,
            &payload,
        )
        .unwrap();
        assert_eq!(baseline.len(), SOURCE_RECEIPT_LEN);
        assert_eq!(&baseline[0..8], SOURCE_RECEIPT_MAGIC);
        assert_eq!(
            usize::from(u16::from_le_bytes(baseline[376..378].try_into().unwrap())),
            payload.len()
        );
        assert_eq!(&baseline[384..384 + payload.len()], payload);
        let baseline_hash = prefixed_blake2b(SOURCE_RECEIPT_HASH_PREFIX, &baseline);
        for offset in [
            9usize, 16, 48, 80, 112, 144, 176, 184, 192, 200, 208, 240, 272, 304, 336, 368, 384,
        ] {
            let mut attack = baseline.clone();
            attack[offset] ^= 1;
            assert_ne!(
                prefixed_blake2b(SOURCE_RECEIPT_HASH_PREFIX, &attack),
                baseline_hash,
                "receipt offset {offset} must be committed"
            );
        }
    }

    #[test]
    fn peer_state_comparison_rejects_every_governed_substitution() {
        let source_program = Pubkey::new_unique();
        let destination_program = Pubkey::new_unique();
        let destination_state = Pubkey::new_unique();
        let base = StateConfig {
            role: ROLE_DESTINATION,
            verify_bump: 1,
            mint_bump: 2,
            route_revision: 1,
            mint: Pubkey::new_unique(),
            peer_program: source_program,
            destination_state,
            verifier_program: Pubkey::new_unique(),
            material: Pubkey::new_unique(),
            destination_binding_hash: hash(0xa1),
            route_configuration_hash: hash(0xa2),
            verifier_key_hash: hash(0xa3),
            verifier_config_hash: hash(0xa4),
            source_lane_hash: source_lane_hash(),
            destination_lane_hash: destination_lane_hash(),
        };
        let source = StateConfig {
            role: ROLE_SOURCE,
            peer_program: destination_program,
            ..base
        };
        assert!(require_peer_configs(&source_program, &source, &base).is_ok());

        let mut attacks = Vec::new();
        let mut attack = base;
        attack.mint = Pubkey::new_unique();
        attacks.push(attack);
        let mut attack = base;
        attack.verifier_program = Pubkey::new_unique();
        attacks.push(attack);
        let mut attack = base;
        attack.material = Pubkey::new_unique();
        attacks.push(attack);
        let mut attack = base;
        attack.route_revision = 2;
        attacks.push(attack);
        let mut attack = base;
        attack.destination_binding_hash = hash(0xb1);
        attacks.push(attack);
        let mut attack = base;
        attack.route_configuration_hash = hash(0xb2);
        attacks.push(attack);
        let mut attack = base;
        attack.verifier_key_hash = hash(0xb3);
        attacks.push(attack);
        let mut attack = base;
        attack.verifier_config_hash = hash(0xb4);
        attacks.push(attack);
        let mut attack = base;
        attack.source_lane_hash = hash(0xb5);
        attacks.push(attack);
        let mut attack = base;
        attack.destination_lane_hash = hash(0xb6);
        attacks.push(attack);
        for attack in attacks {
            assert_eq!(
                require_peer_configs(&source_program, &source, &attack),
                Err(ProgramError::InvalidAccountData)
            );
        }
    }

    #[test]
    fn token_cpis_are_exact_and_do_not_carry_untrusted_metadata() {
        let source = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let amount = u64::MAX;
        let burn = token_burn_instruction(&source, &mint, &owner, amount);
        assert_eq!(burn.program_id, TOKEN_PROGRAM_ID);
        let mut expected_burn = vec![TOKEN_INSTRUCTION_BURN];
        expected_burn.extend_from_slice(&amount.to_le_bytes());
        assert_eq!(burn.data, expected_burn);
        assert_eq!(burn.accounts.len(), 3);
        assert!(burn.accounts[2].is_signer);
        let mint_to = token_mint_to_instruction(&mint, &source, &owner, amount);
        let mut expected_mint = vec![TOKEN_INSTRUCTION_MINT_TO];
        expected_mint.extend_from_slice(&amount.to_le_bytes());
        assert_eq!(mint_to.data, expected_mint);
        assert_eq!(mint_to.accounts.len(), 3);
        assert!(mint_to.accounts[2].is_signer);
    }

    #[test]
    fn signer_writable_and_owner_substitutions_fail_closed() {
        let key = Pubkey::new_unique();
        let correct_owner = Pubkey::new_unique();
        let wrong_owner = Pubkey::new_unique();
        let mut lamports = 0;
        let mut data = [];
        let account = AccountInfo::new(
            &key,
            false,
            false,
            &mut lamports,
            &mut data,
            &wrong_owner,
            false,
        );
        assert_eq!(
            require_signer(&account),
            Err(ProgramError::MissingRequiredSignature)
        );
        assert_eq!(
            require_writable(&account, "hostile"),
            Err(ProgramError::InvalidAccountData)
        );
        assert_eq!(
            require_key(account.owner, &correct_owner, "hostile owner"),
            Err(ProgramError::InvalidAccountData)
        );
        assert_eq!(
            require_account_count(&[], 1),
            Err(ProgramError::NotEnoughAccountKeys)
        );
        assert_eq!(
            require_account_count(&[account.clone(), account.clone()], 1),
            Err(ProgramError::NotEnoughAccountKeys)
        );
    }

    #[test]
    fn route_state_pdas_bind_program_role_and_mint() {
        let destination_program = Pubkey::new_unique();
        let source_program = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let other_mint = Pubkey::new_unique();
        let destination = route_state_address(&destination_program, ROLE_DESTINATION, &mint).0;
        let source = route_state_address(&source_program, ROLE_SOURCE, &mint).0;
        assert_ne!(destination, source);
        assert_ne!(
            destination,
            route_state_address(&destination_program, ROLE_SOURCE, &mint).0
        );
        assert_ne!(
            destination,
            route_state_address(&destination_program, ROLE_DESTINATION, &other_mint).0
        );
        require_route_state_pda_key(&destination, &destination_program, ROLE_DESTINATION, &mint)
            .expect("exact destination state PDA");
        for hostile in [
            source,
            Pubkey::new_unique(),
            route_state_address(&destination_program, ROLE_SOURCE, &mint).0,
            route_state_address(&destination_program, ROLE_DESTINATION, &other_mint).0,
        ] {
            assert_eq!(
                require_route_state_pda_key(
                    &hostile,
                    &destination_program,
                    ROLE_DESTINATION,
                    &mint,
                ),
                Err(ProgramError::InvalidAccountData),
            );
        }
    }

    #[test]
    fn verifier_failure_prevents_receipt_and_mint() {
        use std::cell::RefCell;

        let calls = RefCell::new(Vec::new());
        let result = verify_then_record_then_mint(
            || {
                calls.borrow_mut().push("verify");
                Err(ProgramError::Custom(77))
            },
            || {
                calls.borrow_mut().push("record");
                Ok(())
            },
            || {
                calls.borrow_mut().push("mint");
                Ok(())
            },
        );
        assert_eq!(result, Err(ProgramError::Custom(77)));
        assert_eq!(calls.into_inner(), ["verify"]);
    }

    #[test]
    fn record_failure_prevents_mint_and_success_order_is_fixed() {
        use std::cell::RefCell;

        let calls = RefCell::new(Vec::new());
        let result = verify_then_record_then_mint(
            || {
                calls.borrow_mut().push("verify");
                Ok(())
            },
            || {
                calls.borrow_mut().push("record");
                Err(ProgramError::Custom(78))
            },
            || {
                calls.borrow_mut().push("mint");
                Ok(())
            },
        );
        assert_eq!(result, Err(ProgramError::Custom(78)));
        assert_eq!(calls.into_inner(), ["verify", "record"]);

        let calls = RefCell::new(Vec::new());
        assert!(verify_then_record_then_mint(
            || {
                calls.borrow_mut().push("verify");
                Ok(())
            },
            || {
                calls.borrow_mut().push("record");
                Ok(())
            },
            || {
                calls.borrow_mut().push("mint");
                Ok(())
            },
        )
        .is_ok());
        assert_eq!(calls.into_inner(), ["verify", "record", "mint"]);
    }

    #[test]
    fn burn_failure_prevents_source_record() {
        use std::cell::RefCell;

        let calls = RefCell::new(Vec::new());
        let result: Result<(), ProgramError> = burn_then_record(
            || {
                calls.borrow_mut().push("burn");
                Err(ProgramError::InsufficientFunds)
            },
            || {
                calls.borrow_mut().push("record");
                Ok(())
            },
        );
        assert_eq!(result, Err(ProgramError::InsufficientFunds));
        assert_eq!(calls.into_inner(), ["burn"]);
    }

    #[test]
    fn state_and_receipt_sizes_remain_transaction_safe() {
        assert_eq!(STATE_LEN, 400);
        assert_eq!(DESTINATION_RECEIPT_LEN, 272);
        assert_eq!(SOURCE_RECEIPT_LEN, 896);
        assert_eq!(FinalizeArgs::LEN + 2, 42);
        assert_eq!(InitializeArgs::LEN + 2, 167);
        assert_eq!(18 + MAX_TAIRA_ACCOUNT_BYTES, 146);
    }

    fn hex32(value: &str) -> [u8; 32] {
        assert_eq!(value.len(), 64);
        let mut out = [0u8; 32];
        for (index, slot) in out.iter_mut().enumerate() {
            *slot = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16).unwrap();
        }
        out
    }
}
