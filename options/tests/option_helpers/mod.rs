use solana_client::{client_error::ClientError, rpc_client::RpcClient};
use solana_options::market::OptionMarket;
use solana_program::{program_pack::Pack, pubkey::Pubkey, system_instruction};
use solana_sdk::{
    commitment_config::CommitmentConfig,
    instruction::Instruction,
    message::Message,
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use spl_token::{
    instruction as token_instruction,
    state::{Account, Mint},
};

pub fn create_spl_mint_account_uninitialized(
    client: &RpcClient,
    spl_mint: &Keypair,
    payer_keys: &Keypair,
) -> Result<(), ClientError> {
    let data_len = Mint::LEN;

    let min_balance = client.get_minimum_balance_for_rent_exemption(data_len)?;

    let instruction = system_instruction::create_account(
        &payer_keys.pubkey(),
        &spl_mint.pubkey(),
        min_balance,
        data_len as u64,
        &spl_token::id(),
    );

    let signers = vec![payer_keys, spl_mint];
    send_and_confirm_transaction(client, instruction, &payer_keys.pubkey(), signers)?;
    println!("Created SPL mint account {}", spl_mint.pubkey());

    Ok(())
}

pub fn create_spl_mint_account(
    client: &RpcClient,
    spl_mint: &Keypair,
    payer_keys: &Keypair,
) -> Result<(), ClientError> {
    let data_len = Mint::LEN;

    let min_balance = client.get_minimum_balance_for_rent_exemption(data_len)?;

    let create_acct_ix = system_instruction::create_account(
        &payer_keys.pubkey(),
        &spl_mint.pubkey(),
        min_balance,
        data_len as u64,
        &spl_token::id(),
    );

    // TODO [rust] whats the best way easily handle multiple error types in a Result
    let init_mint_ix = token_instruction::initialize_mint(
        &spl_token::id(),
        &spl_mint.pubkey(),
        &payer_keys.pubkey(),
        None,
        18,
    )
    .unwrap();

    let message = Message::new(&[create_acct_ix, init_mint_ix], Some(&payer_keys.pubkey()));

    let mut transaction = Transaction::new_unsigned(message.clone());

    let (blockhash, _, _) = client
        .get_recent_blockhash_with_commitment(CommitmentConfig::recent())?
        .value;
    transaction.try_sign(&[payer_keys, spl_mint], blockhash)?;

    client.send_and_confirm_transaction_with_spinner_and_commitment(
        &transaction,
        CommitmentConfig::recent(),
    )?;
    println!(
        "Created and Initialized SPL mint account {}",
        spl_mint.pubkey()
    );

    Ok(())
}

pub fn create_spl_account_uninitialized(
    client: &RpcClient,
    new_account_keys: &Keypair,
    payer_keys: &Keypair,
) -> Result<(), ClientError> {
    let data_len = Account::LEN;

    let min_balance = client.get_minimum_balance_for_rent_exemption(data_len)?;

    let instruction = system_instruction::create_account(
        &payer_keys.pubkey(),
        &new_account_keys.pubkey(),
        min_balance,
        data_len as u64,
        &spl_token::id(),
    );

    let signers = vec![payer_keys, new_account_keys];
    send_and_confirm_transaction(client, instruction, &payer_keys.pubkey(), signers)?;
    println!("Created SPL mint account {}", new_account_keys.pubkey());
    Ok(())
}

pub fn create_spl_account(
    client: &RpcClient,
    new_account_keys: &Keypair,
    owner: &Pubkey,
    spl_mint: &Pubkey,
    payer_keys: &Keypair,
) -> Result<(), ClientError> {
    create_spl_account_uninitialized(client, new_account_keys, payer_keys)?;
    // TODO [rust] whats the best way easily handle multiple error types in a Result
    let init_spl_account_ix = token_instruction::initialize_account(
        &spl_token::id(),
        &new_account_keys.pubkey(),
        spl_mint,
        owner,
    )
    .unwrap();

    let signers = vec![payer_keys];
    send_and_confirm_transaction(client, init_spl_account_ix, &payer_keys.pubkey(), signers)?;
    println!("Initialized SPL account {}", new_account_keys.pubkey());
    Ok(())
}

fn create_options_market(
    client: &RpcClient,
    options_program_id: &Pubkey,
    options_market: &Keypair,
    payer_keys: &Keypair,
) -> Result<(), ClientError> {
    let data_len = OptionMarket::LEN;

    let min_balance = client.get_minimum_balance_for_rent_exemption(data_len)?;

    let instruction = system_instruction::create_account(
        &payer_keys.pubkey(),
        &options_market.pubkey(),
        min_balance,
        data_len as u64,
        options_program_id,
    );

    let message = Message::new(&[instruction], Some(&payer_keys.pubkey()));

    let (blockhash, _, _) = client
        .get_recent_blockhash_with_commitment(CommitmentConfig::recent())?
        .value;

    let mut transaction = Transaction::new_unsigned(message.clone());
    transaction.try_sign(&[payer_keys, options_market], blockhash)?;

    client.send_and_confirm_transaction_with_spinner_and_commitment(
        &transaction,
        CommitmentConfig::recent(),
    )?;
    println!("Created Options Market account {}", options_market.pubkey());

    Ok(())
}

pub fn create_accounts_for_options_market(
    client: &RpcClient,
    options_program_id: &Pubkey,
    spl_mint: &Keypair,
    options_market: &Keypair,
    payer_keys: &Keypair,
) -> Result<(), ClientError> {
    create_spl_mint_account_uninitialized(client, spl_mint, payer_keys)?;
    create_options_market(client, options_program_id, options_market, payer_keys)?;

    Ok(())
}

fn send_and_confirm_transaction(
    client: &RpcClient,
    instruction: Instruction,
    payer_key: &Pubkey,
    signers: Vec<&Keypair>,
) -> Result<(), ClientError> {
    let message = Message::new(&[instruction], Some(&payer_key));

    let (blockhash, _, _) = client
        .get_recent_blockhash_with_commitment(CommitmentConfig::recent())?
        .value;

    let mut transaction = Transaction::new_unsigned(message.clone());
    transaction.try_sign(&signers, blockhash)?;

    client.send_and_confirm_transaction_with_spinner_and_commitment(
        &transaction,
        CommitmentConfig::recent(),
    )?;
    Ok(())
}
