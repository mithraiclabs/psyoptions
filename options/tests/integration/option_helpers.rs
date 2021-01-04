use solana_program::clock::UnixTimestamp;
use crate::{
    solana_helpers::{create_account_with_lamports, send_and_confirm_transaction},
    spl_helpers::{
        create_spl_account_uninitialized, create_spl_mint_account,
        create_spl_mint_account_uninitialized,
    },
};
use solana_client::{client_error::ClientError, rpc_client::RpcClient};
use solana_options::market::OptionMarket;
use solana_program::{program_pack::Pack, pubkey::Pubkey, system_instruction};
use solana_sdk::{
    commitment_config::CommitmentConfig,
    message::Message,
    signature::{Keypair, Signer},
    transaction::Transaction,
};

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
    strike_price: u64,
    expiry: UnixTimestamp,
) -> Result<(Keypair, Keypair, Keypair, Keypair, Pubkey, Pubkey), ClientError> {
    let payer_keys = create_account_with_lamports(&client, 10000000000);
    let options_spl_mint = Keypair::new();
    let options_market_keys = Keypair::new();

    let underlying_spl = Keypair::new();
    let quote_spl = Keypair::new();
    let underlying_spl_pool = Keypair::new();

    // create the spl mints to be used in the options market
    create_spl_mint_account(&client, &underlying_spl, &payer_keys).unwrap();
    create_spl_mint_account(&client, &quote_spl, &payer_keys).unwrap();
    create_spl_account_uninitialized(&client, &underlying_spl_pool, &payer_keys).unwrap();

    create_accounts_for_options_market(
        &client,
        &program_id,
        &options_spl_mint,
        &options_market_keys,
        &payer_keys,
    )?;

    let init_market_ix = solana_options::instruction::initiailize_market(
        &program_id,
        &underlying_spl.pubkey(),
        &quote_spl.pubkey(),
        &options_spl_mint.pubkey(),
        &options_market_keys.pubkey(),
        &underlying_spl_pool.pubkey(),
        amount_per_contract,
        strike_price,
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
    ))
}
