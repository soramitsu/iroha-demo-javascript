use solana_account::Account;
use solana_instruction_error::InstructionError;
use solana_keypair::Keypair;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    hash::hashv,
    instruction::{AccountMeta, Instruction},
    keccak::hashv as keccak_hashv,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
};
use solana_program_test::{processor, ProgramTest, ProgramTestContext};
use solana_sdk_ids::sysvar::{clock::ID as CLOCK_SYSVAR_ID, rent::ID as RENT_SYSVAR_ID};
use solana_signer::Signer;
use solana_system_interface::program as system_program;
use solana_transaction::Transaction;
use solana_transaction_error::TransactionError;
use std::{str::FromStr, sync::Once};

const PROGRAM_ID: Pubkey = Pubkey::new_from_array([0x41; 32]);
const ACCEPT_VERIFIER_ID: Pubkey = Pubkey::new_from_array([0x42; 32]);
const REJECT_VERIFIER_ID: Pubkey = Pubkey::new_from_array([0x43; 32]);
const TOKEN_PROGRAM_ID_TEXT: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const STATE_LEN: usize = 272;
const STATE_MAGIC: &[u8; 8] = b"SCCPSOL1";
const STATE_VERSION: u8 = 1;
const STATE_VERIFIER_LOCKED_OFFSET: usize = 9;
const STATE_ACCEPTED_COUNT_OFFSET: usize = 48;
const STATE_NATIVE_VERIFIER_PROGRAM_OFFSET: usize = 64;
const STATE_VERIFIER_MATERIAL_HASH_OFFSET: usize = 96;
const STATE_VERIFIER_CONFIG_HASH_OFFSET: usize = 128;
const STATE_MINT_OFFSET: usize = 192;
const STATE_TOTAL_MINTED_OFFSET: usize = 224;
const STATE_TOTAL_BURNED_OFFSET: usize = 232;
const STATE_LAST_BURN_HASH_OFFSET: usize = 240;
const RECEIPT_LEN: usize = 192;
const BURN_RECEIPT_LEN: usize = 232;
const MINT_AUTHORITY_SEED: &[u8] = b"sccp-taira-xor-mint-authority";
const MESSAGE_RECEIPT_SEED: &[u8] = b"sccp-message-receipt";
const BURN_RECEIPT_SEED: &[u8] = b"sccp-source-burn-receipt";
const ENTRYPOINT_SUBMIT: &[u8] = b"submit_sccp_message_proof";
const ENTRYPOINT_BURN: &[u8] = b"burn_to_taira";
const VERIFIER_ENTRYPOINT_VERIFY: &[u8] = b"verify_sccp_message_proof";
const NATIVE_VERIFIER_CPI_MARKER: &[u8] = b"SCCP_SOLANA_NATIVE_RECURSIVE_VERIFIER_CPI_V1";
const SETTLEMENT_CONTEXT_PREFIX: &[u8] = b"sccp:solana:settlement:v1";
const TRANSFER_MESSAGE_PREFIX: &[u8] = b"sccp:transfer:v1";
const DESTINATION_BINDING_HASH: [u8; 32] = [
    0x07, 0x85, 0x78, 0xf0, 0xaa, 0x27, 0xda, 0xa2, 0x97, 0x2d, 0x6c, 0x19, 0xd1, 0xd2, 0x6d, 0xbb,
    0x6b, 0xf6, 0xba, 0x1e, 0x8d, 0xf8, 0x4e, 0x28, 0x3d, 0x7e, 0xf1, 0x01, 0xfc, 0x46, 0xab, 0xf6,
];
const CANONICAL_TAIRA_ACCOUNT: &str = "testuﾛ1Npﾃﾕヱﾇq11pｳﾘ2ｱ5ﾇｦiCJKjRﾔzｷNMNﾆｹﾕPCｳﾙFvｵE9LBLB";
const TOKEN_FAIL_AFTER_MUTATION_AMOUNT: u64 = 13;
const TOKEN_FAIL_ERROR: u32 = 0x7101;
const VERIFIER_REJECT_ERROR: u32 = 0x7102;

// `solana-program-test` 4.0.0 installs its native syscall bridge in
// `solana-sysvar` 3.1.1, while `solana-program` 4.0.0 uses the 4.0.0 hook
// table. Forward the syscalls exercised by this program into ProgramTest's
// runtime bridge so CPI remains a real SVM invocation. Clock and Rent have the
// same program ABI and are supplied deterministically for native execution.
struct ProgramTestSyscallAdapter;

impl solana_sysvar_v4::program_stubs::SyscallStubs for ProgramTestSyscallAdapter {
    fn sol_log(&self, message: &str) {
        solana_sysvar_v3::program_stubs::sol_log(message);
    }

    fn sol_invoke_signed(
        &self,
        instruction: &Instruction,
        account_infos: &[AccountInfo],
        signers_seeds: &[&[&[u8]]],
    ) -> ProgramResult {
        solana_sysvar_v3::program_stubs::sol_invoke_signed(
            instruction,
            account_infos,
            signers_seeds,
        )
    }

    fn sol_get_sysvar(
        &self,
        sysvar_id_addr: *const u8,
        var_addr: *mut u8,
        offset: u64,
        length: u64,
    ) -> u64 {
        let sysvar_id = unsafe { std::slice::from_raw_parts(sysvar_id_addr, 32) };
        let value = if sysvar_id == CLOCK_SYSVAR_ID.as_ref() {
            bincode::serialize(&Clock {
                slot: 1,
                ..Clock::default()
            })
        } else if sysvar_id == RENT_SYSVAR_ID.as_ref() {
            bincode::serialize(&Rent::default())
        } else {
            return 1;
        };
        let Ok(value) = value else {
            return 1;
        };
        let Ok(start) = usize::try_from(offset) else {
            return 1;
        };
        let Ok(length) = usize::try_from(length) else {
            return 1;
        };
        let Some(end) = start.checked_add(length) else {
            return 1;
        };
        let Some(source) = value.get(start..end) else {
            return 1;
        };
        unsafe { std::ptr::copy_nonoverlapping(source.as_ptr(), var_addr, source.len()) };
        0
    }
}

fn install_program_test_syscall_adapter() {
    static INSTALL: Once = Once::new();
    INSTALL.call_once(|| {
        solana_sysvar_v4::program_stubs::set_syscall_stubs(Box::new(ProgramTestSyscallAdapter));
    });
}

fn token_program_id() -> Pubkey {
    Pubkey::from_str(TOKEN_PROGRAM_ID_TEXT).expect("canonical SPL Token id")
}

fn read_u64(data: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes(data[offset..offset + 8].try_into().expect("u64 field"))
}

fn write_u64(data: &mut [u8], offset: usize, value: u64) {
    data[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
}

fn push_vec(out: &mut Vec<u8>, value: &[u8]) {
    out.extend_from_slice(&(value.len() as u32).to_le_bytes());
    out.extend_from_slice(value);
}

fn take_vec<'a>(input: &'a [u8], offset: &mut usize) -> Result<&'a [u8], ProgramError> {
    let length_end = offset
        .checked_add(4)
        .ok_or(ProgramError::InvalidInstructionData)?;
    let length_bytes = input
        .get(*offset..length_end)
        .ok_or(ProgramError::InvalidInstructionData)?;
    let length = u32::from_le_bytes(
        length_bytes
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    ) as usize;
    let value_end = length_end
        .checked_add(length)
        .ok_or(ProgramError::InvalidInstructionData)?;
    let value = input
        .get(length_end..value_end)
        .ok_or(ProgramError::InvalidInstructionData)?;
    *offset = value_end;
    Ok(value)
}

fn accepting_verifier(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if accounts.len() != 4 || !accounts[0].is_signer {
        return Err(ProgramError::InvalidAccountData);
    }
    let mut offset = 0;
    if take_vec(data, &mut offset)? != VERIFIER_ENTRYPOINT_VERIFY
        || take_vec(data, &mut offset)? != NATIVE_VERIFIER_CPI_MARKER
    {
        return Err(ProgramError::InvalidInstructionData);
    }
    Ok(())
}

fn rejecting_verifier(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _data: &[u8],
) -> ProgramResult {
    Err(ProgramError::Custom(VERIFIER_REJECT_ERROR))
}

fn mock_token_program(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    if data.len() != 9 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let amount = u64::from_le_bytes(
        data[1..9]
            .try_into()
            .map_err(|_| ProgramError::InvalidInstructionData)?,
    );
    let account_iter = &mut accounts.iter();
    match data[0] {
        7 => {
            let mint = next_account_info(account_iter)?;
            let destination = next_account_info(account_iter)?;
            let authority = next_account_info(account_iter)?;
            if account_iter.next().is_some()
                || !mint.is_writable
                || !destination.is_writable
                || !authority.is_signer
            {
                return Err(ProgramError::InvalidAccountData);
            }
            let mut mint_data = mint.try_borrow_mut_data()?;
            let supply = read_u64(&mint_data, 36)
                .checked_add(amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            write_u64(&mut mint_data, 36, supply);
            drop(mint_data);
            let mut destination_data = destination.try_borrow_mut_data()?;
            let balance = read_u64(&destination_data, 64)
                .checked_add(amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            write_u64(&mut destination_data, 64, balance);
        }
        8 => {
            let source = next_account_info(account_iter)?;
            let mint = next_account_info(account_iter)?;
            let owner = next_account_info(account_iter)?;
            if account_iter.next().is_some()
                || !source.is_writable
                || !mint.is_writable
                || !owner.is_signer
            {
                return Err(ProgramError::InvalidAccountData);
            }
            let mut source_data = source.try_borrow_mut_data()?;
            let balance = read_u64(&source_data, 64)
                .checked_sub(amount)
                .ok_or(ProgramError::InsufficientFunds)?;
            write_u64(&mut source_data, 64, balance);
            drop(source_data);
            let mut mint_data = mint.try_borrow_mut_data()?;
            let supply = read_u64(&mint_data, 36)
                .checked_sub(amount)
                .ok_or(ProgramError::InsufficientFunds)?;
            write_u64(&mut mint_data, 36, supply);
        }
        _ => return Err(ProgramError::InvalidInstructionData),
    }
    if amount == TOKEN_FAIL_AFTER_MUTATION_AMOUNT {
        return Err(ProgramError::Custom(TOKEN_FAIL_ERROR));
    }
    Ok(())
}

fn account(owner: Pubkey, data: Vec<u8>, lamports: u64) -> Account {
    Account {
        lamports,
        data,
        owner,
        executable: false,
        rent_epoch: 0,
    }
}

fn state_data(
    mint: &Pubkey,
    verifier: &Pubkey,
    accepted: u64,
    minted: u64,
    burned: u64,
) -> Vec<u8> {
    let mut data = vec![0; STATE_LEN];
    data[0..8].copy_from_slice(STATE_MAGIC);
    data[8] = STATE_VERSION;
    data[STATE_VERIFIER_LOCKED_OFFSET] = 1;
    write_u64(&mut data, STATE_ACCEPTED_COUNT_OFFSET, accepted);
    data[STATE_NATIVE_VERIFIER_PROGRAM_OFFSET..STATE_NATIVE_VERIFIER_PROGRAM_OFFSET + 32]
        .copy_from_slice(verifier.as_ref());
    data[STATE_VERIFIER_MATERIAL_HASH_OFFSET..STATE_VERIFIER_MATERIAL_HASH_OFFSET + 32]
        .copy_from_slice(&[0x51; 32]);
    data[STATE_VERIFIER_CONFIG_HASH_OFFSET..STATE_VERIFIER_CONFIG_HASH_OFFSET + 32]
        .copy_from_slice(&[0x52; 32]);
    data[STATE_MINT_OFFSET..STATE_MINT_OFFSET + 32].copy_from_slice(mint.as_ref());
    write_u64(&mut data, STATE_TOTAL_MINTED_OFFSET, minted);
    write_u64(&mut data, STATE_TOTAL_BURNED_OFFSET, burned);
    data
}

fn mint_data(authority: &Pubkey, supply: u64) -> Vec<u8> {
    let mut data = vec![0; 82];
    data[0..4].copy_from_slice(&1_u32.to_le_bytes());
    data[4..36].copy_from_slice(authority.as_ref());
    write_u64(&mut data, 36, supply);
    data[44] = 9;
    data[45] = 1;
    data[46..50].copy_from_slice(&0_u32.to_le_bytes());
    data
}

fn token_account_data(mint: &Pubkey, owner: &Pubkey, balance: u64) -> Vec<u8> {
    let mut data = vec![0; 165];
    data[0..32].copy_from_slice(mint.as_ref());
    data[32..64].copy_from_slice(owner.as_ref());
    write_u64(&mut data, 64, balance);
    data[108] = 1;
    data
}

struct Fixture {
    owner: Keypair,
    state: Pubkey,
    mint: Pubkey,
    token: Pubkey,
    mint_authority: Pubkey,
    verifier: Pubkey,
}

impl Fixture {
    async fn start(
        verifier: Pubkey,
        token_balance: u64,
        mint_supply: u64,
        accepted: u64,
        minted: u64,
        burned: u64,
    ) -> (Self, ProgramTestContext) {
        let owner = Keypair::new();
        let state = Pubkey::new_unique();
        let mint = Pubkey::new_unique();
        let token = Pubkey::new_unique();
        let (mint_authority, _) =
            Pubkey::find_program_address(&[MINT_AUTHORITY_SEED, state.as_ref()], &PROGRAM_ID);
        let mut test = ProgramTest::new(
            "sccp_taira_xor",
            PROGRAM_ID,
            processor!(sccp_taira_xor::process_instruction),
        );
        test.add_program(
            "accepting_verifier",
            ACCEPT_VERIFIER_ID,
            processor!(accepting_verifier),
        );
        test.add_program(
            "rejecting_verifier",
            REJECT_VERIFIER_ID,
            processor!(rejecting_verifier),
        );
        test.add_program(
            "mock_spl_token",
            token_program_id(),
            processor!(mock_token_program),
        );
        test.add_account(
            owner.pubkey(),
            account(system_program::ID, Vec::new(), 10_000_000_000),
        );
        test.add_account(
            state,
            account(
                PROGRAM_ID,
                state_data(&mint, &verifier, accepted, minted, burned),
                10_000_000,
            ),
        );
        test.add_account(
            mint,
            account(
                token_program_id(),
                mint_data(&mint_authority, mint_supply),
                10_000_000,
            ),
        );
        test.add_account(
            token,
            account(
                token_program_id(),
                token_account_data(&mint, &owner.pubkey(), token_balance),
                10_000_000,
            ),
        );
        let context = test.start_with_context().await;
        install_program_test_syscall_adapter();
        (
            Self {
                owner,
                state,
                mint,
                token,
                mint_authority,
                verifier,
            },
            context,
        )
    }

    fn submit(&self, amount: u64) -> (Instruction, Pubkey, [u8; 32]) {
        self.submit_with_receipt(amount, None)
    }

    fn submit_with_receipt(
        &self,
        amount: u64,
        receipt_override: Option<Pubkey>,
    ) -> (Instruction, Pubkey, [u8; 32]) {
        let (public_inputs, bundle, message_id) = transfer_fixture(&self.owner.pubkey(), amount);
        let statement_hash = [0x61; 32];
        let proof_context_hash = hashv(&[
            SETTLEMENT_CONTEXT_PREFIX,
            &statement_hash,
            &DESTINATION_BINDING_HASH,
            &message_id,
            self.mint.as_ref(),
            self.token.as_ref(),
            self.owner.pubkey().as_ref(),
            &amount.to_le_bytes(),
        ])
        .to_bytes();
        let receipt = receipt_override.unwrap_or_else(|| {
            Pubkey::find_program_address(
                &[MESSAGE_RECEIPT_SEED, self.state.as_ref(), &message_id],
                &PROGRAM_ID,
            )
            .0
        });
        let mut data = Vec::new();
        push_vec(&mut data, ENTRYPOINT_SUBMIT);
        push_vec(&mut data, &[0xa1]);
        push_vec(&mut data, &public_inputs);
        push_vec(&mut data, &bundle);
        push_vec(&mut data, &statement_hash);
        push_vec(&mut data, &DESTINATION_BINDING_HASH);
        push_vec(&mut data, &proof_context_hash);
        push_vec(&mut data, &amount.to_le_bytes());
        (
            Instruction {
                program_id: PROGRAM_ID,
                accounts: vec![
                    AccountMeta::new(self.owner.pubkey(), true),
                    AccountMeta::new(self.state, false),
                    AccountMeta::new(self.mint, false),
                    AccountMeta::new(self.token, false),
                    AccountMeta::new_readonly(self.mint_authority, false),
                    AccountMeta::new_readonly(token_program_id(), false),
                    AccountMeta::new_readonly(self.verifier, false),
                    AccountMeta::new(receipt, false),
                    AccountMeta::new_readonly(system_program::ID, false),
                ],
                data,
            },
            receipt,
            message_id,
        )
    }

    fn burn(&self, amount: u64, nonce: u64) -> (Instruction, Pubkey) {
        let nonce_bytes = nonce.to_le_bytes();
        let receipt = Pubkey::find_program_address(
            &[
                BURN_RECEIPT_SEED,
                self.state.as_ref(),
                self.owner.pubkey().as_ref(),
                &nonce_bytes,
            ],
            &PROGRAM_ID,
        )
        .0;
        let mut data = Vec::new();
        push_vec(&mut data, ENTRYPOINT_BURN);
        push_vec(&mut data, &amount.to_le_bytes());
        push_vec(&mut data, CANONICAL_TAIRA_ACCOUNT.as_bytes());
        push_vec(&mut data, &nonce_bytes);
        (
            Instruction {
                program_id: PROGRAM_ID,
                accounts: vec![
                    AccountMeta::new(self.owner.pubkey(), true),
                    AccountMeta::new(self.state, false),
                    AccountMeta::new(self.token, false),
                    AccountMeta::new(self.mint, false),
                    AccountMeta::new_readonly(token_program_id(), false),
                    AccountMeta::new(receipt, false),
                    AccountMeta::new_readonly(system_program::ID, false),
                ],
                data,
            },
            receipt,
        )
    }
}

fn transfer_fixture(recipient: &Pubkey, amount: u64) -> (Vec<u8>, Vec<u8>, [u8; 32]) {
    let mut payload = Vec::new();
    payload.push(2);
    payload.push(1);
    payload.extend_from_slice(&0_u32.to_le_bytes());
    payload.extend_from_slice(&3_u32.to_le_bytes());
    payload.extend_from_slice(&7_u64.to_le_bytes());
    payload.extend_from_slice(&0_u32.to_le_bytes());
    payload.push(1);
    push_vec(&mut payload, b"xor");
    payload.extend_from_slice(&u128::from(amount).to_le_bytes());
    payload.push(1);
    push_vec(&mut payload, CANONICAL_TAIRA_ACCOUNT.as_bytes());
    payload.push(3);
    push_vec(&mut payload, recipient.to_string().as_bytes());
    payload.push(1);
    push_vec(&mut payload, b"taira_sol_xor");

    let message_id = keccak_hashv(&[TRANSFER_MESSAGE_PREFIX, &payload[1..]]).to_bytes();
    let payload_hash = [0x55; 32];
    let mut commitment = Vec::new();
    commitment.push(1);
    commitment.push(6);
    commitment.extend_from_slice(&3_u32.to_le_bytes());
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
    public_inputs.extend_from_slice(&3_u32.to_le_bytes());
    public_inputs.extend_from_slice(&[0x33; 32]);
    public_inputs.extend_from_slice(&9_u64.to_le_bytes());
    public_inputs.extend_from_slice(&[0x22; 32]);
    (public_inputs, bundle, message_id)
}

async fn process(
    context: &mut ProgramTestContext,
    owner: &Keypair,
    instruction: Instruction,
    refresh_blockhash: bool,
) -> Result<(), TransactionError> {
    process_with_owner_signature(context, owner, instruction, refresh_blockhash, true).await
}

async fn process_with_owner_signature(
    context: &mut ProgramTestContext,
    owner: &Keypair,
    instruction: Instruction,
    refresh_blockhash: bool,
    sign_owner: bool,
) -> Result<(), TransactionError> {
    if refresh_blockhash {
        context
            .get_new_latest_blockhash()
            .await
            .expect("new blockhash");
    }
    let transaction = if sign_owner {
        Transaction::new_signed_with_payer(
            &[instruction],
            Some(&context.payer.pubkey()),
            &[&context.payer, owner],
            context.last_blockhash,
        )
    } else {
        Transaction::new_signed_with_payer(
            &[instruction],
            Some(&context.payer.pubkey()),
            &[&context.payer],
            context.last_blockhash,
        )
    };
    context
        .banks_client
        .process_transaction(transaction)
        .await
        .map_err(|error| error.unwrap())
}

async fn get_account(context: &mut ProgramTestContext, key: Pubkey) -> Option<Account> {
    context
        .banks_client
        .get_account(key)
        .await
        .expect("account query")
}

async fn snapshot(
    context: &mut ProgramTestContext,
    fixture: &Fixture,
) -> (Vec<u8>, Vec<u8>, Vec<u8>, u64) {
    let state = get_account(context, fixture.state).await.expect("state");
    let mint = get_account(context, fixture.mint).await.expect("mint");
    let token = get_account(context, fixture.token).await.expect("token");
    let owner = get_account(context, fixture.owner.pubkey())
        .await
        .expect("owner");
    (state.data, mint.data, token.data, owner.lamports)
}

#[tokio::test]
async fn destination_finalize_success_replay_and_receipt_collision_use_runtime_pdas() {
    let (fixture, mut context) = Fixture::start(ACCEPT_VERIFIER_ID, 0, 0, 0, 0, 0).await;
    let (instruction, receipt, message_id) = fixture.submit(7);
    process(&mut context, &fixture.owner, instruction.clone(), false)
        .await
        .expect("destination finalization");

    let state = get_account(&mut context, fixture.state)
        .await
        .expect("state");
    let mint = get_account(&mut context, fixture.mint).await.expect("mint");
    let destination = get_account(&mut context, fixture.token)
        .await
        .expect("destination");
    let receipt_account = get_account(&mut context, receipt).await.expect("receipt");
    assert_eq!(read_u64(&state.data, STATE_ACCEPTED_COUNT_OFFSET), 1);
    assert_eq!(read_u64(&state.data, STATE_TOTAL_MINTED_OFFSET), 7);
    assert_eq!(read_u64(&mint.data, 36), 7);
    assert_eq!(read_u64(&destination.data, 64), 7);
    assert_eq!(receipt_account.owner, PROGRAM_ID);
    assert_eq!(receipt_account.data.len(), RECEIPT_LEN);
    assert_eq!(&receipt_account.data[0..8], b"SCCPMSG1");
    assert_eq!(&receipt_account.data[16..48], &message_id);

    let after_success = snapshot(&mut context, &fixture).await;
    let replay = process(&mut context, &fixture.owner, instruction, true)
        .await
        .expect_err("replay must fail");
    assert_eq!(
        replay,
        TransactionError::InstructionError(0, InstructionError::AccountAlreadyInitialized)
    );
    assert_eq!(snapshot(&mut context, &fixture).await, after_success);

    let (collision, selected_receipt, second_message_id) =
        fixture.submit_with_receipt(8, Some(receipt));
    let canonical_second_receipt = Pubkey::find_program_address(
        &[
            MESSAGE_RECEIPT_SEED,
            fixture.state.as_ref(),
            &second_message_id,
        ],
        &PROGRAM_ID,
    )
    .0;
    let collision_error = process(&mut context, &fixture.owner, collision, false)
        .await
        .expect_err("receipt collision must fail");
    assert_eq!(
        collision_error,
        TransactionError::InstructionError(0, InstructionError::InvalidAccountData)
    );
    assert_eq!(snapshot(&mut context, &fixture).await, after_success);
    assert_eq!(selected_receipt, receipt);
    assert_ne!(canonical_second_receipt, receipt);
    assert!(get_account(&mut context, canonical_second_receipt)
        .await
        .is_none());
}

#[tokio::test]
async fn destination_verifier_and_token_rejections_roll_back_every_outer_and_cpi_write() {
    let (reject_fixture, mut reject_context) =
        Fixture::start(REJECT_VERIFIER_ID, 0, 0, 0, 0, 0).await;
    let before_reject = snapshot(&mut reject_context, &reject_fixture).await;
    let (reject_instruction, reject_receipt, _) = reject_fixture.submit(7);
    let error = process(
        &mut reject_context,
        &reject_fixture.owner,
        reject_instruction,
        false,
    )
    .await
    .expect_err("native verifier rejection");
    assert_eq!(
        error,
        TransactionError::InstructionError(0, InstructionError::Custom(VERIFIER_REJECT_ERROR))
    );
    assert_eq!(
        snapshot(&mut reject_context, &reject_fixture).await,
        before_reject
    );
    assert!(get_account(&mut reject_context, reject_receipt)
        .await
        .is_none());

    let (token_fixture, mut token_context) =
        Fixture::start(ACCEPT_VERIFIER_ID, 0, 0, 0, 0, 0).await;
    let before_token = snapshot(&mut token_context, &token_fixture).await;
    let (token_instruction, token_receipt, _) =
        token_fixture.submit(TOKEN_FAIL_AFTER_MUTATION_AMOUNT);
    let error = process(
        &mut token_context,
        &token_fixture.owner,
        token_instruction,
        false,
    )
    .await
    .expect_err("mutating token CPI rejection");
    assert_eq!(
        error,
        TransactionError::InstructionError(0, InstructionError::Custom(TOKEN_FAIL_ERROR))
    );
    assert_eq!(
        snapshot(&mut token_context, &token_fixture).await,
        before_token
    );
    assert!(get_account(&mut token_context, token_receipt)
        .await
        .is_none());
}

#[tokio::test]
async fn destination_post_cpi_overflow_rolls_back_token_receipt_and_state_at_u64_boundaries() {
    let (fixture, mut context) =
        Fixture::start(ACCEPT_VERIFIER_ID, 0, 0, u64::MAX - 1, u64::MAX - 5, 0).await;
    let (boundary, boundary_receipt, _) = fixture.submit(5);
    process(&mut context, &fixture.owner, boundary, false)
        .await
        .expect("exact u64 boundary succeeds");
    let boundary_state = get_account(&mut context, fixture.state)
        .await
        .expect("state");
    assert_eq!(
        read_u64(&boundary_state.data, STATE_ACCEPTED_COUNT_OFFSET),
        u64::MAX
    );
    assert_eq!(
        read_u64(&boundary_state.data, STATE_TOTAL_MINTED_OFFSET),
        u64::MAX
    );
    assert!(get_account(&mut context, boundary_receipt).await.is_some());

    let before_overflow = snapshot(&mut context, &fixture).await;
    let (overflow, overflow_receipt, _) = fixture.submit(1);
    let error = process(&mut context, &fixture.owner, overflow, false)
        .await
        .expect_err("post-CPI state overflow");
    assert_eq!(
        error,
        TransactionError::InstructionError(0, InstructionError::ArithmeticOverflow)
    );
    assert_eq!(snapshot(&mut context, &fixture).await, before_overflow);
    assert!(get_account(&mut context, overflow_receipt).await.is_none());
}

#[tokio::test]
async fn destination_rejects_noncanonical_account_order_count_and_privileges_without_side_effects()
{
    let (fixture, mut context) = Fixture::start(ACCEPT_VERIFIER_ID, 0, 0, 0, 0, 0).await;
    let before = snapshot(&mut context, &fixture).await;
    let (canonical, receipt, _) = fixture.submit(7);
    let mut cases = Vec::new();

    let mut missing = canonical.clone();
    missing.accounts.pop();
    cases.push(missing);
    let mut extra = canonical.clone();
    extra
        .accounts
        .push(AccountMeta::new_readonly(Pubkey::new_unique(), false));
    cases.push(extra);
    let mut readonly_state = canonical.clone();
    readonly_state.accounts[1] = AccountMeta::new_readonly(fixture.state, false);
    cases.push(readonly_state);
    let mut readonly_payer = canonical.clone();
    readonly_payer.accounts[0] = AccountMeta::new_readonly(fixture.owner.pubkey(), true);
    cases.push(readonly_payer);
    let mut readonly_mint = canonical.clone();
    readonly_mint.accounts[2] = AccountMeta::new_readonly(fixture.mint, false);
    cases.push(readonly_mint);
    let mut readonly_destination = canonical.clone();
    readonly_destination.accounts[3] = AccountMeta::new_readonly(fixture.token, false);
    cases.push(readonly_destination);
    let mut readonly_receipt = canonical.clone();
    readonly_receipt.accounts[7] = AccountMeta::new_readonly(receipt, false);
    cases.push(readonly_receipt);
    let mut swapped = canonical.clone();
    swapped.accounts.swap(2, 3);
    cases.push(swapped);
    let mut wrong_authority = canonical.clone();
    wrong_authority.accounts[4] = AccountMeta::new_readonly(Pubkey::new_unique(), false);
    cases.push(wrong_authority);
    let mut wrong_token_program = canonical.clone();
    wrong_token_program.accounts[5] = AccountMeta::new_readonly(ACCEPT_VERIFIER_ID, false);
    cases.push(wrong_token_program);
    let mut wrong_verifier = canonical.clone();
    wrong_verifier.accounts[6] = AccountMeta::new_readonly(REJECT_VERIFIER_ID, false);
    cases.push(wrong_verifier);
    let mut wrong_system = canonical.clone();
    wrong_system.accounts[8] = AccountMeta::new_readonly(ACCEPT_VERIFIER_ID, false);
    cases.push(wrong_system);

    for (index, invalid) in cases.into_iter().enumerate() {
        assert!(
            process(&mut context, &fixture.owner, invalid, false)
                .await
                .is_err(),
            "invalid account case {index} must fail"
        );
        assert_eq!(snapshot(&mut context, &fixture).await, before);
        assert!(get_account(&mut context, receipt).await.is_none());
    }

    let mut missing_payer_signature = canonical.clone();
    missing_payer_signature.accounts[0] = AccountMeta::new(fixture.owner.pubkey(), false);
    let error = process_with_owner_signature(
        &mut context,
        &fixture.owner,
        missing_payer_signature,
        false,
        false,
    )
    .await
    .expect_err("destination payer signature is mandatory");
    assert_eq!(
        error,
        TransactionError::InstructionError(0, InstructionError::MissingRequiredSignature)
    );
    assert_eq!(snapshot(&mut context, &fixture).await, before);
    assert!(get_account(&mut context, receipt).await.is_none());

    process(&mut context, &fixture.owner, canonical, false)
        .await
        .expect("canonical PDA signer and CPI privileges succeed");
}

#[tokio::test]
async fn source_burn_success_replay_cpi_failure_and_overflow_are_runtime_atomic() {
    let (fixture, mut context) = Fixture::start(ACCEPT_VERIFIER_ID, 100, 100, 0, 0, 0).await;
    let (burn, receipt) = fixture.burn(7, 91);
    process(&mut context, &fixture.owner, burn.clone(), false)
        .await
        .expect("source burn");
    let state = get_account(&mut context, fixture.state)
        .await
        .expect("state");
    let mint = get_account(&mut context, fixture.mint).await.expect("mint");
    let source = get_account(&mut context, fixture.token)
        .await
        .expect("source");
    let receipt_account = get_account(&mut context, receipt)
        .await
        .expect("burn receipt");
    assert_eq!(read_u64(&state.data, STATE_TOTAL_BURNED_OFFSET), 7);
    assert!(
        state.data[STATE_LAST_BURN_HASH_OFFSET..STATE_LAST_BURN_HASH_OFFSET + 32]
            .iter()
            .any(|byte| *byte != 0)
    );
    assert_eq!(read_u64(&mint.data, 36), 93);
    assert_eq!(read_u64(&source.data, 64), 93);
    assert_eq!(receipt_account.owner, PROGRAM_ID);
    assert_eq!(receipt_account.data.len(), BURN_RECEIPT_LEN);
    assert_eq!(&receipt_account.data[0..8], b"SCCPBRN1");

    let after_success = snapshot(&mut context, &fixture).await;
    let replay = process(&mut context, &fixture.owner, burn, true)
        .await
        .expect_err("burn nonce replay");
    assert_eq!(
        replay,
        TransactionError::InstructionError(0, InstructionError::AccountAlreadyInitialized)
    );
    assert_eq!(snapshot(&mut context, &fixture).await, after_success);

    let (failing_burn, failing_receipt) = fixture.burn(TOKEN_FAIL_AFTER_MUTATION_AMOUNT, 92);
    let error = process(&mut context, &fixture.owner, failing_burn, false)
        .await
        .expect_err("mutating burn CPI failure");
    assert_eq!(
        error,
        TransactionError::InstructionError(0, InstructionError::Custom(TOKEN_FAIL_ERROR))
    );
    assert_eq!(snapshot(&mut context, &fixture).await, after_success);
    assert!(get_account(&mut context, failing_receipt).await.is_none());

    let state_account = get_account(&mut context, fixture.state)
        .await
        .expect("state");
    let mut overflow_state = state_account.clone();
    write_u64(
        &mut overflow_state.data,
        STATE_TOTAL_BURNED_OFFSET,
        u64::MAX,
    );
    context.set_account(&fixture.state, &overflow_state.into());
    let before_overflow = snapshot(&mut context, &fixture).await;
    let (overflow_burn, overflow_receipt) = fixture.burn(1, 93);
    let error = process(&mut context, &fixture.owner, overflow_burn, false)
        .await
        .expect_err("burn state overflow");
    assert_eq!(
        error,
        TransactionError::InstructionError(0, InstructionError::ArithmeticOverflow)
    );
    assert_eq!(snapshot(&mut context, &fixture).await, before_overflow);
    assert!(get_account(&mut context, overflow_receipt).await.is_none());
}

#[tokio::test]
async fn source_burn_u64_boundary_and_account_privileges_fail_closed() {
    let (fixture, mut context) =
        Fixture::start(ACCEPT_VERIFIER_ID, 20, 20, 0, 0, u64::MAX - 5).await;
    let before = snapshot(&mut context, &fixture).await;
    let (canonical, receipt) = fixture.burn(5, u64::MAX);
    let mut cases = Vec::new();
    let mut missing = canonical.clone();
    missing.accounts.pop();
    cases.push(missing);
    let mut extra = canonical.clone();
    extra
        .accounts
        .push(AccountMeta::new_readonly(Pubkey::new_unique(), false));
    cases.push(extra);
    let mut readonly_state = canonical.clone();
    readonly_state.accounts[1] = AccountMeta::new_readonly(fixture.state, false);
    cases.push(readonly_state);
    let mut readonly_owner = canonical.clone();
    readonly_owner.accounts[0] = AccountMeta::new_readonly(fixture.owner.pubkey(), true);
    cases.push(readonly_owner);
    let mut readonly_source = canonical.clone();
    readonly_source.accounts[2] = AccountMeta::new_readonly(fixture.token, false);
    cases.push(readonly_source);
    let mut readonly_mint = canonical.clone();
    readonly_mint.accounts[3] = AccountMeta::new_readonly(fixture.mint, false);
    cases.push(readonly_mint);
    let mut readonly_receipt = canonical.clone();
    readonly_receipt.accounts[5] = AccountMeta::new_readonly(receipt, false);
    cases.push(readonly_receipt);
    let mut swapped = canonical.clone();
    swapped.accounts.swap(2, 3);
    cases.push(swapped);
    let mut wrong_token = canonical.clone();
    wrong_token.accounts[4] = AccountMeta::new_readonly(ACCEPT_VERIFIER_ID, false);
    cases.push(wrong_token);
    let mut wrong_system = canonical.clone();
    wrong_system.accounts[6] = AccountMeta::new_readonly(ACCEPT_VERIFIER_ID, false);
    cases.push(wrong_system);

    for (index, invalid) in cases.into_iter().enumerate() {
        assert!(
            process(&mut context, &fixture.owner, invalid, false)
                .await
                .is_err(),
            "invalid burn account case {index} must fail"
        );
        assert_eq!(snapshot(&mut context, &fixture).await, before);
        assert!(get_account(&mut context, receipt).await.is_none());
    }

    let mut missing_owner_signature = canonical.clone();
    missing_owner_signature.accounts[0] = AccountMeta::new(fixture.owner.pubkey(), false);
    let error = process_with_owner_signature(
        &mut context,
        &fixture.owner,
        missing_owner_signature,
        false,
        false,
    )
    .await
    .expect_err("burn owner signature is mandatory");
    assert_eq!(
        error,
        TransactionError::InstructionError(0, InstructionError::MissingRequiredSignature)
    );
    assert_eq!(snapshot(&mut context, &fixture).await, before);
    assert!(get_account(&mut context, receipt).await.is_none());

    process(&mut context, &fixture.owner, canonical, false)
        .await
        .expect("u64 boundary burn");
    let state = get_account(&mut context, fixture.state)
        .await
        .expect("state");
    assert_eq!(read_u64(&state.data, STATE_TOTAL_BURNED_OFFSET), u64::MAX);
}
