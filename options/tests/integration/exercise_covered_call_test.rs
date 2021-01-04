use crate::{
  option_helpers::{create_option_writer_accounts, init_option_market, mint_covered_call},
  solana_helpers::{create_account_with_lamports, load_bpf_program, send_and_confirm_transaction},
};
use solana_client::rpc_client::RpcClient;
use solana_options::market::OptionMarket;
use solana_program::program_pack::Pack;
use solana_sdk::{commitment_config::CommitmentConfig, signature::Signer};
use spl_token::state::{Account, Mint};

#[test]
fn test_exercise_covered_call_integration() {
  let client = RpcClient::new_with_commitment(
    "http://localhost:8899".to_string(),
    CommitmentConfig::recent(),
  );
  let options_program_id = load_bpf_program(&client, "solana_options");
  let amount_per_contract = 100;
  let strike_price = 5;
  let expiry = 10;
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
  let option_writer_keys = create_account_with_lamports(&client, 1_000_000_000_000_000);
  let (
    option_writer_underlying_asset_keys,
    option_writer_quote_asset_keys,
    option_writer_option_keys,
  ) = create_option_writer_accounts(
    &client,
    &underlying_asset_mint_keys.pubkey(),
    &quote_asset_mint_keys.pubkey(),
    &option_mint_keys.pubkey(),
    &option_writer_keys,
  )
  .unwrap();

  mint_covered_call(
    &client,
    &options_program_id,
    &option_market_key,
    &option_mint_keys.pubkey(),
    &quote_asset_mint_keys.pubkey(),
    &underlying_asset_mint_keys.pubkey(),
    &asset_authority_keys,
    &option_writer_keys,
    &option_writer_underlying_asset_keys.pubkey(),
    &option_writer_quote_asset_keys.pubkey(),
    &option_writer_option_keys.pubkey(),
  )
  .unwrap();

  let exercise_covered_call_ix =
    solana_options::instruction::exercise_covered_call(&options_program_id).unwrap();
  let signers = vec![&option_writer_keys];
  send_and_confirm_transaction(
    &client,
    exercise_covered_call_ix,
    &option_writer_keys.pubkey(),
    signers,
  )
  .unwrap();

  // assert option market underlying asset pool has decreased to 0
  let underlying_asset_pool_acct_data =
    client.get_account_data(&underlying_asset_pool_key).unwrap();
  let underlying_asset_pool_acct = Account::unpack(&underlying_asset_pool_acct_data[..]).unwrap();
  assert_eq!(
    underlying_asset_pool_acct.mint,
    underlying_asset_mint_keys.pubkey()
  );
  assert_eq!(underlying_asset_pool_acct.amount, 0);

  // assert that the total supply of options has decremented to 0
  let option_mint_data = client.get_account_data(&option_mint_keys.pubkey()).unwrap();
  let option_mint = Mint::unpack(&option_mint_data[..]).unwrap();
  assert_eq!(option_mint.supply, 0);

  // assert option writer's Option account has balance of 0
  let option_writer_option_acct_data = client
    .get_account_data(&option_writer_option_keys.pubkey())
    .unwrap();
  let option_writer_option_acct = Account::unpack(&option_writer_option_acct_data[..]).unwrap();
  assert_eq!(option_writer_option_acct.mint, option_mint_keys.pubkey());
  assert_eq!(option_writer_option_acct.amount, 0);

  // assert that the option market registry contains the proper entry
  let option_market_data = client.get_account_data(&option_market_key).unwrap();
  let option_market = OptionMarket::unpack(&option_market_data[..]).unwrap();
  assert_eq!(option_market.registry_length, 0);
  assert!(option_market.option_writer_registry.is_empty())
}

#[test]
fn test_should_fail_exercise_covered_call_post_expiry_integration() {
  let client = RpcClient::new_with_commitment(
    "http://localhost:8899".to_string(),
    CommitmentConfig::recent(),
  );
  let options_program_id = load_bpf_program(&client, "solana_options");
  let amount_per_contract = 100;
  let strike_price = 5;
  let expiry = 10;
  let (
    underlying_asset_mint_keys,
    quote_asset_mint_keys,
    option_mint_keys,
    asset_authority_keys,
    _underlying_asset_pool_key,
    option_market_key,
  ) = init_option_market(
    &client,
    &options_program_id,
    amount_per_contract,
    strike_price,
    expiry,
  )
  .unwrap();
  let option_writer_keys = create_account_with_lamports(&client, 1_000_000_000_000_000);
  let (
    option_writer_underlying_asset_keys,
    option_writer_quote_asset_keys,
    option_writer_option_keys,
  ) = create_option_writer_accounts(
    &client,
    &underlying_asset_mint_keys.pubkey(),
    &quote_asset_mint_keys.pubkey(),
    &option_mint_keys.pubkey(),
    &option_writer_keys,
  )
  .unwrap();

  mint_covered_call(
    &client,
    &options_program_id,
    &option_market_key,
    &option_mint_keys.pubkey(),
    &quote_asset_mint_keys.pubkey(),
    &underlying_asset_mint_keys.pubkey(),
    &asset_authority_keys,
    &option_writer_keys,
    &option_writer_underlying_asset_keys.pubkey(),
    &option_writer_quote_asset_keys.pubkey(),
    &option_writer_option_keys.pubkey(),
  )
  .unwrap();
  let exercise_covered_call_ix =
    solana_options::instruction::exercise_covered_call(&options_program_id).unwrap();
  let signers = vec![&option_writer_keys];
  let result = send_and_confirm_transaction(
    &client,
    exercise_covered_call_ix,
    &option_writer_keys.pubkey(),
    signers,
  );
  assert!(
    result.is_err(),
    "ExerciseCoveredCall should fail due to expired option"
  );
}
