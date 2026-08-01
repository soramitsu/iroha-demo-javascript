//! Immutable, account-backed Groth16 verifier for TAIRA -> Solana SCCP V1.
//!
//! Large verification keys and proofs never cross the bridge CPI boundary.
//! They are uploaded to verifier-owned PDAs in bounded, contiguous chunks and
//! become permanently immutable only after their hashes, canonical encodings,
//! route bindings, and BN254 pairing equation have been checked.

#![allow(unexpected_cfgs)]

use blake2::{
    digest::{Update, VariableOutput},
    Blake2bVar,
};
use solana_bn254::prelude::{
    alt_bn128_g1_addition_be, alt_bn128_g1_multiplication_be, alt_bn128_g2_multiplication_be,
    alt_bn128_pairing_be,
};
use solana_program::{
    account_info::AccountInfo,
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    hash::hashv as sha256_hashv,
    keccak::hashv as keccak_hashv,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    sysvar::Sysvar,
};
use solana_sdk_ids::bpf_loader_upgradeable;
use solana_system_interface::{instruction as system_instruction, program as system_program};

entrypoint!(process_instruction);

pub const WIRE_VERSION: u8 = 1;
pub const MATERIAL_SEED: &[u8] = b"sccp-vk-v1";
pub const PROOF_SEED: &[u8] = b"sccp-proof-v1";
pub const BRIDGE_AUTHORITY_SEED: &[u8] = b"sccp-verify-authority-v1";
pub const MINT_AUTHORITY_SEED: &[u8] = b"sccp-mint-authority-v1";
pub const ROUTE_STATE_SEED: &[u8] = b"sccp-route-state-v1";
pub const MAX_CHUNK_BYTES: usize = 512;
pub const MAX_PAYLOAD_BYTES: usize = 512;
pub const PUBLIC_INPUTS_LEN: usize = 141;
pub const STATEMENT_HASH_LEN: usize = 32;
pub const GROTH16_PROOF_LEN: usize = 384;
pub const PROOF_BODY_FIXED_LEN: usize =
    PUBLIC_INPUTS_LEN + STATEMENT_HASH_LEN + GROTH16_PROOF_LEN + 2;
pub const PROOF_BODY_MAX_LEN: usize = PROOF_BODY_FIXED_LEN + MAX_PAYLOAD_BYTES;
pub const VERIFYING_KEY_LEN: usize = 38 * 32;

const SCCP_DOMAIN_SORA: u32 = 0;
const SCCP_DOMAIN_SOLANA: u32 = 3;
const SCCP_CODEC_TEXT: u8 = 1;
const SCCP_CODEC_SOLANA_PUBKEY32: u8 = 6;
const SCCP_PAYLOAD_TRANSFER: u8 = 2;
// TAIRA payloads and the Solana XOR mint both use nine decimal places. The
// canonical payload mantissa is therefore already the exact SPL base-unit
// amount; an EVM-style 1e9 expansion would cap usable SPL supply at ~18 XOR.
const TAIRA_TO_SPL_MULTIPLIER: u128 = 1;
const ROUTE_REVISION: u32 = 1;
const BRIDGE_ROLE_DESTINATION: u8 = 1;
const XOR_SPL_DECIMALS: u8 = 9;
const ROUTE_ID: &[u8] = b"taira_sol_xor";
const XOR_ASSET_KEY: &[u8] = b"xor";
const PAYLOAD_HASH_PREFIX: &[u8] = b"sccp:payload:v1";
const MESSAGE_ID_PREFIX: &[u8] = b"sccp:lane-message-id:v1";
const CONFIG_HASH_PREFIX: &[u8] = b"sccp:solana:verifier-config:v1";
const LANE_HASH_PREFIX: &[u8] = b"sccp:lane-id:v1";
const ACCOUNT_HASH_PREFIX: &[u8] = b"sccp:solana:proof-account:v1";
const CONTEXT_HASH_PREFIX: &[u8] = b"sccp:solana:settlement-context:v1";

const SORA_TAIRA_NETWORK_BYTES: &[u8] = &[
    1, 1, 0, 0, 0, 0, 0xfc, 0x56, 0x98, 0x4b, 0x2b, 0xe7, 0x43, 0x1d, 0x84, 0x0e, 0x21, 0x51, 0x4d,
    0x18, 0x83, 0xf0,
];
const SOLANA_TESTNET_NETWORK_BYTES: &[u8] = &[
    1, 13, 3, 0, 0, 0, 0x3a, 0x13, 0x2e, 0xce, 0x10, 0x30, 0x5e, 0xc1, 0x83, 0x07, 0x25, 0x50,
    0x2f, 0xa2, 0xb7, 0xe7, 0xeb, 0x81, 0x57, 0xe9, 0x12, 0x3d, 0x4c, 0x1f, 0x65, 0x4a, 0x71, 0x78,
    0x71, 0x61, 0xdc, 0x21,
];
const TOKEN_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172, 28, 180, 133, 237,
    95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169,
]);
const PUBLIC_SIGNAL_SCHEMA_HASH: [u8; 32] = hex32([
    0x75, 0x67, 0x43, 0x9f, 0x41, 0x17, 0x3d, 0x67, 0x45, 0xa3, 0xd5, 0x19, 0x23, 0xcb, 0x70, 0x37,
    0x1a, 0xcc, 0x7d, 0x66, 0xf2, 0x3c, 0xef, 0xb4, 0x10, 0x0d, 0x6d, 0x5d, 0x7a, 0x43, 0x2c, 0xbb,
]);
const fn hex32(value: [u8; 32]) -> [u8; 32] {
    value
}

const BN254_BASE_FIELD: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d, 0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
];
const BN254_SCALAR_FIELD: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

const MATERIAL_MAGIC: &[u8; 8] = b"SCCPMAT1";
const PROOF_MAGIC: &[u8; 8] = b"SCCPPRF1";
const STATUS_WRITING: u8 = 1;
const STATUS_SEALED: u8 = 2;

/// Governed material header. The VK immediately follows this fixed header.
pub const MATERIAL_HEADER_LEN: usize = 768;
pub const MATERIAL_ACCOUNT_LEN: usize = MATERIAL_HEADER_LEN + VERIFYING_KEY_LEN;
pub const MAT_STATUS: usize = 9;
pub const MAT_BUMP: usize = 10;
pub const MAT_WRITTEN: usize = 12;
pub const MAT_ROUTE_REVISION: usize = 16;
pub const MAT_ASSET_LEN: usize = 20;
pub const MAT_AUTHORITY: usize = 32;
pub const MAT_VK_SHA256: usize = 64;
pub const MAT_VK_KECCAK: usize = 96;
pub const MAT_CONFIG_SHA256: usize = 128;
pub const MAT_BRIDGE_PROGRAM: usize = 160;
pub const MAT_BRIDGE_AUTHORITY: usize = 192;
pub const MAT_BRIDGE_STATE: usize = 224;
pub const MAT_MINT: usize = 256;
pub const MAT_TOKEN_PROGRAM: usize = 288;
pub const MAT_DESTINATION_BINDING: usize = 320;
pub const MAT_ROUTE_CONFIG: usize = 352;
pub const MAT_SORA_ANCHOR: usize = 384;
pub const MAT_SEMANTIC_PROFILE: usize = 416;
pub const MAT_CIRCUIT: usize = 448;
pub const MAT_WITNESS_GENERATOR: usize = 480;
pub const MAT_SCHEMA_COMMITMENT: usize = 512;
pub const MAT_SCHEMA: usize = 544;
pub const MAT_SOURCE_LANE_HASH: usize = 576;
pub const MAT_DESTINATION_LANE_HASH: usize = 608;
pub const MAT_ASSET: usize = 640;
pub const MAT_ROUTE_ID: usize = 704;
pub const MAT_SOURCE_PROGRAM: usize = 736;
pub const MAT_VK: usize = MATERIAL_HEADER_LEN;

// Exact first-release destination bridge-state layout. The verifier parses
// this foreign account only to make the sealed material and the value-moving
// program agree at settlement time; neither account can silently select a
// different governed route commitment.
const BRIDGE_STATE_MAGIC: &[u8; 8] = b"SCCPRT01";
const BRIDGE_STATE_LEN: usize = 400;
const BRIDGE_STATE_ROLE: usize = 9;
const BRIDGE_STATE_VERIFY_BUMP: usize = 10;
const BRIDGE_STATE_REVISION: usize = 12;
const BRIDGE_STATE_MINT: usize = 16;
const BRIDGE_STATE_PEER_PROGRAM: usize = 48;
const BRIDGE_STATE_DESTINATION_STATE: usize = 80;
const BRIDGE_STATE_VERIFIER_PROGRAM: usize = 112;
const BRIDGE_STATE_MATERIAL: usize = 144;
const BRIDGE_STATE_DESTINATION_BINDING: usize = 176;
const BRIDGE_STATE_ROUTE_CONFIG: usize = 208;
const BRIDGE_STATE_VERIFIER_KEY_HASH: usize = 240;
const BRIDGE_STATE_VERIFIER_CONFIG_HASH: usize = 272;
const BRIDGE_STATE_SOURCE_LANE_HASH: usize = 304;
const BRIDGE_STATE_DESTINATION_LANE_HASH: usize = 336;

/// Per-message proof header. The compact proof body immediately follows it.
pub const PROOF_HEADER_LEN: usize = 448;
pub const PRF_STATUS: usize = 9;
pub const PRF_BUMP: usize = 10;
pub const PRF_WRITTEN: usize = 12;
pub const PRF_BODY_LEN: usize = 14;
pub const PRF_ROUTE_REVISION: usize = 16;
pub const PRF_AUTHORITY: usize = 32;
pub const PRF_MATERIAL: usize = 64;
pub const PRF_BODY_SHA256: usize = 96;
pub const PRF_ACCOUNT_SHA256: usize = 128;
pub const PRF_MESSAGE: usize = 160;
pub const PRF_PAYLOAD_HASH: usize = 192;
pub const PRF_STATEMENT_HASH: usize = 224;
pub const PRF_DESTINATION_TOKEN: usize = 256;
pub const PRF_PAYER: usize = 288;
pub const PRF_AMOUNT: usize = 320;
pub const PRF_CONTEXT_SHA256: usize = 328;
pub const PRF_CONFIG_SHA256: usize = 360;
pub const PRF_VK_KECCAK: usize = 392;
pub const PRF_SEALED_SLOT: usize = 424;
pub const PRF_BODY: usize = PROOF_HEADER_LEN;

#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Opcode {
    InitializeMaterial = 0,
    AppendMaterial = 1,
    SealMaterial = 2,
    InitializeProof = 3,
    AppendProof = 4,
    SealProof = 5,
    Verify = 6,
}

impl TryFrom<u8> for Opcode {
    type Error = ProgramError;
    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::InitializeMaterial),
            1 => Ok(Self::AppendMaterial),
            2 => Ok(Self::SealMaterial),
            3 => Ok(Self::InitializeProof),
            4 => Ok(Self::AppendProof),
            5 => Ok(Self::SealProof),
            6 => Ok(Self::Verify),
            _ => Err(ProgramError::InvalidInstructionData),
        }
    }
}

struct MaterialInit<'a> {
    vk_sha256: [u8; 32],
    vk_keccak: [u8; 32],
    config_sha256: [u8; 32],
    route_revision: u32,
    asset: &'a [u8],
    hashes: [[u8; 32]; 7],
}

struct ProofInit {
    body_len: u16,
    body_sha256: [u8; 32],
    message_id: [u8; 32],
    payload_hash: [u8; 32],
    statement_hash: [u8; 32],
    destination_token: [u8; 32],
    amount: u64,
}

enum NativeInstruction<'a> {
    InitializeMaterial(MaterialInit<'a>),
    AppendMaterial { offset: u16, chunk: &'a [u8] },
    SealMaterial,
    InitializeProof(ProofInit),
    AppendProof { offset: u16, chunk: &'a [u8] },
    SealProof,
    Verify { message_id: [u8; 32], amount: u64 },
}

impl<'a> NativeInstruction<'a> {
    fn parse(data: &'a [u8]) -> Result<Self, ProgramError> {
        if data.len() < 2 || data[0] != WIRE_VERSION {
            return Err(ProgramError::InvalidInstructionData);
        }
        let opcode = Opcode::try_from(data[1])?;
        let payload = &data[2..];
        match opcode {
            Opcode::InitializeMaterial => {
                if payload.len() < 3 * 32 + 4 + 1 + 7 * 32 {
                    return Err(ProgramError::InvalidInstructionData);
                }
                let vk_sha256 = array32(payload, 0)?;
                let vk_keccak = array32(payload, 32)?;
                let config_sha256 = array32(payload, 64)?;
                let route_revision = read_u32(payload, 96)?;
                let asset_len = usize::from(payload[100]);
                if asset_len == 0 || asset_len > 64 {
                    return Err(ProgramError::InvalidInstructionData);
                }
                let hash_start = 101usize
                    .checked_add(asset_len)
                    .ok_or(ProgramError::InvalidInstructionData)?;
                if payload.len() != hash_start + 7 * 32 {
                    return Err(ProgramError::InvalidInstructionData);
                }
                let mut hashes = [[0; 32]; 7];
                for (index, hash) in hashes.iter_mut().enumerate() {
                    *hash = array32(payload, hash_start + index * 32)?;
                }
                Ok(Self::InitializeMaterial(MaterialInit {
                    vk_sha256,
                    vk_keccak,
                    config_sha256,
                    route_revision,
                    asset: &payload[101..hash_start],
                    hashes,
                }))
            }
            Opcode::AppendMaterial | Opcode::AppendProof => {
                if payload.len() < 4 {
                    return Err(ProgramError::InvalidInstructionData);
                }
                let offset = read_u16(payload, 0)?;
                let len = usize::from(read_u16(payload, 2)?);
                if len == 0 || len > MAX_CHUNK_BYTES || payload.len() != 4 + len {
                    return Err(ProgramError::InvalidInstructionData);
                }
                if opcode == Opcode::AppendMaterial {
                    Ok(Self::AppendMaterial {
                        offset,
                        chunk: &payload[4..],
                    })
                } else {
                    Ok(Self::AppendProof {
                        offset,
                        chunk: &payload[4..],
                    })
                }
            }
            Opcode::SealMaterial => exact_empty(payload).map(|()| Self::SealMaterial),
            Opcode::InitializeProof => {
                if payload.len() != 2 + 5 * 32 + 8 {
                    return Err(ProgramError::InvalidInstructionData);
                }
                Ok(Self::InitializeProof(ProofInit {
                    body_len: read_u16(payload, 0)?,
                    body_sha256: array32(payload, 2)?,
                    message_id: array32(payload, 34)?,
                    payload_hash: array32(payload, 66)?,
                    statement_hash: array32(payload, 98)?,
                    destination_token: array32(payload, 130)?,
                    amount: read_u64(payload, 162)?,
                }))
            }
            Opcode::SealProof => exact_empty(payload).map(|()| Self::SealProof),
            Opcode::Verify => {
                if payload.len() != 40 {
                    return Err(ProgramError::InvalidInstructionData);
                }
                Ok(Self::Verify {
                    message_id: array32(payload, 0)?,
                    amount: read_u64(payload, 32)?,
                })
            }
        }
    }
}

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    match NativeInstruction::parse(instruction_data)? {
        NativeInstruction::InitializeMaterial(args) => {
            initialize_material(program_id, accounts, args)
        }
        NativeInstruction::AppendMaterial { offset, chunk } => {
            append_material(program_id, accounts, offset, chunk)
        }
        NativeInstruction::SealMaterial => seal_material(program_id, accounts),
        NativeInstruction::InitializeProof(args) => initialize_proof(program_id, accounts, args),
        NativeInstruction::AppendProof { offset, chunk } => {
            append_proof(program_id, accounts, offset, chunk)
        }
        NativeInstruction::SealProof => seal_proof(program_id, accounts),
        NativeInstruction::Verify { message_id, amount } => {
            verify_sealed(program_id, accounts, message_id, amount)
        }
    }
}

fn exact_empty(payload: &[u8]) -> ProgramResult {
    if payload.is_empty() {
        Ok(())
    } else {
        Err(ProgramError::InvalidInstructionData)
    }
}

fn read_u16(data: &[u8], offset: usize) -> Result<u16, ProgramError> {
    Ok(u16::from_le_bytes(
        data.get(offset..offset + 2)
            .ok_or(ProgramError::InvalidInstructionData)?
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    ))
}
fn read_u32(data: &[u8], offset: usize) -> Result<u32, ProgramError> {
    Ok(u32::from_le_bytes(
        data.get(offset..offset + 4)
            .ok_or(ProgramError::InvalidInstructionData)?
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    ))
}
fn read_u64(data: &[u8], offset: usize) -> Result<u64, ProgramError> {
    Ok(u64::from_le_bytes(
        data.get(offset..offset + 8)
            .ok_or(ProgramError::InvalidInstructionData)?
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    ))
}
fn array32(data: &[u8], offset: usize) -> Result<[u8; 32], ProgramError> {
    data.get(offset..offset + 32)
        .ok_or(ProgramError::InvalidInstructionData)?
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)
}
fn put_u16(data: &mut [u8], offset: usize, value: u16) {
    data[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
}
fn put_u32(data: &mut [u8], offset: usize, value: u32) {
    data[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}
fn put_u64(data: &mut [u8], offset: usize, value: u64) {
    data[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
}
fn put32(data: &mut [u8], offset: usize, value: &[u8; 32]) {
    data[offset..offset + 32].copy_from_slice(value);
}

// The handlers and cryptographic verifier follow below. They intentionally use
// only the fixed offsets above; no serialized Rust enum or host ABI is trusted.

fn initialize_material(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    args: MaterialInit<'_>,
) -> ProgramResult {
    require_accounts(accounts, 13)?;
    let authority = &accounts[0];
    let material = &accounts[1];
    let native_program_account = &accounts[2];
    let native_programdata = &accounts[3];
    let bridge_program_account = &accounts[4];
    let bridge_programdata = &accounts[5];
    let source_program_account = &accounts[6];
    let source_programdata = &accounts[7];
    let bridge_state = &accounts[8];
    let bridge_authority = &accounts[9];
    let mint = &accounts[10];
    let token_program = &accounts[11];
    let system = &accounts[12];
    require_material_initialization_signers(authority, mint)?;
    require_writable(authority)?;
    require_writable(material)?;
    require_system_program(system)?;
    require_key(native_program_account, program_id)?;
    require_immutable_loader_v3_program(native_program_account, native_programdata)?;
    require_immutable_loader_v3_program(bridge_program_account, bridge_programdata)?;
    require_immutable_loader_v3_program(source_program_account, source_programdata)?;
    if !token_program.executable || token_program.key != &TOKEN_PROGRAM_ID {
        return Err(ProgramError::InvalidAccountData);
    }
    require_nonzero_distinct(&[
        authority.key,
        native_program_account.key,
        native_programdata.key,
        bridge_program_account.key,
        bridge_programdata.key,
        source_program_account.key,
        source_programdata.key,
        bridge_state.key,
        bridge_authority.key,
        mint.key,
        token_program.key,
    ])?;
    let bridge_program = bridge_program_account.key;
    let expected_bridge_state = destination_route_state_address(bridge_program, mint.key);
    require_key(bridge_state, &expected_bridge_state)?;
    let (expected_bridge_authority, _) = Pubkey::find_program_address(
        &[BRIDGE_AUTHORITY_SEED, bridge_state.key.as_ref()],
        bridge_program,
    );
    require_key(bridge_authority, &expected_bridge_authority)?;
    let expected_mint_authority = Pubkey::find_program_address(
        &[MINT_AUTHORITY_SEED, bridge_state.key.as_ref()],
        bridge_program,
    )
    .0;
    require_exact_spl_mint(mint, &expected_mint_authority)?;
    validate_material_args(&args)?;
    let computed_config = material_config_hash(
        program_id,
        args.route_revision,
        args.asset,
        &args.vk_keccak,
        bridge_program,
        source_program_account.key,
        bridge_state.key,
        mint.key,
        token_program.key,
        &args.hashes,
    )?;
    if computed_config != args.config_sha256 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let (expected, bump) = Pubkey::find_program_address(
        &[MATERIAL_SEED, &args.vk_keccak, &args.config_sha256],
        program_id,
    );
    require_key(material, &expected)?;
    create_pda_account(
        program_id,
        authority,
        material,
        system,
        MATERIAL_ACCOUNT_LEN,
        &[MATERIAL_SEED, &args.vk_keccak, &args.config_sha256, &[bump]],
    )?;
    let mut data = material.try_borrow_mut_data()?;
    data.fill(0);
    data[..8].copy_from_slice(MATERIAL_MAGIC);
    data[8] = WIRE_VERSION;
    data[MAT_STATUS] = STATUS_WRITING;
    data[MAT_BUMP] = bump;
    put_u32(&mut data, MAT_ROUTE_REVISION, args.route_revision);
    data[MAT_ASSET_LEN] =
        u8::try_from(args.asset.len()).map_err(|_| ProgramError::InvalidInstructionData)?;
    put32(&mut data, MAT_AUTHORITY, &authority.key.to_bytes());
    put32(&mut data, MAT_VK_SHA256, &args.vk_sha256);
    put32(&mut data, MAT_VK_KECCAK, &args.vk_keccak);
    put32(&mut data, MAT_CONFIG_SHA256, &args.config_sha256);
    for (offset, value) in [
        (MAT_BRIDGE_PROGRAM, &bridge_program.to_bytes()),
        (MAT_BRIDGE_AUTHORITY, &bridge_authority.key.to_bytes()),
        (MAT_BRIDGE_STATE, &bridge_state.key.to_bytes()),
        (MAT_MINT, &mint.key.to_bytes()),
        (MAT_TOKEN_PROGRAM, &token_program.key.to_bytes()),
    ] {
        put32(&mut data, offset, value);
    }
    for (offset, value) in [
        MAT_DESTINATION_BINDING,
        MAT_ROUTE_CONFIG,
        MAT_SORA_ANCHOR,
        MAT_SEMANTIC_PROFILE,
        MAT_CIRCUIT,
        MAT_WITNESS_GENERATOR,
        MAT_SCHEMA_COMMITMENT,
    ]
    .into_iter()
    .zip(args.hashes.iter())
    {
        put32(&mut data, offset, value);
    }
    put32(&mut data, MAT_SCHEMA, &PUBLIC_SIGNAL_SCHEMA_HASH);
    put32(&mut data, MAT_SOURCE_LANE_HASH, &source_lane_hash()?);
    put32(
        &mut data,
        MAT_DESTINATION_LANE_HASH,
        &destination_lane_hash()?,
    );
    data[MAT_ASSET..MAT_ASSET + args.asset.len()].copy_from_slice(args.asset);
    data[MAT_ROUTE_ID..MAT_ROUTE_ID + ROUTE_ID.len()].copy_from_slice(ROUTE_ID);
    put32(
        &mut data,
        MAT_SOURCE_PROGRAM,
        &source_program_account.key.to_bytes(),
    );
    Ok(())
}

fn append_material(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    offset: u16,
    chunk: &[u8],
) -> ProgramResult {
    require_accounts(accounts, 2)?;
    append_owned_chunk(
        program_id,
        &accounts[0],
        &accounts[1],
        MATERIAL_MAGIC,
        MAT_STATUS,
        MAT_AUTHORITY,
        MAT_WRITTEN,
        MAT_VK,
        VERIFYING_KEY_LEN,
        offset,
        chunk,
    )
}

fn seal_material(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    require_accounts(accounts, 2)?;
    let authority = &accounts[0];
    let material = &accounts[1];
    require_signer(authority)?;
    require_writable(material)?;
    require_owner(material, program_id)?;
    let mut data = material.try_borrow_mut_data()?;
    validate_material_header(
        &data,
        material.key,
        program_id,
        Some(authority.key),
        STATUS_WRITING,
    )?;
    if usize::from(read_u16(&data, MAT_WRITTEN)?) != VERIFYING_KEY_LEN {
        return Err(ProgramError::InvalidAccountData);
    }
    let vk = &data[MAT_VK..MAT_VK + VERIFYING_KEY_LEN];
    if sha256(vk) != array32(&data, MAT_VK_SHA256)? || keccak(vk) != array32(&data, MAT_VK_KECCAK)?
    {
        return Err(ProgramError::InvalidAccountData);
    }
    validate_verifying_key(vk)?;
    data[MAT_STATUS] = STATUS_SEALED;
    data[MAT_AUTHORITY..MAT_AUTHORITY + 32].fill(0);
    Ok(())
}

fn initialize_proof(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    args: ProofInit,
) -> ProgramResult {
    require_accounts(accounts, 5)?;
    let payer = &accounts[0];
    let proof = &accounts[1];
    let material = &accounts[2];
    let destination = &accounts[3];
    let system = &accounts[4];
    require_signer(payer)?;
    require_writable(payer)?;
    require_writable(proof)?;
    require_system_program(system)?;
    require_owner(material, program_id)?;
    if destination.key.to_bytes() != args.destination_token {
        return Err(ProgramError::InvalidInstructionData);
    }
    let material_data = material.try_borrow_data()?;
    validate_material_header(
        &material_data,
        material.key,
        program_id,
        None,
        STATUS_SEALED,
    )?;
    let body_len = usize::from(args.body_len);
    if !(PROOF_BODY_FIXED_LEN..=PROOF_BODY_MAX_LEN).contains(&body_len)
        || args.amount == 0
        || any_zero(&[
            args.body_sha256,
            args.message_id,
            args.payload_hash,
            args.statement_hash,
        ])
    {
        return Err(ProgramError::InvalidInstructionData);
    }
    let (expected, bump) = Pubkey::find_program_address(
        &[
            PROOF_SEED,
            material.key.as_ref(),
            &args.message_id,
            payer.key.as_ref(),
        ],
        program_id,
    );
    require_key(proof, &expected)?;
    let account_len = PROOF_HEADER_LEN
        .checked_add(body_len)
        .ok_or(ProgramError::InvalidInstructionData)?;
    create_pda_account(
        program_id,
        payer,
        proof,
        system,
        account_len,
        &[
            PROOF_SEED,
            material.key.as_ref(),
            &args.message_id,
            payer.key.as_ref(),
            &[bump],
        ],
    )?;
    let mut data = proof.try_borrow_mut_data()?;
    data.fill(0);
    data[..8].copy_from_slice(PROOF_MAGIC);
    data[8] = WIRE_VERSION;
    data[PRF_STATUS] = STATUS_WRITING;
    data[PRF_BUMP] = bump;
    put_u16(&mut data, PRF_BODY_LEN, args.body_len);
    put_u32(
        &mut data,
        PRF_ROUTE_REVISION,
        read_u32(&material_data, MAT_ROUTE_REVISION)?,
    );
    put32(&mut data, PRF_AUTHORITY, &payer.key.to_bytes());
    put32(&mut data, PRF_MATERIAL, &material.key.to_bytes());
    put32(&mut data, PRF_BODY_SHA256, &args.body_sha256);
    put32(&mut data, PRF_MESSAGE, &args.message_id);
    put32(&mut data, PRF_PAYLOAD_HASH, &args.payload_hash);
    put32(&mut data, PRF_STATEMENT_HASH, &args.statement_hash);
    put32(&mut data, PRF_DESTINATION_TOKEN, &args.destination_token);
    put32(&mut data, PRF_PAYER, &payer.key.to_bytes());
    put_u64(&mut data, PRF_AMOUNT, args.amount);
    put32(
        &mut data,
        PRF_CONFIG_SHA256,
        &array32(&material_data, MAT_CONFIG_SHA256)?,
    );
    put32(
        &mut data,
        PRF_VK_KECCAK,
        &array32(&material_data, MAT_VK_KECCAK)?,
    );
    Ok(())
}

fn append_proof(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    offset: u16,
    chunk: &[u8],
) -> ProgramResult {
    require_accounts(accounts, 2)?;
    let proof = &accounts[1];
    let data = proof.try_borrow_data()?;
    let total = usize::from(read_u16(&data, PRF_BODY_LEN)?);
    drop(data);
    append_owned_chunk(
        program_id,
        &accounts[0],
        proof,
        PROOF_MAGIC,
        PRF_STATUS,
        PRF_AUTHORITY,
        PRF_WRITTEN,
        PRF_BODY,
        total,
        offset,
        chunk,
    )
}

// Remaining verifier handlers are defined after the pure cryptographic helpers.

fn seal_proof(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    require_accounts(accounts, 4)?;
    let payer = &accounts[0];
    let proof = &accounts[1];
    let material = &accounts[2];
    let destination = &accounts[3];
    require_signer(payer)?;
    require_writable(proof)?;
    require_owner(proof, program_id)?;
    require_owner(material, program_id)?;

    let material_data = material.try_borrow_data()?;
    validate_material_header(
        &material_data,
        material.key,
        program_id,
        None,
        STATUS_SEALED,
    )?;
    let mut proof_data = proof.try_borrow_mut_data()?;
    validate_proof_header(
        &proof_data,
        proof.key,
        program_id,
        material.key,
        Some(payer.key),
        STATUS_WRITING,
    )?;
    if array32(&proof_data, PRF_DESTINATION_TOKEN)? != destination.key.to_bytes()
        || array32(&proof_data, PRF_CONFIG_SHA256)? != array32(&material_data, MAT_CONFIG_SHA256)?
        || array32(&proof_data, PRF_VK_KECCAK)? != array32(&material_data, MAT_VK_KECCAK)?
        || read_u32(&proof_data, PRF_ROUTE_REVISION)?
            != read_u32(&material_data, MAT_ROUTE_REVISION)?
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let body_len = usize::from(read_u16(&proof_data, PRF_BODY_LEN)?);
    if usize::from(read_u16(&proof_data, PRF_WRITTEN)?) != body_len {
        return Err(ProgramError::InvalidAccountData);
    }
    let body = proof_data
        .get(PRF_BODY..PRF_BODY + body_len)
        .ok_or(ProgramError::InvalidAccountData)?;
    if sha256(body) != array32(&proof_data, PRF_BODY_SHA256)? {
        return Err(ProgramError::InvalidAccountData);
    }
    let parsed = parse_proof_body(body)?;
    if parsed.statement_hash != array32(&proof_data, PRF_STATEMENT_HASH)? {
        return Err(ProgramError::InvalidAccountData);
    }
    let message_id = array32(&proof_data, PRF_MESSAGE)?;
    let payload_hash = array32(&proof_data, PRF_PAYLOAD_HASH)?;
    let amount = read_u64(&proof_data, PRF_AMOUNT)?;
    validate_public_inputs(parsed.public_inputs, &message_id, &payload_hash)?;
    if blake2b256(PAYLOAD_HASH_PREFIX, parsed.payload)? != payload_hash {
        return Err(ProgramError::InvalidAccountData);
    }
    if lane_bound_message_id(&destination_lane_bytes()?, parsed.payload)? != message_id {
        return Err(ProgramError::InvalidAccountData);
    }
    let transfer = parse_transfer_payload(parsed.payload)?;
    validate_transfer(
        &transfer,
        &material_data,
        destination,
        &array32(&proof_data, PRF_PAYER)?,
        amount,
        read_u32(&proof_data, PRF_ROUTE_REVISION)?,
    )?;
    let signals = derive_public_signals(
        parsed.public_inputs,
        &parsed.statement_hash,
        &array32(&material_data, MAT_DESTINATION_BINDING)?,
        &array32(&material_data, MAT_ROUTE_CONFIG)?,
        &array32(&material_data, MAT_SORA_ANCHOR)?,
    )?;
    verify_groth16(
        &material_data[MAT_VK..MAT_VK + VERIFYING_KEY_LEN],
        parsed.proof,
        &signals,
        &message_id,
        &array32(parsed.public_inputs, 65 + 4)?,
    )?;
    let account_hash = canonical_proof_account_hash(&proof_data)?;
    let context_hash = settlement_context_hash(&proof_data, &material_data, proof.key)?;
    put32(&mut proof_data, PRF_ACCOUNT_SHA256, &account_hash);
    put32(&mut proof_data, PRF_CONTEXT_SHA256, &context_hash);
    put_u64(&mut proof_data, PRF_SEALED_SLOT, Clock::get()?.slot);
    proof_data[PRF_STATUS] = STATUS_SEALED;
    proof_data[PRF_AUTHORITY..PRF_AUTHORITY + 32].fill(0);
    msg!("sealed SCCP Solana Groth16 proof account");
    Ok(())
}

fn verify_sealed(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    message_id: [u8; 32],
    amount: u64,
) -> ProgramResult {
    require_accounts(accounts, 7)?;
    let payer = &accounts[0];
    let bridge_authority = &accounts[1];
    let bridge_state = &accounts[2];
    let mint = &accounts[3];
    let destination = &accounts[4];
    let material = &accounts[5];
    let proof = &accounts[6];
    require_signer(payer)?;
    require_writable(payer)?;
    require_signer(bridge_authority)?;
    for account in &accounts[1..] {
        require_readonly(account)?;
    }
    require_owner(material, program_id)?;
    require_owner(proof, program_id)?;
    if amount == 0 || message_id.iter().all(|byte| *byte == 0) {
        return Err(ProgramError::InvalidInstructionData);
    }
    let material_data = material.try_borrow_data()?;
    validate_material_header(
        &material_data,
        material.key,
        program_id,
        None,
        STATUS_SEALED,
    )?;
    for (offset, actual) in [
        (MAT_BRIDGE_PROGRAM, bridge_state.owner),
        (MAT_BRIDGE_AUTHORITY, bridge_authority.key),
        (MAT_BRIDGE_STATE, bridge_state.key),
        (MAT_MINT, mint.key),
        (MAT_TOKEN_PROGRAM, destination.owner),
    ] {
        if array32(&material_data, offset)? != actual.to_bytes() {
            return Err(ProgramError::InvalidAccountData);
        }
    }
    let (expected_authority, _) = Pubkey::find_program_address(
        &[BRIDGE_AUTHORITY_SEED, bridge_state.key.as_ref()],
        bridge_state.owner,
    );
    require_key(bridge_authority, &expected_authority)?;
    validate_destination_bridge_state(program_id, bridge_state, material.key, &material_data)?;
    let proof_data = proof.try_borrow_data()?;
    validate_proof_header(
        &proof_data,
        proof.key,
        program_id,
        material.key,
        None,
        STATUS_SEALED,
    )?;
    require_proof_sealed_in_slot(&proof_data, Clock::get()?.slot)?;
    if array32(&proof_data, PRF_PAYER)? != payer.key.to_bytes()
        || array32(&proof_data, PRF_DESTINATION_TOKEN)? != destination.key.to_bytes()
        || array32(&proof_data, PRF_MESSAGE)? != message_id
        || read_u64(&proof_data, PRF_AMOUNT)? != amount
        || array32(&proof_data, PRF_CONFIG_SHA256)? != array32(&material_data, MAT_CONFIG_SHA256)?
        || array32(&proof_data, PRF_VK_KECCAK)? != array32(&material_data, MAT_VK_KECCAK)?
        || array32(&proof_data, PRF_ACCOUNT_SHA256)? != canonical_proof_account_hash(&proof_data)?
        || array32(&proof_data, PRF_CONTEXT_SHA256)?
            != settlement_context_hash(&proof_data, &material_data, proof.key)?
    {
        return Err(ProgramError::InvalidAccountData);
    }
    validate_destination_token(destination, &array32(&material_data, MAT_MINT)?)?;
    msg!("verified sealed SCCP Solana proof account");
    Ok(())
}

fn validate_destination_bridge_state(
    verifier_program: &Pubkey,
    bridge_state: &AccountInfo,
    material: &Pubkey,
    material_data: &[u8],
) -> ProgramResult {
    let state = bridge_state.try_borrow_data()?;
    if state.len() != BRIDGE_STATE_LEN
        || state.get(..8) != Some(BRIDGE_STATE_MAGIC)
        || state.get(8).copied() != Some(WIRE_VERSION)
        || state.get(BRIDGE_STATE_ROLE).copied() != Some(BRIDGE_ROLE_DESTINATION)
        || read_u32(&state, BRIDGE_STATE_REVISION)? != read_u32(material_data, MAT_ROUTE_REVISION)?
        || array32(&state, BRIDGE_STATE_MINT)? != array32(material_data, MAT_MINT)?
        || array32(&state, BRIDGE_STATE_PEER_PROGRAM)?
            != array32(material_data, MAT_SOURCE_PROGRAM)?
        || array32(&state, BRIDGE_STATE_DESTINATION_STATE)? != bridge_state.key.to_bytes()
        || array32(&state, BRIDGE_STATE_VERIFIER_PROGRAM)? != verifier_program.to_bytes()
        || array32(&state, BRIDGE_STATE_MATERIAL)? != material.to_bytes()
        || array32(&state, BRIDGE_STATE_DESTINATION_BINDING)?
            != array32(material_data, MAT_DESTINATION_BINDING)?
        || array32(&state, BRIDGE_STATE_ROUTE_CONFIG)? != array32(material_data, MAT_ROUTE_CONFIG)?
        || array32(&state, BRIDGE_STATE_VERIFIER_KEY_HASH)?
            != array32(material_data, MAT_VK_KECCAK)?
        || array32(&state, BRIDGE_STATE_VERIFIER_CONFIG_HASH)?
            != array32(material_data, MAT_CONFIG_SHA256)?
        || array32(&state, BRIDGE_STATE_SOURCE_LANE_HASH)? != source_lane_hash()?
        || array32(&state, BRIDGE_STATE_DESTINATION_LANE_HASH)? != destination_lane_hash()?
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let (_, verify_bump) = Pubkey::find_program_address(
        &[BRIDGE_AUTHORITY_SEED, bridge_state.key.as_ref()],
        bridge_state.owner,
    );
    if state[BRIDGE_STATE_VERIFY_BUMP] != verify_bump {
        return Err(ProgramError::InvalidSeeds);
    }
    Ok(())
}

struct ParsedProofBody<'a> {
    public_inputs: &'a [u8],
    statement_hash: [u8; 32],
    proof: &'a [u8],
    payload: &'a [u8],
}

fn parse_proof_body(body: &[u8]) -> Result<ParsedProofBody<'_>, ProgramError> {
    if !(PROOF_BODY_FIXED_LEN..=PROOF_BODY_MAX_LEN).contains(&body.len()) {
        return Err(ProgramError::InvalidAccountData);
    }
    let statement_offset = PUBLIC_INPUTS_LEN;
    let proof_offset = statement_offset + STATEMENT_HASH_LEN;
    let payload_len_offset = proof_offset + GROTH16_PROOF_LEN;
    let payload_len = usize::from(read_u16(body, payload_len_offset)?);
    if payload_len == 0
        || payload_len > MAX_PAYLOAD_BYTES
        || body.len() != payload_len_offset + 2 + payload_len
    {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(ParsedProofBody {
        public_inputs: &body[..PUBLIC_INPUTS_LEN],
        statement_hash: array32(body, statement_offset)?,
        proof: &body[proof_offset..proof_offset + GROTH16_PROOF_LEN],
        payload: &body[payload_len_offset + 2..],
    })
}

fn validate_public_inputs(
    public: &[u8],
    message_id: &[u8; 32],
    payload_hash: &[u8; 32],
) -> ProgramResult {
    if public.len() != PUBLIC_INPUTS_LEN
        || public[0] != 1
        || public.get(1..33) != Some(message_id)
        || public.get(33..65) != Some(payload_hash)
        || read_u32(public, 65)? != SCCP_DOMAIN_SOLANA
        || read_u64(public, 101)? == 0
        || public[69..101].iter().all(|byte| *byte == 0)
        || public[109..141].iter().all(|byte| *byte == 0)
    {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

struct Transfer<'a> {
    route_revision: u32,
    asset: &'a [u8],
    amount: u128,
    sender: &'a [u8],
    recipient: &'a [u8],
    route: &'a [u8],
}

fn parse_transfer_payload(payload: &[u8]) -> Result<Transfer<'_>, ProgramError> {
    let mut cursor = Cursor::new(payload);
    if cursor.u8()? != SCCP_PAYLOAD_TRANSFER
        || cursor.u8()? != 1
        || cursor.u32()? != SCCP_DOMAIN_SORA
        || cursor.u32()? != SCCP_DOMAIN_SOLANA
    {
        return Err(ProgramError::InvalidAccountData);
    }
    // Every u64 nonce is canonical, including u64::MAX. Replay protection is
    // keyed by the proof-bound SCCP message id rather than by reserving a nonce
    // sentinel that the protocol does not define.
    cursor.u64()?;
    let route_revision = cursor.u32()?;
    if cursor.u32()? != SCCP_DOMAIN_SORA || cursor.u8()? != SCCP_CODEC_TEXT {
        return Err(ProgramError::InvalidAccountData);
    }
    let asset = cursor.vec()?;
    let amount = cursor.u128()?;
    if cursor.u8()? != SCCP_CODEC_TEXT {
        return Err(ProgramError::InvalidAccountData);
    }
    let sender = cursor.vec()?;
    if cursor.u8()? != SCCP_CODEC_SOLANA_PUBKEY32 {
        return Err(ProgramError::InvalidAccountData);
    }
    let recipient = cursor.vec()?;
    if cursor.u8()? != SCCP_CODEC_TEXT {
        return Err(ProgramError::InvalidAccountData);
    }
    let route = cursor.vec()?;
    if !cursor.done() {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(Transfer {
        route_revision,
        asset,
        amount,
        sender,
        recipient,
        route,
    })
}

fn validate_transfer(
    transfer: &Transfer<'_>,
    material: &[u8],
    destination: &AccountInfo,
    payer: &[u8; 32],
    amount: u64,
    route_revision: u32,
) -> ProgramResult {
    let asset_len = usize::from(material[MAT_ASSET_LEN]);
    let token_owner = validate_destination_token(destination, &array32(material, MAT_MINT)?)?;
    let expected_mint_amount = payload_amount_to_spl(transfer.amount);
    if destination.owner.to_bytes() != array32(material, MAT_TOKEN_PROGRAM)?
        || transfer.route_revision != route_revision
        || transfer.route_revision != read_u32(material, MAT_ROUTE_REVISION)?
        || transfer.asset != &material[MAT_ASSET..MAT_ASSET + asset_len]
        || expected_mint_amount != Some(amount)
        || transfer.sender.is_empty()
        || transfer.recipient != token_owner
        || transfer.recipient != payer
        || transfer.recipient.len() != 32
        || transfer.recipient.iter().all(|byte| *byte == 0)
        || transfer.route != ROUTE_ID
    {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn payload_amount_to_spl(amount: u128) -> Option<u64> {
    amount
        .checked_mul(TAIRA_TO_SPL_MULTIPLIER)
        .and_then(|value| u64::try_from(value).ok())
}

fn validate_destination_token(
    destination: &AccountInfo,
    mint: &[u8; 32],
) -> Result<[u8; 32], ProgramError> {
    let data = destination.try_borrow_data()?;
    if data.len() < 64 || data.get(..32) != Some(mint) {
        return Err(ProgramError::InvalidAccountData);
    }
    let owner = array32(&data, 32)?;
    if owner.iter().all(|byte| *byte == 0) {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(owner)
}

struct Cursor<'a> {
    data: &'a [u8],
    offset: usize,
}
impl<'a> Cursor<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, offset: 0 }
    }
    fn take(&mut self, len: usize) -> Result<&'a [u8], ProgramError> {
        let end = self
            .offset
            .checked_add(len)
            .ok_or(ProgramError::InvalidAccountData)?;
        let value = self
            .data
            .get(self.offset..end)
            .ok_or(ProgramError::InvalidAccountData)?;
        self.offset = end;
        Ok(value)
    }
    fn u8(&mut self) -> Result<u8, ProgramError> {
        Ok(*self
            .take(1)?
            .first()
            .ok_or(ProgramError::InvalidAccountData)?)
    }
    fn u32(&mut self) -> Result<u32, ProgramError> {
        Ok(u32::from_le_bytes(
            self.take(4)?
                .try_into()
                .map_err(|_| ProgramError::InvalidAccountData)?,
        ))
    }
    fn u64(&mut self) -> Result<u64, ProgramError> {
        Ok(u64::from_le_bytes(
            self.take(8)?
                .try_into()
                .map_err(|_| ProgramError::InvalidAccountData)?,
        ))
    }
    fn u128(&mut self) -> Result<u128, ProgramError> {
        Ok(u128::from_le_bytes(
            self.take(16)?
                .try_into()
                .map_err(|_| ProgramError::InvalidAccountData)?,
        ))
    }
    fn vec(&mut self) -> Result<&'a [u8], ProgramError> {
        let len = usize::try_from(self.u32()?).map_err(|_| ProgramError::InvalidAccountData)?;
        self.take(len)
    }
    fn done(&self) -> bool {
        self.offset == self.data.len()
    }
}

const SIGNAL_LABELS: [&[u8]; 11] = [
    b"sccp:groth16-bn254:signal:message-id:v1",
    b"sccp:groth16-bn254:signal:payload-hash:v1",
    b"sccp:groth16-bn254:signal:target-domain:v1",
    b"sccp:groth16-bn254:signal:commitment-root:v1",
    b"sccp:groth16-bn254:signal:finality-height:v1",
    b"sccp:groth16-bn254:signal:finality-block-hash:v1",
    b"sccp:groth16-bn254:signal:source-domain:v1",
    b"sccp:groth16-bn254:signal:statement-hash:v1",
    b"sccp:groth16-bn254:signal:destination-binding-hash:v1",
    b"sccp:groth16-bn254:signal:route-configuration-hash:v1",
    b"sccp:groth16-bn254:signal:sora-finality-anchor-hash:v1",
];

fn derive_public_signals(
    public: &[u8],
    statement_hash: &[u8; 32],
    destination_binding: &[u8; 32],
    route_config: &[u8; 32],
    sora_anchor: &[u8; 32],
) -> Result<[[u8; 32]; 11], ProgramError> {
    if public.len() != PUBLIC_INPUTS_LEN
        || any_zero(&[
            *statement_hash,
            *destination_binding,
            *route_config,
            *sora_anchor,
        ])
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut target_word = [0; 32];
    target_word[28..].copy_from_slice(&read_u32(public, 65)?.to_be_bytes());
    let mut height_word = [0; 32];
    height_word[24..].copy_from_slice(&read_u64(public, 101)?.to_be_bytes());
    let source_word = [0; 32];
    let values = [
        array32(public, 1)?,
        array32(public, 33)?,
        target_word,
        array32(public, 69)?,
        height_word,
        array32(public, 109)?,
        source_word,
        *statement_hash,
        *destination_binding,
        *route_config,
        *sora_anchor,
    ];
    let mut signals = [[0; 32]; 11];
    for index in 0..11 {
        let label_hash = keccak(SIGNAL_LABELS[index]);
        signals[index] = reduce_scalar(keccak_hashv(&[&label_hash, &values[index]]).to_bytes());
    }
    Ok(signals)
}

fn verify_groth16(
    vk: &[u8],
    proof: &[u8],
    signals: &[[u8; 32]; 11],
    message_id: &[u8; 32],
    commitment_root: &[u8; 32],
) -> ProgramResult {
    if vk.len() != VERIFYING_KEY_LEN || proof.len() != GROTH16_PROOF_LEN {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut version_word = [0; 32];
    version_word[31] = 1;
    if proof[..32] != version_word
        || proof[32..64] != message_id[..]
        || proof[64..96] != [0; 32]
        || proof[96..128] != commitment_root[..]
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let a = proof
        .get(128..192)
        .ok_or(ProgramError::InvalidAccountData)?;
    let b = proof
        .get(192..320)
        .ok_or(ProgramError::InvalidAccountData)?;
    let c = proof
        .get(320..384)
        .ok_or(ProgramError::InvalidAccountData)?;
    validate_g1(a)?;
    validate_g2_canonical(b)?;
    validate_g1(c)?;

    let mut vk_x = vk[448..512].to_vec();
    for (index, signal) in signals.iter().enumerate() {
        let ic = &vk[512 + index * 64..576 + index * 64];
        let product = g1_mul(ic, signal)?;
        vk_x = g1_add(&vk_x, &product)?;
    }
    if vk_x.iter().all(|byte| *byte == 0) {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut pairing = Vec::with_capacity(4 * 192);
    pairing.extend_from_slice(&negate_g1(a)?);
    pairing.extend_from_slice(&canonical_g2_to_eip(b)?);
    pairing.extend_from_slice(&vk[..64]);
    pairing.extend_from_slice(&canonical_g2_to_eip(&vk[64..192])?);
    pairing.extend_from_slice(&vk_x);
    pairing.extend_from_slice(&canonical_g2_to_eip(&vk[192..320])?);
    pairing.extend_from_slice(c);
    pairing.extend_from_slice(&canonical_g2_to_eip(&vk[320..448])?);
    let result = alt_bn128_pairing_be(&pairing).map_err(|_| ProgramError::InvalidAccountData)?;
    let mut one = [0; 32];
    one[31] = 1;
    if result.as_slice() != one {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn validate_verifying_key(vk: &[u8]) -> ProgramResult {
    if vk.len() != VERIFYING_KEY_LEN {
        return Err(ProgramError::InvalidAccountData);
    }
    validate_g1(&vk[..64])?;
    validate_g2_canonical(&vk[64..192])?;
    validate_g2_canonical(&vk[192..320])?;
    validate_g2_canonical(&vk[320..448])?;
    for point in vk[448..].chunks_exact(64) {
        validate_g1(point)?;
    }
    Ok(())
}

fn validate_g1(point: &[u8]) -> ProgramResult {
    if point.len() != 64
        || point.iter().all(|byte| *byte == 0)
        || !be_lt(&point[..32], &BN254_BASE_FIELD)
        || !be_lt(&point[32..], &BN254_BASE_FIELD)
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut one = [0; 32];
    one[31] = 1;
    if g1_mul(point, &one)? != point {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn validate_g2_canonical(point: &[u8]) -> ProgramResult {
    if point.len() != 128
        || point.iter().all(|byte| *byte == 0)
        || point
            .chunks_exact(32)
            .any(|coordinate| !be_lt(coordinate, &BN254_BASE_FIELD))
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let eip = canonical_g2_to_eip(point)?;
    let mut input = [0; 160];
    input[..128].copy_from_slice(&eip);
    input[159] = 1;
    let output =
        alt_bn128_g2_multiplication_be(&input).map_err(|_| ProgramError::InvalidAccountData)?;
    if output != eip {
        return Err(ProgramError::InvalidAccountData);
    }
    // Agave's BN254 G2 group and pairing syscalls deliberately deserialize
    // on-curve points without the expensive subgroup check. Groth16 is sound
    // only in the prime-order subgroup, so require [r]P = infinity explicitly
    // for every governed VK point and every submitted proof B point.
    input[128..].copy_from_slice(&BN254_SCALAR_FIELD);
    let subgroup_check =
        alt_bn128_g2_multiplication_be(&input).map_err(|_| ProgramError::InvalidAccountData)?;
    if subgroup_check.iter().any(|byte| *byte != 0) {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn canonical_g2_to_eip(point: &[u8]) -> Result<[u8; 128], ProgramError> {
    if point.len() != 128 {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut out = [0; 128];
    out[..32].copy_from_slice(&point[32..64]);
    out[32..64].copy_from_slice(&point[..32]);
    out[64..96].copy_from_slice(&point[96..128]);
    out[96..128].copy_from_slice(&point[64..96]);
    Ok(out)
}

fn g1_mul(point: &[u8], scalar: &[u8; 32]) -> Result<Vec<u8>, ProgramError> {
    if point.len() != 64 || !be_lt(scalar, &BN254_SCALAR_FIELD) {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut input = [0; 96];
    input[..64].copy_from_slice(point);
    input[64..].copy_from_slice(scalar);
    alt_bn128_g1_multiplication_be(&input).map_err(|_| ProgramError::InvalidAccountData)
}

fn g1_add(left: &[u8], right: &[u8]) -> Result<Vec<u8>, ProgramError> {
    if left.len() != 64 || right.len() != 64 {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut input = [0; 128];
    input[..64].copy_from_slice(left);
    input[64..].copy_from_slice(right);
    alt_bn128_g1_addition_be(&input).map_err(|_| ProgramError::InvalidAccountData)
}

fn negate_g1(point: &[u8]) -> Result<[u8; 64], ProgramError> {
    validate_g1(point)?;
    let mut out = [0; 64];
    out[..32].copy_from_slice(&point[..32]);
    let y: [u8; 32] = point[32..]
        .try_into()
        .map_err(|_| ProgramError::InvalidAccountData)?;
    if y.iter().all(|byte| *byte == 0) {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut negated = BN254_BASE_FIELD;
    sub_be(&mut negated, &y);
    out[32..].copy_from_slice(&negated);
    Ok(out)
}

fn reduce_scalar(mut value: [u8; 32]) -> [u8; 32] {
    while !be_lt(&value, &BN254_SCALAR_FIELD) {
        sub_be(&mut value, &BN254_SCALAR_FIELD);
    }
    value
}

fn be_lt(left: &[u8], right: &[u8; 32]) -> bool {
    left.len() == 32 && left.iter().cmp(right.iter()).is_lt()
}

fn sub_be(left: &mut [u8; 32], right: &[u8; 32]) {
    let mut borrow = 0u16;
    for index in (0..32).rev() {
        let minuend = u16::from(left[index]);
        let subtrahend = u16::from(right[index]) + borrow;
        if minuend >= subtrahend {
            left[index] = (minuend - subtrahend) as u8;
            borrow = 0;
        } else {
            left[index] = (minuend + 256 - subtrahend) as u8;
            borrow = 1;
        }
    }
}

fn validate_material_args(args: &MaterialInit<'_>) -> ProgramResult {
    if args.route_revision != ROUTE_REVISION
        || args.asset != XOR_ASSET_KEY
        || any_zero(&[args.vk_sha256, args.vk_keccak, args.config_sha256])
        || any_zero(&args.hashes)
        || args.hashes[6] != PUBLIC_SIGNAL_SCHEMA_HASH
    {
        return Err(ProgramError::InvalidInstructionData);
    }
    let mut roles = Vec::with_capacity(10);
    roles.extend_from_slice(&[args.vk_sha256, args.vk_keccak, args.config_sha256]);
    roles.extend_from_slice(&args.hashes);
    if has_alias(&roles) {
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(())
}

fn canonical_lane_bytes(destination: bool) -> Result<Vec<u8>, ProgramError> {
    let (source, target) = if destination {
        (SORA_TAIRA_NETWORK_BYTES, SOLANA_TESTNET_NETWORK_BYTES)
    } else {
        (SOLANA_TESTNET_NETWORK_BYTES, SORA_TAIRA_NETWORK_BYTES)
    };
    let mut canonical = Vec::with_capacity(1 + 8 + source.len() + target.len());
    canonical.push(WIRE_VERSION);
    canonical.extend_from_slice(
        &u32::try_from(source.len())
            .map_err(|_| ProgramError::InvalidInstructionData)?
            .to_le_bytes(),
    );
    canonical.extend_from_slice(source);
    canonical.extend_from_slice(
        &u32::try_from(target.len())
            .map_err(|_| ProgramError::InvalidInstructionData)?
            .to_le_bytes(),
    );
    canonical.extend_from_slice(target);
    Ok(canonical)
}

fn destination_lane_bytes() -> Result<Vec<u8>, ProgramError> {
    canonical_lane_bytes(true)
}

fn lane_hash(destination: bool) -> Result<[u8; 32], ProgramError> {
    blake2b256(LANE_HASH_PREFIX, &canonical_lane_bytes(destination)?)
}

fn lane_bound_message_id(lane: &[u8], payload: &[u8]) -> Result<[u8; 32], ProgramError> {
    let lane_len = u32::try_from(lane.len())
        .map_err(|_| ProgramError::InvalidAccountData)?
        .to_le_bytes();
    let payload_len = u32::try_from(payload.len())
        .map_err(|_| ProgramError::InvalidAccountData)?
        .to_le_bytes();
    Ok(keccak_hashv(&[
        MESSAGE_ID_PREFIX,
        &[WIRE_VERSION],
        &lane_len,
        lane,
        &payload_len,
        payload,
    ])
    .to_bytes())
}

fn source_lane_hash() -> Result<[u8; 32], ProgramError> {
    lane_hash(false)
}

fn destination_lane_hash() -> Result<[u8; 32], ProgramError> {
    lane_hash(true)
}

#[allow(clippy::too_many_arguments)]
fn material_config_hash(
    verifier_program: &Pubkey,
    route_revision: u32,
    asset: &[u8],
    vk_keccak: &[u8; 32],
    bridge_program: &Pubkey,
    source_program: &Pubkey,
    bridge_state: &Pubkey,
    mint: &Pubkey,
    token_program: &Pubkey,
    hashes: &[[u8; 32]; 7],
) -> Result<[u8; 32], ProgramError> {
    let revision = route_revision.to_le_bytes();
    let asset_len = [asset.len() as u8];
    let multiplier = TAIRA_TO_SPL_MULTIPLIER.to_le_bytes();
    let source_lane = source_lane_hash()?;
    let destination_lane = destination_lane_hash()?;
    Ok(sha256_hashv(&[
        CONFIG_HASH_PREFIX,
        &[WIRE_VERSION],
        SORA_TAIRA_NETWORK_BYTES,
        SOLANA_TESTNET_NETWORK_BYTES,
        ROUTE_ID,
        &revision,
        &asset_len,
        asset,
        &multiplier,
        vk_keccak,
        verifier_program.as_ref(),
        bridge_program.as_ref(),
        source_program.as_ref(),
        bridge_state.as_ref(),
        mint.as_ref(),
        token_program.as_ref(),
        &source_lane,
        &destination_lane,
        // Destination binding and route configuration are intentionally not
        // part of this preimage: both already commit this config hash and the
        // material PDA. Including them would require a cryptographic fixed
        // point. They remain sealed in the account and are checked against the
        // destination bridge state before every settlement.
        &hashes[2],
        &hashes[3],
        &hashes[4],
        &hashes[5],
        &hashes[6],
    ])
    .to_bytes())
}

fn validate_material_header(
    data: &[u8],
    key: &Pubkey,
    program_id: &Pubkey,
    authority: Option<&Pubkey>,
    status: u8,
) -> ProgramResult {
    if data.len() != MATERIAL_ACCOUNT_LEN
        || data.get(..8) != Some(MATERIAL_MAGIC)
        || data[8] != WIRE_VERSION
        || data[MAT_STATUS] != status
        || data[11] != 0
        || data[14..16] != [0; 2]
        || data[21..32] != [0; 11]
        || read_u32(data, MAT_ROUTE_REVISION)? != ROUTE_REVISION
        || array32(data, MAT_SCHEMA)? != PUBLIC_SIGNAL_SCHEMA_HASH
        || array32(data, MAT_SOURCE_LANE_HASH)? != source_lane_hash()?
        || array32(data, MAT_DESTINATION_LANE_HASH)? != destination_lane_hash()?
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let asset_len = usize::from(data[MAT_ASSET_LEN]);
    if asset_len != XOR_ASSET_KEY.len()
        || data[MAT_ASSET..MAT_ASSET + asset_len] != *XOR_ASSET_KEY
        || data[MAT_ASSET + asset_len..MAT_ROUTE_ID]
            .iter()
            .any(|byte| *byte != 0)
        || data[MAT_ROUTE_ID..MAT_ROUTE_ID + ROUTE_ID.len()] != *ROUTE_ID
        || data[MAT_ROUTE_ID + ROUTE_ID.len()..736]
            .iter()
            .any(|byte| *byte != 0)
        || usize::from(read_u16(data, MAT_WRITTEN)?) > VERIFYING_KEY_LEN
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let auth = array32(data, MAT_AUTHORITY)?;
    match (status, authority) {
        (STATUS_WRITING, Some(expected)) if auth != expected.to_bytes() => {
            return Err(ProgramError::IllegalOwner)
        }
        (STATUS_WRITING, None) if auth.iter().all(|byte| *byte == 0) => {
            return Err(ProgramError::InvalidAccountData)
        }
        (STATUS_SEALED, _) if auth.iter().any(|byte| *byte != 0) => {
            return Err(ProgramError::InvalidAccountData)
        }
        _ => {}
    }
    if status == STATUS_SEALED
        && (usize::from(read_u16(data, MAT_WRITTEN)?) != VERIFYING_KEY_LEN
            || sha256(&data[MAT_VK..MAT_VK + VERIFYING_KEY_LEN]) != array32(data, MAT_VK_SHA256)?
            || keccak(&data[MAT_VK..MAT_VK + VERIFYING_KEY_LEN]) != array32(data, MAT_VK_KECCAK)?)
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let vk_keccak = array32(data, MAT_VK_KECCAK)?;
    let config = array32(data, MAT_CONFIG_SHA256)?;
    let (expected, bump) =
        Pubkey::find_program_address(&[MATERIAL_SEED, &vk_keccak, &config], program_id);
    if key != &expected || data[MAT_BUMP] != bump {
        return Err(ProgramError::InvalidSeeds);
    }
    let bridge_program = Pubkey::new_from_array(array32(data, MAT_BRIDGE_PROGRAM)?);
    let bridge_authority = Pubkey::new_from_array(array32(data, MAT_BRIDGE_AUTHORITY)?);
    let bridge_state = Pubkey::new_from_array(array32(data, MAT_BRIDGE_STATE)?);
    let mint = Pubkey::new_from_array(array32(data, MAT_MINT)?);
    let token_program = Pubkey::new_from_array(array32(data, MAT_TOKEN_PROGRAM)?);
    let source_program = Pubkey::new_from_array(array32(data, MAT_SOURCE_PROGRAM)?);
    let hashes = [
        array32(data, MAT_DESTINATION_BINDING)?,
        array32(data, MAT_ROUTE_CONFIG)?,
        array32(data, MAT_SORA_ANCHOR)?,
        array32(data, MAT_SEMANTIC_PROFILE)?,
        array32(data, MAT_CIRCUIT)?,
        array32(data, MAT_WITNESS_GENERATOR)?,
        array32(data, MAT_SCHEMA_COMMITMENT)?,
    ];
    let (derived_bridge_authority, _) = Pubkey::find_program_address(
        &[BRIDGE_AUTHORITY_SEED, bridge_state.as_ref()],
        &bridge_program,
    );
    let derived_bridge_state = destination_route_state_address(&bridge_program, &mint);
    if bridge_authority != derived_bridge_authority
        || bridge_state != derived_bridge_state
        || token_program != TOKEN_PROGRAM_ID
        || any_zero(&[
            array32(data, MAT_VK_SHA256)?,
            vk_keccak,
            config,
            *bridge_program.as_array(),
            *bridge_authority.as_array(),
            *bridge_state.as_array(),
            *mint.as_array(),
            *token_program.as_array(),
            *source_program.as_array(),
        ])
        || bridge_program == source_program
        || bridge_program == *program_id
        || source_program == *program_id
        || any_zero(&hashes)
        || has_alias(&hashes)
        || hashes[6] != PUBLIC_SIGNAL_SCHEMA_HASH
        || config
            != material_config_hash(
                program_id,
                read_u32(data, MAT_ROUTE_REVISION)?,
                &data[MAT_ASSET..MAT_ASSET + asset_len],
                &vk_keccak,
                &bridge_program,
                &source_program,
                &bridge_state,
                &mint,
                &token_program,
                &hashes,
            )?
    {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn validate_proof_header(
    data: &[u8],
    key: &Pubkey,
    program_id: &Pubkey,
    material: &Pubkey,
    authority: Option<&Pubkey>,
    status: u8,
) -> ProgramResult {
    if data.len() < PROOF_HEADER_LEN
        || data.get(..8) != Some(PROOF_MAGIC)
        || data[8] != WIRE_VERSION
        || data[PRF_STATUS] != status
        || data[11] != 0
        || data[20..32] != [0; 12]
        || data[432..PROOF_HEADER_LEN] != [0; 16]
        || array32(data, PRF_MATERIAL)? != material.to_bytes()
        || read_u32(data, PRF_ROUTE_REVISION)? != ROUTE_REVISION
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let body_len = usize::from(read_u16(data, PRF_BODY_LEN)?);
    if !(PROOF_BODY_FIXED_LEN..=PROOF_BODY_MAX_LEN).contains(&body_len)
        || data.len() != PROOF_HEADER_LEN + body_len
        || usize::from(read_u16(data, PRF_WRITTEN)?) > body_len
        || read_u64(data, PRF_AMOUNT)? == 0
        || any_zero(&[
            array32(data, PRF_BODY_SHA256)?,
            array32(data, PRF_MESSAGE)?,
            array32(data, PRF_PAYLOAD_HASH)?,
            array32(data, PRF_STATEMENT_HASH)?,
            array32(data, PRF_DESTINATION_TOKEN)?,
            array32(data, PRF_PAYER)?,
            array32(data, PRF_CONFIG_SHA256)?,
            array32(data, PRF_VK_KECCAK)?,
        ])
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let stored_authority = array32(data, PRF_AUTHORITY)?;
    match (status, authority) {
        (STATUS_WRITING, Some(expected)) if stored_authority != expected.to_bytes() => {
            return Err(ProgramError::IllegalOwner)
        }
        (STATUS_WRITING, None) if stored_authority.iter().all(|byte| *byte == 0) => {
            return Err(ProgramError::InvalidAccountData)
        }
        (STATUS_SEALED, _) if stored_authority.iter().any(|byte| *byte != 0) => {
            return Err(ProgramError::InvalidAccountData)
        }
        _ => {}
    }
    let message = array32(data, PRF_MESSAGE)?;
    let payer = array32(data, PRF_PAYER)?;
    let (expected, bump) = Pubkey::find_program_address(
        &[PROOF_SEED, material.as_ref(), &message, &payer],
        program_id,
    );
    if key != &expected || data[PRF_BUMP] != bump {
        return Err(ProgramError::InvalidSeeds);
    }
    if status == STATUS_SEALED
        && (array32(data, PRF_ACCOUNT_SHA256)?
            .iter()
            .all(|byte| *byte == 0)
            || array32(data, PRF_CONTEXT_SHA256)?
                .iter()
                .all(|byte| *byte == 0))
    {
        return Err(ProgramError::InvalidAccountData);
    }
    if status == STATUS_SEALED
        && (usize::from(read_u16(data, PRF_WRITTEN)?) != body_len
            || sha256(&data[PRF_BODY..PRF_BODY + body_len]) != array32(data, PRF_BODY_SHA256)?)
    {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn require_proof_sealed_in_slot(data: &[u8], current_slot: u64) -> ProgramResult {
    if current_slot == 0 || read_u64(data, PRF_SEALED_SLOT)? != current_slot {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn canonical_proof_account_hash(data: &[u8]) -> Result<[u8; 32], ProgramError> {
    let body_len = usize::from(read_u16(data, PRF_BODY_LEN)?);
    let body = data
        .get(PRF_BODY..PRF_BODY + body_len)
        .ok_or(ProgramError::InvalidAccountData)?;
    Ok(sha256_hashv(&[
        ACCOUNT_HASH_PREFIX,
        &[WIRE_VERSION],
        &data[PRF_ROUTE_REVISION..PRF_ROUTE_REVISION + 4],
        &data[PRF_MATERIAL..PRF_MATERIAL + 32],
        &data[PRF_BODY_SHA256..PRF_BODY_SHA256 + 32],
        &data[PRF_MESSAGE..PRF_MESSAGE + 32],
        &data[PRF_PAYLOAD_HASH..PRF_PAYLOAD_HASH + 32],
        &data[PRF_STATEMENT_HASH..PRF_STATEMENT_HASH + 32],
        &data[PRF_DESTINATION_TOKEN..PRF_DESTINATION_TOKEN + 32],
        &data[PRF_PAYER..PRF_PAYER + 32],
        &data[PRF_AMOUNT..PRF_AMOUNT + 8],
        &data[PRF_CONFIG_SHA256..PRF_CONFIG_SHA256 + 32],
        &data[PRF_VK_KECCAK..PRF_VK_KECCAK + 32],
        body,
    ])
    .to_bytes())
}

fn settlement_context_hash(
    proof: &[u8],
    material: &[u8],
    proof_key: &Pubkey,
) -> Result<[u8; 32], ProgramError> {
    let account_hash = canonical_proof_account_hash(proof)?;
    Ok(sha256_hashv(&[
        CONTEXT_HASH_PREFIX,
        &material[MAT_BRIDGE_PROGRAM..MAT_BRIDGE_PROGRAM + 32],
        &material[MAT_BRIDGE_AUTHORITY..MAT_BRIDGE_AUTHORITY + 32],
        &material[MAT_BRIDGE_STATE..MAT_BRIDGE_STATE + 32],
        &material[MAT_SOURCE_PROGRAM..MAT_SOURCE_PROGRAM + 32],
        &material[MAT_MINT..MAT_MINT + 32],
        &proof[PRF_DESTINATION_TOKEN..PRF_DESTINATION_TOKEN + 32],
        &proof[PRF_PAYER..PRF_PAYER + 32],
        &proof[PRF_MATERIAL..PRF_MATERIAL + 32],
        proof_key.as_ref(),
        &proof[PRF_AMOUNT..PRF_AMOUNT + 8],
        &proof[PRF_MESSAGE..PRF_MESSAGE + 32],
        &proof[PRF_PAYLOAD_HASH..PRF_PAYLOAD_HASH + 32],
        &proof[PRF_STATEMENT_HASH..PRF_STATEMENT_HASH + 32],
        &material[MAT_DESTINATION_BINDING..MAT_DESTINATION_BINDING + 32],
        &material[MAT_ROUTE_CONFIG..MAT_ROUTE_CONFIG + 32],
        &material[MAT_SORA_ANCHOR..MAT_SORA_ANCHOR + 32],
        &proof[PRF_CONFIG_SHA256..PRF_CONFIG_SHA256 + 32],
        &account_hash,
    ])
    .to_bytes())
}

#[allow(clippy::too_many_arguments)]
fn append_owned_chunk(
    program_id: &Pubkey,
    authority: &AccountInfo,
    account: &AccountInfo,
    magic: &[u8; 8],
    status_offset: usize,
    authority_offset: usize,
    written_offset: usize,
    body_offset: usize,
    total_len: usize,
    offset: u16,
    chunk: &[u8],
) -> ProgramResult {
    require_signer(authority)?;
    require_writable(account)?;
    require_owner(account, program_id)?;
    if chunk.is_empty() || chunk.len() > MAX_CHUNK_BYTES {
        return Err(ProgramError::InvalidInstructionData);
    }
    let mut data = account.try_borrow_mut_data()?;
    if data.get(..8) != Some(magic)
        || data.get(status_offset) != Some(&STATUS_WRITING)
        || array32(&data, authority_offset)? != authority.key.to_bytes()
        || data.len() != body_offset + total_len
    {
        return Err(ProgramError::InvalidAccountData);
    }
    if magic == MATERIAL_MAGIC {
        validate_material_header(
            &data,
            account.key,
            program_id,
            Some(authority.key),
            STATUS_WRITING,
        )?;
    } else {
        let material = Pubkey::new_from_array(array32(&data, PRF_MATERIAL)?);
        validate_proof_header(
            &data,
            account.key,
            program_id,
            &material,
            Some(authority.key),
            STATUS_WRITING,
        )?;
    }
    let written = usize::from(read_u16(&data, written_offset)?);
    validate_append_range(data[status_offset], written, total_len, offset, chunk.len())?;
    let start = body_offset + written;
    data[start..start + chunk.len()].copy_from_slice(chunk);
    put_u16(
        &mut data,
        written_offset,
        u16::try_from(written + chunk.len()).map_err(|_| ProgramError::InvalidInstructionData)?,
    );
    Ok(())
}

fn validate_append_range(
    status: u8,
    written: usize,
    total: usize,
    offset: u16,
    len: usize,
) -> ProgramResult {
    if status != STATUS_WRITING
        || len == 0
        || len > MAX_CHUNK_BYTES
        || usize::from(offset) != written
        || written
            .checked_add(len)
            .ok_or(ProgramError::InvalidInstructionData)?
            > total
    {
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(())
}

fn create_pda_account<'a>(
    program_id: &Pubkey,
    payer: &AccountInfo<'a>,
    pda: &AccountInfo<'a>,
    system: &AccountInfo<'a>,
    size: usize,
    seeds: &[&[u8]],
) -> ProgramResult {
    if pda.owner != &system_program::ID || !pda.data_is_empty() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    let minimum = Rent::get()?.minimum_balance(size);
    let funding = minimum.saturating_sub(pda.lamports());
    if funding > 0 {
        invoke(
            &system_instruction::transfer(payer.key, pda.key, funding),
            &[payer.clone(), pda.clone(), system.clone()],
        )?;
    }
    invoke_signed(
        &system_instruction::allocate(pda.key, size as u64),
        &[pda.clone(), system.clone()],
        &[seeds],
    )?;
    invoke_signed(
        &system_instruction::assign(pda.key, program_id),
        &[pda.clone(), system.clone()],
        &[seeds],
    )?;
    Ok(())
}

fn require_accounts(accounts: &[AccountInfo], expected: usize) -> ProgramResult {
    if accounts.len() == expected {
        Ok(())
    } else {
        Err(ProgramError::NotEnoughAccountKeys)
    }
}

fn destination_route_state_address(bridge_program: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[ROUTE_STATE_SEED, &[BRIDGE_ROLE_DESTINATION], mint.as_ref()],
        bridge_program,
    )
    .0
}
fn require_signer(account: &AccountInfo) -> ProgramResult {
    if account.is_signer {
        Ok(())
    } else {
        Err(ProgramError::MissingRequiredSignature)
    }
}

fn require_immutable_loader_v3_program(
    program: &AccountInfo,
    programdata: &AccountInfo,
) -> ProgramResult {
    require_readonly(program)?;
    require_readonly(programdata)?;
    if !program.executable
        || program.owner != &bpf_loader_upgradeable::ID
        || programdata.executable
        || programdata.owner != &bpf_loader_upgradeable::ID
    {
        return Err(ProgramError::IncorrectProgramId);
    }
    let program_data = program.try_borrow_data()?;
    if program_data.len() != 36
        || read_u32(&program_data, 0)? != 2
        || array32(&program_data, 4)? != programdata.key.to_bytes()
    {
        return Err(ProgramError::InvalidAccountData);
    }
    let programdata_data = programdata.try_borrow_data()?;
    if programdata_data.len() < 49
        || read_u32(&programdata_data, 0)? != 3
        || programdata_data.get(12).copied() != Some(0)
        || programdata_data.get(45..49) != Some(&[0x7f, 0x45, 0x4c, 0x46])
    {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn require_exact_spl_mint(mint: &AccountInfo, expected_authority: &Pubkey) -> ProgramResult {
    if mint.owner != &TOKEN_PROGRAM_ID {
        return Err(ProgramError::IncorrectProgramId);
    }
    let data = mint.try_borrow_data()?;
    if data.len() != 82
        || data.get(0..4) != Some(&1u32.to_le_bytes())
        || data.get(4..36) != Some(expected_authority.as_ref())
        || data.get(36..44) != Some(&0u64.to_le_bytes())
        || data.get(44).copied() != Some(XOR_SPL_DECIMALS)
        || data.get(45).copied() != Some(1)
        || data.get(46..50) != Some(&0u32.to_le_bytes())
    {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

/// Material PDAs are deterministic from public governed hashes. Requiring the
/// newly created governed mint to co-sign its atomic create/init/material-init
/// transaction prevents a third party from squatting the material PDA.
fn require_material_initialization_signers(
    uploader: &AccountInfo,
    mint: &AccountInfo,
) -> ProgramResult {
    require_signer(uploader)?;
    require_signer(mint)
}
fn require_writable(account: &AccountInfo) -> ProgramResult {
    if account.is_writable {
        Ok(())
    } else {
        Err(ProgramError::InvalidAccountData)
    }
}
fn require_readonly(account: &AccountInfo) -> ProgramResult {
    if account.is_writable {
        Err(ProgramError::InvalidAccountData)
    } else {
        Ok(())
    }
}
fn require_owner(account: &AccountInfo, owner: &Pubkey) -> ProgramResult {
    if account.owner == owner {
        Ok(())
    } else {
        Err(ProgramError::IllegalOwner)
    }
}
fn require_key(account: &AccountInfo, key: &Pubkey) -> ProgramResult {
    if account.key == key {
        Ok(())
    } else {
        Err(ProgramError::InvalidSeeds)
    }
}
fn require_system_program(account: &AccountInfo) -> ProgramResult {
    if account.key == &system_program::ID {
        Ok(())
    } else {
        Err(ProgramError::IncorrectProgramId)
    }
}
fn require_nonzero_distinct(accounts: &[&Pubkey]) -> ProgramResult {
    for (index, account) in accounts.iter().enumerate() {
        if account.to_bytes().iter().all(|byte| *byte == 0) || accounts[..index].contains(account) {
            return Err(ProgramError::InvalidArgument);
        }
    }
    Ok(())
}

fn any_zero<const N: usize>(values: &[[u8; 32]; N]) -> bool {
    values
        .iter()
        .any(|value| value.iter().all(|byte| *byte == 0))
}
fn has_alias(values: &[[u8; 32]]) -> bool {
    values
        .iter()
        .enumerate()
        .any(|(index, value)| values[..index].contains(value))
}
fn sha256(value: &[u8]) -> [u8; 32] {
    sha256_hashv(&[value]).to_bytes()
}
fn keccak(value: &[u8]) -> [u8; 32] {
    keccak_hashv(&[value]).to_bytes()
}
fn blake2b256(prefix: &[u8], value: &[u8]) -> Result<[u8; 32], ProgramError> {
    let mut hasher = Blake2bVar::new(32).map_err(|_| ProgramError::InvalidArgument)?;
    hasher.update(prefix);
    hasher.update(value);
    let mut out = [0; 32];
    hasher
        .finalize_variable(&mut out)
        .map_err(|_| ProgramError::InvalidArgument)?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ark_bn254::{Fq, Fq2, G2Affine};
    use ark_ff::{BigInteger, PrimeField};

    const ASSET: &[u8] = b"xor";

    fn fq_be(value: Fq) -> [u8; 32] {
        let encoded = value.into_bigint().to_bytes_be();
        let mut out = [0; 32];
        out[32 - encoded.len()..].copy_from_slice(&encoded);
        out
    }

    fn on_curve_non_subgroup_g2() -> [u8; 128] {
        for seed in 1u64..1024 {
            let x = Fq2::new(Fq::from(seed), Fq::from(seed + 1));
            for greatest in [false, true] {
                if let Some(point) = G2Affine::get_point_from_x_unchecked(x, greatest) {
                    if point.is_in_correct_subgroup_assuming_on_curve() {
                        continue;
                    }
                    let mut out = [0; 128];
                    for (offset, coordinate) in [
                        (0, point.x.c0),
                        (32, point.x.c1),
                        (64, point.y.c0),
                        (96, point.y.c1),
                    ] {
                        out[offset..offset + 32].copy_from_slice(&fq_be(coordinate));
                    }
                    return out;
                }
            }
        }
        panic!("deterministic BN254 search must find an on-curve non-subgroup G2 point")
    }

    fn word_u64(value: u64) -> [u8; 32] {
        let mut out = [0; 32];
        out[24..].copy_from_slice(&value.to_be_bytes());
        out
    }

    fn g1_generator() -> [u8; 64] {
        let mut point = [0; 64];
        point[31] = 1;
        point[63] = 2;
        point
    }

    fn g2_generator() -> [u8; 128] {
        let words = [
            "1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed",
            "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2",
            "12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa",
            "090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b",
        ];
        let mut out = [0; 128];
        for (index, word) in words.iter().enumerate() {
            for byte in 0..32 {
                out[index * 32 + byte] =
                    u8::from_str_radix(&word[byte * 2..byte * 2 + 2], 16).expect("hex fixture");
            }
        }
        out
    }

    fn test_vk() -> Vec<u8> {
        let g1 = g1_generator();
        let g2 = g2_generator();
        let mut vk = Vec::with_capacity(VERIFYING_KEY_LEN);
        vk.extend_from_slice(&g1);
        vk.extend_from_slice(&g2);
        vk.extend_from_slice(&g2);
        vk.extend_from_slice(&g2);
        for _ in 0..12 {
            vk.extend_from_slice(&g1);
        }
        vk
    }

    fn material_header_fixture(status: u8) -> (Pubkey, Pubkey, Pubkey, Vec<u8>) {
        let program = Pubkey::new_from_array([90; 32]);
        let upload_authority = Pubkey::new_from_array([91; 32]);
        let bridge_program = Pubkey::new_from_array([92; 32]);
        let mint = Pubkey::new_from_array([94; 32]);
        let bridge_state = destination_route_state_address(&bridge_program, &mint);
        let (bridge_authority, _) = Pubkey::find_program_address(
            &[BRIDGE_AUTHORITY_SEED, bridge_state.as_ref()],
            &bridge_program,
        );
        let token = TOKEN_PROGRAM_ID;
        let source_program = Pubkey::new_from_array([96; 32]);
        let hashes = [
            [11; 32],
            [12; 32],
            [13; 32],
            [14; 32],
            [15; 32],
            [16; 32],
            PUBLIC_SIGNAL_SCHEMA_HASH,
        ];
        let vk = test_vk();
        let vk_sha = sha256(&vk);
        let vk_keccak = keccak(&vk);
        let config = material_config_hash(
            &program,
            ROUTE_REVISION,
            ASSET,
            &vk_keccak,
            &bridge_program,
            &source_program,
            &bridge_state,
            &mint,
            &token,
            &hashes,
        )
        .expect("fixed lane config hashes");
        let (key, bump) =
            Pubkey::find_program_address(&[MATERIAL_SEED, &vk_keccak, &config], &program);
        let mut data = vec![0; MATERIAL_ACCOUNT_LEN];
        data[..8].copy_from_slice(MATERIAL_MAGIC);
        data[8] = WIRE_VERSION;
        data[MAT_STATUS] = status;
        data[MAT_BUMP] = bump;
        put_u16(
            &mut data,
            MAT_WRITTEN,
            if status == STATUS_SEALED {
                VERIFYING_KEY_LEN as u16
            } else {
                0
            },
        );
        put_u32(&mut data, MAT_ROUTE_REVISION, ROUTE_REVISION);
        data[MAT_ASSET_LEN] = ASSET.len() as u8;
        if status == STATUS_WRITING {
            put32(&mut data, MAT_AUTHORITY, &upload_authority.to_bytes());
        }
        for (offset, value) in [
            (MAT_VK_SHA256, vk_sha),
            (MAT_VK_KECCAK, vk_keccak),
            (MAT_CONFIG_SHA256, config),
            (MAT_BRIDGE_PROGRAM, bridge_program.to_bytes()),
            (MAT_BRIDGE_AUTHORITY, bridge_authority.to_bytes()),
            (MAT_BRIDGE_STATE, bridge_state.to_bytes()),
            (MAT_MINT, mint.to_bytes()),
            (MAT_TOKEN_PROGRAM, token.to_bytes()),
            (MAT_SOURCE_PROGRAM, source_program.to_bytes()),
        ] {
            put32(&mut data, offset, &value);
        }
        for (offset, value) in [
            MAT_DESTINATION_BINDING,
            MAT_ROUTE_CONFIG,
            MAT_SORA_ANCHOR,
            MAT_SEMANTIC_PROFILE,
            MAT_CIRCUIT,
            MAT_WITNESS_GENERATOR,
            MAT_SCHEMA_COMMITMENT,
        ]
        .into_iter()
        .zip(hashes)
        {
            put32(&mut data, offset, &value);
        }
        put32(&mut data, MAT_SCHEMA, &PUBLIC_SIGNAL_SCHEMA_HASH);
        put32(
            &mut data,
            MAT_SOURCE_LANE_HASH,
            &source_lane_hash().expect("fixed source lane"),
        );
        put32(
            &mut data,
            MAT_DESTINATION_LANE_HASH,
            &destination_lane_hash().expect("fixed destination lane"),
        );
        data[MAT_ASSET..MAT_ASSET + ASSET.len()].copy_from_slice(ASSET);
        data[MAT_ROUTE_ID..MAT_ROUTE_ID + ROUTE_ID.len()].copy_from_slice(ROUTE_ID);
        data[MAT_VK..].copy_from_slice(&vk);
        (program, key, upload_authority, data)
    }

    fn proof_header_fixture(
        program: &Pubkey,
        material: &Pubkey,
        status: u8,
    ) -> (Pubkey, Pubkey, Vec<u8>) {
        let payer = Pubkey::new_from_array([71; 32]);
        let message = [72; 32];
        let body = vec![73; PROOF_BODY_FIXED_LEN];
        let (key, bump) = Pubkey::find_program_address(
            &[PROOF_SEED, material.as_ref(), &message, payer.as_ref()],
            program,
        );
        let mut data = vec![0; PROOF_HEADER_LEN + body.len()];
        data[..8].copy_from_slice(PROOF_MAGIC);
        data[8] = WIRE_VERSION;
        data[PRF_STATUS] = status;
        data[PRF_BUMP] = bump;
        put_u16(
            &mut data,
            PRF_WRITTEN,
            if status == STATUS_SEALED {
                body.len() as u16
            } else {
                0
            },
        );
        put_u16(&mut data, PRF_BODY_LEN, body.len() as u16);
        put_u32(&mut data, PRF_ROUTE_REVISION, ROUTE_REVISION);
        if status == STATUS_WRITING {
            put32(&mut data, PRF_AUTHORITY, &payer.to_bytes());
        }
        for (offset, value) in [
            (PRF_MATERIAL, material.to_bytes()),
            (PRF_BODY_SHA256, sha256(&body)),
            (PRF_MESSAGE, message),
            (PRF_PAYLOAD_HASH, [74; 32]),
            (PRF_STATEMENT_HASH, [75; 32]),
            (PRF_DESTINATION_TOKEN, [76; 32]),
            (PRF_PAYER, payer.to_bytes()),
            (PRF_CONFIG_SHA256, [77; 32]),
            (PRF_VK_KECCAK, [78; 32]),
        ] {
            put32(&mut data, offset, &value);
        }
        put_u64(&mut data, PRF_AMOUNT, 79);
        data[PRF_BODY..].copy_from_slice(&body);
        if status == STATUS_SEALED {
            put32(&mut data, PRF_ACCOUNT_SHA256, &[80; 32]);
            put32(&mut data, PRF_CONTEXT_SHA256, &[81; 32]);
        }
        (key, payer, data)
    }

    fn public_inputs(message: [u8; 32], payload_hash: [u8; 32]) -> Vec<u8> {
        let mut out = vec![0; PUBLIC_INPUTS_LEN];
        out[0] = 1;
        out[1..33].copy_from_slice(&message);
        out[33..65].copy_from_slice(&payload_hash);
        out[65..69].copy_from_slice(&SCCP_DOMAIN_SOLANA.to_le_bytes());
        out[69..101].copy_from_slice(&[3; 32]);
        out[101..109].copy_from_slice(&9_u64.to_le_bytes());
        out[109..141].copy_from_slice(&[4; 32]);
        out
    }

    fn valid_proof(
        public: &[u8],
        statement: [u8; 32],
        destination: [u8; 32],
        route: [u8; 32],
        anchor: [u8; 32],
    ) -> (Vec<u8>, [[u8; 32]; 11]) {
        let signals = derive_public_signals(public, &statement, &destination, &route, &anchor)
            .expect("signals");
        let g1 = g1_generator();
        let mut vk_x = g1.to_vec();
        for signal in &signals {
            let term = g1_mul(&g1, signal).expect("mul");
            vk_x = g1_add(&vk_x, &term).expect("add");
        }
        let a = g1_add(&g1_add(&vk_x, &g1).expect("add one"), &g1).expect("add two");
        let mut proof = vec![0; GROTH16_PROOF_LEN];
        proof[..32].copy_from_slice(&word_u64(1));
        proof[32..64].copy_from_slice(&public[1..33]);
        proof[64..96].copy_from_slice(&word_u64(SCCP_DOMAIN_SORA as u64));
        proof[96..128].copy_from_slice(&public[69..101]);
        proof[128..192].copy_from_slice(&a);
        proof[192..320].copy_from_slice(&g2_generator());
        proof[320..384].copy_from_slice(&g1);
        (proof, signals)
    }

    fn push_vec(out: &mut Vec<u8>, value: &[u8]) {
        out.extend_from_slice(&(value.len() as u32).to_le_bytes());
        out.extend_from_slice(value);
    }

    fn transfer_payload(recipient: [u8; 32]) -> Vec<u8> {
        let mut out = Vec::new();
        out.push(SCCP_PAYLOAD_TRANSFER);
        out.push(1);
        out.extend_from_slice(&SCCP_DOMAIN_SORA.to_le_bytes());
        out.extend_from_slice(&SCCP_DOMAIN_SOLANA.to_le_bytes());
        out.extend_from_slice(&7_u64.to_le_bytes());
        out.extend_from_slice(&ROUTE_REVISION.to_le_bytes());
        out.extend_from_slice(&SCCP_DOMAIN_SORA.to_le_bytes());
        out.push(SCCP_CODEC_TEXT);
        push_vec(&mut out, ASSET);
        out.extend_from_slice(&42_u128.to_le_bytes());
        out.push(SCCP_CODEC_TEXT);
        push_vec(&mut out, b"sorau-test-sender");
        out.push(SCCP_CODEC_SOLANA_PUBKEY32);
        push_vec(&mut out, &recipient);
        out.push(SCCP_CODEC_TEXT);
        push_vec(&mut out, ROUTE_ID);
        out
    }

    #[test]
    fn typed_instruction_parser_accepts_only_exact_verify_wire() {
        let mut data = vec![WIRE_VERSION, Opcode::Verify as u8];
        data.extend_from_slice(&[8; 32]);
        data.extend_from_slice(&42_u64.to_le_bytes());
        assert!(matches!(
            NativeInstruction::parse(&data),
            Ok(NativeInstruction::Verify { amount: 42, .. })
        ));
        for mutation in [
            vec![],
            vec![2, Opcode::Verify as u8],
            vec![WIRE_VERSION, 99],
            data[..data.len() - 1].to_vec(),
            {
                let mut value = data.clone();
                value.push(0);
                value
            },
        ] {
            assert!(NativeInstruction::parse(&mutation).is_err());
        }
    }

    #[test]
    fn append_wire_rejects_empty_oversized_partial_and_trailing_chunks() {
        let make = |declared: u16, chunk: Vec<u8>| {
            let mut out = vec![WIRE_VERSION, Opcode::AppendProof as u8, 0, 0];
            out.extend_from_slice(&declared.to_le_bytes());
            out.extend_from_slice(&chunk);
            out
        };
        assert!(NativeInstruction::parse(&make(1, vec![7])).is_ok());
        assert!(NativeInstruction::parse(&make(0, vec![])).is_err());
        assert!(NativeInstruction::parse(&make(513, vec![0; 513])).is_err());
        assert!(NativeInstruction::parse(&make(2, vec![1])).is_err());
        assert!(NativeInstruction::parse(&make(1, vec![1, 2])).is_err());
    }

    #[test]
    fn append_ranges_reject_overlap_gap_overflow_and_post_seal_mutation() {
        assert_eq!(
            validate_append_range(STATUS_WRITING, 0, 900, 0, 512),
            Ok(())
        );
        assert_eq!(
            validate_append_range(STATUS_WRITING, 512, 900, 512, 388),
            Ok(())
        );
        assert!(validate_append_range(STATUS_WRITING, 512, 900, 511, 1).is_err());
        assert!(validate_append_range(STATUS_WRITING, 512, 900, 513, 1).is_err());
        assert!(validate_append_range(STATUS_WRITING, 512, 900, 512, 389).is_err());
        assert!(validate_append_range(STATUS_WRITING, 0, 900, 0, 513).is_err());
        assert!(validate_append_range(STATUS_SEALED, 900, 900, 900, 1).is_err());
    }

    #[test]
    fn proof_body_has_one_exact_statement_and_no_trailing_bytes() {
        let recipient = [9; 32];
        let payload = transfer_payload(recipient);
        let mut body = vec![0; PUBLIC_INPUTS_LEN];
        body.extend_from_slice(&[5; 32]);
        body.extend_from_slice(&vec![7; GROTH16_PROOF_LEN]);
        body.extend_from_slice(&(payload.len() as u16).to_le_bytes());
        body.extend_from_slice(&payload);
        let parsed = parse_proof_body(&body).expect("canonical body");
        assert_eq!(parsed.statement_hash, [5; 32]);
        assert_eq!(parsed.payload, payload);
        let mut trailing = body.clone();
        trailing.push(0);
        assert!(parse_proof_body(&trailing).is_err());
        body[PUBLIC_INPUTS_LEN + 32 + GROTH16_PROOF_LEN] = 0;
        body[PUBLIC_INPUTS_LEN + 32 + GROTH16_PROOF_LEN + 1] = 0;
        assert!(parse_proof_body(&body).is_err());
    }

    #[test]
    fn canonical_transfer_parser_rejects_every_role_substitution() {
        let payer = [9; 32];
        let baseline = transfer_payload(payer);
        let parsed = parse_transfer_payload(&baseline).expect("payload");
        assert_eq!(parsed.route_revision, ROUTE_REVISION);
        assert_eq!(parsed.amount, 42);
        assert_eq!(parsed.recipient, payer);
        for offset in [0usize, 1, 2, 6, 22] {
            let mut hostile = baseline.clone();
            hostile[offset] ^= 1;
            assert!(parse_transfer_payload(&hostile).is_err(), "offset {offset}");
        }
        let mut trailing = baseline.clone();
        trailing.push(0);
        assert!(parse_transfer_payload(&trailing).is_err());
    }

    #[test]
    fn canonical_transfer_accepts_the_full_u64_nonce_domain() {
        let mut payload = transfer_payload([9; 32]);
        payload[10..18].copy_from_slice(&u64::MAX.to_le_bytes());
        let parsed = parse_transfer_payload(&payload).expect("u64::MAX is a canonical nonce");
        assert_eq!(parsed.route_revision, ROUTE_REVISION);
    }

    #[test]
    fn destination_message_id_recomputes_the_exact_lane_and_payload_identity() {
        let mut payload = Vec::new();
        payload.push(SCCP_PAYLOAD_TRANSFER);
        payload.push(WIRE_VERSION);
        payload.extend_from_slice(&SCCP_DOMAIN_SORA.to_le_bytes());
        payload.extend_from_slice(&SCCP_DOMAIN_SOLANA.to_le_bytes());
        payload.extend_from_slice(&7_u64.to_le_bytes());
        payload.extend_from_slice(&ROUTE_REVISION.to_le_bytes());
        payload.extend_from_slice(&SCCP_DOMAIN_SORA.to_le_bytes());
        payload.push(SCCP_CODEC_TEXT);
        push_vec(&mut payload, ASSET);
        payload.extend_from_slice(&11_u128.to_le_bytes());
        payload.push(SCCP_CODEC_TEXT);
        push_vec(&mut payload, b"alice@taira");
        payload.push(SCCP_CODEC_SOLANA_PUBKEY32);
        push_vec(&mut payload, &[0x11; 32]);
        payload.push(SCCP_CODEC_TEXT);
        push_vec(&mut payload, ROUTE_ID);

        let destination_lane = destination_lane_bytes().expect("fixed lane");
        let message = lane_bound_message_id(&destination_lane, &payload).expect("message id");
        assert_eq!(
            message,
            [
                0x42, 0xe5, 0x56, 0x9e, 0x97, 0xf4, 0x0e, 0x74, 0xc3, 0xf1, 0x22, 0xea, 0xaf, 0x30,
                0xcc, 0x96, 0xca, 0x5c, 0x6e, 0xbd, 0x17, 0x75, 0xcb, 0x04, 0x11, 0x2e, 0x24, 0x0b,
                0x02, 0xc8, 0x98, 0x24,
            ]
        );
        let mut mutated = payload.clone();
        *mutated.last_mut().expect("nonempty payload") ^= 1;
        assert_ne!(
            lane_bound_message_id(&destination_lane, &mutated).expect("message id"),
            message
        );
        assert_ne!(
            lane_bound_message_id(&canonical_lane_bytes(false).expect("source lane"), &payload,)
                .expect("message id"),
            message
        );
    }

    #[test]
    fn solana_amount_conversion_is_exact_at_the_full_spl_u64_boundary() {
        assert_eq!(TAIRA_TO_SPL_MULTIPLIER, 1);
        assert_eq!(payload_amount_to_spl(1), Some(1));
        assert_eq!(payload_amount_to_spl(42), Some(42));
        assert_eq!(payload_amount_to_spl(u64::MAX as u128), Some(u64::MAX));
        assert_eq!(payload_amount_to_spl(u64::MAX as u128 + 1), None);
        assert_eq!(payload_amount_to_spl(u128::MAX), None);
    }

    #[test]
    fn public_inputs_reject_wrong_message_payload_target_and_finality() {
        let message = [1; 32];
        let payload = [2; 32];
        let baseline = public_inputs(message, payload);
        validate_public_inputs(&baseline, &message, &payload).expect("valid");
        for offset in [0usize, 1, 33, 65] {
            let mut hostile = baseline.clone();
            hostile[offset] ^= 1;
            assert!(
                validate_public_inputs(&hostile, &message, &payload).is_err(),
                "offset {offset}"
            );
        }
        for range in [69..101, 101..109, 109..141] {
            let mut hostile = baseline.clone();
            hostile[range].fill(0);
            assert!(validate_public_inputs(&hostile, &message, &payload).is_err());
        }
    }

    #[test]
    fn governed_test_key_and_pairing_fixture_verify() {
        let message = [1; 32];
        let payload = [2; 32];
        let public = public_inputs(message, payload);
        let (proof, signals) = valid_proof(&public, [5; 32], [6; 32], [7; 32], [8; 32]);
        let vk = test_vk();
        validate_verifying_key(&vk).expect("test key is structurally valid");
        verify_groth16(&vk, &proof, &signals, &message, &[3; 32]).expect("valid pairing");
    }

    #[test]
    fn pairing_rejects_metadata_point_signal_and_key_mutations() {
        let message = [1; 32];
        let public = public_inputs(message, [2; 32]);
        let (proof, signals) = valid_proof(&public, [5; 32], [6; 32], [7; 32], [8; 32]);
        let vk = test_vk();
        for offset in [0usize, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352] {
            let mut hostile = proof.clone();
            hostile[offset] ^= 1;
            assert!(
                verify_groth16(&vk, &hostile, &signals, &message, &[3; 32]).is_err(),
                "proof offset {offset}"
            );
        }
        let mut hostile_signals = signals;
        hostile_signals[10][31] ^= 1;
        assert!(verify_groth16(&vk, &proof, &hostile_signals, &message, &[3; 32]).is_err());
        let mut hostile_vk = vk.clone();
        hostile_vk[63] ^= 1;
        assert!(verify_groth16(&hostile_vk, &proof, &signals, &message, &[3; 32]).is_err());
    }

    #[test]
    fn curve_checks_reject_infinity_out_of_field_off_curve_and_swapped_g2() {
        assert!(validate_g1(&[0; 64]).is_err());
        let mut out_of_field = g1_generator();
        out_of_field[..32].copy_from_slice(&BN254_BASE_FIELD);
        assert!(validate_g1(&out_of_field).is_err());
        let mut off_curve = g1_generator();
        off_curve[63] = 3;
        assert!(validate_g1(&off_curve).is_err());
        assert!(validate_g2_canonical(&[0; 128]).is_err());
        let mut swapped = g2_generator();
        let original = swapped;
        swapped[..32].copy_from_slice(&original[32..64]);
        swapped[32..64].copy_from_slice(&original[..32]);
        assert!(validate_g2_canonical(&swapped).is_err());
        let non_subgroup = on_curve_non_subgroup_g2();
        assert!(
            validate_g2_canonical(&non_subgroup).is_err(),
            "an on-curve G2 point outside the prime-order subgroup must never reach pairing"
        );
    }

    #[test]
    fn scalar_reduction_is_canonical_and_bounded() {
        assert_eq!(reduce_scalar(BN254_SCALAR_FIELD), [0; 32]);
        let mut modulus_plus_one = BN254_SCALAR_FIELD;
        modulus_plus_one[31] = 2;
        assert_eq!(reduce_scalar(modulus_plus_one), word_u64(1));
        assert!(be_lt(&reduce_scalar([0xff; 32]), &BN254_SCALAR_FIELD));
    }

    #[test]
    fn config_hash_is_one_way_and_binds_every_primitive_role() {
        let verifier_program = Pubkey::new_from_array([5; 32]);
        let bridge_program = Pubkey::new_from_array([1; 32]);
        let source_program = Pubkey::new_from_array([6; 32]);
        let state = Pubkey::new_from_array([2; 32]);
        let mint = Pubkey::new_from_array([3; 32]);
        let token = Pubkey::new_from_array([4; 32]);
        let hashes = [
            [11; 32],
            [12; 32],
            [13; 32],
            [14; 32],
            [15; 32],
            [16; 32],
            PUBLIC_SIGNAL_SCHEMA_HASH,
        ];
        let config = |verifier_program: &Pubkey,
                      revision: u32,
                      asset: &[u8],
                      key: &[u8; 32],
                      bridge_program: &Pubkey,
                      state: &Pubkey,
                      mint: &Pubkey,
                      token: &Pubkey,
                      hashes: &[[u8; 32]; 7]| {
            material_config_hash(
                verifier_program,
                revision,
                asset,
                key,
                bridge_program,
                &source_program,
                state,
                mint,
                token,
                hashes,
            )
            .expect("fixed lane config hashes")
        };
        let baseline = config(
            &verifier_program,
            3,
            ASSET,
            &[10; 32],
            &bridge_program,
            &state,
            &mint,
            &token,
            &hashes,
        );
        assert_ne!(
            baseline,
            config(
                &verifier_program,
                4,
                ASSET,
                &[10; 32],
                &bridge_program,
                &state,
                &mint,
                &token,
                &hashes
            )
        );

        // These two hashes commit the finished config/PDA and therefore must
        // not feed back into the config preimage. They remain sealed in the
        // material account and are compared with bridge state at Verify.
        let mut hostile = hashes;
        for index in 0..2 {
            hostile[index][0] ^= 1;
            assert_eq!(
                baseline,
                config(
                    &verifier_program,
                    3,
                    ASSET,
                    &[10; 32],
                    &bridge_program,
                    &state,
                    &mint,
                    &token,
                    &hostile
                )
            );
            hostile = hashes;
        }

        for index in 2..7 {
            hostile[index][0] ^= 1;
            assert_ne!(
                baseline,
                config(
                    &verifier_program,
                    3,
                    ASSET,
                    &[10; 32],
                    &bridge_program,
                    &state,
                    &mint,
                    &token,
                    &hostile
                )
            );
            hostile = hashes;
        }
        assert_ne!(
            baseline,
            config(
                &verifier_program,
                3,
                b"dot",
                &[10; 32],
                &bridge_program,
                &state,
                &mint,
                &token,
                &hashes
            )
        );
        assert_ne!(
            baseline,
            config(
                &verifier_program,
                3,
                ASSET,
                &[18; 32],
                &bridge_program,
                &state,
                &mint,
                &token,
                &hashes,
            ),
            "the exact governed verification key must be bound",
        );
        assert_ne!(
            baseline,
            config(
                &Pubkey::new_from_array([24; 32]),
                3,
                ASSET,
                &[10; 32],
                &bridge_program,
                &state,
                &mint,
                &token,
                &hashes,
            ),
            "the native verifier program must be bound",
        );
        assert_ne!(
            baseline,
            material_config_hash(
                &verifier_program,
                3,
                ASSET,
                &[10; 32],
                &bridge_program,
                &Pubkey::new_from_array([25; 32]),
                &state,
                &mint,
                &token,
                &hashes,
            )
            .expect("fixed lane config hashes"),
            "the exact source program must be bound",
        );
        for (hostile_program, hostile_state, hostile_mint, hostile_token) in [
            (Pubkey::new_from_array([19; 32]), state, mint, token),
            (
                bridge_program,
                Pubkey::new_from_array([21; 32]),
                mint,
                token,
            ),
            (
                bridge_program,
                state,
                Pubkey::new_from_array([22; 32]),
                token,
            ),
            (
                bridge_program,
                state,
                mint,
                Pubkey::new_from_array([23; 32]),
            ),
        ] {
            assert_ne!(
                baseline,
                config(
                    &verifier_program,
                    3,
                    ASSET,
                    &[10; 32],
                    &hostile_program,
                    &hostile_state,
                    &hostile_mint,
                    &hostile_token,
                    &hashes,
                ),
                "every exact runtime account role must be bound independently",
            );
        }
    }

    #[test]
    fn proof_account_and_context_hashes_bind_all_runtime_roles() {
        let body = vec![7; PROOF_BODY_FIXED_LEN];
        let mut data = vec![0; PROOF_HEADER_LEN + body.len()];
        put_u16(&mut data, PRF_BODY_LEN, body.len() as u16);
        put_u32(&mut data, PRF_ROUTE_REVISION, ROUTE_REVISION);
        for (offset, value) in [
            (PRF_MATERIAL, [1; 32]),
            (PRF_BODY_SHA256, sha256(&body)),
            (PRF_MESSAGE, [2; 32]),
            (PRF_PAYLOAD_HASH, [3; 32]),
            (PRF_STATEMENT_HASH, [4; 32]),
            (PRF_DESTINATION_TOKEN, [5; 32]),
            (PRF_PAYER, [6; 32]),
            (PRF_CONFIG_SHA256, [7; 32]),
            (PRF_VK_KECCAK, [8; 32]),
        ] {
            put32(&mut data, offset, &value);
        }
        put_u64(&mut data, PRF_AMOUNT, 42);
        data[PRF_BODY..].copy_from_slice(&body);
        let baseline = canonical_proof_account_hash(&data).expect("hash");
        for offset in [
            PRF_ROUTE_REVISION,
            PRF_MATERIAL,
            PRF_BODY_SHA256,
            PRF_MESSAGE,
            PRF_PAYLOAD_HASH,
            PRF_STATEMENT_HASH,
            PRF_DESTINATION_TOKEN,
            PRF_PAYER,
            PRF_AMOUNT,
            PRF_CONFIG_SHA256,
            PRF_VK_KECCAK,
            PRF_BODY,
        ] {
            let mut hostile = data.clone();
            hostile[offset] ^= 1;
            assert_ne!(
                baseline,
                canonical_proof_account_hash(&hostile).expect("hash"),
                "offset {offset}"
            );
        }
    }

    #[test]
    fn pda_namespaces_bind_material_message_and_payer() {
        let program = Pubkey::new_from_array([90; 32]);
        let (material, _) =
            Pubkey::find_program_address(&[MATERIAL_SEED, &[1; 32], &[2; 32]], &program);
        let (proof, _) = Pubkey::find_program_address(
            &[PROOF_SEED, material.as_ref(), &[3; 32], &[4; 32]],
            &program,
        );
        let (other_message, _) = Pubkey::find_program_address(
            &[PROOF_SEED, material.as_ref(), &[5; 32], &[4; 32]],
            &program,
        );
        let (other_payer, _) = Pubkey::find_program_address(
            &[PROOF_SEED, material.as_ref(), &[3; 32], &[6; 32]],
            &program,
        );
        assert_ne!(proof, other_message);
        assert_ne!(proof, other_payer);
    }

    #[test]
    fn material_header_rejects_pda_policy_route_and_primitive_role_substitution() {
        let (program, key, authority, data) = material_header_fixture(STATUS_WRITING);
        validate_material_header(&data, &key, &program, Some(&authority), STATUS_WRITING)
            .expect("valid material header");
        assert!(validate_material_header(
            &data,
            &Pubkey::new_from_array([99; 32]),
            &program,
            Some(&authority),
            STATUS_WRITING,
        )
        .is_err());
        for offset in [
            MAT_ROUTE_REVISION,
            MAT_ASSET,
            MAT_ROUTE_ID,
            MAT_VK_KECCAK,
            MAT_CONFIG_SHA256,
            MAT_BRIDGE_PROGRAM,
            MAT_BRIDGE_AUTHORITY,
            MAT_BRIDGE_STATE,
            MAT_MINT,
            MAT_TOKEN_PROGRAM,
            MAT_SORA_ANCHOR,
            MAT_SEMANTIC_PROFILE,
            MAT_CIRCUIT,
            MAT_WITNESS_GENERATOR,
            MAT_SCHEMA_COMMITMENT,
            MAT_SCHEMA,
            MAT_SOURCE_LANE_HASH,
            MAT_DESTINATION_LANE_HASH,
        ] {
            let mut hostile = data.clone();
            hostile[offset] ^= 1;
            assert!(
                validate_material_header(
                    &hostile,
                    &key,
                    &program,
                    Some(&authority),
                    STATUS_WRITING,
                )
                .is_err(),
                "offset {offset}"
            );
        }
        for hostile_source in [
            [0u8; 32],
            array32(&data, MAT_BRIDGE_PROGRAM).expect("bridge program"),
            program.to_bytes(),
        ] {
            let mut hostile = data.clone();
            put32(&mut hostile, MAT_SOURCE_PROGRAM, &hostile_source);
            assert!(validate_material_header(
                &hostile,
                &key,
                &program,
                Some(&authority),
                STATUS_WRITING,
            )
            .is_err());
        }
    }

    #[test]
    fn verifier_rejects_material_and_destination_state_route_substitution() {
        let (program, material_key, _authority, material) = material_header_fixture(STATUS_SEALED);
        let bridge_program =
            Pubkey::new_from_array(array32(&material, MAT_BRIDGE_PROGRAM).expect("program"));
        let state_key =
            Pubkey::new_from_array(array32(&material, MAT_BRIDGE_STATE).expect("state"));
        let mut state = vec![0; BRIDGE_STATE_LEN];
        state[..8].copy_from_slice(BRIDGE_STATE_MAGIC);
        state[8] = WIRE_VERSION;
        state[BRIDGE_STATE_ROLE] = BRIDGE_ROLE_DESTINATION;
        let (_, verify_bump) = Pubkey::find_program_address(
            &[BRIDGE_AUTHORITY_SEED, state_key.as_ref()],
            &bridge_program,
        );
        state[BRIDGE_STATE_VERIFY_BUMP] = verify_bump;
        put_u32(
            &mut state,
            BRIDGE_STATE_REVISION,
            read_u32(&material, MAT_ROUTE_REVISION).expect("revision"),
        );
        for (state_offset, material_offset) in [
            (BRIDGE_STATE_MINT, MAT_MINT),
            (BRIDGE_STATE_DESTINATION_BINDING, MAT_DESTINATION_BINDING),
            (BRIDGE_STATE_ROUTE_CONFIG, MAT_ROUTE_CONFIG),
            (BRIDGE_STATE_VERIFIER_KEY_HASH, MAT_VK_KECCAK),
            (BRIDGE_STATE_VERIFIER_CONFIG_HASH, MAT_CONFIG_SHA256),
            (BRIDGE_STATE_SOURCE_LANE_HASH, MAT_SOURCE_LANE_HASH),
            (
                BRIDGE_STATE_DESTINATION_LANE_HASH,
                MAT_DESTINATION_LANE_HASH,
            ),
        ] {
            put32(
                &mut state,
                state_offset,
                &array32(&material, material_offset).expect("material role"),
            );
        }
        put32(
            &mut state,
            BRIDGE_STATE_DESTINATION_STATE,
            &state_key.to_bytes(),
        );
        put32(
            &mut state,
            BRIDGE_STATE_PEER_PROGRAM,
            &array32(&material, MAT_SOURCE_PROGRAM).expect("source program"),
        );
        put32(
            &mut state,
            BRIDGE_STATE_VERIFIER_PROGRAM,
            &program.to_bytes(),
        );
        put32(&mut state, BRIDGE_STATE_MATERIAL, &material_key.to_bytes());
        let mut lamports = 0;
        let account = AccountInfo::new(
            &state_key,
            false,
            false,
            &mut lamports,
            &mut state,
            &bridge_program,
            false,
        );
        validate_destination_bridge_state(&program, &account, &material_key, &material)
            .expect("exact material and bridge state agree");
        drop(account);

        state[BRIDGE_STATE_DESTINATION_BINDING] ^= 1;
        let mut hostile_lamports = 0;
        let hostile = AccountInfo::new(
            &state_key,
            false,
            false,
            &mut hostile_lamports,
            &mut state,
            &bridge_program,
            false,
        );
        assert!(
            validate_destination_bridge_state(&program, &hostile, &material_key, &material,)
                .is_err()
        );
    }

    #[test]
    fn sealed_material_and_proof_headers_have_no_remaining_authority() {
        let (program, material_key, authority, mut material) =
            material_header_fixture(STATUS_SEALED);
        validate_material_header(&material, &material_key, &program, None, STATUS_SEALED)
            .expect("sealed material");
        put32(&mut material, MAT_AUTHORITY, &authority.to_bytes());
        assert!(
            validate_material_header(&material, &material_key, &program, None, STATUS_SEALED,)
                .is_err()
        );

        let (proof_key, payer, mut proof) =
            proof_header_fixture(&program, &material_key, STATUS_SEALED);
        validate_proof_header(
            &proof,
            &proof_key,
            &program,
            &material_key,
            None,
            STATUS_SEALED,
        )
        .expect("sealed proof");
        put32(&mut proof, PRF_AUTHORITY, &payer.to_bytes());
        assert!(validate_proof_header(
            &proof,
            &proof_key,
            &program,
            &material_key,
            None,
            STATUS_SEALED,
        )
        .is_err());
    }

    #[test]
    fn compact_verify_accepts_only_a_proof_sealed_in_the_current_slot() {
        let mut data = vec![0; PROOF_HEADER_LEN];
        put_u64(&mut data, PRF_SEALED_SLOT, 42);
        require_proof_sealed_in_slot(&data, 42).expect("same-slot seal");
        assert!(require_proof_sealed_in_slot(&data, 41).is_err());
        assert!(require_proof_sealed_in_slot(&data, 43).is_err());
        assert!(require_proof_sealed_in_slot(&data, 0).is_err());
    }

    #[test]
    fn proof_header_rejects_wrong_owner_namespace_material_message_and_payer() {
        let (program, material_key, _, _) = material_header_fixture(STATUS_SEALED);
        let (proof_key, payer, data) =
            proof_header_fixture(&program, &material_key, STATUS_WRITING);
        validate_proof_header(
            &data,
            &proof_key,
            &program,
            &material_key,
            Some(&payer),
            STATUS_WRITING,
        )
        .expect("valid proof header");
        for (wrong_key, wrong_material, wrong_payer) in [
            (Pubkey::new_from_array([1; 32]), material_key, payer),
            (proof_key, Pubkey::new_from_array([2; 32]), payer),
            (proof_key, material_key, Pubkey::new_from_array([3; 32])),
        ] {
            assert!(validate_proof_header(
                &data,
                &wrong_key,
                &program,
                &wrong_material,
                Some(&wrong_payer),
                STATUS_WRITING,
            )
            .is_err());
        }
        let mut swapped_message = data.clone();
        swapped_message[PRF_MESSAGE] ^= 1;
        assert!(validate_proof_header(
            &swapped_message,
            &proof_key,
            &program,
            &material_key,
            Some(&payer),
            STATUS_WRITING,
        )
        .is_err());
    }

    #[test]
    fn material_initialization_rejects_squatting_without_the_new_mint_signature() {
        let uploader_key = Pubkey::new_unique();
        let mint_key = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let mut uploader_lamports = 0;
        let mut mint_lamports = 0;
        let mut uploader_data = [];
        let mut mint_data = [];
        let uploader = AccountInfo::new(
            &uploader_key,
            true,
            true,
            &mut uploader_lamports,
            &mut uploader_data,
            &owner,
            false,
        );
        let unsigned_mint = AccountInfo::new(
            &mint_key,
            false,
            false,
            &mut mint_lamports,
            &mut mint_data,
            &owner,
            false,
        );
        assert_eq!(
            require_material_initialization_signers(&uploader, &unsigned_mint),
            Err(ProgramError::MissingRequiredSignature),
            "an unrelated uploader must not be able to squat the governed material PDA",
        );

        let mut signed_mint_lamports = 0;
        let mut signed_mint_data = [];
        let signed_mint = AccountInfo::new(
            &mint_key,
            true,
            false,
            &mut signed_mint_lamports,
            &mut signed_mint_data,
            &owner,
            false,
        );
        assert_eq!(
            require_material_initialization_signers(&uploader, &signed_mint),
            Ok(()),
        );

        let unsigned_uploader_key = Pubkey::new_unique();
        let mut unsigned_uploader_lamports = 0;
        let mut unsigned_uploader_data = [];
        let unsigned_uploader = AccountInfo::new(
            &unsigned_uploader_key,
            false,
            true,
            &mut unsigned_uploader_lamports,
            &mut unsigned_uploader_data,
            &owner,
            false,
        );
        assert_eq!(
            require_material_initialization_signers(&unsigned_uploader, &signed_mint),
            Err(ProgramError::MissingRequiredSignature),
        );
    }

    #[test]
    fn material_initialization_binds_the_route_state_pda_and_fresh_scale9_mint() {
        let bridge_program = Pubkey::new_unique();
        let mint_key = Pubkey::new_unique();
        let other_mint = Pubkey::new_unique();
        let state = destination_route_state_address(&bridge_program, &mint_key);
        let expected_mint_authority =
            Pubkey::find_program_address(&[MINT_AUTHORITY_SEED, state.as_ref()], &bridge_program).0;
        assert_ne!(
            state,
            destination_route_state_address(&bridge_program, &other_mint)
        );
        assert_ne!(
            state,
            destination_route_state_address(&Pubkey::new_unique(), &mint_key)
        );

        let mut lamports = 0;
        let mut data = [0u8; 82];
        data[..4].copy_from_slice(&1u32.to_le_bytes());
        data[4..36].copy_from_slice(expected_mint_authority.as_ref());
        data[44] = XOR_SPL_DECIMALS;
        data[45] = 1;
        {
            let mint = AccountInfo::new(
                &mint_key,
                true,
                false,
                &mut lamports,
                &mut data,
                &TOKEN_PROGRAM_ID,
                false,
            );
            require_exact_spl_mint(&mint, &expected_mint_authority).expect("fresh exact mint");
        }
        {
            let mint = AccountInfo::new(
                &mint_key,
                true,
                false,
                &mut lamports,
                &mut data,
                &TOKEN_PROGRAM_ID,
                false,
            );
            assert_eq!(
                require_exact_spl_mint(&mint, &state),
                Err(ProgramError::InvalidAccountData),
                "the route state itself is not the mint authority",
            );
        }
        data[36] = 1;
        let hostile = AccountInfo::new(
            &mint_key,
            true,
            false,
            &mut lamports,
            &mut data,
            &TOKEN_PROGRAM_ID,
            false,
        );
        assert_eq!(
            require_exact_spl_mint(&hostile, &expected_mint_authority),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn material_initialization_requires_an_immutable_loader_v3_destination() {
        let program_key = Pubkey::new_unique();
        let programdata_key = Pubkey::new_unique();
        let mut program_lamports = 0;
        let mut programdata_lamports = 0;
        let mut program_data = [0u8; 36];
        program_data[..4].copy_from_slice(&2u32.to_le_bytes());
        program_data[4..].copy_from_slice(programdata_key.as_ref());
        let mut programdata_data = [0u8; 50];
        programdata_data[..4].copy_from_slice(&3u32.to_le_bytes());
        programdata_data[12] = 0;
        programdata_data[45..49].copy_from_slice(&[0x7f, 0x45, 0x4c, 0x46]);
        {
            let program = AccountInfo::new(
                &program_key,
                false,
                false,
                &mut program_lamports,
                &mut program_data,
                &bpf_loader_upgradeable::ID,
                true,
            );
            let programdata = AccountInfo::new(
                &programdata_key,
                false,
                false,
                &mut programdata_lamports,
                &mut programdata_data,
                &bpf_loader_upgradeable::ID,
                false,
            );
            require_immutable_loader_v3_program(&program, &programdata)
                .expect("immutable loader-v3 program");
        }
        programdata_data[12] = 1;
        programdata_data[13] = 7;
        let program = AccountInfo::new(
            &program_key,
            false,
            false,
            &mut program_lamports,
            &mut program_data,
            &bpf_loader_upgradeable::ID,
            true,
        );
        let mutable_programdata = AccountInfo::new(
            &programdata_key,
            false,
            false,
            &mut programdata_lamports,
            &mut programdata_data,
            &bpf_loader_upgradeable::ID,
            false,
        );
        assert_eq!(
            require_immutable_loader_v3_program(&program, &mutable_programdata),
            Err(ProgramError::InvalidAccountData)
        );

        // Some(Pubkey::default()) is not canonical Loader-v3 immutability.
        // Production requires the explicit None option tag emitted by a
        // finalized SetAuthority(None) operation.
        programdata_data[13] = 0;
        let disabled_zero_programdata = AccountInfo::new(
            &programdata_key,
            false,
            false,
            &mut programdata_lamports,
            &mut programdata_data,
            &bpf_loader_upgradeable::ID,
            false,
        );
        assert_eq!(
            require_immutable_loader_v3_program(&program, &disabled_zero_programdata),
            Err(ProgramError::InvalidAccountData)
        );

        // Loader-v3 serializes None to the one-byte option tag and does not
        // clear the former 32-byte authority payload. Residual bytes 13..45
        // are therefore semantically irrelevant; the exact tag at byte 12 is
        // the immutable authority state and code remains fixed at offset 45.
        programdata_data[12] = 0;
        programdata_data[13] = 1;
        let residual_none_programdata = AccountInfo::new(
            &programdata_key,
            false,
            false,
            &mut programdata_lamports,
            &mut programdata_data,
            &bpf_loader_upgradeable::ID,
            false,
        );
        require_immutable_loader_v3_program(&program, &residual_none_programdata)
            .expect("None remains immutable with residual former-authority bytes");
    }

    #[test]
    fn statement_hash_is_an_independent_authenticated_signal() {
        let message = [1; 32];
        let public = public_inputs(message, [2; 32]);
        let baseline = derive_public_signals(&public, &[5; 32], &[6; 32], &[7; 32], &[8; 32])
            .expect("signals");
        let hostile = derive_public_signals(&public, &[9; 32], &[6; 32], &[7; 32], &[8; 32])
            .expect("signals");
        assert_eq!(baseline[..7], hostile[..7]);
        assert_ne!(baseline[7], hostile[7]);
        assert_eq!(baseline[8..], hostile[8..]);
    }
}
