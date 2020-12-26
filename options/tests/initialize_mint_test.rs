use solana_client::rpc_client::RpcClient;
use solana_program::{program_option::COption, program_pack::Pack};
use solana_sdk::{
    commitment_config::CommitmentConfig,
    pubkey::Pubkey,
    signature::{Keypair, Signer},
};
use spl_token::state::Mint;
mod option_helpers;
mod solana_helpers;

#[test]

fn test_integration() {
    let client = RpcClient::new_with_commitment(
        "http://localhost:8899".to_string(),
        CommitmentConfig::recent(),
    );
    let options_program_id = solana_helpers::load_bpf_program(&client, "solana_options");

    let payer_keys = solana_helpers::create_account_with_lamports(&client, 10000000000);
    let options_spl_mint = Keypair::new();
    let options_market_keys = Keypair::new();

    let underlying_spl = Keypair::new();
    let quote_spl = Keypair::new();
    let underlying_spl_pool = Keypair::new();

    // create the spl mints to be used in the options market
    option_helpers::create_spl_mint_account(&client, &underlying_spl, &payer_keys).unwrap();
    option_helpers::create_spl_mint_account(&client, &quote_spl, &payer_keys).unwrap();
    option_helpers::create_spl_account_uninitialized(&client, &underlying_spl_pool, &payer_keys)
        .unwrap();

    option_helpers::create_accounts_for_options_market(
        &client,
        &options_program_id,
        &options_spl_mint,
        &options_market_keys,
        &payer_keys,
    )
    .unwrap();

    //create the IX to init the market
    let amount_per_contract = 100;
    let strike_price = 5;
    let expiry = 0;
    let init_market_ix = solana_options::instruction::initiailize_market(
        &options_program_id,
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
    // fire TX to do it
    let signers = vec![&payer_keys];
    solana_helpers::send_and_confirm_transaction(
        &client,
        init_market_ix,
        &payer_keys.pubkey(),
        signers,
    )
    .unwrap();

    let (options_spl_authority_pubkey, _bump_seed) = Pubkey::find_program_address(
        &[&options_spl_mint.pubkey().to_bytes()[..32]],
        &options_program_id,
    );

    // assert program id is the mint authority
    let option_mint_data = client.get_account_data(&options_spl_mint.pubkey()).unwrap();
    let option_mint = Mint::unpack(&option_mint_data[..]).unwrap();
    assert_eq!(
        option_mint.mint_authority,
        COption::Some(options_spl_authority_pubkey)
    );
    assert_eq!(option_mint.supply, 0);
    assert_eq!(option_mint.decimals, 0);
    assert!(option_mint.is_initialized);
    assert_eq!(option_mint.freeze_authority, COption::None);

    // assert the option market data is correct
    let option_market_data = client
        .get_account_data(&options_market_keys.pubkey())
        .unwrap();
    let option_market =
        solana_options::market::OptionMarket::unpack(&option_market_data[..]).unwrap();
    assert_eq!(
        option_market.underlying_asset_address,
        underlying_spl.pubkey()
    );
    assert_eq!(option_market.quote_asset_address, quote_spl.pubkey());
    assert_eq!(option_market.amount_per_contract, amount_per_contract);
    assert_eq!(option_market.strike_price, strike_price);
    assert_eq!(option_market.expiration_unix_timestamp, expiry);
    assert_eq!(
        option_market.asset_pool_address,
        underlying_spl_pool.pubkey()
    );
    assert_eq!(option_market.registry_length, 0);
    assert_eq!(option_market.option_writer_registry, vec![]);
}

#[test]
fn should_fail_with_same_quote_underlying_assets() {
    assert!(false);
}
