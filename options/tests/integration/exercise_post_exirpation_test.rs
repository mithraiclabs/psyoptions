use crate::{
  option_helpers::{create_and_add_option_writer, init_option_market},
  solana_helpers,
  spl_helpers::{create_spl_account, mint_tokens_to_account},
};
use solana_client::rpc_client::RpcClient;
use solana_options::{instruction, market::OptionMarket};
use solana_program::program_pack::Pack;
use solana_sdk::{
  commitment_config::CommitmentConfig,
  signature::{Keypair, Signer},
};
use spl_token::state::{Account, Mint};
use std::{
  thread::sleep,
  time::{Duration, SystemTime, UNIX_EPOCH},
};

#[test]
pub fn test_sucessful_exercise_post_expiration() {
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
  );
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
  );

  // pick one of the option writers from the OptionMarket account
  let option_market_data = client.get_account_data(&option_market_key).unwrap();
  let option_market = OptionMarket::unpack(&option_market_data[..]).unwrap();
  let option_writer = &option_market.option_writer_registry[0];
  // TODO create an option exerciser with SPL accounts we can check
  // TODO generate the exercise_post_expiration instruction
  let exercise_post_exirpation_ix =
    solana_options::instruction::exercise_post_expiration(
      &options_program_id,
      option_writer,
      &option_market_key,

    );

  // Sleep 10 seconds
  sleep(Duration::from_secs(10));

  // TODO assert that the OptionMarket.registry_length decremented
  // TODO assert that the 1 OptionWriter is removed from the OptionMarket.option_writer_registry
  // TODO assert that the underlying_asset_pool size decreased by amount_per_contract
  // TODO assert that the exerciser received the underlying asset
  // TODO assert that the exerciser's quote asset account is less the amount required to close the contract
}

#[test]
pub fn test_panic_when_expiration_has_not_passed() {
  assert!(false)
}
