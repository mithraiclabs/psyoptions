use crate::{
  option_helpers::{create_and_add_option_writer, create_exerciser, init_option_market},
  solana_helpers
};
use solana_client::rpc_client::RpcClient;
use solana_options::{market::OptionMarket};
use solana_program::{
  clock::Clock,
  program_pack::Pack,
  sysvar::{clock, Sysvar},
};
use solana_sdk::{
  account::create_account_infos,
  commitment_config::CommitmentConfig,
  signature::Signer,
};
use spl_token::state::{Account, Mint};
use std::{
  thread,
  time::{Duration, SystemTime, UNIX_EPOCH},
};
use serial_test::serial;

#[test]
#[serial]
pub fn test_sucessful_close_post_expiration() {
  // Create the options market
  let client = RpcClient::new_with_commitment(
    "http://localhost:8899".to_string(),
    CommitmentConfig::recent(),
  );
  let options_program_id = solana_helpers::load_bpf_program(&client, "solana_options");
  let amount_per_contract = 100;
  let strike_price = 5;
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
    asset_authority_keys,
    underlying_asset_pool_key,
    option_market_key,
  ) = init_option_market(
    &client,
    &options_program_id,
    amount_per_contract,
    strike_price,
    expiry,
  )
  .unwrap();

  // Add 2 option writers to it
  create_and_add_option_writer(
    &client,
    &options_program_id,
    &underlying_asset_mint_keys,
    &asset_authority_keys,
    &quote_asset_mint_keys,
    &option_mint_keys,
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
    &underlying_asset_pool_key,
    &option_market_key,
    amount_per_contract,
  )
  .unwrap();

  // pick one of the option writers from the OptionMarket account
  let option_market_data = client.get_account_data(&option_market_key).unwrap();
  let option_market = OptionMarket::unpack(&option_market_data[..]).unwrap();
  let option_writer = &option_market.option_writer_registry[0];
  // create an option exerciser with SPL accounts we can check
  let (exerciser_authority_keys, exerciser_quote_asset_keys, exerciser_underlying_asset_keys) =
    create_exerciser(
      &client,
      &asset_authority_keys,
      &underlying_asset_mint_keys,
      &quote_asset_mint_keys,
      &option_market,
    )
    .unwrap();

  // generate the exercise_post_expiration instruction
  let close_post_exirpation_ix = solana_options::instruction::close_post_expiration(
    &options_program_id,
    option_writer,
    &option_mint_keys.pubkey(),
    &option_market.asset_pool_address,
  )
  .unwrap();
  let underlying_asset_pool_acct_data =
    client.get_account_data(&underlying_asset_pool_key).unwrap();
  let initial_underlying_asset_pool_acct =
    Account::unpack(&underlying_asset_pool_acct_data[..]).unwrap();

  // Hold some initial values in memory for assertions
  let writer_underlying_asset_acct_data = client
    .get_account_data(&option_writer.underlying_asset_acct_address)
    .unwrap();
  let writer_underlying_asset_acct = Account::unpack(&writer_underlying_asset_acct_data[..]).unwrap();

  // Sleep 20 seconds so the market is expired
  thread::sleep(Duration::from_secs(20));

  // Send the transaction
  let signers = vec![&exerciser_authority_keys];
  solana_helpers::send_and_confirm_transaction(
    &client,
    close_post_exirpation_ix,
    &exerciser_authority_keys.pubkey(),
    signers,
  )
  .unwrap();

  let option_market_data = client.get_account_data(&option_market_key).unwrap();
  let updated_option_market = OptionMarket::unpack(&option_market_data[..]).unwrap();
  // assert that the OptionMarket.registry_length decremented
  assert_eq!(
    updated_option_market.registry_length,
    option_market.registry_length - 1
  );
  // assert that the 1 OptionWriter is removed from the OptionMarket.option_writer_registry
  // TODO make this more robust/exhaustive
  assert_ne!(
    *option_writer,
    updated_option_market.option_writer_registry[0]
  );

  // assert that the underlying_asset_pool size decreased by amount_per_contract
  let underlying_asset_pool_acct_data =
    client.get_account_data(&underlying_asset_pool_key).unwrap();
  let underlying_asset_pool_acct = Account::unpack(&underlying_asset_pool_acct_data[..]).unwrap();
  assert_eq!(
    underlying_asset_pool_acct.mint,
    underlying_asset_mint_keys.pubkey()
  );
  let expected_pool_amount = initial_underlying_asset_pool_acct.amount - amount_per_contract;
  assert_eq!(underlying_asset_pool_acct.amount, expected_pool_amount);

  // assert that the option writer received the underlying asset
  let writer_underlying_asset_acct_data = client
    .get_account_data(&option_writer.underlying_asset_acct_address)
    .unwrap();
  let updated_writer_underlying_asset_acct = Account::unpack(&writer_underlying_asset_acct_data[..]).unwrap();
  assert_eq!(
    writer_underlying_asset_acct.amount,
    updated_writer_underlying_asset_acct.amount + option_market.amount_per_contract
  );
}

#[test]
#[serial]
#[should_panic(expected = "Error processing Instruction 0: custom program error: 0x4")]
pub fn test_panic_when_expiration_has_not_passed() {
  // Create the options market
  let client = RpcClient::new_with_commitment(
    "http://localhost:8899".to_string(),
    CommitmentConfig::recent(),
  );
  let options_program_id = solana_helpers::load_bpf_program(&client, "solana_options");
  let amount_per_contract = 100;
  let strike_price = 5;
  let now = SystemTime::now();
  let expiry = (now + Duration::from_secs(10))
    .duration_since(UNIX_EPOCH)
    .unwrap()
    .as_secs() as i64;
  // Create the option market
  let (
    underlying_asset_mint_keys,
    quote_asset_mint_keys,
    option_mint_keys,
    asset_authority_keys,
    underlying_asset_pool_key,
    option_market_key,
  ) = init_option_market(
    &client,
    &options_program_id,
    amount_per_contract,
    strike_price,
    expiry,
  )
  .unwrap();

  // Add 2 option writers to it
  create_and_add_option_writer(
    &client,
    &options_program_id,
    &underlying_asset_mint_keys,
    &asset_authority_keys,
    &quote_asset_mint_keys,
    &option_mint_keys,
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
    &underlying_asset_pool_key,
    &option_market_key,
    amount_per_contract,
  )
  .unwrap();

  // pick one of the option writers from the OptionMarket account
  let option_market_data = client.get_account_data(&option_market_key).unwrap();
  let option_market = OptionMarket::unpack(&option_market_data[..]).unwrap();
  let option_writer = &option_market.option_writer_registry[0];
  // create an option exerciser with SPL accounts we can check
  let (exerciser_authority_keys, exerciser_quote_asset_keys, exerciser_underlying_asset_keys) =
    create_exerciser(
      &client,
      &asset_authority_keys,
      &underlying_asset_mint_keys,
      &quote_asset_mint_keys,
      &option_market,
    )
    .unwrap();

  // generate the exercise_post_expiration instruction
  let close_post_exirpation_ix = solana_options::instruction::close_post_expiration(
    &options_program_id,
    option_writer,
    &option_mint_keys.pubkey(),
    &option_market.asset_pool_address,
  )
  .unwrap();
  // Send the transaction
  let signers = vec![&exerciser_authority_keys];
  solana_helpers::send_and_confirm_transaction(
    &client,
    close_post_exirpation_ix,
    &exerciser_authority_keys.pubkey(),
    signers,
  )
  .unwrap();
}
