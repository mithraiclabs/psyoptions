use crate::{
    solana_helpers::{create_account_with_lamports, send_and_confirm_transaction},
    spl_helpers::{
        create_spl_account, create_spl_account_uninitialized, create_spl_mint_account,
        create_spl_mint_account_uninitialized, mint_tokens_to_account,
    },
};
use solana_client::{client_error::ClientError, rpc_client::RpcClient};
use solana_options::market::{OptionMarket, OptionWriterRegistry};
use solana_program::{
    clock::UnixTimestamp, program_pack::Pack, pubkey::Pubkey, system_instruction,
};
use solana_sdk::{
    commitment_config::CommitmentConfig,
    message::Message,
    signature::{Keypair, Signer},
    transaction::Transaction,
};

fn create_writer_registry_acct(
    client: &RpcClient,
    options_program_id: &Pubkey,
    option_wrtier_registry: &Keypair,
    payer_keys: &Keypair,
) -> Result<(), ClientError> {
    let data_len = OptionWriterRegistry::LEN;

    let min_balance = client.get_minimum_balance_for_rent_exemption(data_len)?;

    let instruction = system_instruction::create_account(
        &payer_keys.pubkey(),
        &option_wrtier_registry.pubkey(),
        min_balance,
        data_len as u64,
        options_program_id,
    );

    let message = Message::new(&[instruction], Some(&payer_keys.pubkey()));

    let (blockhash, _, _) = client
        .get_recent_blockhash_with_commitment(CommitmentConfig::processed())?
        .value;

    let mut transaction = Transaction::new_unsigned(message.clone());
    transaction.try_sign(&[payer_keys, option_wrtier_registry], blockhash)?;

    client.send_and_confirm_transaction_with_spinner_and_commitment(
        &transaction,
        CommitmentConfig::processed(),
    )?;
    println!("Created Options Market account {}", option_wrtier_registry.pubkey());

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
        .get_recent_blockhash_with_commitment(CommitmentConfig::processed())?
        .value;

    let mut transaction = Transaction::new_unsigned(message.clone());
    transaction.try_sign(&[payer_keys, options_market], blockhash)?;

    client.send_and_confirm_transaction_with_spinner_and_commitment(
        &transaction,
        CommitmentConfig::processed(),
    )?;
    println!("Created Options Market account {}", options_market.pubkey());

    Ok(())
}

pub fn create_accounts_for_options_market(
    client: &RpcClient,
    options_program_id: &Pubkey,
    spl_mint: &Keypair,
    options_market: &Keypair,
    option_writer_registry: &Keypair,
    payer_keys: &Keypair,
) -> Result<(), ClientError> {
    create_spl_mint_account_uninitialized(client, spl_mint, payer_keys)?;
    create_options_market(client, options_program_id, options_market, payer_keys)?;
    create_writer_registry_acct(client, options_program_id, option_writer_registry, payer_keys)?;
    
    Ok(())
}

/// Helper to create Underlying Asset, Quote Asset, and Option spl accounts
/// for option writer
pub fn create_option_writer_accounts(
    client: &RpcClient,
    underlying_asset_mint_key: &Pubkey,
    quote_asset_mint_key: &Pubkey,
    option_mint_key: &Pubkey,
    option_writer_keys: &Keypair,
) -> Result<(Keypair, Keypair, Keypair), ClientError> {
    let option_writer_underlying_asset_keys = Keypair::new();
    create_spl_account(
        &client,
        &option_writer_underlying_asset_keys,
        &option_writer_keys.pubkey(),
        underlying_asset_mint_key,
        option_writer_keys,
    )?;
    let option_writer_quote_asset_keys = Keypair::new();
    create_spl_account(
        &client,
        &option_writer_quote_asset_keys,
        &option_writer_keys.pubkey(),
        quote_asset_mint_key,
        option_writer_keys,
    )?;
    let option_writer_option_keys = Keypair::new();
    create_spl_account(
        &client,
        &option_writer_option_keys,
        &option_writer_keys.pubkey(),
        option_mint_key,
        option_writer_keys,
    )?;
    Ok((
        option_writer_underlying_asset_keys,
        option_writer_quote_asset_keys,
        option_writer_option_keys,
    ))
}

/// Set up function to initialize an options market.
/// Returns a tuple consisting of
/// - Underlying Asset Mint Keypair
/// - Quote Asset Mint Keypair
/// - Option Mint Keypair
/// - Underyling/Quote Mint Authority Keypair
/// - Underlying Asset Pool Pubkey
/// - Option Market Pubkey
pub fn init_option_market(
    client: &RpcClient,
    program_id: &Pubkey,
    amount_per_contract: u64,
    quote_amount_per_contract: u64,
    expiry: UnixTimestamp,
) -> Result<(Keypair, Keypair, Keypair, Keypair, Pubkey, Pubkey, Pubkey), ClientError> {
    let payer_keys = create_account_with_lamports(&client, 10000000000);
    let options_spl_mint = Keypair::new();
    let options_market_keys = Keypair::new();

    let underlying_spl = Keypair::new();
    let quote_spl = Keypair::new();
    let underlying_spl_pool = Keypair::new();
    let writer_registry_kp = Keypair::new();

    // create the spl mints to be used in the options market
    create_spl_mint_account(&client, &underlying_spl, &payer_keys).unwrap();
    create_spl_mint_account(&client, &quote_spl, &payer_keys).unwrap();
    create_spl_account_uninitialized(&client, &underlying_spl_pool, &payer_keys).unwrap();

    create_accounts_for_options_market(
        &client,
        &program_id,
        &options_spl_mint,
        &options_market_keys,
        &writer_registry_kp,
        &payer_keys,
    )?;

    let init_market_ix = solana_options::instruction::initiailize_market(
        &program_id,
        &underlying_spl.pubkey(),
        &quote_spl.pubkey(),
        &options_spl_mint.pubkey(),
        &options_market_keys.pubkey(),
        &underlying_spl_pool.pubkey(),
        &writer_registry_kp.pubkey(),
        amount_per_contract,
        quote_amount_per_contract,
        expiry,
    )
    .unwrap();
    let signers = vec![&payer_keys];
    send_and_confirm_transaction(&client, init_market_ix, &payer_keys.pubkey(), signers)?;
    Ok((
        underlying_spl,
        quote_spl,
        options_spl_mint,
        payer_keys,
        underlying_spl_pool.pubkey(),
        options_market_keys.pubkey(),
        writer_registry_kp.pubkey(),
    ))
}
/// Creates and seeds the necessary accounts for an entity, then mints a
/// covered call with those accounts
///
/// returns tuple containing
/// - option_writer_option_keys - the account that contains the option contract token
/// - option_writer_ooption_authority
pub fn create_and_add_option_writer(
    client: &RpcClient,
    options_program_id: &Pubkey,
    underlying_asset_mint_keys: &Keypair,
    asset_authority_keys: &Keypair,
    quote_asset_mint_keys: &Keypair,
    option_mint_keys: &Keypair,
    underlying_asset_pool_key: &Pubkey,
    option_market_key: &Pubkey,
    amount_per_contract: u64,
    writer_registry_key: &Pubkey,
) -> Result<(Keypair, Keypair), ClientError> {
    let option_writer_keys = create_account_with_lamports(&client, 1_000_000_000_000_000);
    let option_writer_underlying_asset_keys = Keypair::new();
    let _option_writer_underlying_asset_acct = create_spl_account(
        &client,
        &option_writer_underlying_asset_keys,
        &option_writer_keys.pubkey(),
        &underlying_asset_mint_keys.pubkey(),
        &option_writer_keys,
    );
    // add >= amount_per_contract of underlying asset to the src account
    let _mint_to_res = mint_tokens_to_account(
        &client,
        &spl_token::id(),
        &underlying_asset_mint_keys.pubkey(),
        &option_writer_underlying_asset_keys.pubkey(),
        &asset_authority_keys.pubkey(),
        vec![&asset_authority_keys],
        amount_per_contract,
    )
    .unwrap();

    // Set up the users quote asset accounts
    let option_writer_quote_asset_keys = Keypair::new();
    let _option_writer_quote_asset_acct = create_spl_account(
        &client,
        &option_writer_quote_asset_keys,
        &option_writer_keys.pubkey(),
        &quote_asset_mint_keys.pubkey(),
        &option_writer_keys,
    );
    let option_writer_option_keys = Keypair::new();
    let _option_writer_option_acct = create_spl_account(
        &client,
        &option_writer_option_keys,
        &option_writer_keys.pubkey(),
        &option_mint_keys.pubkey(),
        &option_writer_keys,
    );

    // send TX to mint a covered call
    let mint_covered_call_ix = solana_options::instruction::mint_covered_call(
        &options_program_id,
        &option_mint_keys.pubkey(),
        &option_writer_option_keys.pubkey(),
        &option_writer_underlying_asset_keys.pubkey(),
        &underlying_asset_pool_key,
        &option_writer_quote_asset_keys.pubkey(),
        &option_market_key,
        &option_writer_keys.pubkey(),
        &writer_registry_key,
    )
    .unwrap();
    let signers = vec![&option_writer_keys];
    send_and_confirm_transaction(
        &client,
        mint_covered_call_ix,
        &option_writer_keys.pubkey(),
        signers,
    )
    .unwrap();
    Ok((option_writer_option_keys, option_writer_keys))
}

/// Creates the necessary accounts and adds tokens to those accounts for someone to
/// exercise for a given option market
///
/// Returns a tuple consisting of
/// - Exercisor Authority Keypair
/// - Exercisor Quote Asset Account Keypair
/// - Exercisor Underlying Asset Account Keypair
pub fn create_exerciser(
    client: &RpcClient,
    asset_authority_keys: &Keypair,
    underlying_asset_mint_keys: &Keypair,
    quote_asset_mint_keys: &Keypair,
    option_market: &OptionMarket,
) -> Result<(Keypair, Keypair, Keypair), ClientError> {
    // create the Authority account
    let exerciser_authority_keys = create_account_with_lamports(&client, 1_000_000_000_000_000);
    // create an account to receive the underlying asset
    let exerciser_underlying_asset_keys = Keypair::new();
    let _exerciser_underlying_asset_acct = create_spl_account(
        &client,
        &exerciser_underlying_asset_keys,
        &exerciser_authority_keys.pubkey(),
        &underlying_asset_mint_keys.pubkey(),
        &exerciser_authority_keys,
    );
    // create and seed an Account with the quote asset
    let exerciser_quote_asset_keys = Keypair::new();
    let _exerciser_quote_asset_acct = create_spl_account(
        &client,
        &exerciser_quote_asset_keys,
        &exerciser_authority_keys.pubkey(),
        &quote_asset_mint_keys.pubkey(),
        &exerciser_authority_keys,
    );
    // add >= amount_per_contract of underlying asset to the src account
    let _mint_to_res = mint_tokens_to_account(
        &client,
        &spl_token::id(),
        &quote_asset_mint_keys.pubkey(),
        &exerciser_quote_asset_keys.pubkey(),
        &asset_authority_keys.pubkey(),
        vec![&asset_authority_keys],
        option_market.quote_amount_per_contract,
    )
    .unwrap();

    Ok((
        exerciser_authority_keys,
        exerciser_quote_asset_keys,
        exerciser_underlying_asset_keys,
    ))
}
