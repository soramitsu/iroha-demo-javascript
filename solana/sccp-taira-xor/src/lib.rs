//! Solana SCCP verifier surface for the TAIRA XOR testnet route.
//!
//! The program accepts the `borsh_instruction_v1` envelope emitted by the
//! Iroha SCCP SDK for the `submit_sccp_message_proof` entrypoint. It validates
//! the envelope shape, fixed-width proof context fields, signer, and
//! program-owned state account, then records a hash of the accepted submission.
//! When the proof package carries an optional amount argument and the caller
//! supplies SPL Token accounts, the program mints TAIRA-backed XOR from a
//! program-derived mint authority. The reverse `burn_to_taira` entrypoint burns
//! the same SPL token and records the source event hash used by TAIRA
//! settlement tooling.

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    hash::hashv,
    instruction::{AccountMeta, Instruction},
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::Sysvar,
};

entrypoint!(process_instruction);

const STATE_MAGIC: &[u8; 8] = b"SCCPSOL1";
const STATE_VERSION: u8 = 1;
const STATE_LEN: usize = 272;
const ENTRYPOINT_INITIALIZE: &[u8] = b"initialize_sccp_state";
const ENTRYPOINT_SUBMIT: &[u8] = b"submit_sccp_message_proof";
const ENTRYPOINT_BURN: &[u8] = b"burn_to_taira";
const MINT_AUTHORITY_SEED: &[u8] = b"sccp-taira-xor-mint-authority";
const TOKEN_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172, 28, 180, 133, 237,
    95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169,
]);
const TOKEN_INSTRUCTION_MINT_TO: u8 = 7;
const TOKEN_INSTRUCTION_BURN: u8 = 8;
const MAX_PROOF_BYTES: usize = 64 * 1024;
const MAX_PUBLIC_INPUT_BYTES: usize = 8 * 1024;
const MAX_BUNDLE_BYTES: usize = 64 * 1024;
const MAX_TAIRA_RECIPIENT_BYTES: usize = 128;
const MAX_BURN_NONCE_BYTES: usize = 64;

/// Program entrypoint.
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let envelope = Envelope::parse(instruction_data)?;
    match envelope.entrypoint {
        ENTRYPOINT_INITIALIZE => initialize_state(program_id, accounts),
        ENTRYPOINT_SUBMIT => submit_message_proof(program_id, accounts, &envelope),
        ENTRYPOINT_BURN => burn_to_taira(program_id, accounts, &envelope),
        _ => {
            msg!("unsupported SCCP Solana entrypoint");
            Err(ProgramError::InvalidInstructionData)
        }
    }
}

fn initialize_state(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
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
    data.fill(0);
    data[0..8].copy_from_slice(STATE_MAGIC);
    data[8] = STATE_VERSION;
    data[16..48].copy_from_slice(authority.key.as_ref());
    data[56..64].copy_from_slice(&Clock::get()?.slot.to_le_bytes());
    data[192..224].copy_from_slice(mint.key.as_ref());
    msg!("initialized SCCP Solana state");
    Ok(())
}

fn submit_message_proof(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    envelope: &Envelope,
) -> ProgramResult {
    let mut account_iter = accounts.iter();
    let payer = next_account_info(&mut account_iter)?;
    let state = next_account_info(&mut account_iter)?;
    require_signer(payer)?;
    require_writable_state(program_id, state)?;

    let args = envelope.submit_args()?;
    require_non_empty_bounded(args.proof_bytes, MAX_PROOF_BYTES, "proof bytes")?;
    require_non_empty_bounded(args.public_inputs, MAX_PUBLIC_INPUT_BYTES, "public inputs")?;
    require_non_empty_bounded(args.bundle_bytes, MAX_BUNDLE_BYTES, "bundle bytes")?;
    require_hash(args.statement_hash, "statement hash")?;
    require_hash(args.destination_binding_hash, "destination binding hash")?;
    require_hash(args.proof_context_hash, "proof context hash")?;

    let mut data = state.try_borrow_mut_data()?;
    if data.len() < STATE_LEN || &data[0..8] != STATE_MAGIC || data[8] != STATE_VERSION {
        msg!("SCCP Solana state is not initialized");
        return Err(ProgramError::UninitializedAccount);
    }

    let count = read_u64(&data[48..56])?.saturating_add(1);
    let slot = Clock::get()?.slot;
    let accepted_hash = hashv(&[
        ENTRYPOINT_SUBMIT,
        payer.key.as_ref(),
        args.proof_bytes,
        args.public_inputs,
        args.bundle_bytes,
        args.statement_hash,
        args.destination_binding_hash,
        args.proof_context_hash,
    ]);

    data[48..56].copy_from_slice(&count.to_le_bytes());
    data[56..64].copy_from_slice(&slot.to_le_bytes());
    data[64..96].copy_from_slice(accepted_hash.as_ref());
    data[96..128].copy_from_slice(args.statement_hash);
    data[128..160].copy_from_slice(args.destination_binding_hash);
    data[160..192].copy_from_slice(args.proof_context_hash);

    if let Some(amount) = args.amount {
        drop(data);
        let mint = next_account_info(&mut account_iter)?;
        let destination_token = next_account_info(&mut account_iter)?;
        let mint_authority_info = next_account_info(&mut account_iter)?;
        let token_program = next_account_info(&mut account_iter)?;
        let state_data = state.try_borrow_data()?;
        let stored_mint_key = stored_mint(&state_data)?;
        drop(state_data);
        mint_verified_xor(
            program_id,
            state.key,
            &stored_mint_key,
            mint,
            destination_token,
            mint_authority_info,
            token_program,
            amount,
        )?;
        let mut data = state.try_borrow_mut_data()?;
        let total_minted = read_u64(&data[224..232])?.saturating_add(amount);
        data[224..232].copy_from_slice(&total_minted.to_le_bytes());
    }

    msg!("accepted SCCP Solana proof envelope");
    Ok(())
}

fn mint_verified_xor<'a>(
    program_id: &Pubkey,
    state_key: &Pubkey,
    stored_mint_key: &Pubkey,
    mint: &AccountInfo<'a>,
    destination_token: &AccountInfo<'a>,
    mint_authority_info: &AccountInfo<'a>,
    token_program: &AccountInfo<'a>,
    amount: u64,
) -> ProgramResult {
    if amount == 0 {
        msg!("mint amount must be positive");
        return Err(ProgramError::InvalidInstructionData);
    }
    require_key(mint.key, stored_mint_key, "mint")?;
    require_key(token_program.key, &TOKEN_PROGRAM_ID, "token program")?;
    let (expected_authority, bump) = mint_authority(program_id, state_key);
    require_key(
        mint_authority_info.key,
        &expected_authority,
        "mint authority PDA",
    )?;
    let seeds = &[MINT_AUTHORITY_SEED, state_key.as_ref(), &[bump]];
    let ix = spl_token_mint_to_instruction(
        token_program.key,
        mint.key,
        destination_token.key,
        mint_authority_info.key,
        amount,
    );
    invoke_signed(
        &ix,
        &[
            mint.clone(),
            destination_token.clone(),
            mint_authority_info.clone(),
            token_program.clone(),
        ],
        &[seeds],
    )
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
    require_signer(owner)?;
    require_writable_state(program_id, state)?;
    let args = envelope.burn_args()?;
    let amount = args.amount;
    if amount == 0 {
        msg!("burn amount must be positive");
        return Err(ProgramError::InvalidInstructionData);
    }
    require_non_empty_bounded(
        args.taira_recipient,
        MAX_TAIRA_RECIPIENT_BYTES,
        "TAIRA recipient",
    )?;
    require_non_empty_bounded(args.nonce, MAX_BURN_NONCE_BYTES, "burn nonce")?;
    {
        let data = state.try_borrow_data()?;
        require_key(mint.key, &stored_mint(&data)?, "mint")?;
    }
    require_key(token_program.key, &TOKEN_PROGRAM_ID, "token program")?;
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

    let slot = Clock::get()?.slot;
    let burn_hash = hashv(&[
        ENTRYPOINT_BURN,
        owner.key.as_ref(),
        mint.key.as_ref(),
        &amount.to_le_bytes(),
        args.taira_recipient,
        args.nonce,
    ]);
    let mut data = state.try_borrow_mut_data()?;
    let total_burned = read_u64(&data[232..240])?.saturating_add(amount);
    data[56..64].copy_from_slice(&slot.to_le_bytes());
    data[232..240].copy_from_slice(&total_burned.to_le_bytes());
    data[240..272].copy_from_slice(burn_hash.as_ref());
    msg!("burned SCCP Solana XOR for TAIRA settlement");
    Ok(())
}

fn require_signer(account: &AccountInfo) -> ProgramResult {
    if !account.is_signer {
        msg!("required signer is missing");
        return Err(ProgramError::MissingRequiredSignature);
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

fn require_key(actual: &Pubkey, expected: &Pubkey, label: &str) -> ProgramResult {
    if actual != expected {
        msg!("SCCP Solana {} account mismatch", label);
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(())
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
    Ok(Pubkey::new_from_array(
        data[192..224]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    ))
}

pub fn mint_authority(program_id: &Pubkey, state: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[MINT_AUTHORITY_SEED, state.as_ref()], program_id)
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
        if self.args.len() != 6 && self.args.len() != 7 {
            msg!("SCCP Solana submit envelope must carry six or seven arguments");
            return Err(ProgramError::InvalidInstructionData);
        }
        Ok(SubmitArgs {
            proof_bytes: self.args[0],
            public_inputs: self.args[1],
            bundle_bytes: self.args[2],
            statement_hash: self.args[3],
            destination_binding_hash: self.args[4],
            proof_context_hash: self.args[5],
            amount: if self.args.len() == 7 {
                Some(read_amount(self.args[6], "mint amount")?)
            } else {
                None
            },
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

struct BurnArgs<'a> {
    amount: u64,
    taira_recipient: &'a [u8],
    nonce: &'a [u8],
}

#[cfg(test)]
mod tests {
    use super::*;

    fn push_vec(out: &mut Vec<u8>, bytes: &[u8]) {
        out.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
        out.extend_from_slice(bytes);
    }

    #[test]
    fn parses_submit_envelope() {
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
        let args = envelope.submit_args().expect("submit args");
        assert_eq!(args.proof_bytes, &[1, 2, 3]);
        assert_eq!(args.proof_context_hash, &[3; 32]);
        assert_eq!(args.amount, None);
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
    fn parses_burn_envelope() {
        let mut data = Vec::new();
        push_vec(&mut data, ENTRYPOINT_BURN);
        push_vec(&mut data, &9_u64.to_le_bytes());
        push_vec(&mut data, b"testu-recipient");
        push_vec(&mut data, b"nonce-1");

        let envelope = Envelope::parse(&data).expect("valid envelope");
        let args = envelope.burn_args().expect("burn args");
        assert_eq!(args.amount, 9);
        assert_eq!(args.taira_recipient, b"testu-recipient");
        assert_eq!(args.nonce, b"nonce-1");
    }

    #[test]
    fn rejects_short_hash() {
        assert_eq!(
            require_hash(&[1; 31], "statement hash"),
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
}
