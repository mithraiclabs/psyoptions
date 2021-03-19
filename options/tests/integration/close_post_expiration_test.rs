use crate::{
  option_helpers::{create_and_add_option_writer, init_option_market},
  solana_helpers, PROGRAM_KEY,
};
use serial_test::serial;
use solana_client::rpc_client::RpcClient;
use solana_options::market::OptionMarket;
use solana_program::{
  clock::Clock,
  program_pack::Pack,
  sysvar::{clock, Sysvar},
};
use solana_sdk::{
  account::create_account_infos, commitment_config::CommitmentConfig, signature::Signer,
};
use spl_token::state::{Account, Mint};
use std::{thread, time::Duration};

#[test]
#[serial]
/// Option Writer closing out should receive underlying asset
pub fn test_sucessful_close_post_expiration() {
  // Create the options market
  let client = RpcClient::new_with_commitment(
    "http://localhost:8899".to_string(),
    CommitmentConfig::processed(),
  );
  let options_program_id = &PROGRAM_KEY;
  let underlying_amount_per_contract = 100;
  let quote_amount_per_contract = 500; // strike price of 5
                                       // Get the current network clock time to use as the basis for the expiration
  let sysvar_clock_acct = client.get_account(&clock::id()).unwrap();
  let accounts = &mut [(clock::id(), sysvar_clock_acct)];
  let sysvar_clock_acct_info = &create_account_infos(accounts)[0];
  let clock = Clock::from_account_info(&sysvar_clock_acct_info).unwrap();
  let expiry = clock.unix_timestamp + 30;
  // Create the option market
  let (
    underlying_asset_mint_keys,
    quote_asset_mint_keys,
    option_mint_keys,
    writer_token_mint_keys,
    asset_authority_keys,
    underlying_asset_pool_key,
    _quote_asset_pool_key,
    option_market_key,
  ) = init_option_market(
    &client,
    &options_program_id,
    underlying_amount_per_contract,
    quote_amount_per_contract,
    expiry,
  )
  .unwrap();

  // Add 2 option writers to it
  let (
    _option_writer_option_keys,
    option_writer_writer_token_mint_keys,
    option_writer_underlying_asset_keys,
    option_writer_keys,
  ) = create_and_add_option_writer(
    &client,
    &options_program_id,
    &underlying_asset_mint_keys,
    &asset_authority_keys,
    &quote_asset_mint_keys,
    &option_mint_keys,
    &writer_token_mint_keys,
    &underlying_asset_pool_key,
    &option_market_key,
    underlying_amount_per_contract,
  )
  .unwrap();
  create_and_add_option_writer(
    &client,
    &options_program_id,
    &underlying_asset_mint_keys,
    &asset_authority_keys,
    &quote_asset_mint_keys,
    &option_mint_keys,
    &writer_token_mint_keys,
    &underlying_asset_pool_key,
    &option_market_key,
    underlying_amount_per_contract,
  )
  .unwrap();

  let option_market_data = client.get_account_data(&option_market_key).unwrap();
  let option_market = OptionMarket::unpack(&option_market_data[..]).unwrap();

  // generate the exercise_post_expiration instruction
  let close_post_exirpation_ix = solana_options::instruction::close_post_expiration(
    &options_program_id,
    &option_market_key,
    &option_market.underlying_asset_pool,
    &option_mint_keys.pubkey(),
    &writer_token_mint_keys.pubkey(),
    &option_writer_writer_token_mint_keys.pubkey(),
    &option_writer_underlying_asset_keys.pubkey(),
  )
  .unwrap();
  let underlying_asset_pool_acct_data =
    client.get_account_data(&underlying_asset_pool_key).unwrap();
  let initial_underlying_asset_pool_acct =
    Account::unpack(&underlying_asset_pool_acct_data[..]).unwrap();
  let initial_writer_token_mint_data = client
    .get_account_data(&writer_token_mint_keys.pubkey())
    .unwrap();
  let initial_writer_token_mint_act = Mint::unpack(&initial_writer_token_mint_data[..]).unwrap();
  let initial_option_writer_writer_token_acct_data =
    client.get_account_data(&underlying_asset_pool_key).unwrap();
  let initial_option_writer_writer_token_acct =
    Account::unpack(&initial_option_writer_writer_token_acct_data[..]).unwrap();
  let initial_option_writer_underlying_asset_acct_data = client
    .get_account_data(&option_writer_underlying_asset_keys.pubkey())
    .unwrap();
  let initial_option_writer_underlying_asset_acct =
    Account::unpack(&initial_option_writer_underlying_asset_acct_data[..]).unwrap();

  // Sleep 20 seconds so the market is expired
  thread::sleep(Duration::from_secs(20));

  // Send the transaction
  let signers = vec![&option_writer_keys];
  solana_helpers::send_and_confirm_transaction(
    &client,
    close_post_exirpation_ix,
    &option_writer_keys.pubkey(),
    signers,
  )
  .unwrap();

  // assert that the underlying_asset_pool size decreased by amount_per_contract
  let underlying_asset_pool_acct_data =
    client.get_account_data(&underlying_asset_pool_key).unwrap();
  let underlying_asset_pool_acct = Account::unpack(&underlying_asset_pool_acct_data[..]).unwrap();
  assert_eq!(
    underlying_asset_pool_acct.mint,
    underlying_asset_mint_keys.pubkey()
  );
  let expected_pool_amount =
    initial_underlying_asset_pool_acct.amount - underlying_amount_per_contract;
  assert_eq!(underlying_asset_pool_acct.amount, expected_pool_amount);

  // assert the wwriter Token supply decreased (i.e. should burn not transfer)
  let writer_token_mint_data = client
    .get_account_data(&writer_token_mint_keys.pubkey())
    .unwrap();
  let writer_token_mint_acct = Mint::unpack(&writer_token_mint_data[..]).unwrap();
  assert_eq!(
    writer_token_mint_acct.supply,
    initial_writer_token_mint_act.supply - 1
  );

  // assert that the option writer burned one Writer Token
  let option_writer_writer_token_acct_data =
    client.get_account_data(&underlying_asset_pool_key).unwrap();
  let option_writer_writer_token_acct =
    Account::unpack(&option_writer_writer_token_acct_data[..]).unwrap();
  assert_eq!(
    option_writer_writer_token_acct.mint,
    writer_token_mint_keys.pubkey()
  );
  assert_eq!(
    option_writer_writer_token_acct.amount,
    initial_option_writer_writer_token_acct.amount - 1
  );

  // assert that the option writer received the underlying asset
  let option_writer_underlying_asset_acct_data = client
    .get_account_data(&option_writer_underlying_asset_keys.pubkey())
    .unwrap();
  let option_writer_underlying_asset_acct =
    Account::unpack(&option_writer_underlying_asset_acct_data[..]).unwrap();
  assert_eq!(
    option_writer_underlying_asset_acct.amount,
    initial_option_writer_underlying_asset_acct.amount + underlying_amount_per_contract
  )
}

#[test]
#[serial]
#[should_panic(expected = "Error processing Instruction 0: custom program error: 0x4")]
pub fn test_panic_when_expiration_has_not_passed() {
  // Create the options market
  let client = RpcClient::new_with_commitment(
    "http://localhost:8899".to_string(),
    CommitmentConfig::processed(),
  );
  let options_program_id = &PROGRAM_KEY;
  let amount_per_contract = 100;
  let quote_amount_per_contract = 500;
  let expiry = 999_999_999_999_999_999;
  // Create the option market
  let (
    underlying_asset_mint_keys,
    quote_asset_mint_keys,
    option_mint_keys,
    writer_token_mint_keys,
    asset_authority_keys,
    underlying_asset_pool_key,
    quote_asset_pool_key,
    option_market_key,
  ) = init_option_market(
    &client,
    &options_program_id,
    amount_per_contract,
    quote_amount_per_contract,
    expiry,
  )
  .unwrap();

  // Add 2 option writers to it
  let (
    option_writer_option_keys,
    option_writer_writer_token_mint_keys,
    option_writer_underlying_asset_keys,
    option_writer_keys,
  ) = create_and_add_option_writer(
    &client,
    &options_program_id,
    &underlying_asset_mint_keys,
    &asset_authority_keys,
    &quote_asset_mint_keys,
    &option_mint_keys,
    &writer_token_mint_keys,
    &underlying_asset_pool_key,
    &option_market_key,
    amount_per_contract,
  )
  .unwrap();
  create_and_add_option_writer(
    &client,
    &options_program_id,
    &underlying_asset_mint_keys,
    &asset_authority_keys,
    &quote_asset_mint_keys,
    &option_mint_keys,
    &writer_token_mint_keys,
    &underlying_asset_pool_key,
    &option_market_key,
    amount_per_contract,
  )
  .unwrap();

  let option_market_data = client.get_account_data(&option_market_key).unwrap();
  let option_market = OptionMarket::unpack(&option_market_data[..]).unwrap();

  // generate the exercise_post_expiration instruction
  let close_post_exirpation_ix = solana_options::instruction::close_post_expiration(
    &options_program_id,
    &option_market_key,
    &option_market.underlying_asset_pool,
    &option_mint_keys.pubkey(),
    &writer_token_mint_keys.pubkey(),
    &option_writer_writer_token_mint_keys.pubkey(),
    &option_writer_underlying_asset_keys.pubkey(),
  )
  .unwrap();
  // Send the transaction
  let signers = vec![&option_writer_keys];
  solana_helpers::send_and_confirm_transaction(
    &client,
    close_post_exirpation_ix,
    &option_writer_keys.pubkey(),
    signers,
  )
  .unwrap();
}
