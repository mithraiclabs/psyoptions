use crate::{
  PROGRAM_KEY,
  option_helpers::init_option_market,
  solana_helpers,
  spl_helpers::{create_spl_account, mint_tokens_to_account},
};
use serial_test::serial;
use solana_client::rpc_client::RpcClient;
use solana_options::market::{OptionMarket, OptionWriter};
use solana_program::program_pack::Pack;
use solana_sdk::{
  commitment_config::CommitmentConfig,
  signature::{Keypair, Signer},
};
use spl_token::state::{Account, Mint};

#[test]
#[serial]
fn test_mint_covered_call_integration() {
  let client = RpcClient::new_with_commitment(
    "http://localhost:8899".to_string(),
    CommitmentConfig::processed(),
  );
  let options_program_id = &PROGRAM_KEY;
  let amount_per_contract = 100;
  let quote_amount_per_contract = 500;
  let expiry = 999_999_999_999_999_999;
  let (
    underlying_asset_mint_keys,
    quote_asset_mint_keys,
    option_mint_keys,
    asset_authority_keys,
    underlying_asset_pool_key,
    option_market_key,
    writer_registry_key,
  ) = init_option_market(
    &client,
    &options_program_id,
    amount_per_contract,
    quote_amount_per_contract,
    expiry,
  )
  .unwrap();
  let option_writer_keys =
    solana_helpers::create_account_with_lamports(&client, 1_000_000_000_000_000);
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
  solana_helpers::send_and_confirm_transaction(
    &client,
    mint_covered_call_ix,
    &option_writer_keys.pubkey(),
    signers,
  )
  .unwrap();

  // assert option market underlying asset pool has increased by the amount per option contract
  let underlying_asset_pool_acct_data =
    client.get_account_data(&underlying_asset_pool_key).unwrap();
  let underlying_asset_pool_acct = Account::unpack(&underlying_asset_pool_acct_data[..]).unwrap();
  assert_eq!(
    underlying_asset_pool_acct.mint,
    underlying_asset_mint_keys.pubkey()
  );
  assert_eq!(underlying_asset_pool_acct.amount, amount_per_contract);

  // assert that the total supply of options has incremented to 1
  let option_mint_data = client.get_account_data(&option_mint_keys.pubkey()).unwrap();
  let option_mint = Mint::unpack(&option_mint_data[..]).unwrap();
  assert_eq!(option_mint.supply, 1);

  // assert option writer's Option account has balance of 1
  let option_writer_option_acct_data = client
    .get_account_data(&option_writer_option_keys.pubkey())
    .unwrap();
  let option_writer_option_acct = Account::unpack(&option_writer_option_acct_data[..]).unwrap();
  assert_eq!(option_writer_option_acct.mint, option_mint_keys.pubkey());
  assert_eq!(option_writer_option_acct.amount, 1);

  // assert that the option market registry contains the proper entry
  let writer_registry_data = client.get_account_data(&writer_registry_key).unwrap();
  let writer_registry =
    solana_options::market::OptionWriterRegistry::unpack(&writer_registry_data[..]).unwrap();
  assert_eq!(writer_registry.registry_length, 1);
  assert_eq!(
    writer_registry.registry[0],
    OptionWriter {
      underlying_asset_acct_address: option_writer_underlying_asset_keys.pubkey(),
      quote_asset_acct_address: option_writer_quote_asset_keys.pubkey(),
      contract_token_acct_address: option_writer_option_keys.pubkey(),
    }
  )
}

#[test]
#[serial]
#[should_panic(expected = "Error processing Instruction 0: custom program error: 0x0")]
fn test_mint_covered_call_fail_post_expiry() {
  let client = RpcClient::new_with_commitment(
    "http://localhost:8899".to_string(),
    CommitmentConfig::processed(),
  );
  let options_program_id = &PROGRAM_KEY;
  let amount_per_contract = 100;
  let quote_amount_per_contract = 500; // strike price of 5
  let expiry = 10;
  let (
    underlying_asset_mint_keys,
    quote_asset_mint_keys,
    option_mint_keys,
    asset_authority_keys,
    underlying_asset_pool_key,
    option_market_key,
    writer_registry_key,
  ) = init_option_market(
    &client,
    &options_program_id,
    amount_per_contract,
    quote_amount_per_contract,
    expiry,
  )
  .unwrap();
  let option_writer_keys =
    solana_helpers::create_account_with_lamports(&client, 1_000_000_000_000_000);
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
  solana_helpers::send_and_confirm_transaction(
    &client,
    mint_covered_call_ix,
    &option_writer_keys.pubkey(),
    signers,
  )
  .unwrap();
}

#[test]
#[serial]
#[should_panic(expected = "Error processing Instruction 0: custom program error: 0x1")]
fn test_when_quote_asset_mint_dont_match_contract_market() {
  let client = RpcClient::new_with_commitment(
    "http://localhost:8899".to_string(),
    CommitmentConfig::processed(),
  );
  let options_program_id = &PROGRAM_KEY;
  let amount_per_contract = 100;
  let quote_amount_per_contract = 500; // strike price of 5
  let expiry = 999_999_999_999_999_999;
  let (
    underlying_asset_mint_keys,
    quote_asset_mint_keys,
    option_mint_keys,
    asset_authority_keys,
    underlying_asset_pool_key,
    option_market_key,
    writer_registry_key,
  ) = init_option_market(
    &client,
    &options_program_id,
    amount_per_contract,
    quote_amount_per_contract,
    expiry,
  )
  .unwrap();
  let option_writer_keys =
    solana_helpers::create_account_with_lamports(&client, 1_000_000_000_000_000);
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
    // ERROR should be caused by using the underlying asset key here instead of the quote asset
    &option_writer_underlying_asset_keys.pubkey(),
    &option_market_key,
    &option_writer_keys.pubkey(),
    &writer_registry_key
  )
  .unwrap();
  let signers = vec![&option_writer_keys];
  solana_helpers::send_and_confirm_transaction(
    &client,
    mint_covered_call_ix,
    &option_writer_keys.pubkey(),
    signers,
  )
  .unwrap();
}
