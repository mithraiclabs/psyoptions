use crate::{
    option_helpers, solana_helpers,
    spl_helpers::{
        create_spl_account_uninitialized, create_spl_mint_account,
        create_spl_mint_account_uninitialized,
    },
    PROGRAM_KEY,
};
use solana_client::rpc_client::RpcClient;
use solana_program::{program_option::COption, program_pack::Pack};
use solana_sdk::{
    commitment_config::CommitmentConfig,
    program_pack::IsInitialized,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
};
use spl_token::state::{Account, Mint};

#[test]

fn test_initialize_market() {
    let client = RpcClient::new_with_commitment(
        "http://localhost:8899".to_string(),
        CommitmentConfig::processed(),
    );
    let options_program_id = &PROGRAM_KEY;

    let payer_keys = solana_helpers::create_account_with_lamports(&client, 10_000_000_000);
    let option_mint_keys = Keypair::new();
    let writer_token_mint_keys = Keypair::new();
    let underlying_amount_per_contract: u64 = 10_000_000_000;
    let quote_amount_per_contract: u64 = 50_000_000_000; // strike price of 5
    let expiry: i64 = 0;

    let underlying_mint_keys = Keypair::new();
    let quote_mint_keys = Keypair::new();
    let underlying_asset_pool_keys = Keypair::new();
    let quote_asset_pool_keys = Keypair::new();

    let (options_market_key, _no_duplication_bump) = Pubkey::find_program_address(
        &[
            &underlying_mint_keys.pubkey().to_bytes(),
            &quote_mint_keys.pubkey().to_bytes(),
            &underlying_amount_per_contract.to_le_bytes(),
            &quote_amount_per_contract.to_le_bytes(),
            &expiry.to_le_bytes(),
        ],
        &options_program_id,
    );

    // create the spl mints to be used in the options market
    create_spl_mint_account(&client, &underlying_mint_keys, &payer_keys).unwrap();
    create_spl_mint_account(&client, &quote_mint_keys, &payer_keys).unwrap();
    create_spl_account_uninitialized(&client, &underlying_asset_pool_keys, &payer_keys).unwrap();
    create_spl_account_uninitialized(&client, &quote_asset_pool_keys, &payer_keys).unwrap();

    option_helpers::create_accounts_for_options_market(
        &client,
        &options_program_id,
        &option_mint_keys,
        &writer_token_mint_keys,
        &payer_keys,
    )
    .unwrap();

    //create the IX to init the market
    let init_market_ix = psyoptions::instruction::initialize_market(
        &options_program_id,
        &underlying_mint_keys.pubkey(),
        &quote_mint_keys.pubkey(),
        &option_mint_keys.pubkey(),
        &writer_token_mint_keys.pubkey(),
        &underlying_asset_pool_keys.pubkey(),
        &quote_asset_pool_keys.pubkey(),
        &payer_keys.pubkey(),
        underlying_amount_per_contract,
        quote_amount_per_contract,
        expiry,
    )
    .unwrap();
    // fire TX to do it
    let signers = vec![&payer_keys];
    solana_helpers::send_and_confirm_transaction(
        &client,
        init_market_ix,
        &payer_keys.pubkey(),
        signers,
    )
    .unwrap();

    let (option_authority_pubkey, _bump_seed) = Pubkey::find_program_address(
        &[&options_market_key.to_bytes()[..32]],
        &options_program_id,
    );

    // assert program id is the option mint authority
    let option_mint_data = client.get_account_data(&option_mint_keys.pubkey()).unwrap();
    let option_mint = Mint::unpack(&option_mint_data[..]).unwrap();
    assert_eq!(
        option_mint.mint_authority,
        COption::Some(option_authority_pubkey)
    );
    assert_eq!(option_mint.supply, 0);
    assert_eq!(option_mint.decimals, 0);
    assert!(option_mint.is_initialized);
    assert_eq!(option_mint.freeze_authority, COption::None);

    // assert program id is the writer token mint authority
    let writer_token_mint_data = client
        .get_account_data(&writer_token_mint_keys.pubkey())
        .unwrap();
    let writer_token_mint = Mint::unpack(&writer_token_mint_data[..]).unwrap();
    assert_eq!(
        writer_token_mint.mint_authority,
        COption::Some(option_authority_pubkey)
    );
    assert_eq!(writer_token_mint.supply, 0);
    assert_eq!(writer_token_mint.decimals, 0);
    assert!(writer_token_mint.is_initialized);
    assert_eq!(writer_token_mint.freeze_authority, COption::None);

    // assert underlying asset pool is initialized
    let underlying_asset_pool_acct_data = client
        .get_account_data(&underlying_asset_pool_keys.pubkey())
        .unwrap();
    let underlying_asset_pool_acct = Account::unpack(&underlying_asset_pool_acct_data[..]).unwrap();
    assert!(underlying_asset_pool_acct.is_initialized());

    // assert quote asset pool is initialized
    let quote_asset_pool_acct_data = client
        .get_account_data(&quote_asset_pool_keys.pubkey())
        .unwrap();
    let quote_asset_pool_acct = Account::unpack(&quote_asset_pool_acct_data[..]).unwrap();
    assert!(quote_asset_pool_acct.is_initialized());

    // assert the option market data is correct
    let option_market_data = client
        .get_account_data(&options_market_key)
        .unwrap();
    let option_market = psyoptions::market::OptionMarket::unpack(&option_market_data[..]).unwrap();
    assert_eq!(option_market.option_mint, option_mint_keys.pubkey());
    assert_eq!(
        option_market.writer_token_mint,
        writer_token_mint_keys.pubkey()
    );
    assert_eq!(
        option_market.underlying_asset_mint,
        underlying_mint_keys.pubkey()
    );
    assert_eq!(option_market.quote_asset_mint, quote_mint_keys.pubkey());
    assert_eq!(
        option_market.underlying_amount_per_contract,
        underlying_amount_per_contract
    );
    assert_eq!(
        option_market.quote_amount_per_contract,
        quote_amount_per_contract
    );
    assert_eq!(option_market.expiration_unix_timestamp, expiry);
    assert_eq!(
        option_market.underlying_asset_pool,
        underlying_asset_pool_keys.pubkey()
    );
    assert_eq!(
        option_market.quote_asset_pool,
        quote_asset_pool_keys.pubkey()
    );
}

#[test]
#[should_panic(expected = "Error processing Instruction 0: custom program error: 0x2")]
fn should_fail_with_same_quote_underlying_assets() {
    let client = RpcClient::new_with_commitment(
        "http://localhost:8899".to_string(),
        CommitmentConfig::processed(),
    );
    let options_program_id = &PROGRAM_KEY;

    let payer_keys = solana_helpers::create_account_with_lamports(&client, 10_000_000_000);
    let option_mint_keys = Keypair::new();
    let writer_token_mint_keys = Keypair::new();

    let underlying_mint_keys = Keypair::new();
    let underlying_asset_pool_keys = Keypair::new();
    let quote_asset_pool_keys = Keypair::new();

    // create the spl mints to be used in the options market
    create_spl_mint_account(&client, &underlying_mint_keys, &payer_keys).unwrap();
    create_spl_account_uninitialized(&client, &underlying_asset_pool_keys, &payer_keys).unwrap();

    option_helpers::create_accounts_for_options_market(
        &client,
        &options_program_id,
        &option_mint_keys,
        &writer_token_mint_keys,
        &payer_keys,
    )
    .unwrap();

    //create the IX to init the market
    let amount_per_contract = 100;
    let quote_amount_per_contract = 500; // strike price of 5
    let expiry = 0;
    let init_market_ix = psyoptions::instruction::initialize_market(
        &options_program_id,
        &underlying_mint_keys.pubkey(),
        &underlying_mint_keys.pubkey(),
        &option_mint_keys.pubkey(),
        &writer_token_mint_keys.pubkey(),
        &underlying_asset_pool_keys.pubkey(),
        &quote_asset_pool_keys.pubkey(),
        &payer_keys.pubkey(),
        amount_per_contract,
        quote_amount_per_contract,
        expiry,
    )
    .unwrap();
    // fire TX to do it
    let signers = vec![&payer_keys];
    solana_helpers::send_and_confirm_transaction(
        &client,
        init_market_ix,
        &payer_keys.pubkey(),
        signers,
    )
    .unwrap();
}

#[test]
#[should_panic(expected = "already in use")]
fn test_no_duplicate_markets() {
    let client = RpcClient::new_with_commitment(
        "http://localhost:8899".to_string(),
        CommitmentConfig::processed(),
    );
    let options_program_id = &PROGRAM_KEY;

    let payer_keys = solana_helpers::create_account_with_lamports(&client, 10_000_000_000);
    let option_mint_keys = Keypair::new();
    let writer_token_mint_keys = Keypair::new();

    let underlying_mint_keys = Keypair::new();
    let quote_mint_keys = Keypair::new();
    let underlying_asset_pool_keys = Keypair::new();
    let quote_asset_pool_keys = Keypair::new();

    // create the spl mints to be used in the options market
    create_spl_mint_account(&client, &underlying_mint_keys, &payer_keys).unwrap();
    create_spl_mint_account(&client, &quote_mint_keys, &payer_keys).unwrap();
    create_spl_account_uninitialized(&client, &underlying_asset_pool_keys, &payer_keys).unwrap();
    create_spl_account_uninitialized(&client, &quote_asset_pool_keys, &payer_keys).unwrap();

    option_helpers::create_accounts_for_options_market(
        &client,
        &options_program_id,
        &option_mint_keys,
        &writer_token_mint_keys,
        &payer_keys,
    )
    .unwrap();

    //create the IX to init the market
    let underlying_amount_per_contract = 10_000_000_000;
    let quote_amount_per_contract = 50_000_000_000; // strike price of 5
    let expiry = 0;
    let init_market_ix = psyoptions::instruction::initialize_market(
        &options_program_id,
        &underlying_mint_keys.pubkey(),
        &quote_mint_keys.pubkey(),
        &option_mint_keys.pubkey(),
        &writer_token_mint_keys.pubkey(),
        &underlying_asset_pool_keys.pubkey(),
        &quote_asset_pool_keys.pubkey(),
        &payer_keys.pubkey(),
        underlying_amount_per_contract,
        quote_amount_per_contract,
        expiry,
    )
    .unwrap();
    // fire TX to do it
    let signers = vec![&payer_keys];
    solana_helpers::send_and_confirm_transaction(
        &client,
        init_market_ix,
        &payer_keys.pubkey(),
        signers,
    )
    .unwrap();
    // Create new keys for the option market, spl tokens, etc, but keep the general Option params the same
    let option_mint_keys = Keypair::new();
    let writer_token_mint_keys = Keypair::new();

    let underlying_asset_pool_keys = Keypair::new();
    let quote_asset_pool_keys = Keypair::new();

    // create the spl mints to be used in the options market
    create_spl_account_uninitialized(&client, &underlying_asset_pool_keys, &payer_keys).unwrap();
    create_spl_account_uninitialized(&client, &quote_asset_pool_keys, &payer_keys).unwrap();

    option_helpers::create_accounts_for_options_market(
        &client,
        &options_program_id,
        &option_mint_keys,
        &writer_token_mint_keys,
        &payer_keys,
    )
    .unwrap();

    //create the IX to init the market
    let init_market_ix = psyoptions::instruction::initialize_market(
        &options_program_id,
        &underlying_mint_keys.pubkey(),
        &quote_mint_keys.pubkey(),
        &option_mint_keys.pubkey(),
        &writer_token_mint_keys.pubkey(),
        &underlying_asset_pool_keys.pubkey(),
        &quote_asset_pool_keys.pubkey(),
        &payer_keys.pubkey(),
        underlying_amount_per_contract,
        quote_amount_per_contract,
        expiry,
    )
    .unwrap();
    // fire TX to do it
    let signers = vec![&payer_keys];
    solana_helpers::send_and_confirm_transaction(
        &client,
        init_market_ix,
        &payer_keys.pubkey(),
        signers,
    )
    .unwrap();
}

#[test]
fn test_different_markets() {
    let client = RpcClient::new_with_commitment(
        "http://localhost:8899".to_string(),
        CommitmentConfig::processed(),
    );
    let options_program_id = &PROGRAM_KEY;

    let payer_keys = solana_helpers::create_account_with_lamports(&client, 10_000_000_000);
    let option_mint_keys = Keypair::new();
    let writer_token_mint_keys = Keypair::new();

    let underlying_mint_keys = Keypair::new();
    let quote_mint_keys = Keypair::new();
    let underlying_asset_pool_keys = Keypair::new();
    let quote_asset_pool_keys = Keypair::new();

    // create the spl mints to be used in the options market
    create_spl_mint_account(&client, &underlying_mint_keys, &payer_keys).unwrap();
    create_spl_mint_account(&client, &quote_mint_keys, &payer_keys).unwrap();
    create_spl_account_uninitialized(&client, &underlying_asset_pool_keys, &payer_keys).unwrap();
    create_spl_account_uninitialized(&client, &quote_asset_pool_keys, &payer_keys).unwrap();

    option_helpers::create_accounts_for_options_market(
        &client,
        &options_program_id,
        &option_mint_keys,
        &writer_token_mint_keys,
        &payer_keys,
    )
    .unwrap();

    //create the IX to init the market
    let underlying_amount_per_contract = 10_000_000_000;
    let quote_amount_per_contract = 50_000_000_000; // strike price of 5
    let expiry = 0;
    let init_market_ix = psyoptions::instruction::initialize_market(
        &options_program_id,
        &underlying_mint_keys.pubkey(),
        &quote_mint_keys.pubkey(),
        &option_mint_keys.pubkey(),
        &writer_token_mint_keys.pubkey(),
        &underlying_asset_pool_keys.pubkey(),
        &quote_asset_pool_keys.pubkey(),
        &payer_keys.pubkey(),
        underlying_amount_per_contract,
        quote_amount_per_contract,
        expiry,
    )
    .unwrap();
    // fire TX to do it
    let signers = vec![&payer_keys];
    solana_helpers::send_and_confirm_transaction(
        &client,
        init_market_ix,
        &payer_keys.pubkey(),
        signers,
    )
    .unwrap();
    // Create new keys for the option market, spl tokens, etc, but keep the general Option params the same
    let option_mint_keys = Keypair::new();
    let writer_token_mint_keys = Keypair::new();

    let underlying_asset_pool_keys = Keypair::new();
    let quote_asset_pool_keys = Keypair::new();

    // create the spl mints to be used in the options market
    create_spl_account_uninitialized(&client, &underlying_asset_pool_keys, &payer_keys).unwrap();
    create_spl_account_uninitialized(&client, &quote_asset_pool_keys, &payer_keys).unwrap();

    option_helpers::create_accounts_for_options_market(
        &client,
        &options_program_id,
        &option_mint_keys,
        &writer_token_mint_keys,
        &payer_keys,
    )
    .unwrap();

    //create the IX to init the market
    let init_market_ix = psyoptions::instruction::initialize_market(
        &options_program_id,
        &underlying_mint_keys.pubkey(),
        &quote_mint_keys.pubkey(),
        &option_mint_keys.pubkey(),
        &writer_token_mint_keys.pubkey(),
        &underlying_asset_pool_keys.pubkey(),
        &quote_asset_pool_keys.pubkey(),
        &payer_keys.pubkey(),
        underlying_amount_per_contract,
        2_000_000_000,
        expiry,
    )
    .unwrap();
    // fire TX to do it
    let signers = vec![&payer_keys];
    solana_helpers::send_and_confirm_transaction(
        &client,
        init_market_ix,
        &payer_keys.pubkey(),
        signers,
    )
    .unwrap();
    assert_eq!(true, true);
}
