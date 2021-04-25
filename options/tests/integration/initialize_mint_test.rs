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

    let payer_keys = solana_helpers::create_account_with_lamports(&client, 10000000000);
    let option_mint_keys = Keypair::new();
    let writer_token_mint_keys = Keypair::new();
    let options_market_keys = Keypair::new();

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
        &options_market_keys,
        &payer_keys,
    )
    .unwrap();

    //create the IX to init the market
    let underlying_amount_per_contract = 10_000_000_000;
    let quote_amount_per_contract = 50_000_000_000; // strike price of 5
    let expiry = 0;
    let init_market_ix = solana_options::instruction::initialize_market(
        &options_program_id,
        &underlying_mint_keys.pubkey(),
        &quote_mint_keys.pubkey(),
        &option_mint_keys.pubkey(),
        &writer_token_mint_keys.pubkey(),
        &options_market_keys.pubkey(),
        &underlying_asset_pool_keys.pubkey(),
        &quote_asset_pool_keys.pubkey(),
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
        &[&options_market_keys.pubkey().to_bytes()[..32]],
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
        .get_account_data(&options_market_keys.pubkey())
        .unwrap();
    let option_market =
        solana_options::market::OptionMarket::unpack(&option_market_data[..]).unwrap();
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

    let payer_keys = solana_helpers::create_account_with_lamports(&client, 10000000000);
    let option_mint_keys = Keypair::new();
    let writer_token_mint_keys = Keypair::new();
    let options_market_keys = Keypair::new();

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
        &options_market_keys,
        &payer_keys,
    )
    .unwrap();

    //create the IX to init the market
    let amount_per_contract = 100;
    let quote_amount_per_contract = 500; // strike price of 5
    let expiry = 0;
    let init_market_ix = solana_options::instruction::initialize_market(
        &options_program_id,
        &underlying_mint_keys.pubkey(),
        &underlying_mint_keys.pubkey(),
        &option_mint_keys.pubkey(),
        &writer_token_mint_keys.pubkey(),
        &options_market_keys.pubkey(),
        &underlying_asset_pool_keys.pubkey(),
        &quote_asset_pool_keys.pubkey(),
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
#[should_panic(expected = "Error processing Instruction 0: custom program error: 0xa")]
fn should_fail_to_reinitialize_market() {
    let client = RpcClient::new_with_commitment(
        "http://localhost:8899".to_string(),
        CommitmentConfig::processed(),
    );
    let options_program_id = &PROGRAM_KEY;

    let payer_keys = solana_helpers::create_account_with_lamports(&client, 10000000000);
    let option_mint_keys = Keypair::new();
    let writer_token_mint_keys = Keypair::new();
    let options_market_keys = Keypair::new();

    println!("Option market keys {}", options_market_keys.pubkey());

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
        &options_market_keys,
        &payer_keys,
    )
    .unwrap();

    //create the IX to init the market
    let underlying_amount_per_contract = 100;
    let quote_amount_per_contract = 500; // strike price of 5
    let expiry = 0;
    let init_market_ix = solana_options::instruction::initialize_market(
        &options_program_id,
        &underlying_mint_keys.pubkey(),
        &quote_mint_keys.pubkey(),
        &option_mint_keys.pubkey(),
        &writer_token_mint_keys.pubkey(),
        &options_market_keys.pubkey(),
        &underlying_asset_pool_keys.pubkey(),
        &quote_asset_pool_keys.pubkey(),
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

    // Set up new accounts to be used on the same market

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
    create_spl_mint_account_uninitialized(&client, &option_mint_keys, &payer_keys).unwrap();
    create_spl_mint_account_uninitialized(&client, &writer_token_mint_keys, &payer_keys).unwrap();

    let underlying_amount_per_contract = 10;
    let quote_amount_per_contract = 500; // strike price of 5
    let expiry = 0;
    let init_market_ix = solana_options::instruction::initialize_market(
        &options_program_id,
        &underlying_mint_keys.pubkey(),
        &quote_mint_keys.pubkey(),
        &option_mint_keys.pubkey(),
        &writer_token_mint_keys.pubkey(),
        &options_market_keys.pubkey(),
        &underlying_asset_pool_keys.pubkey(),
        &quote_asset_pool_keys.pubkey(),
        underlying_amount_per_contract,
        quote_amount_per_contract,
        expiry,
    )
    .unwrap();
    let signers = vec![&payer_keys];
    solana_helpers::send_and_confirm_transaction(
        &client,
        init_market_ix,
        &payer_keys.pubkey(),
        signers,
    )
    .unwrap();
}
