//! Fail-closed native recursive verifier CPI target for TAIRA Solana SCCP.
//!
//! The destination bridge invokes this program after it has validated the SCCP
//! envelope shape and before it mints SPL XOR. This staging verifier validates
//! the CPI envelope surface and then rejects every proof until governed native
//! recursive verifier material is deployed. The CPI surface also binds the
//! canonical message id, payer/recipient, mint, destination token account, and
//! amount into a settlement context so a production verifier cannot approve a
//! proof for different mint outputs.

#![allow(unexpected_cfgs)]

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    hash::hashv,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

entrypoint!(process_instruction);

const ENTRYPOINT_VERIFY: &[u8] = b"verify_sccp_message_proof";
const NATIVE_VERIFIER_CPI_MARKER: &[u8] = b"SCCP_SOLANA_NATIVE_RECURSIVE_VERIFIER_CPI_V1";
const SETTLEMENT_CONTEXT_PREFIX: &[u8] = b"sccp:solana:settlement:v1";
const FAIL_CLOSED_LOG: &str =
    "SCCP Solana native recursive verifier governed material is not linked";
const EXPECTED_ARG_COUNT: usize = 15;
const MAX_PROOF_BYTES: usize = 64 * 1024;
const MAX_PUBLIC_INPUT_BYTES: usize = 8 * 1024;
const MAX_BUNDLE_BYTES: usize = 64 * 1024;

pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let mut account_iter = accounts.iter();
    let payer = next_account_info(&mut account_iter)?;
    let state = next_account_info(&mut account_iter)?;
    let mint = next_account_info(&mut account_iter)?;
    let destination_token = next_account_info(&mut account_iter)?;
    if !payer.is_signer {
        msg!("SCCP Solana native verifier payer signer is missing");
        return Err(ProgramError::MissingRequiredSignature);
    }

    let envelope = Envelope::parse(instruction_data)?;
    if envelope.entrypoint != ENTRYPOINT_VERIFY {
        msg!("unsupported SCCP Solana native verifier entrypoint");
        return Err(ProgramError::InvalidInstructionData);
    }
    if envelope.args.len() != EXPECTED_ARG_COUNT {
        msg!("SCCP Solana native verifier envelope has wrong arity");
        return Err(ProgramError::InvalidInstructionData);
    }
    if envelope.args[0] != NATIVE_VERIFIER_CPI_MARKER {
        msg!("SCCP Solana native verifier CPI marker mismatch");
        return Err(ProgramError::InvalidInstructionData);
    }
    require_non_empty_bounded(envelope.args[1], MAX_PROOF_BYTES, "proof bytes")?;
    require_non_empty_bounded(envelope.args[2], MAX_PUBLIC_INPUT_BYTES, "public inputs")?;
    require_non_empty_bounded(envelope.args[3], MAX_BUNDLE_BYTES, "bundle bytes")?;
    require_hash(envelope.args[4], "statement hash")?;
    require_hash(envelope.args[5], "destination binding hash")?;
    require_hash(envelope.args[6], "proof context hash")?;
    let amount = read_u64(envelope.args[7], "amount")?;
    if amount == 0 {
        msg!("SCCP Solana native verifier amount must be positive");
        return Err(ProgramError::InvalidInstructionData);
    }
    require_hash(envelope.args[8], "verifier material hash")?;
    require_hash(envelope.args[9], "verifier config hash")?;
    validate_settlement_binding(
        &envelope,
        payer.key,
        state.key,
        mint.key,
        destination_token.key,
    )?;

    msg!("{}", FAIL_CLOSED_LOG);
    Err(ProgramError::InvalidInstructionData)
}

fn validate_settlement_binding(
    envelope: &Envelope,
    payer: &Pubkey,
    state: &Pubkey,
    mint: &Pubkey,
    destination_token: &Pubkey,
) -> ProgramResult {
    if envelope.args.len() != EXPECTED_ARG_COUNT {
        return Err(ProgramError::InvalidInstructionData);
    }
    require_pubkey(envelope.args[10], "payer")?;
    require_pubkey(envelope.args[11], "state")?;
    require_hash(envelope.args[12], "message id")?;
    require_pubkey(envelope.args[13], "mint")?;
    require_pubkey(envelope.args[14], "destination token")?;
    require_bytes_equal(envelope.args[10], payer.as_ref(), "payer")?;
    require_bytes_equal(envelope.args[11], state.as_ref(), "state")?;
    require_bytes_equal(envelope.args[13], mint.as_ref(), "mint")?;
    require_bytes_equal(
        envelope.args[14],
        destination_token.as_ref(),
        "destination token",
    )?;
    if envelope.args[2].len() != 141
        || envelope.args[2][0] != 1
        || envelope.args[2].get(1..33) != Some(envelope.args[12])
    {
        msg!("SCCP Solana native verifier public message id mismatch");
        return Err(ProgramError::InvalidInstructionData);
    }
    let expected_context = settlement_context_hash(
        envelope.args[4],
        envelope.args[5],
        envelope.args[12],
        envelope.args[13],
        envelope.args[14],
        envelope.args[10],
        envelope.args[7],
    );
    require_bytes_equal(
        envelope.args[6],
        &expected_context,
        "settlement proof context",
    )
}

fn settlement_context_hash(
    statement_hash: &[u8],
    destination_binding_hash: &[u8],
    message_id: &[u8],
    mint: &[u8],
    destination_token: &[u8],
    payer: &[u8],
    amount_bytes: &[u8],
) -> [u8; 32] {
    hashv(&[
        SETTLEMENT_CONTEXT_PREFIX,
        statement_hash,
        destination_binding_hash,
        message_id,
        mint,
        destination_token,
        payer,
        amount_bytes,
    ])
    .to_bytes()
}

fn require_non_empty_bounded(value: &[u8], max_len: usize, label: &str) -> ProgramResult {
    if value.is_empty() || value.iter().all(|byte| *byte == 0) || value.len() > max_len {
        msg!("invalid SCCP Solana native verifier {}", label);
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(())
}

fn require_hash(value: &[u8], label: &str) -> ProgramResult {
    if value.len() != 32 || value.iter().all(|byte| *byte == 0) {
        msg!("invalid SCCP Solana native verifier {}", label);
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(())
}

fn require_pubkey(value: &[u8], label: &str) -> ProgramResult {
    if value.len() != 32 || value.iter().all(|byte| *byte == 0) {
        msg!("invalid SCCP Solana native verifier {} pubkey", label);
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(())
}

fn require_bytes_equal(value: &[u8], expected: &[u8], label: &str) -> ProgramResult {
    if value != expected {
        msg!("SCCP Solana native verifier {} mismatch", label);
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

fn read_u64(input: &[u8], label: &str) -> Result<u64, ProgramError> {
    if input.len() != 8 {
        msg!(
            "SCCP Solana native verifier {} must be u64 little-endian",
            label
        );
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(u64::from_le_bytes(
        input
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    ))
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
}

#[cfg(test)]
mod tests {
    use super::*;

    fn push_vec(out: &mut Vec<u8>, bytes: &[u8]) {
        out.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
        out.extend_from_slice(bytes);
    }

    fn valid_envelope() -> Vec<u8> {
        let statement = [1; 32];
        let destination_binding = [2; 32];
        let amount = 42_u64.to_le_bytes();
        let payer = [6; 32];
        let state = [7; 32];
        let message_id = [8; 32];
        let mint = [9; 32];
        let destination_token = [10; 32];
        let context = settlement_context_hash(
            &statement,
            &destination_binding,
            &message_id,
            &mint,
            &destination_token,
            &payer,
            &amount,
        );
        let mut public_inputs = vec![0_u8; 141];
        public_inputs[0] = 1;
        public_inputs[1..33].copy_from_slice(&message_id);
        let mut data = Vec::new();
        push_vec(&mut data, ENTRYPOINT_VERIFY);
        push_vec(&mut data, NATIVE_VERIFIER_CPI_MARKER);
        push_vec(&mut data, &[1, 2, 3]);
        push_vec(&mut data, &public_inputs);
        push_vec(&mut data, &[7, 8, 9]);
        push_vec(&mut data, &statement);
        push_vec(&mut data, &destination_binding);
        push_vec(&mut data, &context);
        push_vec(&mut data, &amount);
        push_vec(&mut data, &[4; 32]);
        push_vec(&mut data, &[5; 32]);
        push_vec(&mut data, &payer);
        push_vec(&mut data, &state);
        push_vec(&mut data, &message_id);
        push_vec(&mut data, &mint);
        push_vec(&mut data, &destination_token);
        data
    }

    #[test]
    fn parses_valid_cpi_envelope() {
        let data = valid_envelope();
        let envelope = Envelope::parse(&data).expect("valid envelope");
        assert_eq!(envelope.entrypoint, ENTRYPOINT_VERIFY);
        assert_eq!(envelope.args.len(), EXPECTED_ARG_COUNT);
        assert_eq!(envelope.args[0], NATIVE_VERIFIER_CPI_MARKER);
        assert_eq!(read_u64(envelope.args[7], "amount").expect("amount"), 42);
        assert_eq!(
            validate_settlement_binding(
                &envelope,
                &Pubkey::new_from_array([6; 32]),
                &Pubkey::new_from_array([7; 32]),
                &Pubkey::new_from_array([9; 32]),
                &Pubkey::new_from_array([10; 32]),
            ),
            Ok(())
        );
    }

    #[test]
    fn rejects_substituted_outer_accounts() {
        let data = valid_envelope();
        let envelope = Envelope::parse(&data).expect("valid envelope");
        let payer = Pubkey::new_from_array([6; 32]);
        let state = Pubkey::new_from_array([7; 32]);
        let mint = Pubkey::new_from_array([9; 32]);
        let destination = Pubkey::new_from_array([10; 32]);
        assert_eq!(
            validate_settlement_binding(
                &envelope,
                &Pubkey::new_unique(),
                &state,
                &mint,
                &destination,
            ),
            Err(ProgramError::InvalidInstructionData)
        );
        assert_eq!(
            validate_settlement_binding(
                &envelope,
                &payer,
                &state,
                &Pubkey::new_unique(),
                &destination,
            ),
            Err(ProgramError::InvalidInstructionData)
        );
        assert_eq!(
            validate_settlement_binding(&envelope, &payer, &state, &mint, &Pubkey::new_unique(),),
            Err(ProgramError::InvalidInstructionData)
        );
    }

    #[test]
    fn settlement_context_changes_for_every_output_field() {
        let baseline = settlement_context_hash(
            &[1; 32],
            &[2; 32],
            &[3; 32],
            &[4; 32],
            &[5; 32],
            &[6; 32],
            &42_u64.to_le_bytes(),
        );
        assert_ne!(
            baseline,
            settlement_context_hash(
                &[1; 32],
                &[2; 32],
                &[9; 32],
                &[4; 32],
                &[5; 32],
                &[6; 32],
                &42_u64.to_le_bytes(),
            )
        );
        assert_ne!(
            baseline,
            settlement_context_hash(
                &[1; 32],
                &[2; 32],
                &[3; 32],
                &[9; 32],
                &[5; 32],
                &[6; 32],
                &42_u64.to_le_bytes(),
            )
        );
        assert_ne!(
            baseline,
            settlement_context_hash(
                &[1; 32],
                &[2; 32],
                &[3; 32],
                &[4; 32],
                &[9; 32],
                &[6; 32],
                &42_u64.to_le_bytes(),
            )
        );
        assert_ne!(
            baseline,
            settlement_context_hash(
                &[1; 32],
                &[2; 32],
                &[3; 32],
                &[4; 32],
                &[5; 32],
                &[9; 32],
                &42_u64.to_le_bytes(),
            )
        );
        assert_ne!(
            baseline,
            settlement_context_hash(
                &[1; 32],
                &[2; 32],
                &[3; 32],
                &[4; 32],
                &[5; 32],
                &[6; 32],
                &43_u64.to_le_bytes(),
            )
        );
    }

    #[test]
    fn rejects_bad_marker() {
        let mut data = Vec::new();
        push_vec(&mut data, ENTRYPOINT_VERIFY);
        push_vec(&mut data, b"wrong");
        for _ in 1..EXPECTED_ARG_COUNT {
            push_vec(&mut data, &[1; 32]);
        }
        let envelope = Envelope::parse(&data).expect("valid envelope shape");
        assert_ne!(envelope.args[0], NATIVE_VERIFIER_CPI_MARKER);
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
    fn accepts_hash_shape() {
        assert_eq!(require_hash(&[1; 32], "hash"), Ok(()));
    }

    #[test]
    fn rejects_zero_hash() {
        assert_eq!(
            require_hash(&[0; 32], "hash"),
            Err(ProgramError::InvalidInstructionData)
        );
    }
}
