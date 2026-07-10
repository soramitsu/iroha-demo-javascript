//! Solana SCCP verifier surface for the TAIRA XOR testnet route.
//!
//! The program accepts the `borsh_instruction_v1` envelope emitted by the
//! Iroha SCCP SDK for the `submit_sccp_message_proof` entrypoint. It validates
//! the envelope shape, fixed-width proof context fields, signer, and
//! program-owned state account. Destination proof submission is fail-closed
//! unless state has been configured with a governed native recursive verifier
//! program and that verifier accepts the proof over CPI before any state
//! mutation or SPL token mint. The reverse `burn_to_taira` entrypoint burns the
//! same SPL token and records the source event hash used by TAIRA settlement
//! tooling.

#![allow(unexpected_cfgs)]

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    hash::hashv,
    instruction::{AccountMeta, Instruction},
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
use std::{str, str::FromStr};

entrypoint!(process_instruction);

const STATE_MAGIC: &[u8; 8] = b"SCCPSOL1";
const STATE_VERSION: u8 = 1;
const STATE_LEN: usize = 272;
const RECEIPT_MAGIC: &[u8; 8] = b"SCCPMSG1";
const RECEIPT_VERSION: u8 = 1;
const RECEIPT_LEN: usize = 192;
const ENTRYPOINT_INITIALIZE: &[u8] = b"initialize_sccp_state";
const ENTRYPOINT_CONFIGURE_VERIFIER: &[u8] = b"configure_native_recursive_verifier";
const ENTRYPOINT_SUBMIT: &[u8] = b"submit_sccp_message_proof";
const ENTRYPOINT_BURN: &[u8] = b"burn_to_taira";
const VERIFIER_ENTRYPOINT_VERIFY: &[u8] = b"verify_sccp_message_proof";
const NATIVE_VERIFIER_CPI_MARKER: &[u8] = b"SCCP_SOLANA_NATIVE_RECURSIVE_VERIFIER_CPI_V1";
const MINT_AUTHORITY_SEED: &[u8] = b"sccp-taira-xor-mint-authority";
const MESSAGE_RECEIPT_SEED: &[u8] = b"sccp-message-receipt";
const SETTLEMENT_CONTEXT_PREFIX: &[u8] = b"sccp:solana:settlement:v1";
const TRANSFER_MESSAGE_PREFIX: &[u8] = b"sccp:transfer:v1";
const SCCP_DOMAIN_SORA: u32 = 0;
const SCCP_DOMAIN_SOLANA: u32 = 3;
const SCCP_CODEC_TEXT_UTF8: u8 = 1;
const SCCP_CODEC_SOLANA_BASE58: u8 = 3;
const SCCP_XOR_ASSET_ID: &[u8] = b"xor";
const SCCP_TAIRA_SOL_XOR_ROUTE_ID: &[u8] = b"taira_sol_xor";
const SCCP_PAYLOAD_TRANSFER_DISCRIMINANT: u8 = 2;
const SCCP_COMMITMENT_TRANSFER_KIND: u8 = 6;
const TOKEN_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172, 28, 180, 133, 237,
    95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169,
]);
const TOKEN_INSTRUCTION_MINT_TO: u8 = 7;
const TOKEN_INSTRUCTION_BURN: u8 = 8;
const XOR_SPL_DECIMALS: u8 = 9;
const MAX_PROOF_BYTES: usize = 64 * 1024;
const MAX_PUBLIC_INPUT_BYTES: usize = 8 * 1024;
const MAX_BUNDLE_BYTES: usize = 64 * 1024;
const MAX_TAIRA_ACCOUNT_BYTES: usize = 128;
const INITIALIZE_ACCOUNT_COUNT: usize = 3;
const CONFIGURE_VERIFIER_ACCOUNT_COUNT: usize = 6;
const SUBMIT_ACCOUNT_COUNT: usize = 9;
const CANONICAL_PUBLIC_INPUTS_LEN: usize = 1 + 32 + 32 + 4 + 32 + 8 + 32;
const CANONICAL_COMMITMENT_LEN: usize = 1 + 1 + 4 + 32 + 32;
const DESTINATION_BINDING_HASH: [u8; 32] = [
    0x07, 0x85, 0x78, 0xf0, 0xaa, 0x27, 0xda, 0xa2, 0x97, 0x2d, 0x6c, 0x19, 0xd1, 0xd2, 0x6d, 0xbb,
    0x6b, 0xf6, 0xba, 0x1e, 0x8d, 0xf8, 0x4e, 0x28, 0x3d, 0x7e, 0xf1, 0x01, 0xfc, 0x46, 0xab, 0xf6,
];
const STATE_AUTHORITY_OFFSET: usize = 16;
const STATE_VERIFIER_LOCKED_OFFSET: usize = 9;
const STATE_ACCEPTED_COUNT_OFFSET: usize = 48;
const STATE_LAST_SLOT_OFFSET: usize = 56;
const STATE_NATIVE_VERIFIER_PROGRAM_OFFSET: usize = 64;
const STATE_VERIFIER_MATERIAL_HASH_OFFSET: usize = 96;
const STATE_VERIFIER_CONFIG_HASH_OFFSET: usize = 128;
const STATE_VERIFIER_CONFIGURED_SLOT_OFFSET: usize = 160;
const STATE_MINT_OFFSET: usize = 192;
const STATE_TOTAL_MINTED_OFFSET: usize = 224;
const STATE_TOTAL_BURNED_OFFSET: usize = 232;
const STATE_LAST_BURN_HASH_OFFSET: usize = 240;
const RECEIPT_BUMP_OFFSET: usize = 9;
const RECEIPT_MESSAGE_ID_OFFSET: usize = 16;
const RECEIPT_STATE_OFFSET: usize = 48;
const RECEIPT_MINT_OFFSET: usize = 80;
const RECEIPT_OWNER_OFFSET: usize = 112;
const RECEIPT_DESTINATION_TOKEN_OFFSET: usize = 144;
const RECEIPT_AMOUNT_OFFSET: usize = 176;
const RECEIPT_SLOT_OFFSET: usize = 184;
const BURN_RECEIPT_MAGIC: &[u8; 8] = b"SCCPBRN1";
const BURN_RECEIPT_VERSION: u8 = 1;
const BURN_RECEIPT_LEN: usize = 232;
const BURN_RECEIPT_SEED: &[u8] = b"sccp-source-burn-receipt";
const SOURCE_BURN_EVENT_PREFIX: &[u8] = b"sccp:solana:source-burn:v1";
const TAIRA_I105_SENTINEL: &str = "test";
const I105_CHECKSUM_LEN: usize = 6;
const I105_BASE: u32 = 105;
const BECH32M_CONST: u32 = 0x2bc8_30a3;
const I105_CURRENT_HEADER_SINGLE_KEY: u8 = 0b0000_0010;
const I105_CONTROLLER_SINGLE_KEY_TAG: u8 = 0;
const I105_CURVE_ED25519: u8 = 1;
const ED25519_PUBLIC_KEY_LEN: usize = 32;
const ED25519_FIELD_MODULUS: [u8; ED25519_PUBLIC_KEY_LEN] = [
    0xed, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f,
];
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
const BURN_RECEIPT_BUMP_OFFSET: usize = 9;
const BURN_RECEIPT_STATE_OFFSET: usize = 16;
const BURN_RECEIPT_MINT_OFFSET: usize = 48;
const BURN_RECEIPT_OWNER_OFFSET: usize = 80;
const BURN_RECEIPT_SOURCE_TOKEN_OFFSET: usize = 112;
const BURN_RECEIPT_RECIPIENT_HASH_OFFSET: usize = 144;
const BURN_RECEIPT_AMOUNT_OFFSET: usize = 176;
const BURN_RECEIPT_NONCE_OFFSET: usize = 184;
const BURN_RECEIPT_SLOT_OFFSET: usize = 192;
const BURN_RECEIPT_EVENT_HASH_OFFSET: usize = 200;

/// Program entrypoint.
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let envelope = Envelope::parse(instruction_data)?;
    match envelope.entrypoint {
        ENTRYPOINT_INITIALIZE => initialize_state(program_id, accounts),
        ENTRYPOINT_CONFIGURE_VERIFIER => {
            configure_native_recursive_verifier(program_id, accounts, &envelope)
        }
        ENTRYPOINT_SUBMIT => submit_message_proof(program_id, accounts, &envelope),
        ENTRYPOINT_BURN => burn_to_taira(program_id, accounts, &envelope),
        _ => {
            msg!("unsupported SCCP Solana entrypoint");
            Err(ProgramError::InvalidInstructionData)
        }
    }
}

fn initialize_state(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    require_canonical_account_count(accounts.len(), INITIALIZE_ACCOUNT_COUNT, "initialize")?;
    let mut account_iter = accounts.iter();
    let authority = next_account_info(&mut account_iter)?;
    let state = next_account_info(&mut account_iter)?;
    let mint = next_account_info(&mut account_iter)?;
    require_signer(authority)?;
    require_writable_state(program_id, state)?;
    require_key(mint.owner, &TOKEN_PROGRAM_ID, "mint owner")?;

    let mut data = state.try_borrow_mut_data()?;
    if data.len() < STATE_LEN {
        msg!("SCCP Solana state account is too small");
        return Err(ProgramError::AccountDataTooSmall);
    }
    require_clean_uninitialized_state(&data)?;
    data.fill(0);
    data[0..8].copy_from_slice(STATE_MAGIC);
    data[8] = STATE_VERSION;
    data[STATE_AUTHORITY_OFFSET..STATE_AUTHORITY_OFFSET + 32]
        .copy_from_slice(authority.key.as_ref());
    data[STATE_LAST_SLOT_OFFSET..STATE_LAST_SLOT_OFFSET + 8]
        .copy_from_slice(&Clock::get()?.slot.to_le_bytes());
    data[STATE_MINT_OFFSET..STATE_MINT_OFFSET + 32].copy_from_slice(mint.key.as_ref());
    msg!("initialized SCCP Solana state");
    Ok(())
}

fn configure_native_recursive_verifier(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    envelope: &Envelope,
) -> ProgramResult {
    require_canonical_account_count(
        accounts.len(),
        CONFIGURE_VERIFIER_ACCOUNT_COUNT,
        "verifier configuration",
    )?;
    let mut account_iter = accounts.iter();
    let authority = next_account_info(&mut account_iter)?;
    let state = next_account_info(&mut account_iter)?;
    let verifier_program = next_account_info(&mut account_iter)?;
    let verifier_program_data = next_account_info(&mut account_iter)?;
    let bridge_program = next_account_info(&mut account_iter)?;
    let bridge_program_data = next_account_info(&mut account_iter)?;
    require_signer(authority)?;
    require_writable_state(program_id, state)?;
    require_executable(verifier_program, "native verifier program")?;
    if verifier_program.key == program_id {
        msg!("SCCP Solana native verifier program must be distinct");
        return Err(ProgramError::InvalidAccountData);
    }
    require_key(bridge_program.key, program_id, "bridge program")?;
    require_executable(bridge_program, "bridge program")?;
    require_immutable_upgradeable_program(bridge_program, bridge_program_data)?;
    require_immutable_upgradeable_program(verifier_program, verifier_program_data)?;

    let args = envelope.configure_verifier_args()?;
    let verifier_material_hash = hash_array(args.verifier_material_hash, "verifier material hash")?;
    let verifier_config_hash = hash_array(args.verifier_config_hash, "verifier config hash")?;
    let slot = Clock::get()?.slot;
    let mut data = state.try_borrow_mut_data()?;
    let stored_authority_key = stored_authority(&data)?;
    require_key(authority.key, &stored_authority_key, "authority")?;
    write_verifier_config_state(
        &mut data,
        verifier_program.key,
        &verifier_material_hash,
        &verifier_config_hash,
        slot,
    )?;
    msg!("configured SCCP Solana native recursive verifier");
    Ok(())
}

fn require_clean_uninitialized_state(data: &[u8]) -> ProgramResult {
    if data.len() >= 9 && &data[0..8] == STATE_MAGIC && data[8] == STATE_VERSION {
        msg!("SCCP Solana state account is already initialized");
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    if data.iter().any(|byte| *byte != 0) {
        msg!("SCCP Solana state account is not clean");
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn require_immutable_upgradeable_program(
    verifier_program: &AccountInfo,
    verifier_program_data: &AccountInfo,
) -> ProgramResult {
    require_key(
        verifier_program.owner,
        &bpf_loader_upgradeable::ID,
        "native verifier loader",
    )?;
    require_key(
        verifier_program_data.owner,
        &bpf_loader_upgradeable::ID,
        "native verifier ProgramData loader",
    )?;
    let program_data_address = {
        let data = verifier_program.try_borrow_data()?;
        parse_upgradeable_program_data_address(&data)?
    };
    require_key(
        verifier_program_data.key,
        &program_data_address,
        "native verifier ProgramData",
    )?;
    let data = verifier_program_data.try_borrow_data()?;
    require_immutable_program_data(&data)
}

fn parse_upgradeable_program_data_address(data: &[u8]) -> Result<Pubkey, ProgramError> {
    // `UpgradeableLoaderState::Program` is bincode enum variant 2 followed by
    // its ProgramData address. Keeping the parser local avoids accepting any
    // other executable loader representation as governed native code.
    if data.len() != 36 || data.get(0..4) != Some(&2_u32.to_le_bytes()) {
        msg!("SCCP Solana native verifier is not an upgradeable-loader Program account");
        return Err(ProgramError::InvalidAccountData);
    }
    Pubkey::try_from(data.get(4..36).ok_or(ProgramError::InvalidAccountData)?)
        .map_err(|_| ProgramError::InvalidAccountData)
}

fn require_immutable_program_data(data: &[u8]) -> ProgramResult {
    // `UpgradeableLoaderState::ProgramData` is variant 3, then a u64 slot and
    // an Option<Pubkey>. An absent upgrade authority is encoded as zero.
    if data.len() < 45
        || data.get(0..4) != Some(&3_u32.to_le_bytes())
        || data.get(12).copied() != Some(0)
    {
        msg!("SCCP Solana native verifier must be finalized with no upgrade authority");
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn submit_message_proof(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    envelope: &Envelope,
) -> ProgramResult {
    require_canonical_account_count(accounts.len(), SUBMIT_ACCOUNT_COUNT, "submit")?;
    let mut account_iter = accounts.iter();
    let payer = next_account_info(&mut account_iter)?;
    let state = next_account_info(&mut account_iter)?;
    require_signer(payer)?;
    require_writable(payer, "payer")?;
    require_writable_state(program_id, state)?;

    let args = envelope.submit_args()?;
    require_non_empty_bounded(args.proof_bytes, MAX_PROOF_BYTES, "proof bytes")?;
    require_non_empty_bounded(args.public_inputs, MAX_PUBLIC_INPUT_BYTES, "public inputs")?;
    require_non_empty_bounded(args.bundle_bytes, MAX_BUNDLE_BYTES, "bundle bytes")?;
    require_hash(args.statement_hash, "statement hash")?;
    require_hash(args.destination_binding_hash, "destination binding hash")?;
    require_bytes_equal(
        args.destination_binding_hash,
        &DESTINATION_BINDING_HASH,
        "destination binding hash",
    )?;
    require_hash(args.proof_context_hash, "proof context hash")?;
    let amount = match args.amount {
        Some(amount) if amount > 0 => amount,
        _ => {
            msg!("mint amount must be positive");
            return Err(ProgramError::InvalidInstructionData);
        }
    };
    require_initialized_state(state)?;
    let (
        stored_mint_key,
        native_verifier_program_key,
        verifier_material_hash,
        verifier_config_hash,
    ) = {
        let data = state.try_borrow_data()?;
        (
            stored_mint(&data)?,
            stored_native_verifier_program(&data)?,
            stored_verifier_material_hash(&data)?,
            stored_verifier_config_hash(&data)?,
        )
    };

    let mint = next_account_info(&mut account_iter)?;
    let destination_token = next_account_info(&mut account_iter)?;
    let mint_authority = next_account_info(&mut account_iter)?;
    let token_program = next_account_info(&mut account_iter)?;
    let verifier_program = next_account_info(&mut account_iter)?;
    let message_receipt = next_account_info(&mut account_iter)?;
    let system_program_account = next_account_info(&mut account_iter)?;
    require_key(mint.key, &stored_mint_key, "mint")?;
    require_key(mint.owner, &TOKEN_PROGRAM_ID, "mint owner")?;
    require_key(token_program.key, &TOKEN_PROGRAM_ID, "token program")?;
    require_key(
        system_program_account.key,
        &system_program::ID,
        "system program",
    )?;
    require_executable(system_program_account, "system program")?;
    require_key(
        verifier_program.key,
        &native_verifier_program_key,
        "native verifier program",
    )?;
    require_executable(verifier_program, "native verifier program")?;
    let (expected_mint_authority, bump) =
        Pubkey::find_program_address(&[MINT_AUTHORITY_SEED, state.key.as_ref()], program_id);
    require_key(
        mint_authority.key,
        &expected_mint_authority,
        "mint authority",
    )?;
    require_writable(mint, "mint")?;
    require_spl_source_route_mint(mint, &expected_mint_authority)?;
    require_spl_destination_token_account(destination_token, mint.key, payer.key)?;
    let settlement = parse_canonical_transfer_settlement(
        args.public_inputs,
        args.bundle_bytes,
        payer.key,
        amount,
    )?;
    let expected_context_hash = settlement_context_hash(
        args.statement_hash,
        args.destination_binding_hash,
        &settlement.message_id,
        mint.key,
        destination_token.key,
        payer.key,
        amount,
    );
    require_bytes_equal(
        args.proof_context_hash,
        &expected_context_hash,
        "settlement proof context hash",
    )?;
    let receipt_bump = require_unused_message_receipt(
        program_id,
        state.key,
        &settlement.message_id,
        message_receipt,
    )?;
    invoke_configured_native_recursive_verifier(
        payer,
        state,
        mint,
        destination_token,
        verifier_program,
        &args,
        amount,
        &settlement.message_id,
        &verifier_material_hash,
        &verifier_config_hash,
    )?;
    create_message_receipt(
        program_id,
        payer,
        state,
        mint,
        destination_token,
        message_receipt,
        system_program_account,
        &settlement.message_id,
        amount,
        receipt_bump,
        Clock::get()?.slot,
    )?;
    let ix = spl_token_mint_to_instruction(
        token_program.key,
        mint.key,
        destination_token.key,
        mint_authority.key,
        amount,
    );
    invoke_signed(
        &ix,
        &[
            mint.clone(),
            destination_token.clone(),
            mint_authority.clone(),
            token_program.clone(),
        ],
        &[&[MINT_AUTHORITY_SEED, state.key.as_ref(), &[bump]]],
    )?;

    record_successful_mint(state, Clock::get()?.slot, amount)?;
    msg!("accepted SCCP Solana proof and minted SPL XOR");
    Ok(())
}

fn require_canonical_account_count(actual: usize, expected: usize, label: &str) -> ProgramResult {
    if actual != expected {
        msg!("SCCP Solana {} account list is not canonical", label);
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn record_successful_mint(state: &AccountInfo, slot: u64, amount: u64) -> ProgramResult {
    let mut data = state.try_borrow_mut_data()?;
    write_successful_mint_state(&mut data, slot, amount)
}

fn write_successful_mint_state(data: &mut [u8], slot: u64, amount: u64) -> ProgramResult {
    if amount == 0 {
        msg!("mint amount must be positive");
        return Err(ProgramError::InvalidInstructionData);
    }
    if data.len() < STATE_LEN || &data[0..8] != STATE_MAGIC || data[8] != STATE_VERSION {
        msg!("SCCP Solana state is not initialized");
        return Err(ProgramError::UninitializedAccount);
    }
    let accepted_count =
        read_u64(&data[STATE_ACCEPTED_COUNT_OFFSET..STATE_ACCEPTED_COUNT_OFFSET + 8])?
            .checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;
    let total_minted = read_u64(&data[STATE_TOTAL_MINTED_OFFSET..STATE_TOTAL_MINTED_OFFSET + 8])?
        .checked_add(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    data[STATE_ACCEPTED_COUNT_OFFSET..STATE_ACCEPTED_COUNT_OFFSET + 8]
        .copy_from_slice(&accepted_count.to_le_bytes());
    data[STATE_LAST_SLOT_OFFSET..STATE_LAST_SLOT_OFFSET + 8].copy_from_slice(&slot.to_le_bytes());
    data[STATE_TOTAL_MINTED_OFFSET..STATE_TOTAL_MINTED_OFFSET + 8]
        .copy_from_slice(&total_minted.to_le_bytes());
    Ok(())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct TransferSettlement {
    message_id: [u8; 32],
}

fn parse_canonical_transfer_settlement(
    public_inputs: &[u8],
    bundle_bytes: &[u8],
    expected_recipient: &Pubkey,
    expected_amount: u64,
) -> Result<TransferSettlement, ProgramError> {
    if public_inputs.len() != CANONICAL_PUBLIC_INPUTS_LEN || public_inputs[0] != 1 {
        msg!("SCCP Solana public inputs are not canonical v1 bytes");
        return Err(ProgramError::InvalidInstructionData);
    }
    let public_message_id = array_at(public_inputs, 1, "public message id")?;
    let public_payload_hash = array_at(public_inputs, 33, "public payload hash")?;
    let public_target_domain = u32::from_le_bytes(
        public_inputs[65..69]
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    );
    if is_zero_32(&public_message_id) || public_target_domain != SCCP_DOMAIN_SOLANA {
        msg!("SCCP Solana public inputs target or message id is invalid");
        return Err(ProgramError::InvalidInstructionData);
    }

    let mut bundle = ByteCursor::new(bundle_bytes);
    if bundle.take_u8()? != 1 {
        msg!("SCCP Solana bundle version is invalid");
        return Err(ProgramError::InvalidInstructionData);
    }
    bundle.take_exact(32)?; // commitment root, verified by the native proof
    let commitment = bundle.take_vec()?;
    bundle.take_vec()?; // Merkle branch
    let payload = bundle.take_vec()?;
    bundle.take_vec()?; // finality proof
    if !bundle.is_finished() {
        msg!("SCCP Solana bundle has trailing bytes");
        return Err(ProgramError::InvalidInstructionData);
    }
    if commitment.len() != CANONICAL_COMMITMENT_LEN
        || commitment[0] != 1
        || commitment[1] != SCCP_COMMITMENT_TRANSFER_KIND
        || u32::from_le_bytes(
            commitment[2..6]
                .try_into()
                .map_err(|_| ProgramError::InvalidInstructionData)?,
        ) != SCCP_DOMAIN_SOLANA
    {
        msg!("SCCP Solana bundle commitment is not a Solana transfer");
        return Err(ProgramError::InvalidInstructionData);
    }
    let commitment_message_id = array_at(commitment, 6, "commitment message id")?;
    let commitment_payload_hash = array_at(commitment, 38, "commitment payload hash")?;
    if commitment_message_id != public_message_id || commitment_payload_hash != public_payload_hash
    {
        msg!("SCCP Solana public inputs do not match the bundle commitment");
        return Err(ProgramError::InvalidInstructionData);
    }

    let mut transfer = ByteCursor::new(payload);
    if transfer.take_u8()? != SCCP_PAYLOAD_TRANSFER_DISCRIMINANT {
        msg!("SCCP Solana destination payload is not a transfer");
        return Err(ProgramError::InvalidInstructionData);
    }
    let canonical_transfer_bytes = payload
        .get(1..)
        .ok_or(ProgramError::InvalidInstructionData)?;
    if transfer.take_u8()? != 1
        || transfer.take_u32()? != SCCP_DOMAIN_SORA
        || transfer.take_u32()? != SCCP_DOMAIN_SOLANA
    {
        msg!("SCCP Solana transfer domain binding is invalid");
        return Err(ProgramError::InvalidInstructionData);
    }
    transfer.take_u64()?; // nonce is part of the canonical message id
    if transfer.take_u32()? != SCCP_DOMAIN_SORA {
        msg!("SCCP Solana transfer asset home domain is invalid");
        return Err(ProgramError::InvalidInstructionData);
    }
    let asset_codec = transfer.take_u8()?;
    let asset_id = transfer.take_vec()?;
    if asset_codec != SCCP_CODEC_TEXT_UTF8 || asset_id != SCCP_XOR_ASSET_ID {
        msg!("SCCP Solana transfer asset binding is not canonical taira_sol_xor XOR");
        return Err(ProgramError::InvalidInstructionData);
    }
    let transfer_amount = transfer.take_u128()?;
    if transfer_amount != u128::from(expected_amount) {
        msg!("SCCP Solana proof amount does not match the mint amount");
        return Err(ProgramError::InvalidInstructionData);
    }
    let sender_codec = transfer.take_u8()?;
    let sender = transfer.take_vec()?;
    if sender_codec != SCCP_CODEC_TEXT_UTF8 {
        msg!("SCCP Solana transfer sender codec is not canonical TAIRA text");
        return Err(ProgramError::InvalidInstructionData);
    }
    require_canonical_taira_i105_account(sender, "sender")?;
    if transfer.take_u8()? != SCCP_CODEC_SOLANA_BASE58 {
        msg!("SCCP Solana transfer recipient codec is invalid");
        return Err(ProgramError::InvalidInstructionData);
    }
    let recipient = transfer.take_vec()?;
    let recipient_text =
        str::from_utf8(recipient).map_err(|_| ProgramError::InvalidInstructionData)?;
    let recipient_key =
        Pubkey::from_str(recipient_text).map_err(|_| ProgramError::InvalidInstructionData)?;
    if &recipient_key != expected_recipient || recipient_key.to_string().as_bytes() != recipient {
        msg!("SCCP Solana proof recipient does not match the destination owner");
        return Err(ProgramError::InvalidInstructionData);
    }
    let route_codec = transfer.take_u8()?;
    let route_id = transfer.take_vec()?;
    if route_codec != SCCP_CODEC_TEXT_UTF8
        || route_id != SCCP_TAIRA_SOL_XOR_ROUTE_ID
        || !transfer.is_finished()
    {
        msg!("SCCP Solana transfer route binding is not canonical taira_sol_xor text");
        return Err(ProgramError::InvalidInstructionData);
    }
    let calculated_message_id = keccak_hashv(&[TRANSFER_MESSAGE_PREFIX, canonical_transfer_bytes]);
    if calculated_message_id.as_ref() != public_message_id {
        msg!("SCCP Solana canonical transfer message id does not match the proof");
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(TransferSettlement {
        message_id: public_message_id,
    })
}

fn settlement_context_hash(
    statement_hash: &[u8],
    destination_binding_hash: &[u8],
    message_id: &[u8; 32],
    mint: &Pubkey,
    destination_token: &Pubkey,
    owner: &Pubkey,
    amount: u64,
) -> [u8; 32] {
    hashv(&[
        SETTLEMENT_CONTEXT_PREFIX,
        statement_hash,
        destination_binding_hash,
        message_id,
        mint.as_ref(),
        destination_token.as_ref(),
        owner.as_ref(),
        &amount.to_le_bytes(),
    ])
    .to_bytes()
}

fn require_unused_message_receipt(
    program_id: &Pubkey,
    state: &Pubkey,
    message_id: &[u8; 32],
    receipt: &AccountInfo,
) -> Result<u8, ProgramError> {
    require_writable(receipt, "message receipt")?;
    let (expected, bump) = Pubkey::find_program_address(
        &[MESSAGE_RECEIPT_SEED, state.as_ref(), message_id],
        program_id,
    );
    require_key(receipt.key, &expected, "message receipt")?;
    if receipt.owner == program_id {
        msg!("SCCP Solana message has already been settled");
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    if receipt.owner != &system_program::ID || !receipt.data_is_empty() {
        msg!("SCCP Solana message receipt is not an unused system account");
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(bump)
}

#[allow(clippy::too_many_arguments)]
fn create_message_receipt<'a>(
    program_id: &Pubkey,
    payer: &AccountInfo<'a>,
    state: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    destination_token: &AccountInfo<'a>,
    receipt: &AccountInfo<'a>,
    system_program_account: &AccountInfo<'a>,
    message_id: &[u8; 32],
    amount: u64,
    bump: u8,
    slot: u64,
) -> ProgramResult {
    let rent_lamports = Rent::get()?.minimum_balance(RECEIPT_LEN);
    let funding = rent_lamports.saturating_sub(receipt.lamports());
    if funding > 0 {
        invoke(
            &system_instruction::transfer(payer.key, receipt.key, funding),
            &[
                payer.clone(),
                receipt.clone(),
                system_program_account.clone(),
            ],
        )?;
    }
    let signer_seeds: &[&[u8]] = &[
        MESSAGE_RECEIPT_SEED,
        state.key.as_ref(),
        message_id,
        &[bump],
    ];
    invoke_signed(
        &system_instruction::allocate(receipt.key, RECEIPT_LEN as u64),
        &[receipt.clone(), system_program_account.clone()],
        &[signer_seeds],
    )?;
    invoke_signed(
        &system_instruction::assign(receipt.key, program_id),
        &[receipt.clone(), system_program_account.clone()],
        &[signer_seeds],
    )?;
    let mut data = receipt.try_borrow_mut_data()?;
    write_message_receipt_state(
        &mut data,
        bump,
        message_id,
        state.key,
        mint.key,
        payer.key,
        destination_token.key,
        amount,
        slot,
    )
}

#[allow(clippy::too_many_arguments)]
fn write_message_receipt_state(
    data: &mut [u8],
    bump: u8,
    message_id: &[u8; 32],
    state: &Pubkey,
    mint: &Pubkey,
    owner: &Pubkey,
    destination_token: &Pubkey,
    amount: u64,
    slot: u64,
) -> ProgramResult {
    if data.len() != RECEIPT_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    if data.iter().any(|byte| *byte != 0) {
        msg!("SCCP Solana message receipt is already initialized");
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    data[0..8].copy_from_slice(RECEIPT_MAGIC);
    data[8] = RECEIPT_VERSION;
    data[RECEIPT_BUMP_OFFSET] = bump;
    data[RECEIPT_MESSAGE_ID_OFFSET..RECEIPT_MESSAGE_ID_OFFSET + 32].copy_from_slice(message_id);
    data[RECEIPT_STATE_OFFSET..RECEIPT_STATE_OFFSET + 32].copy_from_slice(state.as_ref());
    data[RECEIPT_MINT_OFFSET..RECEIPT_MINT_OFFSET + 32].copy_from_slice(mint.as_ref());
    data[RECEIPT_OWNER_OFFSET..RECEIPT_OWNER_OFFSET + 32].copy_from_slice(owner.as_ref());
    data[RECEIPT_DESTINATION_TOKEN_OFFSET..RECEIPT_DESTINATION_TOKEN_OFFSET + 32]
        .copy_from_slice(destination_token.as_ref());
    data[RECEIPT_AMOUNT_OFFSET..RECEIPT_AMOUNT_OFFSET + 8].copy_from_slice(&amount.to_le_bytes());
    data[RECEIPT_SLOT_OFFSET..RECEIPT_SLOT_OFFSET + 8].copy_from_slice(&slot.to_le_bytes());
    Ok(())
}

fn burn_to_taira(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    envelope: &Envelope,
) -> ProgramResult {
    let mut account_iter = accounts.iter();
    let owner = next_account_info(&mut account_iter)?;
    let state = next_account_info(&mut account_iter)?;
    let source_token = next_account_info(&mut account_iter)?;
    let mint = next_account_info(&mut account_iter)?;
    let token_program = next_account_info(&mut account_iter)?;
    let burn_receipt = next_account_info(&mut account_iter)?;
    let system_program_account = next_account_info(&mut account_iter)?;
    if account_iter.next().is_some() {
        msg!("SCCP Solana burn account list is not canonical");
        return Err(ProgramError::InvalidAccountData);
    }
    require_signer(owner)?;
    require_writable(owner, "burn owner")?;
    require_writable_state(program_id, state)?;
    let args = envelope.burn_args()?;
    let amount = args.amount;
    if amount == 0 {
        msg!("burn amount must be positive");
        return Err(ProgramError::InvalidInstructionData);
    }
    require_canonical_taira_i105_account(args.taira_recipient, "recipient")?;
    let nonce = parse_canonical_positive_burn_nonce(args.nonce)?;
    let stored_mint_key = {
        let data = state.try_borrow_data()?;
        stored_mint(&data)?
    };
    require_key(mint.key, &stored_mint_key, "mint")?;
    require_key(mint.owner, &TOKEN_PROGRAM_ID, "mint owner")?;
    require_writable(mint, "burn mint")?;
    require_key(token_program.key, &TOKEN_PROGRAM_ID, "token program")?;
    require_executable(token_program, "token program")?;
    require_key(
        system_program_account.key,
        &system_program::ID,
        "system program",
    )?;
    require_executable(system_program_account, "system program")?;
    let (expected_mint_authority, _) =
        Pubkey::find_program_address(&[MINT_AUTHORITY_SEED, state.key.as_ref()], program_id);
    require_spl_mint_binding(mint, &expected_mint_authority)?;
    require_spl_source_token_account(source_token, mint.key, owner.key, amount)?;
    let receipt_bump = require_unused_burn_receipt(
        program_id,
        state.key,
        owner.key,
        &nonce.to_le_bytes(),
        burn_receipt,
    )?;

    let slot = Clock::get()?.slot;
    let burn_hash = source_burn_event_hash(
        program_id,
        state.key,
        mint.key,
        owner.key,
        source_token.key,
        args.taira_recipient,
        amount,
        nonce,
        slot,
    )?;
    let ix = spl_token_burn_instruction(
        token_program.key,
        source_token.key,
        mint.key,
        owner.key,
        amount,
    );
    invoke(
        &ix,
        &[
            source_token.clone(),
            mint.clone(),
            owner.clone(),
            token_program.clone(),
        ],
    )?;
    create_burn_receipt(
        program_id,
        owner,
        state,
        mint,
        source_token,
        burn_receipt,
        system_program_account,
        args.taira_recipient,
        amount,
        nonce,
        receipt_bump,
        slot,
        &burn_hash,
    )?;

    let mut data = state.try_borrow_mut_data()?;
    write_successful_burn_state(&mut data, slot, amount, &burn_hash)?;
    msg!(
        "burned SCCP Solana XOR for TAIRA settlement: {:?}",
        burn_hash
    );
    Ok(())
}

fn write_successful_burn_state(
    data: &mut [u8],
    slot: u64,
    amount: u64,
    burn_hash: &[u8; 32],
) -> ProgramResult {
    if amount == 0 {
        msg!("burn amount must be positive");
        return Err(ProgramError::InvalidInstructionData);
    }
    if data.len() < STATE_LEN || &data[0..8] != STATE_MAGIC || data[8] != STATE_VERSION {
        msg!("SCCP Solana state is not initialized");
        return Err(ProgramError::UninitializedAccount);
    }
    let total_burned = read_u64(&data[STATE_TOTAL_BURNED_OFFSET..STATE_TOTAL_BURNED_OFFSET + 8])?
        .checked_add(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    data[STATE_LAST_SLOT_OFFSET..STATE_LAST_SLOT_OFFSET + 8].copy_from_slice(&slot.to_le_bytes());
    data[STATE_TOTAL_BURNED_OFFSET..STATE_TOTAL_BURNED_OFFSET + 8]
        .copy_from_slice(&total_burned.to_le_bytes());
    data[STATE_LAST_BURN_HASH_OFFSET..STATE_LAST_BURN_HASH_OFFSET + 32].copy_from_slice(burn_hash);
    Ok(())
}

fn parse_canonical_positive_burn_nonce(value: &[u8]) -> Result<u64, ProgramError> {
    if value.len() != core::mem::size_of::<u64>() {
        msg!("SCCP Solana burn nonce must be canonical u64 little-endian bytes");
        return Err(ProgramError::InvalidInstructionData);
    }
    let nonce = u64::from_le_bytes(
        value
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    );
    if nonce == 0 {
        msg!("SCCP Solana burn nonce must be positive");
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(nonce)
}

#[allow(clippy::too_many_arguments)]
fn source_burn_event_hash(
    program_id: &Pubkey,
    state: &Pubkey,
    mint: &Pubkey,
    owner: &Pubkey,
    source_token: &Pubkey,
    taira_recipient: &[u8],
    amount: u64,
    nonce: u64,
    slot: u64,
) -> Result<[u8; 32], ProgramError> {
    let recipient_len =
        u16::try_from(taira_recipient.len()).map_err(|_| ProgramError::InvalidInstructionData)?;
    Ok(hashv(&[
        SOURCE_BURN_EVENT_PREFIX,
        program_id.as_ref(),
        state.as_ref(),
        mint.as_ref(),
        owner.as_ref(),
        source_token.as_ref(),
        &recipient_len.to_le_bytes(),
        taira_recipient,
        &amount.to_le_bytes(),
        &nonce.to_le_bytes(),
        &slot.to_le_bytes(),
    ])
    .to_bytes())
}

fn require_unused_burn_receipt(
    program_id: &Pubkey,
    state: &Pubkey,
    owner: &Pubkey,
    nonce: &[u8; 8],
    receipt: &AccountInfo,
) -> Result<u8, ProgramError> {
    require_writable(receipt, "burn receipt")?;
    let (expected, bump) = Pubkey::find_program_address(
        &[BURN_RECEIPT_SEED, state.as_ref(), owner.as_ref(), nonce],
        program_id,
    );
    require_key(receipt.key, &expected, "burn receipt")?;
    if receipt.owner == program_id {
        msg!("SCCP Solana source burn nonce has already been consumed");
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    if receipt.owner != &system_program::ID || !receipt.data_is_empty() {
        msg!("SCCP Solana burn receipt is not an unused system account");
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(bump)
}

#[allow(clippy::too_many_arguments)]
fn create_burn_receipt<'a>(
    program_id: &Pubkey,
    payer: &AccountInfo<'a>,
    state: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    source_token: &AccountInfo<'a>,
    receipt: &AccountInfo<'a>,
    system_program_account: &AccountInfo<'a>,
    taira_recipient: &[u8],
    amount: u64,
    nonce: u64,
    bump: u8,
    slot: u64,
    event_hash: &[u8; 32],
) -> ProgramResult {
    let rent_lamports = Rent::get()?.minimum_balance(BURN_RECEIPT_LEN);
    let funding = rent_lamports.saturating_sub(receipt.lamports());
    if funding > 0 {
        invoke(
            &system_instruction::transfer(payer.key, receipt.key, funding),
            &[
                payer.clone(),
                receipt.clone(),
                system_program_account.clone(),
            ],
        )?;
    }
    let nonce_bytes = nonce.to_le_bytes();
    let signer_seeds: &[&[u8]] = &[
        BURN_RECEIPT_SEED,
        state.key.as_ref(),
        payer.key.as_ref(),
        &nonce_bytes,
        &[bump],
    ];
    invoke_signed(
        &system_instruction::allocate(receipt.key, BURN_RECEIPT_LEN as u64),
        &[receipt.clone(), system_program_account.clone()],
        &[signer_seeds],
    )?;
    invoke_signed(
        &system_instruction::assign(receipt.key, program_id),
        &[receipt.clone(), system_program_account.clone()],
        &[signer_seeds],
    )?;
    let recipient_hash = hashv(&[taira_recipient]).to_bytes();
    let mut data = receipt.try_borrow_mut_data()?;
    write_burn_receipt_state(
        &mut data,
        bump,
        state.key,
        mint.key,
        payer.key,
        source_token.key,
        &recipient_hash,
        amount,
        nonce,
        slot,
        event_hash,
    )
}

#[allow(clippy::too_many_arguments)]
fn write_burn_receipt_state(
    data: &mut [u8],
    bump: u8,
    state: &Pubkey,
    mint: &Pubkey,
    owner: &Pubkey,
    source_token: &Pubkey,
    recipient_hash: &[u8; 32],
    amount: u64,
    nonce: u64,
    slot: u64,
    event_hash: &[u8; 32],
) -> ProgramResult {
    if data.len() != BURN_RECEIPT_LEN {
        return Err(ProgramError::AccountDataTooSmall);
    }
    if data.iter().any(|byte| *byte != 0) {
        msg!("SCCP Solana burn receipt is already initialized");
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    data[0..8].copy_from_slice(BURN_RECEIPT_MAGIC);
    data[8] = BURN_RECEIPT_VERSION;
    data[BURN_RECEIPT_BUMP_OFFSET] = bump;
    data[BURN_RECEIPT_STATE_OFFSET..BURN_RECEIPT_STATE_OFFSET + 32].copy_from_slice(state.as_ref());
    data[BURN_RECEIPT_MINT_OFFSET..BURN_RECEIPT_MINT_OFFSET + 32].copy_from_slice(mint.as_ref());
    data[BURN_RECEIPT_OWNER_OFFSET..BURN_RECEIPT_OWNER_OFFSET + 32].copy_from_slice(owner.as_ref());
    data[BURN_RECEIPT_SOURCE_TOKEN_OFFSET..BURN_RECEIPT_SOURCE_TOKEN_OFFSET + 32]
        .copy_from_slice(source_token.as_ref());
    data[BURN_RECEIPT_RECIPIENT_HASH_OFFSET..BURN_RECEIPT_RECIPIENT_HASH_OFFSET + 32]
        .copy_from_slice(recipient_hash);
    data[BURN_RECEIPT_AMOUNT_OFFSET..BURN_RECEIPT_AMOUNT_OFFSET + 8]
        .copy_from_slice(&amount.to_le_bytes());
    data[BURN_RECEIPT_NONCE_OFFSET..BURN_RECEIPT_NONCE_OFFSET + 8]
        .copy_from_slice(&nonce.to_le_bytes());
    data[BURN_RECEIPT_SLOT_OFFSET..BURN_RECEIPT_SLOT_OFFSET + 8]
        .copy_from_slice(&slot.to_le_bytes());
    data[BURN_RECEIPT_EVENT_HASH_OFFSET..BURN_RECEIPT_EVENT_HASH_OFFSET + 32]
        .copy_from_slice(event_hash);
    Ok(())
}

fn require_signer(account: &AccountInfo) -> ProgramResult {
    if !account.is_signer {
        msg!("required signer is missing");
        return Err(ProgramError::MissingRequiredSignature);
    }
    Ok(())
}

fn require_writable(account: &AccountInfo, label: &str) -> ProgramResult {
    if !account.is_writable {
        msg!("SCCP Solana {} account is not writable", label);
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn require_writable_state(program_id: &Pubkey, account: &AccountInfo) -> ProgramResult {
    if account.owner != program_id {
        msg!("SCCP Solana state account owner does not match program");
        return Err(ProgramError::IncorrectProgramId);
    }
    if !account.is_writable {
        msg!("SCCP Solana state account is not writable");
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn require_initialized_state(account: &AccountInfo) -> ProgramResult {
    let data = account.try_borrow_data()?;
    if data.len() < STATE_LEN || &data[0..8] != STATE_MAGIC || data[8] != STATE_VERSION {
        msg!("SCCP Solana state is not initialized");
        return Err(ProgramError::UninitializedAccount);
    }
    Ok(())
}

fn require_key(actual: &Pubkey, expected: &Pubkey, label: &str) -> ProgramResult {
    if actual != expected {
        msg!("SCCP Solana {} account mismatch", label);
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn require_executable(account: &AccountInfo, label: &str) -> ProgramResult {
    if !account.executable {
        msg!("SCCP Solana {} account is not executable", label);
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn require_spl_mint_binding(mint: &AccountInfo, expected_authority: &Pubkey) -> ProgramResult {
    let data = mint.try_borrow_data()?;
    if data.len() != 82
        || data.get(0..4) != Some(&1_u32.to_le_bytes())
        || data.get(4..36) != Some(expected_authority.as_ref())
        || data.get(45).copied() != Some(1)
    {
        msg!("SCCP Solana SPL mint is not initialized with the route mint authority");
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn require_spl_destination_token_account(
    destination: &AccountInfo,
    expected_mint: &Pubkey,
    expected_owner: &Pubkey,
) -> ProgramResult {
    require_writable(destination, "destination token")?;
    require_key(
        destination.owner,
        &TOKEN_PROGRAM_ID,
        "destination token owner program",
    )?;
    let data = destination.try_borrow_data()?;
    if data.len() != 165
        || data.get(0..32) != Some(expected_mint.as_ref())
        || data.get(32..64) != Some(expected_owner.as_ref())
        || data.get(108).copied() != Some(1)
    {
        msg!("SCCP Solana destination token account mint, owner, or state is invalid");
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn require_spl_source_token_account(
    source: &AccountInfo,
    expected_mint: &Pubkey,
    expected_owner: &Pubkey,
    burn_amount: u64,
) -> ProgramResult {
    require_writable(source, "source token")?;
    require_key(
        source.owner,
        &TOKEN_PROGRAM_ID,
        "source token owner program",
    )?;
    let data = source.try_borrow_data()?;
    if data.len() != 165
        || data.get(0..32) != Some(expected_mint.as_ref())
        || data.get(32..64) != Some(expected_owner.as_ref())
        || data.get(108).copied() != Some(1)
    {
        msg!("SCCP Solana source token account mint, owner, or state is invalid");
        return Err(ProgramError::InvalidAccountData);
    }
    let balance = read_u64(data.get(64..72).ok_or(ProgramError::InvalidAccountData)?)?;
    if balance < burn_amount {
        msg!("SCCP Solana source token balance is insufficient");
        return Err(ProgramError::InsufficientFunds);
    }
    Ok(())
}

fn require_spl_source_route_mint(mint: &AccountInfo, expected_authority: &Pubkey) -> ProgramResult {
    require_spl_mint_binding(mint, expected_authority)?;
    let data = mint.try_borrow_data()?;
    if data.get(44).copied() != Some(XOR_SPL_DECIMALS)
        || data.get(46..50) != Some(&0_u32.to_le_bytes())
    {
        msg!("SCCP Solana source mint decimals or freeze authority is invalid");
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn require_canonical_taira_i105_account(value: &[u8], label: &str) -> ProgramResult {
    require_non_empty_bounded(value, MAX_TAIRA_ACCOUNT_BYTES, "TAIRA account")?;
    let literal = str::from_utf8(value).map_err(|_| ProgramError::InvalidInstructionData)?;
    let Some(payload) = literal.strip_prefix(TAIRA_I105_SENTINEL) else {
        msg!(
            "SCCP Solana TAIRA {} must use the I105 test sentinel",
            label
        );
        return Err(ProgramError::InvalidInstructionData);
    };
    let digits = i105_payload_digits(payload)?;
    if digits.len() <= I105_CHECKSUM_LEN {
        msg!("SCCP Solana TAIRA I105 {} is too short", label);
        return Err(ProgramError::InvalidInstructionData);
    }
    let split_at = digits.len() - I105_CHECKSUM_LEN;
    let canonical = decode_base_105(&digits[..split_at])?;
    if digits[split_at..] != i105_checksum_digits(&canonical)
        || encode_base_105(&canonical)? != digits[..split_at]
    {
        msg!(
            "SCCP Solana TAIRA I105 {} checksum or encoding is non-canonical",
            label
        );
        return Err(ProgramError::InvalidInstructionData);
    }
    require_canonical_ed25519_account_payload(&canonical, label)
}

fn require_canonical_ed25519_account_payload(canonical: &[u8], label: &str) -> ProgramResult {
    let expected_len = 4 + ED25519_PUBLIC_KEY_LEN;
    if canonical.len() != expected_len
        || canonical[0] != I105_CURRENT_HEADER_SINGLE_KEY
        || canonical[1] != I105_CONTROLLER_SINGLE_KEY_TAG
        || canonical[2] != I105_CURVE_ED25519
        || usize::from(canonical[3]) != ED25519_PUBLIC_KEY_LEN
    {
        msg!(
            "SCCP Solana TAIRA {} is not a current canonical Ed25519 account",
            label
        );
        return Err(ProgramError::InvalidInstructionData);
    }
    let key_bytes: [u8; ED25519_PUBLIC_KEY_LEN] = canonical[4..]
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)?;
    let key = Pubkey::new_from_array(key_bytes);
    if !ed25519_compressed_y_is_canonical(&key_bytes)
        || !key.is_on_curve()
        || ED25519_SMALL_ORDER_POINTS.contains(&key_bytes)
    {
        msg!(
            "SCCP Solana TAIRA {} carries a weak or non-canonical Ed25519 key",
            label
        );
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(())
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
        .map(|symbol| {
            i105_digit(symbol).ok_or_else(|| {
                msg!("SCCP Solana TAIRA recipient contains a non-I105 symbol");
                ProgramError::InvalidInstructionData
            })
        })
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
        let mut remainder = 0_u32;
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
        let mut remainder = 0_u32;
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
    values.extend([0_u8; I105_CHECKSUM_LEN]);
    let polymod = bech32_polymod(values.iter().copied()) ^ BECH32M_CONST;
    let mut result = [0_u8; I105_CHECKSUM_LEN];
    for (index, slot) in result.iter_mut().enumerate() {
        let shift = 5 * (I105_CHECKSUM_LEN - 1 - index);
        *slot = u8::try_from((polymod >> shift) & 0x1f).expect("checksum limb fits in u8");
    }
    result
}

fn convert_to_base32(data: &[u8]) -> Vec<u8> {
    let mut acc = 0_u32;
    let mut bits = 0_u32;
    let mut out = Vec::with_capacity((data.len() * 8).div_ceil(5));
    for byte in data {
        acc = (acc << 8) | u32::from(*byte);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            out.push(u8::try_from((acc >> bits) & 0x1f).expect("base32 limb fits in u8"));
        }
    }
    if bits > 0 {
        out.push(u8::try_from((acc << (5 - bits)) & 0x1f).expect("base32 remainder fits in u8"));
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
    let mut checksum = 1_u32;
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

fn require_non_empty_bounded(value: &[u8], max_len: usize, label: &str) -> ProgramResult {
    if value.is_empty() || value.iter().all(|byte| *byte == 0) || value.len() > max_len {
        msg!("invalid SCCP Solana {}", label);
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(())
}

fn require_hash(value: &[u8], label: &str) -> ProgramResult {
    if value.len() != 32 || value.iter().all(|byte| *byte == 0) {
        msg!("invalid SCCP Solana {}", label);
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(())
}

fn require_bytes_equal(value: &[u8], expected: &[u8], label: &str) -> ProgramResult {
    if value != expected {
        msg!("SCCP Solana {} does not match the route binding", label);
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(())
}

fn hash_array(value: &[u8], label: &str) -> Result<[u8; 32], ProgramError> {
    require_hash(value, label)?;
    value
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)
}

fn array_at(input: &[u8], offset: usize, label: &str) -> Result<[u8; 32], ProgramError> {
    input
        .get(offset..offset + 32)
        .ok_or_else(|| {
            msg!("invalid SCCP Solana {}", label);
            ProgramError::InvalidInstructionData
        })?
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)
}

struct ByteCursor<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> ByteCursor<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, offset: 0 }
    }

    fn take_exact(&mut self, len: usize) -> Result<&'a [u8], ProgramError> {
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

    fn take_u8(&mut self) -> Result<u8, ProgramError> {
        Ok(self.take_exact(1)?[0])
    }

    fn take_u32(&mut self) -> Result<u32, ProgramError> {
        Ok(u32::from_le_bytes(
            self.take_exact(4)?
                .try_into()
                .map_err(|_| ProgramError::InvalidInstructionData)?,
        ))
    }

    fn take_u64(&mut self) -> Result<u64, ProgramError> {
        Ok(u64::from_le_bytes(
            self.take_exact(8)?
                .try_into()
                .map_err(|_| ProgramError::InvalidInstructionData)?,
        ))
    }

    fn take_u128(&mut self) -> Result<u128, ProgramError> {
        Ok(u128::from_le_bytes(
            self.take_exact(16)?
                .try_into()
                .map_err(|_| ProgramError::InvalidInstructionData)?,
        ))
    }

    fn take_vec(&mut self) -> Result<&'a [u8], ProgramError> {
        let len =
            usize::try_from(self.take_u32()?).map_err(|_| ProgramError::InvalidInstructionData)?;
        self.take_exact(len)
    }

    fn is_finished(&self) -> bool {
        self.offset == self.bytes.len()
    }
}

fn read_u32(input: &[u8], offset: &mut usize) -> Result<usize, ProgramError> {
    let end = offset
        .checked_add(4)
        .ok_or(ProgramError::InvalidInstructionData)?;
    let bytes = input
        .get(*offset..end)
        .ok_or(ProgramError::InvalidInstructionData)?;
    *offset = end;
    Ok(u32::from_le_bytes(
        bytes
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    ) as usize)
}

fn read_vec<'a>(input: &'a [u8], offset: &mut usize) -> Result<&'a [u8], ProgramError> {
    let len = read_u32(input, offset)?;
    let end = offset
        .checked_add(len)
        .ok_or(ProgramError::InvalidInstructionData)?;
    let bytes = input
        .get(*offset..end)
        .ok_or(ProgramError::InvalidInstructionData)?;
    *offset = end;
    Ok(bytes)
}

fn read_u64(input: &[u8]) -> Result<u64, ProgramError> {
    Ok(u64::from_le_bytes(
        input
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    ))
}

fn read_amount(input: &[u8], label: &str) -> Result<u64, ProgramError> {
    if input.len() != 8 {
        msg!("SCCP Solana {} must be u64 little-endian", label);
        return Err(ProgramError::InvalidInstructionData);
    }
    read_u64(input).map_err(|_| ProgramError::InvalidInstructionData)
}

fn stored_mint(data: &[u8]) -> Result<Pubkey, ProgramError> {
    if data.len() < STATE_LEN || &data[0..8] != STATE_MAGIC || data[8] != STATE_VERSION {
        return Err(ProgramError::UninitializedAccount);
    }
    read_pubkey_at(data, STATE_MINT_OFFSET)
}

fn stored_authority(data: &[u8]) -> Result<Pubkey, ProgramError> {
    if data.len() < STATE_LEN || &data[0..8] != STATE_MAGIC || data[8] != STATE_VERSION {
        return Err(ProgramError::UninitializedAccount);
    }
    read_pubkey_at(data, STATE_AUTHORITY_OFFSET)
}

fn stored_native_verifier_program(data: &[u8]) -> Result<Pubkey, ProgramError> {
    if data.len() < STATE_LEN || &data[0..8] != STATE_MAGIC || data[8] != STATE_VERSION {
        return Err(ProgramError::UninitializedAccount);
    }
    require_verifier_config_locked(data)?;
    let key = read_pubkey_at(data, STATE_NATIVE_VERIFIER_PROGRAM_OFFSET)?;
    if is_zero_32(key.as_ref()) {
        msg!("SCCP Solana native verifier program is not configured");
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(key)
}

fn stored_verifier_material_hash(data: &[u8]) -> Result<[u8; 32], ProgramError> {
    require_verifier_config_locked(data)?;
    read_hash_at(
        data,
        STATE_VERIFIER_MATERIAL_HASH_OFFSET,
        "verifier material hash",
    )
}

fn stored_verifier_config_hash(data: &[u8]) -> Result<[u8; 32], ProgramError> {
    require_verifier_config_locked(data)?;
    read_hash_at(
        data,
        STATE_VERIFIER_CONFIG_HASH_OFFSET,
        "verifier config hash",
    )
}

fn read_pubkey_at(data: &[u8], offset: usize) -> Result<Pubkey, ProgramError> {
    let end = offset
        .checked_add(32)
        .ok_or(ProgramError::InvalidAccountData)?;
    Ok(Pubkey::new_from_array(
        data.get(offset..end)
            .ok_or(ProgramError::InvalidAccountData)?
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    ))
}

fn read_hash_at(data: &[u8], offset: usize, label: &str) -> Result<[u8; 32], ProgramError> {
    if data.len() < STATE_LEN || &data[0..8] != STATE_MAGIC || data[8] != STATE_VERSION {
        return Err(ProgramError::UninitializedAccount);
    }
    let end = offset
        .checked_add(32)
        .ok_or(ProgramError::InvalidAccountData)?;
    let value: [u8; 32] = data
        .get(offset..end)
        .ok_or(ProgramError::InvalidAccountData)?
        .try_into()
        .map_err(|_| ProgramError::InvalidAccountData)?;
    if is_zero_32(&value) {
        msg!("SCCP Solana {} is not configured", label);
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(value)
}

fn write_verifier_config_state(
    data: &mut [u8],
    verifier_program: &Pubkey,
    verifier_material_hash: &[u8; 32],
    verifier_config_hash: &[u8; 32],
    slot: u64,
) -> ProgramResult {
    if data.len() < STATE_LEN || &data[0..8] != STATE_MAGIC || data[8] != STATE_VERSION {
        msg!("SCCP Solana state is not initialized");
        return Err(ProgramError::UninitializedAccount);
    }
    if is_zero_32(verifier_program.as_ref()) {
        msg!("SCCP Solana native verifier program is invalid");
        return Err(ProgramError::InvalidAccountData);
    }
    if data[STATE_VERIFIER_LOCKED_OFFSET] != 0
        || data[STATE_NATIVE_VERIFIER_PROGRAM_OFFSET..STATE_NATIVE_VERIFIER_PROGRAM_OFFSET + 32]
            .iter()
            .any(|byte| *byte != 0)
        || data[STATE_VERIFIER_MATERIAL_HASH_OFFSET..STATE_VERIFIER_MATERIAL_HASH_OFFSET + 32]
            .iter()
            .any(|byte| *byte != 0)
        || data[STATE_VERIFIER_CONFIG_HASH_OFFSET..STATE_VERIFIER_CONFIG_HASH_OFFSET + 32]
            .iter()
            .any(|byte| *byte != 0)
        || data[STATE_VERIFIER_CONFIGURED_SLOT_OFFSET..STATE_VERIFIER_CONFIGURED_SLOT_OFFSET + 8]
            .iter()
            .any(|byte| *byte != 0)
    {
        msg!("SCCP Solana native verifier configuration is permanently locked");
        return Err(ProgramError::AccountAlreadyInitialized);
    }
    data[STATE_NATIVE_VERIFIER_PROGRAM_OFFSET..STATE_NATIVE_VERIFIER_PROGRAM_OFFSET + 32]
        .copy_from_slice(verifier_program.as_ref());
    data[STATE_VERIFIER_MATERIAL_HASH_OFFSET..STATE_VERIFIER_MATERIAL_HASH_OFFSET + 32]
        .copy_from_slice(verifier_material_hash);
    data[STATE_VERIFIER_CONFIG_HASH_OFFSET..STATE_VERIFIER_CONFIG_HASH_OFFSET + 32]
        .copy_from_slice(verifier_config_hash);
    data[STATE_VERIFIER_CONFIGURED_SLOT_OFFSET..STATE_VERIFIER_CONFIGURED_SLOT_OFFSET + 8]
        .copy_from_slice(&slot.to_le_bytes());
    data[STATE_VERIFIER_LOCKED_OFFSET] = 1;
    data[STATE_LAST_SLOT_OFFSET..STATE_LAST_SLOT_OFFSET + 8].copy_from_slice(&slot.to_le_bytes());
    Ok(())
}

fn require_verifier_config_locked(data: &[u8]) -> ProgramResult {
    if data.len() < STATE_LEN || data[STATE_VERIFIER_LOCKED_OFFSET] != 1 {
        msg!("SCCP Solana native verifier configuration is not permanently locked");
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
}

fn is_zero_32(value: &[u8]) -> bool {
    value.len() == 32 && value.iter().all(|byte| *byte == 0)
}

fn push_instruction_vec(out: &mut Vec<u8>, bytes: &[u8]) {
    out.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    out.extend_from_slice(bytes);
}

#[allow(clippy::too_many_arguments)]
fn native_recursive_verifier_instruction(
    verifier_program: &Pubkey,
    payer: &Pubkey,
    state: &Pubkey,
    mint: &Pubkey,
    destination_token: &Pubkey,
    args: &SubmitArgs,
    amount: u64,
    message_id: &[u8; 32],
    verifier_material_hash: &[u8; 32],
    verifier_config_hash: &[u8; 32],
) -> Instruction {
    let mut data = Vec::new();
    push_instruction_vec(&mut data, VERIFIER_ENTRYPOINT_VERIFY);
    push_instruction_vec(&mut data, NATIVE_VERIFIER_CPI_MARKER);
    push_instruction_vec(&mut data, args.proof_bytes);
    push_instruction_vec(&mut data, args.public_inputs);
    push_instruction_vec(&mut data, args.bundle_bytes);
    push_instruction_vec(&mut data, args.statement_hash);
    push_instruction_vec(&mut data, args.destination_binding_hash);
    push_instruction_vec(&mut data, args.proof_context_hash);
    push_instruction_vec(&mut data, &amount.to_le_bytes());
    push_instruction_vec(&mut data, verifier_material_hash);
    push_instruction_vec(&mut data, verifier_config_hash);
    push_instruction_vec(&mut data, payer.as_ref());
    push_instruction_vec(&mut data, state.as_ref());
    push_instruction_vec(&mut data, message_id);
    push_instruction_vec(&mut data, mint.as_ref());
    push_instruction_vec(&mut data, destination_token.as_ref());
    Instruction {
        program_id: *verifier_program,
        accounts: vec![
            AccountMeta::new_readonly(*payer, true),
            AccountMeta::new_readonly(*state, false),
            AccountMeta::new_readonly(*mint, false),
            AccountMeta::new_readonly(*destination_token, false),
        ],
        data,
    }
}

#[allow(clippy::too_many_arguments)]
fn invoke_configured_native_recursive_verifier<'a>(
    payer: &AccountInfo<'a>,
    state: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
    destination_token: &AccountInfo<'a>,
    verifier_program: &AccountInfo<'a>,
    args: &SubmitArgs,
    amount: u64,
    message_id: &[u8; 32],
    verifier_material_hash: &[u8; 32],
    verifier_config_hash: &[u8; 32],
) -> ProgramResult {
    let ix = native_recursive_verifier_instruction(
        verifier_program.key,
        payer.key,
        state.key,
        mint.key,
        destination_token.key,
        args,
        amount,
        message_id,
        verifier_material_hash,
        verifier_config_hash,
    );
    invoke(
        &ix,
        &[
            payer.clone(),
            state.clone(),
            mint.clone(),
            destination_token.clone(),
            verifier_program.clone(),
        ],
    )
}

fn spl_token_burn_instruction(
    token_program: &Pubkey,
    source: &Pubkey,
    mint: &Pubkey,
    owner: &Pubkey,
    amount: u64,
) -> Instruction {
    let mut data = Vec::with_capacity(9);
    data.push(TOKEN_INSTRUCTION_BURN);
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction {
        program_id: *token_program,
        accounts: vec![
            AccountMeta::new(*source, false),
            AccountMeta::new(*mint, false),
            AccountMeta::new_readonly(*owner, true),
        ],
        data,
    }
}

fn spl_token_mint_to_instruction(
    token_program: &Pubkey,
    mint: &Pubkey,
    destination: &Pubkey,
    authority: &Pubkey,
    amount: u64,
) -> Instruction {
    let mut data = Vec::with_capacity(9);
    data.push(TOKEN_INSTRUCTION_MINT_TO);
    data.extend_from_slice(&amount.to_le_bytes());
    Instruction {
        program_id: *token_program,
        accounts: vec![
            AccountMeta::new(*mint, false),
            AccountMeta::new(*destination, false),
            AccountMeta::new_readonly(*authority, true),
        ],
        data,
    }
}

struct Envelope<'a> {
    entrypoint: &'a [u8],
    args: Vec<&'a [u8]>,
}

impl<'a> Envelope<'a> {
    fn parse(input: &'a [u8]) -> Result<Self, ProgramError> {
        let mut offset = 0;
        let entrypoint = read_vec(input, &mut offset)?;
        let mut args = Vec::new();
        while offset < input.len() {
            args.push(read_vec(input, &mut offset)?);
        }
        Ok(Self { entrypoint, args })
    }

    fn submit_args(&self) -> Result<SubmitArgs<'a>, ProgramError> {
        if self.args.len() != 7 {
            msg!("SCCP Solana submit envelope must carry seven arguments");
            return Err(ProgramError::InvalidInstructionData);
        }
        Ok(SubmitArgs {
            proof_bytes: self.args[0],
            public_inputs: self.args[1],
            bundle_bytes: self.args[2],
            statement_hash: self.args[3],
            destination_binding_hash: self.args[4],
            proof_context_hash: self.args[5],
            amount: Some(read_amount(self.args[6], "mint amount")?),
        })
    }

    fn configure_verifier_args(&self) -> Result<ConfigureVerifierArgs<'a>, ProgramError> {
        if self.args.len() != 2 {
            msg!("SCCP Solana verifier config envelope must carry two arguments");
            return Err(ProgramError::InvalidInstructionData);
        }
        Ok(ConfigureVerifierArgs {
            verifier_material_hash: self.args[0],
            verifier_config_hash: self.args[1],
        })
    }

    fn burn_args(&self) -> Result<BurnArgs<'a>, ProgramError> {
        if self.args.len() != 3 {
            msg!("SCCP Solana burn envelope must carry three arguments");
            return Err(ProgramError::InvalidInstructionData);
        }
        Ok(BurnArgs {
            amount: read_amount(self.args[0], "burn amount")?,
            taira_recipient: self.args[1],
            nonce: self.args[2],
        })
    }
}

struct SubmitArgs<'a> {
    proof_bytes: &'a [u8],
    public_inputs: &'a [u8],
    bundle_bytes: &'a [u8],
    statement_hash: &'a [u8],
    destination_binding_hash: &'a [u8],
    proof_context_hash: &'a [u8],
    amount: Option<u64>,
}

struct ConfigureVerifierArgs<'a> {
    verifier_material_hash: &'a [u8],
    verifier_config_hash: &'a [u8],
}

struct BurnArgs<'a> {
    amount: u64,
    taira_recipient: &'a [u8],
    nonce: &'a [u8],
}

#[cfg(test)]
mod tests {
    use super::*;

    const CANONICAL_TAIRA_ACCOUNT_FIXTURE: &str =
        "testuﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB";

    fn push_vec(out: &mut Vec<u8>, bytes: &[u8]) {
        out.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
        out.extend_from_slice(bytes);
    }

    #[derive(Clone, Copy)]
    struct TransferBindingFixture<'a> {
        asset_codec: u8,
        asset_id: &'a [u8],
        sender_codec: u8,
        sender: &'a [u8],
        route_codec: u8,
        route_id: &'a [u8],
    }

    fn canonical_transfer_bindings() -> TransferBindingFixture<'static> {
        TransferBindingFixture {
            asset_codec: SCCP_CODEC_TEXT_UTF8,
            asset_id: SCCP_XOR_ASSET_ID,
            sender_codec: SCCP_CODEC_TEXT_UTF8,
            sender: CANONICAL_TAIRA_ACCOUNT_FIXTURE.as_bytes(),
            route_codec: SCCP_CODEC_TEXT_UTF8,
            route_id: SCCP_TAIRA_SOL_XOR_ROUTE_ID,
        }
    }

    fn canonical_transfer_fixture(recipient: &Pubkey, amount: u64) -> (Vec<u8>, Vec<u8>, [u8; 32]) {
        transfer_fixture(recipient, amount, canonical_transfer_bindings())
    }

    fn transfer_fixture(
        recipient: &Pubkey,
        amount: u64,
        bindings: TransferBindingFixture<'_>,
    ) -> (Vec<u8>, Vec<u8>, [u8; 32]) {
        let mut payload = Vec::new();
        payload.push(SCCP_PAYLOAD_TRANSFER_DISCRIMINANT);
        payload.push(1);
        payload.extend_from_slice(&SCCP_DOMAIN_SORA.to_le_bytes());
        payload.extend_from_slice(&SCCP_DOMAIN_SOLANA.to_le_bytes());
        payload.extend_from_slice(&7_u64.to_le_bytes());
        payload.extend_from_slice(&SCCP_DOMAIN_SORA.to_le_bytes());
        payload.push(bindings.asset_codec);
        push_vec(&mut payload, bindings.asset_id);
        payload.extend_from_slice(&u128::from(amount).to_le_bytes());
        payload.push(bindings.sender_codec);
        push_vec(&mut payload, bindings.sender);
        payload.push(SCCP_CODEC_SOLANA_BASE58);
        push_vec(&mut payload, recipient.to_string().as_bytes());
        payload.push(bindings.route_codec);
        push_vec(&mut payload, bindings.route_id);

        let message_id = keccak_hashv(&[TRANSFER_MESSAGE_PREFIX, &payload[1..]]).to_bytes();
        let payload_hash = [0x55; 32];
        let mut commitment = Vec::new();
        commitment.push(1);
        commitment.push(SCCP_COMMITMENT_TRANSFER_KIND);
        commitment.extend_from_slice(&SCCP_DOMAIN_SOLANA.to_le_bytes());
        commitment.extend_from_slice(&message_id);
        commitment.extend_from_slice(&payload_hash);

        let mut bundle = Vec::new();
        bundle.push(1);
        bundle.extend_from_slice(&[0x44; 32]);
        push_vec(&mut bundle, &commitment);
        push_vec(&mut bundle, &[1]);
        push_vec(&mut bundle, &payload);
        push_vec(&mut bundle, &[2]);

        let mut public_inputs = Vec::new();
        public_inputs.push(1);
        public_inputs.extend_from_slice(&message_id);
        public_inputs.extend_from_slice(&payload_hash);
        public_inputs.extend_from_slice(&SCCP_DOMAIN_SOLANA.to_le_bytes());
        public_inputs.extend_from_slice(&[0x33; 32]);
        public_inputs.extend_from_slice(&9_u64.to_le_bytes());
        public_inputs.extend_from_slice(&[0x22; 32]);
        (public_inputs, bundle, message_id)
    }

    fn assert_rehashed_transfer_binding_rejected(
        recipient: &Pubkey,
        amount: u64,
        canonical_message_id: &[u8; 32],
        bindings: TransferBindingFixture<'_>,
        label: &str,
    ) {
        let (public_inputs, bundle, adversarial_message_id) =
            transfer_fixture(recipient, amount, bindings);
        assert_ne!(
            adversarial_message_id, *canonical_message_id,
            "{label} must be tested with a freshly hashed canonical payload"
        );
        assert_eq!(
            public_inputs.get(1..33),
            Some(adversarial_message_id.as_slice()),
            "{label} public inputs must carry the adversarial message id"
        );
        // Bundle prefix is version + commitment root + commitment length. The
        // commitment message id follows version, kind, and target domain.
        assert_eq!(
            bundle.get(43..75),
            Some(adversarial_message_id.as_slice()),
            "{label} bundle commitment must carry the adversarial message id"
        );
        assert_eq!(
            parse_canonical_transfer_settlement(&public_inputs, &bundle, recipient, amount),
            Err(ProgramError::InvalidInstructionData),
            "{label} must fail from its semantic route binding, not a stale hash"
        );
    }

    #[test]
    fn rejects_submit_envelope_without_amount() {
        let mut data = Vec::new();
        push_vec(&mut data, ENTRYPOINT_SUBMIT);
        push_vec(&mut data, &[1, 2, 3]);
        push_vec(&mut data, &[4, 5, 6]);
        push_vec(&mut data, &[7, 8, 9]);
        push_vec(&mut data, &[1; 32]);
        push_vec(&mut data, &[2; 32]);
        push_vec(&mut data, &[3; 32]);

        let envelope = Envelope::parse(&data).expect("valid envelope");
        assert_eq!(envelope.entrypoint, ENTRYPOINT_SUBMIT);
        assert_eq!(
            envelope.submit_args().map(|_| ()),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn parses_submit_envelope_with_amount() {
        let mut data = Vec::new();
        push_vec(&mut data, ENTRYPOINT_SUBMIT);
        push_vec(&mut data, &[1, 2, 3]);
        push_vec(&mut data, &[4, 5, 6]);
        push_vec(&mut data, &[7, 8, 9]);
        push_vec(&mut data, &[1; 32]);
        push_vec(&mut data, &[2; 32]);
        push_vec(&mut data, &[3; 32]);
        push_vec(&mut data, &42_u64.to_le_bytes());

        let envelope = Envelope::parse(&data).expect("valid envelope");
        let args = envelope.submit_args().expect("submit args");
        assert_eq!(args.amount, Some(42));
    }

    #[test]
    fn rejects_noncanonical_account_counts_for_every_first_release_entrypoint() {
        for (expected, label) in [
            (INITIALIZE_ACCOUNT_COUNT, "initialize"),
            (CONFIGURE_VERIFIER_ACCOUNT_COUNT, "verifier configuration"),
            (SUBMIT_ACCOUNT_COUNT, "submit"),
        ] {
            assert_eq!(
                require_canonical_account_count(expected, expected, label),
                Ok(())
            );
            assert_eq!(
                require_canonical_account_count(expected - 1, expected, label),
                Err(ProgramError::InvalidAccountData)
            );
            assert_eq!(
                require_canonical_account_count(expected + 1, expected, label),
                Err(ProgramError::InvalidAccountData)
            );
        }
    }

    #[test]
    fn parses_configure_verifier_envelope() {
        let mut data = Vec::new();
        push_vec(&mut data, ENTRYPOINT_CONFIGURE_VERIFIER);
        push_vec(&mut data, &[4; 32]);
        push_vec(&mut data, &[5; 32]);

        let envelope = Envelope::parse(&data).expect("valid envelope");
        assert_eq!(envelope.entrypoint, ENTRYPOINT_CONFIGURE_VERIFIER);
        let args = envelope.configure_verifier_args().expect("configure args");
        assert_eq!(args.verifier_material_hash, &[4; 32]);
        assert_eq!(args.verifier_config_hash, &[5; 32]);
    }

    #[test]
    fn parses_burn_envelope() {
        let mut data = Vec::new();
        push_vec(&mut data, ENTRYPOINT_BURN);
        push_vec(&mut data, &9_u64.to_le_bytes());
        push_vec(
            &mut data,
            "testuﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB".as_bytes(),
        );
        push_vec(&mut data, &7_u64.to_le_bytes());

        let envelope = Envelope::parse(&data).expect("valid envelope");
        let args = envelope.burn_args().expect("burn args");
        assert_eq!(args.amount, 9);
        assert_eq!(
            args.taira_recipient,
            "testuﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB".as_bytes()
        );
        assert_eq!(args.nonce, &7_u64.to_le_bytes());
    }

    #[test]
    fn rejects_short_hash() {
        assert_eq!(
            require_hash(&[1; 31], "statement hash"),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn accepts_expected_destination_binding_hash() {
        assert_eq!(
            require_bytes_equal(
                &DESTINATION_BINDING_HASH,
                &DESTINATION_BINDING_HASH,
                "destination binding hash"
            ),
            Ok(())
        );
    }

    #[test]
    fn rejects_wrong_destination_binding_hash() {
        let mut wrong = DESTINATION_BINDING_HASH;
        wrong[31] ^= 1;

        assert_eq!(
            require_bytes_equal(
                &wrong,
                &DESTINATION_BINDING_HASH,
                "destination binding hash"
            ),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn rejects_trailing_partial_vec() {
        let data = [3, 0, 0, 0, b'a', b'b'];
        assert_eq!(
            Envelope::parse(&data).map(|_| ()),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn accepts_clean_uninitialized_state() {
        let data = [0_u8; STATE_LEN];
        assert_eq!(require_clean_uninitialized_state(&data), Ok(()));
    }

    #[test]
    fn rejects_initialized_state_reinitialization() {
        let mut data = [0_u8; STATE_LEN];
        data[0..8].copy_from_slice(STATE_MAGIC);
        data[8] = STATE_VERSION;
        assert_eq!(
            require_clean_uninitialized_state(&data),
            Err(ProgramError::AccountAlreadyInitialized)
        );
    }

    #[test]
    fn rejects_dirty_uninitialized_state() {
        let mut data = [0_u8; STATE_LEN];
        data[24] = 1;
        assert_eq!(
            require_clean_uninitialized_state(&data),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn rejects_missing_native_recursive_verifier_config() {
        let mut data = [0_u8; STATE_LEN];
        data[0..8].copy_from_slice(STATE_MAGIC);
        data[8] = STATE_VERSION;

        assert_eq!(
            stored_native_verifier_program(&data),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn writes_and_reads_native_recursive_verifier_config() {
        let verifier_program = Pubkey::new_from_array([9; 32]);
        let mut data = [0_u8; STATE_LEN];
        data[0..8].copy_from_slice(STATE_MAGIC);
        data[8] = STATE_VERSION;

        write_verifier_config_state(&mut data, &verifier_program, &[4; 32], &[5; 32], 77)
            .expect("config write");

        assert_eq!(
            stored_native_verifier_program(&data).expect("verifier program"),
            verifier_program
        );
        assert_eq!(
            stored_verifier_material_hash(&data).expect("material hash"),
            [4; 32]
        );
        assert_eq!(
            stored_verifier_config_hash(&data).expect("config hash"),
            [5; 32]
        );
        assert_eq!(
            read_u64(
                &data[STATE_VERIFIER_CONFIGURED_SLOT_OFFSET
                    ..STATE_VERIFIER_CONFIGURED_SLOT_OFFSET + 8]
            )
            .expect("configured slot"),
            77
        );
        assert_eq!(data[STATE_VERIFIER_LOCKED_OFFSET], 1);
        assert_eq!(
            write_verifier_config_state(
                &mut data,
                &Pubkey::new_from_array([8; 32]),
                &[6; 32],
                &[7; 32],
                78,
            ),
            Err(ProgramError::AccountAlreadyInitialized)
        );
    }

    #[test]
    fn rejects_configured_but_unlocked_legacy_verifier_state() {
        let mut data = [0_u8; STATE_LEN];
        data[0..8].copy_from_slice(STATE_MAGIC);
        data[8] = STATE_VERSION;
        data[STATE_NATIVE_VERIFIER_PROGRAM_OFFSET..STATE_NATIVE_VERIFIER_PROGRAM_OFFSET + 32]
            .copy_from_slice(&[9; 32]);
        assert_eq!(
            stored_native_verifier_program(&data),
            Err(ProgramError::InvalidAccountData)
        );
        assert_eq!(
            write_verifier_config_state(
                &mut data,
                &Pubkey::new_from_array([8; 32]),
                &[6; 32],
                &[7; 32],
                78,
            ),
            Err(ProgramError::AccountAlreadyInitialized)
        );
    }

    #[test]
    fn builds_native_recursive_verifier_cpi_instruction() {
        let verifier_program = Pubkey::new_from_array([8; 32]);
        let payer = Pubkey::new_from_array([7; 32]);
        let state = Pubkey::new_from_array([6; 32]);
        let mint = Pubkey::new_from_array([5; 32]);
        let destination_token = Pubkey::new_from_array([4; 32]);
        let message_id = [3; 32];
        let args = SubmitArgs {
            proof_bytes: &[1, 2, 3],
            public_inputs: &[4, 5],
            bundle_bytes: &[6, 7, 8],
            statement_hash: &[9; 32],
            destination_binding_hash: &DESTINATION_BINDING_HASH,
            proof_context_hash: &[10; 32],
            amount: Some(42),
        };

        let ix = native_recursive_verifier_instruction(
            &verifier_program,
            &payer,
            &state,
            &mint,
            &destination_token,
            &args,
            42,
            &message_id,
            &[11; 32],
            &[12; 32],
        );
        let envelope = Envelope::parse(&ix.data).expect("cpi envelope");

        assert_eq!(ix.program_id, verifier_program);
        assert_eq!(ix.accounts.len(), 4);
        assert_eq!(ix.accounts[0].pubkey, payer);
        assert!(ix.accounts[0].is_signer);
        assert_eq!(ix.accounts[1].pubkey, state);
        assert_eq!(ix.accounts[2].pubkey, mint);
        assert_eq!(ix.accounts[3].pubkey, destination_token);
        assert_eq!(envelope.entrypoint, VERIFIER_ENTRYPOINT_VERIFY);
        assert_eq!(envelope.args[0], NATIVE_VERIFIER_CPI_MARKER);
        assert_eq!(envelope.args[1], &[1, 2, 3]);
        assert_eq!(envelope.args[7], &42_u64.to_le_bytes());
        assert_eq!(envelope.args[8], &[11; 32]);
        assert_eq!(envelope.args[9], &[12; 32]);
        assert_eq!(envelope.args[10], payer.as_ref());
        assert_eq!(envelope.args[11], state.as_ref());
        assert_eq!(envelope.args[12], message_id);
        assert_eq!(envelope.args[13], mint.as_ref());
        assert_eq!(envelope.args[14], destination_token.as_ref());
    }

    #[test]
    fn records_successful_mint_state() {
        let mut data = [0_u8; STATE_LEN];
        data[0..8].copy_from_slice(STATE_MAGIC);
        data[8] = STATE_VERSION;
        data[48..56].copy_from_slice(&3_u64.to_le_bytes());
        data[56..64].copy_from_slice(&99_u64.to_le_bytes());
        data[224..232].copy_from_slice(&10_u64.to_le_bytes());

        write_successful_mint_state(&mut data, 123, 7).expect("state update");

        assert_eq!(read_u64(&data[48..56]).expect("accepted count"), 4);
        assert_eq!(read_u64(&data[56..64]).expect("slot"), 123);
        assert_eq!(read_u64(&data[224..232]).expect("total minted"), 17);
    }

    #[test]
    fn rejects_zero_mint_state_update() {
        let mut data = [0_u8; STATE_LEN];
        data[0..8].copy_from_slice(STATE_MAGIC);
        data[8] = STATE_VERSION;

        assert_eq!(
            write_successful_mint_state(&mut data, 123, 0),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn canonical_transfer_binds_recipient_amount_and_message_id() {
        let recipient = Pubkey::new_unique();
        let (public_inputs, bundle, message_id) = canonical_transfer_fixture(&recipient, 42);
        let settlement =
            parse_canonical_transfer_settlement(&public_inputs, &bundle, &recipient, 42)
                .expect("canonical settlement");
        assert_eq!(settlement.message_id, message_id);

        assert_eq!(
            parse_canonical_transfer_settlement(&public_inputs, &bundle, &Pubkey::new_unique(), 42,),
            Err(ProgramError::InvalidInstructionData)
        );
        assert_eq!(
            parse_canonical_transfer_settlement(&public_inputs, &bundle, &recipient, 41),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn canonical_transfer_rejects_rehashed_asset_alias_codec_case_and_padding() {
        let recipient = Pubkey::new_unique();
        let (_, _, canonical_message_id) = canonical_transfer_fixture(&recipient, 42);
        let cases: &[(u8, &[u8], &str)] = &[
            (0, SCCP_XOR_ASSET_ID, "empty asset codec"),
            (
                SCCP_CODEC_SOLANA_BASE58,
                SCCP_XOR_ASSET_ID,
                "wrong asset codec",
            ),
            (6, SCCP_XOR_ASSET_ID, "SORA binary asset codec"),
            (SCCP_CODEC_TEXT_UTF8, b"xor#universal", "legacy asset alias"),
            (SCCP_CODEC_TEXT_UTF8, b"XOR", "case-folded asset alias"),
            (SCCP_CODEC_TEXT_UTF8, b" xor", "leading asset padding"),
            (SCCP_CODEC_TEXT_UTF8, b"xor ", "trailing asset padding"),
            (SCCP_CODEC_TEXT_UTF8, b"xor\0", "nul-padded asset id"),
            (
                SCCP_CODEC_TEXT_UTF8,
                b"x\xce\xbfr",
                "Unicode asset lookalike",
            ),
            (SCCP_CODEC_TEXT_UTF8, b"", "empty asset id"),
        ];

        for (asset_codec, asset_id, label) in cases {
            let mut bindings = canonical_transfer_bindings();
            bindings.asset_codec = *asset_codec;
            bindings.asset_id = *asset_id;
            assert_rehashed_transfer_binding_rejected(
                &recipient,
                42,
                &canonical_message_id,
                bindings,
                label,
            );
        }
    }

    #[test]
    fn canonical_transfer_rejects_rehashed_route_alias_codec_case_and_padding() {
        let recipient = Pubkey::new_unique();
        let (_, _, canonical_message_id) = canonical_transfer_fixture(&recipient, 42);
        let cases: &[(u8, &[u8], &str)] = &[
            (0, SCCP_TAIRA_SOL_XOR_ROUTE_ID, "empty route codec"),
            (
                SCCP_CODEC_SOLANA_BASE58,
                SCCP_TAIRA_SOL_XOR_ROUTE_ID,
                "wrong route codec",
            ),
            (6, SCCP_TAIRA_SOL_XOR_ROUTE_ID, "SORA binary route codec"),
            (SCCP_CODEC_TEXT_UTF8, b"nexus:sol:xor", "legacy route alias"),
            (
                SCCP_CODEC_TEXT_UTF8,
                b"taira-sol-xor",
                "punctuation route alias",
            ),
            (
                SCCP_CODEC_TEXT_UTF8,
                b"TAIRA_SOL_XOR",
                "case-folded route alias",
            ),
            (
                SCCP_CODEC_TEXT_UTF8,
                b" taira_sol_xor",
                "leading route padding",
            ),
            (
                SCCP_CODEC_TEXT_UTF8,
                b"taira_sol_xor ",
                "trailing route padding",
            ),
            (
                SCCP_CODEC_TEXT_UTF8,
                b"taira_sol_xor\0",
                "nul-padded route id",
            ),
            (SCCP_CODEC_TEXT_UTF8, b"", "empty route id"),
        ];

        for (route_codec, route_id, label) in cases {
            let mut bindings = canonical_transfer_bindings();
            bindings.route_codec = *route_codec;
            bindings.route_id = *route_id;
            assert_rehashed_transfer_binding_rejected(
                &recipient,
                42,
                &canonical_message_id,
                bindings,
                label,
            );
        }
    }

    #[test]
    fn canonical_transfer_rejects_rehashed_noncanonical_taira_senders() {
        let recipient = Pubkey::new_unique();
        let (_, _, canonical_message_id) = canonical_transfer_fixture(&recipient, 42);

        for (sender_codec, label) in [
            (0, "empty sender codec"),
            (SCCP_CODEC_SOLANA_BASE58, "wrong sender codec"),
            (6, "SORA binary sender codec"),
        ] {
            let mut wrong_codec = canonical_transfer_bindings();
            wrong_codec.sender_codec = sender_codec;
            assert_rehashed_transfer_binding_rejected(
                &recipient,
                42,
                &canonical_message_id,
                wrong_codec,
                label,
            );
        }

        let canonical_payload = CANONICAL_TAIRA_ACCOUNT_FIXTURE
            .strip_prefix(TAIRA_I105_SENTINEL)
            .expect("fixture uses TAIRA sentinel");
        let mut checksum_tampered = CANONICAL_TAIRA_ACCOUNT_FIXTURE.chars().collect::<Vec<_>>();
        *checksum_tampered
            .last_mut()
            .expect("canonical sender has a checksum") = '1';
        let invalid_senders = [
            b"testu-sender".to_vec(),
            b"alice@wonderland".to_vec(),
            b"".to_vec(),
            vec![0xff, 0xfe],
            format!(" {CANONICAL_TAIRA_ACCOUNT_FIXTURE}").into_bytes(),
            format!("{CANONICAL_TAIRA_ACCOUNT_FIXTURE} ").into_bytes(),
            format!("sora{canonical_payload}").into_bytes(),
            format!("n369{canonical_payload}").into_bytes(),
            format!("TEST{canonical_payload}").into_bytes(),
            format!("ｔｅｓｔ{canonical_payload}").into_bytes(),
            checksum_tampered
                .into_iter()
                .collect::<String>()
                .into_bytes(),
        ];
        for (index, sender) in invalid_senders.iter().enumerate() {
            let mut bindings = canonical_transfer_bindings();
            bindings.sender = sender;
            assert_rehashed_transfer_binding_rejected(
                &recipient,
                42,
                &canonical_message_id,
                bindings,
                &format!("noncanonical TAIRA sender {index}"),
            );
        }
    }

    #[test]
    fn canonical_transfer_rejects_forged_message_id_even_when_public_and_commitment_match() {
        let recipient = Pubkey::new_unique();
        let (mut public_inputs, mut bundle, _) = canonical_transfer_fixture(&recipient, 42);
        let forged = [0x99; 32];
        public_inputs[1..33].copy_from_slice(&forged);
        // Bundle prefix (version + root + vec length) is 37 bytes; message id
        // begins six bytes into the canonical commitment.
        bundle[43..75].copy_from_slice(&forged);
        assert_eq!(
            parse_canonical_transfer_settlement(&public_inputs, &bundle, &recipient, 42),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn canonical_transfer_rejects_commitment_public_input_mismatch() {
        let recipient = Pubkey::new_unique();
        let (public_inputs, mut bundle, _) = canonical_transfer_fixture(&recipient, 42);
        bundle[43] ^= 1;
        assert_eq!(
            parse_canonical_transfer_settlement(&public_inputs, &bundle, &recipient, 42),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn settlement_context_binds_payer_mint_destination_amount_and_message() {
        let statement = [1; 32];
        let destination_binding = DESTINATION_BINDING_HASH;
        let message = [2; 32];
        let mint = Pubkey::new_unique();
        let destination = Pubkey::new_unique();
        let payer = Pubkey::new_unique();
        let baseline = settlement_context_hash(
            &statement,
            &destination_binding,
            &message,
            &mint,
            &destination,
            &payer,
            42,
        );
        assert_ne!(
            baseline,
            settlement_context_hash(
                &statement,
                &destination_binding,
                &message,
                &Pubkey::new_unique(),
                &destination,
                &payer,
                42,
            )
        );
        assert_ne!(
            baseline,
            settlement_context_hash(
                &statement,
                &destination_binding,
                &message,
                &mint,
                &Pubkey::new_unique(),
                &payer,
                42,
            )
        );
        assert_ne!(
            baseline,
            settlement_context_hash(
                &statement,
                &destination_binding,
                &message,
                &mint,
                &destination,
                &Pubkey::new_unique(),
                42,
            )
        );
        assert_ne!(
            baseline,
            settlement_context_hash(
                &statement,
                &destination_binding,
                &message,
                &mint,
                &destination,
                &payer,
                43,
            )
        );
        let mut wrong_message = message;
        wrong_message[0] ^= 1;
        assert_ne!(
            baseline,
            settlement_context_hash(
                &statement,
                &destination_binding,
                &wrong_message,
                &mint,
                &destination,
                &payer,
                42,
            )
        );
    }

    #[test]
    fn token_account_binding_rejects_wrong_mint_owner_and_frozen_state() {
        let destination_key = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let mut lamports = 0;
        let mut data = [0_u8; 165];
        data[0..32].copy_from_slice(mint.as_ref());
        data[32..64].copy_from_slice(owner.as_ref());
        data[108] = 1;
        let account = AccountInfo::new(
            &destination_key,
            false,
            true,
            &mut lamports,
            &mut data,
            &TOKEN_PROGRAM_ID,
            false,
        );
        assert_eq!(
            require_spl_destination_token_account(&account, &mint, &owner),
            Ok(())
        );
        assert_eq!(
            require_spl_destination_token_account(&account, &Pubkey::new_unique(), &owner),
            Err(ProgramError::InvalidAccountData)
        );
        assert_eq!(
            require_spl_destination_token_account(&account, &mint, &Pubkey::new_unique()),
            Err(ProgramError::InvalidAccountData)
        );
        account.try_borrow_mut_data().expect("token data")[108] = 2;
        assert_eq!(
            require_spl_destination_token_account(&account, &mint, &owner),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn mint_binding_rejects_substituted_authority() {
        let mint_key = Pubkey::new_unique();
        let authority = Pubkey::new_unique();
        let mut lamports = 0;
        let mut data = [0_u8; 82];
        data[0..4].copy_from_slice(&1_u32.to_le_bytes());
        data[4..36].copy_from_slice(authority.as_ref());
        data[44] = XOR_SPL_DECIMALS;
        data[45] = 1;
        let account = AccountInfo::new(
            &mint_key,
            false,
            true,
            &mut lamports,
            &mut data,
            &TOKEN_PROGRAM_ID,
            false,
        );
        assert_eq!(require_spl_mint_binding(&account, &authority), Ok(()));
        assert_eq!(require_spl_source_route_mint(&account, &authority), Ok(()));
        assert_eq!(
            require_spl_mint_binding(&account, &Pubkey::new_unique()),
            Err(ProgramError::InvalidAccountData)
        );
        account.try_borrow_mut_data().expect("mint data")[44] ^= 1;
        assert_eq!(
            require_spl_source_route_mint(&account, &authority),
            Err(ProgramError::InvalidAccountData)
        );
        {
            let mut data = account.try_borrow_mut_data().expect("mint data");
            data[44] = XOR_SPL_DECIMALS;
            data[46..50].copy_from_slice(&1_u32.to_le_bytes());
        }
        assert_eq!(
            require_spl_source_route_mint(&account, &authority),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn message_receipt_is_one_time_and_records_exact_output_binding() {
        let message_id = [4; 32];
        let state = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let destination = Pubkey::new_unique();
        let mut data = [0_u8; RECEIPT_LEN];
        write_message_receipt_state(
            &mut data,
            250,
            &message_id,
            &state,
            &mint,
            &owner,
            &destination,
            42,
            77,
        )
        .expect("first settlement");
        assert_eq!(&data[0..8], RECEIPT_MAGIC);
        assert_eq!(
            &data[RECEIPT_MESSAGE_ID_OFFSET..RECEIPT_MESSAGE_ID_OFFSET + 32],
            &message_id
        );
        assert_eq!(
            read_u64(&data[RECEIPT_AMOUNT_OFFSET..RECEIPT_AMOUNT_OFFSET + 8]).expect("amount"),
            42
        );
        assert_eq!(
            write_message_receipt_state(
                &mut data,
                250,
                &message_id,
                &state,
                &mint,
                &owner,
                &destination,
                42,
                78,
            ),
            Err(ProgramError::AccountAlreadyInitialized)
        );
    }

    #[test]
    fn concurrent_duplicates_contend_on_the_same_message_receipt_pda() {
        let program = Pubkey::new_unique();
        let state = Pubkey::new_unique();
        let message = [8; 32];
        let first = Pubkey::find_program_address(
            &[MESSAGE_RECEIPT_SEED, state.as_ref(), &message],
            &program,
        );
        let second = Pubkey::find_program_address(
            &[MESSAGE_RECEIPT_SEED, state.as_ref(), &message],
            &program,
        );
        assert_eq!(first, second);
        let mut different_message = message;
        different_message[31] ^= 1;
        assert_ne!(
            first.0,
            Pubkey::find_program_address(
                &[MESSAGE_RECEIPT_SEED, state.as_ref(), &different_message],
                &program,
            )
            .0
        );
    }

    #[test]
    fn initialized_receipt_pda_rejects_exact_replay_before_verification() {
        let program = Pubkey::new_unique();
        let state = Pubkey::new_unique();
        let message = [8; 32];
        let (receipt_key, expected_bump) = Pubkey::find_program_address(
            &[MESSAGE_RECEIPT_SEED, state.as_ref(), &message],
            &program,
        );
        // A third party may pre-fund any PDA; that must not become a denial of
        // service as long as it is still a zero-data system account.
        let mut unused_lamports = 5;
        let mut unused_data = [];
        let unused = AccountInfo::new(
            &receipt_key,
            false,
            true,
            &mut unused_lamports,
            &mut unused_data,
            &system_program::ID,
            false,
        );
        assert_eq!(
            require_unused_message_receipt(&program, &state, &message, &unused),
            Ok(expected_bump)
        );

        let mut settled_lamports = 1;
        let mut settled_data = [0_u8; RECEIPT_LEN];
        settled_data[0..8].copy_from_slice(RECEIPT_MAGIC);
        settled_data[8] = RECEIPT_VERSION;
        let settled = AccountInfo::new(
            &receipt_key,
            false,
            true,
            &mut settled_lamports,
            &mut settled_data,
            &program,
            false,
        );
        assert_eq!(
            require_unused_message_receipt(&program, &state, &message, &settled),
            Err(ProgramError::AccountAlreadyInitialized)
        );
    }

    #[test]
    fn upgradeable_loader_parser_requires_finalized_programdata() {
        let program_data = Pubkey::new_unique();
        let mut program = [0_u8; 36];
        program[0..4].copy_from_slice(&2_u32.to_le_bytes());
        program[4..36].copy_from_slice(program_data.as_ref());
        assert_eq!(
            parse_upgradeable_program_data_address(&program).expect("program data"),
            program_data
        );

        let mut immutable = [0_u8; 45];
        immutable[0..4].copy_from_slice(&3_u32.to_le_bytes());
        immutable[12] = 0;
        assert_eq!(require_immutable_program_data(&immutable), Ok(()));
        immutable[12] = 1;
        assert_eq!(
            require_immutable_program_data(&immutable),
            Err(ProgramError::InvalidAccountData)
        );
        let mut wrong_variant = [0_u8; 45];
        wrong_variant[0..4].copy_from_slice(&2_u32.to_le_bytes());
        assert_eq!(
            require_immutable_program_data(&wrong_variant),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn builds_spl_token_mint_to_instruction() {
        let mint = Pubkey::new_from_array([1; 32]);
        let destination = Pubkey::new_from_array([2; 32]);
        let authority = Pubkey::new_from_array([3; 32]);
        let ix =
            spl_token_mint_to_instruction(&TOKEN_PROGRAM_ID, &mint, &destination, &authority, 42);

        assert_eq!(ix.program_id, TOKEN_PROGRAM_ID);
        assert_eq!(
            ix.data,
            [TOKEN_INSTRUCTION_MINT_TO, 42, 0, 0, 0, 0, 0, 0, 0]
        );
        assert_eq!(ix.accounts.len(), 3);
        assert_eq!(ix.accounts[0].pubkey, mint);
        assert!(ix.accounts[0].is_writable);
        assert_eq!(ix.accounts[1].pubkey, destination);
        assert!(ix.accounts[1].is_writable);
        assert_eq!(ix.accounts[2].pubkey, authority);
        assert!(ix.accounts[2].is_signer);
    }

    #[test]
    fn accepts_real_canonical_taira_i105_recipient() {
        let recipient = "testuﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB";
        assert_eq!(
            require_canonical_taira_i105_account(recipient.as_bytes(), "recipient"),
            Ok(())
        );
    }

    #[test]
    fn rejects_non_taira_alias_lookalike_and_whitespace_recipients() {
        let canonical = "testuﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB";
        let payload = canonical.strip_prefix("test").expect("test sentinel");
        for invalid in [
            format!("sora{payload}"),
            format!("n369{payload}"),
            format!("ｔｅｓｔ{payload}"),
            format!(" {canonical}"),
            format!("{canonical} "),
            "alice@wonderland".to_owned(),
            "testu-recipient".to_owned(),
        ] {
            assert_eq!(
                require_canonical_taira_i105_account(invalid.as_bytes(), "recipient"),
                Err(ProgramError::InvalidInstructionData),
                "must reject {invalid:?}"
            );
        }
    }

    #[test]
    fn rejects_i105_checksum_tampering_and_noncanonical_payloads() {
        let canonical = "testuﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB";
        let mut chars = canonical.chars().collect::<Vec<_>>();
        let last = chars.last_mut().expect("last checksum symbol");
        *last = if *last == '1' { '2' } else { '1' };
        let checksum_tampered = chars.into_iter().collect::<String>();
        assert_eq!(
            require_canonical_taira_i105_account(checksum_tampered.as_bytes(), "recipient"),
            Err(ProgramError::InvalidInstructionData)
        );

        for weak_key in ED25519_SMALL_ORDER_POINTS {
            let mut weak_payload = vec![
                I105_CURRENT_HEADER_SINGLE_KEY,
                I105_CONTROLLER_SINGLE_KEY_TAG,
                I105_CURVE_ED25519,
                ED25519_PUBLIC_KEY_LEN as u8,
            ];
            weak_payload.extend_from_slice(&weak_key);
            let weak_literal = encode_taira_i105_fixture(&weak_payload);
            assert_eq!(
                require_canonical_taira_i105_account(weak_literal.as_bytes(), "recipient"),
                Err(ProgramError::InvalidInstructionData)
            );
        }

        let mut noncanonical_y = vec![
            I105_CURRENT_HEADER_SINGLE_KEY,
            I105_CONTROLLER_SINGLE_KEY_TAG,
            I105_CURVE_ED25519,
            ED25519_PUBLIC_KEY_LEN as u8,
        ];
        noncanonical_y.extend_from_slice(&ED25519_FIELD_MODULUS);
        let noncanonical_literal = encode_taira_i105_fixture(&noncanonical_y);
        assert_eq!(
            require_canonical_taira_i105_account(noncanonical_literal.as_bytes(), "recipient"),
            Err(ProgramError::InvalidInstructionData)
        );

        let mut malformed_header = decode_taira_i105_fixture(canonical);
        malformed_header[0] ^= 0b0010_0000;
        let malformed_literal = encode_taira_i105_fixture(&malformed_header);
        assert_eq!(
            require_canonical_taira_i105_account(malformed_literal.as_bytes(), "recipient"),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn burn_nonce_requires_exact_positive_u64_bytes() {
        assert_eq!(
            parse_canonical_positive_burn_nonce(&1_u64.to_le_bytes()),
            Ok(1)
        );
        assert_eq!(
            parse_canonical_positive_burn_nonce(&u64::MAX.to_le_bytes()),
            Ok(u64::MAX)
        );
        for invalid in [
            Vec::new(),
            0_u64.to_le_bytes().to_vec(),
            b"1".to_vec(),
            vec![1; 7],
            vec![1; 9],
        ] {
            assert_eq!(
                parse_canonical_positive_burn_nonce(&invalid),
                Err(ProgramError::InvalidInstructionData)
            );
        }
    }

    #[test]
    fn burn_receipt_pda_prevents_nonce_reuse_and_substitution() {
        let program = Pubkey::new_unique();
        let state = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let nonce = 91_u64.to_le_bytes();
        let (receipt_key, bump) = Pubkey::find_program_address(
            &[BURN_RECEIPT_SEED, state.as_ref(), owner.as_ref(), &nonce],
            &program,
        );
        let mut unused_lamports = 1;
        let mut unused_data = [];
        let unused = AccountInfo::new(
            &receipt_key,
            false,
            true,
            &mut unused_lamports,
            &mut unused_data,
            &system_program::ID,
            false,
        );
        assert_eq!(
            require_unused_burn_receipt(&program, &state, &owner, &nonce, &unused),
            Ok(bump)
        );

        let mut settled_lamports = 1;
        let mut settled_data = [0_u8; BURN_RECEIPT_LEN];
        settled_data[0..8].copy_from_slice(BURN_RECEIPT_MAGIC);
        settled_data[8] = BURN_RECEIPT_VERSION;
        let settled = AccountInfo::new(
            &receipt_key,
            false,
            true,
            &mut settled_lamports,
            &mut settled_data,
            &program,
            false,
        );
        assert_eq!(
            require_unused_burn_receipt(&program, &state, &owner, &nonce, &settled),
            Err(ProgramError::AccountAlreadyInitialized)
        );

        let other_nonce = 92_u64.to_le_bytes();
        let other_owner = Pubkey::new_unique();
        let other_state = Pubkey::new_unique();
        assert_ne!(
            receipt_key,
            Pubkey::find_program_address(
                &[
                    BURN_RECEIPT_SEED,
                    state.as_ref(),
                    owner.as_ref(),
                    &other_nonce,
                ],
                &program,
            )
            .0
        );
        assert_ne!(
            receipt_key,
            Pubkey::find_program_address(
                &[
                    BURN_RECEIPT_SEED,
                    state.as_ref(),
                    other_owner.as_ref(),
                    &nonce,
                ],
                &program,
            )
            .0
        );
        assert_ne!(
            receipt_key,
            Pubkey::find_program_address(
                &[
                    BURN_RECEIPT_SEED,
                    other_state.as_ref(),
                    owner.as_ref(),
                    &nonce,
                ],
                &program,
            )
            .0
        );
    }

    #[test]
    fn source_burn_event_hash_binds_every_event_identity_field() {
        let program = Pubkey::new_unique();
        let state = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let source = Pubkey::new_unique();
        let recipient = "testuﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB".as_bytes();
        let baseline = source_burn_event_hash(
            &program, &state, &mint, &owner, &source, recipient, 42, 9, 77,
        )
        .expect("event hash");
        let changed = [
            source_burn_event_hash(
                &Pubkey::new_unique(),
                &state,
                &mint,
                &owner,
                &source,
                recipient,
                42,
                9,
                77,
            )
            .expect("program"),
            source_burn_event_hash(
                &program,
                &Pubkey::new_unique(),
                &mint,
                &owner,
                &source,
                recipient,
                42,
                9,
                77,
            )
            .expect("state"),
            source_burn_event_hash(
                &program,
                &state,
                &Pubkey::new_unique(),
                &owner,
                &source,
                recipient,
                42,
                9,
                77,
            )
            .expect("mint"),
            source_burn_event_hash(
                &program,
                &state,
                &mint,
                &Pubkey::new_unique(),
                &source,
                recipient,
                42,
                9,
                77,
            )
            .expect("owner"),
            source_burn_event_hash(
                &program,
                &state,
                &mint,
                &owner,
                &Pubkey::new_unique(),
                recipient,
                42,
                9,
                77,
            )
            .expect("source"),
            source_burn_event_hash(
                &program,
                &state,
                &mint,
                &owner,
                &source,
                b"different-recipient",
                42,
                9,
                77,
            )
            .expect("recipient"),
            source_burn_event_hash(
                &program, &state, &mint, &owner, &source, recipient, 43, 9, 77,
            )
            .expect("amount"),
            source_burn_event_hash(
                &program, &state, &mint, &owner, &source, recipient, 42, 10, 77,
            )
            .expect("nonce"),
            source_burn_event_hash(
                &program, &state, &mint, &owner, &source, recipient, 42, 9, 78,
            )
            .expect("slot"),
        ];
        for candidate in changed {
            assert_ne!(baseline, candidate);
        }
    }

    #[test]
    fn source_token_binding_rejects_substitution_and_insufficient_balance() {
        let source_key = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let mut lamports = 0;
        let mut data = [0_u8; 165];
        data[0..32].copy_from_slice(mint.as_ref());
        data[32..64].copy_from_slice(owner.as_ref());
        data[64..72].copy_from_slice(&100_u64.to_le_bytes());
        data[108] = 1;
        let source = AccountInfo::new(
            &source_key,
            false,
            true,
            &mut lamports,
            &mut data,
            &TOKEN_PROGRAM_ID,
            false,
        );
        assert_eq!(
            require_spl_source_token_account(&source, &mint, &owner, 100),
            Ok(())
        );
        assert_eq!(
            require_spl_source_token_account(&source, &Pubkey::new_unique(), &owner, 100),
            Err(ProgramError::InvalidAccountData)
        );
        assert_eq!(
            require_spl_source_token_account(&source, &mint, &Pubkey::new_unique(), 100),
            Err(ProgramError::InvalidAccountData)
        );
        assert_eq!(
            require_spl_source_token_account(&source, &mint, &owner, 101),
            Err(ProgramError::InsufficientFunds)
        );
        source.try_borrow_mut_data().expect("source data")[108] = 2;
        assert_eq!(
            require_spl_source_token_account(&source, &mint, &owner, 1),
            Err(ProgramError::InvalidAccountData)
        );
    }

    #[test]
    fn burn_receipt_records_exact_binding_once() {
        let state = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let source = Pubkey::new_unique();
        let recipient_hash = [7; 32];
        let event_hash = [8; 32];
        let mut data = [0_u8; BURN_RECEIPT_LEN];
        write_burn_receipt_state(
            &mut data,
            250,
            &state,
            &mint,
            &owner,
            &source,
            &recipient_hash,
            42,
            9,
            77,
            &event_hash,
        )
        .expect("first burn receipt");
        assert_eq!(&data[0..8], BURN_RECEIPT_MAGIC);
        assert_eq!(
            &data[BURN_RECEIPT_RECIPIENT_HASH_OFFSET..BURN_RECEIPT_RECIPIENT_HASH_OFFSET + 32],
            &recipient_hash
        );
        assert_eq!(
            read_u64(&data[BURN_RECEIPT_NONCE_OFFSET..BURN_RECEIPT_NONCE_OFFSET + 8])
                .expect("nonce"),
            9
        );
        assert_eq!(
            &data[BURN_RECEIPT_EVENT_HASH_OFFSET..BURN_RECEIPT_EVENT_HASH_OFFSET + 32],
            &event_hash
        );
        assert_eq!(
            write_burn_receipt_state(
                &mut data,
                250,
                &state,
                &mint,
                &owner,
                &source,
                &recipient_hash,
                42,
                9,
                78,
                &event_hash,
            ),
            Err(ProgramError::AccountAlreadyInitialized)
        );
    }

    #[test]
    fn burn_state_update_is_checked_and_atomic_on_overflow() {
        let mut data = [0_u8; STATE_LEN];
        data[0..8].copy_from_slice(STATE_MAGIC);
        data[8] = STATE_VERSION;
        data[STATE_TOTAL_BURNED_OFFSET..STATE_TOTAL_BURNED_OFFSET + 8]
            .copy_from_slice(&10_u64.to_le_bytes());
        write_successful_burn_state(&mut data, 77, 5, &[9; 32]).expect("burn state");
        assert_eq!(
            read_u64(&data[STATE_TOTAL_BURNED_OFFSET..STATE_TOTAL_BURNED_OFFSET + 8])
                .expect("total"),
            15
        );
        assert_eq!(
            &data[STATE_LAST_BURN_HASH_OFFSET..STATE_LAST_BURN_HASH_OFFSET + 32],
            &[9; 32]
        );

        data[STATE_TOTAL_BURNED_OFFSET..STATE_TOTAL_BURNED_OFFSET + 8]
            .copy_from_slice(&u64::MAX.to_le_bytes());
        let before = data;
        assert_eq!(
            write_successful_burn_state(&mut data, 78, 1, &[8; 32]),
            Err(ProgramError::ArithmeticOverflow)
        );
        assert_eq!(data, before);
    }

    #[test]
    fn builds_spl_token_burn_instruction() {
        let source = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let ix = spl_token_burn_instruction(&TOKEN_PROGRAM_ID, &source, &mint, &owner, 42);
        assert_eq!(ix.program_id, TOKEN_PROGRAM_ID);
        assert_eq!(ix.data, [TOKEN_INSTRUCTION_BURN, 42, 0, 0, 0, 0, 0, 0, 0]);
        assert_eq!(ix.accounts.len(), 3);
        assert_eq!(ix.accounts[0], AccountMeta::new(source, false));
        assert_eq!(ix.accounts[1], AccountMeta::new(mint, false));
        assert_eq!(ix.accounts[2], AccountMeta::new_readonly(owner, true));
    }

    fn decode_taira_i105_fixture(literal: &str) -> Vec<u8> {
        let payload = literal.strip_prefix(TAIRA_I105_SENTINEL).expect("sentinel");
        let digits = i105_payload_digits(payload).expect("digits");
        decode_base_105(&digits[..digits.len() - I105_CHECKSUM_LEN]).expect("canonical bytes")
    }

    fn encode_taira_i105_fixture(canonical: &[u8]) -> String {
        let mut digits = encode_base_105(canonical).expect("base105");
        digits.extend(i105_checksum_digits(canonical));
        let mut literal = TAIRA_I105_SENTINEL.to_owned();
        for digit in digits {
            literal.push(i105_symbol_for_fixture(digit));
        }
        literal
    }

    fn i105_symbol_for_fixture(digit: u8) -> char {
        const ALPHABET: [char; 105] = [
            '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
            'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'a',
            'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'm', 'n', 'o', 'p', 'q', 'r', 's',
            't', 'u', 'v', 'w', 'x', 'y', 'z', 'ｲ', 'ﾛ', 'ﾊ', 'ﾆ', 'ﾎ', 'ﾍ', 'ﾄ', 'ﾁ', 'ﾘ', 'ﾇ',
            'ﾙ', 'ｦ', 'ﾜ', 'ｶ', 'ﾖ', 'ﾀ', 'ﾚ', 'ｿ', 'ﾂ', 'ﾈ', 'ﾅ', 'ﾗ', 'ﾑ', 'ｳ', 'ヰ', 'ﾉ', 'ｵ',
            'ｸ', 'ﾔ', 'ﾏ', 'ｹ', 'ﾌ', 'ｺ', 'ｴ', 'ﾃ', 'ｱ', 'ｻ', 'ｷ', 'ﾕ', 'ﾒ', 'ﾐ', 'ｼ', 'ヱ', 'ﾋ',
            'ﾓ', 'ｾ', 'ｽ',
        ];
        ALPHABET[usize::from(digit)]
    }
}
