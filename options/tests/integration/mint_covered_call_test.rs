use crate::{
  option_helpers::init_option_market,
  solana_helpers,
  spl_helpers::{create_spl_account, mint_tokens_to_account},
  PROGRAM_KEY,
};
use serial_test::serial;
use solana_client::rpc_client::RpcClient;
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
  let underlying_amount_per_contract = 10_000_000_000;
  let quote_amount_per_contract = 50_000_000_000;
  let expiry = 999_999_999_999_999_999;
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
    2 * underlying_amount_per_contract,
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
  let option_writer_writer_token_keys = Keypair::new();
  let _option_writer_writer_token_acct = create_spl_account(
    &client,
    &option_writer_writer_token_keys,
    &option_writer_keys.pubkey(),
    &writer_token_mint_keys.pubkey(),
    &option_writer_keys,
  );

  // send TX to mint a covered call
  let mint_covered_call_ix = solana_options::instruction::mint_covered_call(
    &options_program_id,
    &option_mint_keys.pubkey(),
    &option_writer_option_keys.pubkey(),
    &writer_token_mint_keys.pubkey(),
    &option_writer_writer_token_keys.pubkey(),
    &option_writer_underlying_asset_keys.pubkey(),
    &underlying_asset_pool_key,
    &option_market_key,
    &underlying_asset_mint_keys.pubkey(),
    &option_writer_keys.pubkey(),
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
  assert_eq!(underlying_asset_pool_acct.amount, underlying_amount_per_contract);

  // assert that the total supply of options has incremented to 1
  let option_mint_data = client.get_account_data(&option_mint_keys.pubkey()).unwrap();
  let option_mint = Mint::unpack(&option_mint_data[..]).unwrap();
  assert_eq!(option_mint.supply, 1);

  // assert that the total supply of writer tokens has incremented to 1
  let writer_token_mint_data = client
    .get_account_data(&writer_token_mint_keys.pubkey())
    .unwrap();
  let writer_token_mint = Mint::unpack(&writer_token_mint_data[..]).unwrap();
  assert_eq!(writer_token_mint.supply, 1);

  // assert option writer's Option account has balance of 1
  let option_writer_option_acct_data = client
    .get_account_data(&option_writer_option_keys.pubkey())
    .unwrap();
  let option_writer_option_acct = Account::unpack(&option_writer_option_acct_data[..]).unwrap();
  assert_eq!(option_writer_option_acct.mint, option_mint_keys.pubkey());
  assert_eq!(option_writer_option_acct.amount, 1);

  // assert option writer's Writer Token account has balance of 1
  let option_writer_writer_token_acct_data = client
    .get_account_data(&option_writer_writer_token_keys.pubkey())
    .unwrap();
  let option_writer_writer_token_acct =
    Account::unpack(&option_writer_writer_token_acct_data[..]).unwrap();
  assert_eq!(
    option_writer_writer_token_acct.mint,
    writer_token_mint_keys.pubkey()
  );
  assert_eq!(option_writer_writer_token_acct.amount, 1);
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
  let amount_per_contract = 10_000_000_000;
  let quote_amount_per_contract = 50_000_000_000; // strike price of 5
  let expiry = 10;
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
    2 * amount_per_contract,
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
  let option_writer_writer_token_keys = Keypair::new();
  let _option_writer_writer_token_acct = create_spl_account(
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
    &writer_token_mint_keys.pubkey(),
    &option_writer_writer_token_keys.pubkey(),
    &option_writer_underlying_asset_keys.pubkey(),
    &underlying_asset_pool_key,
    &option_market_key,
    &underlying_asset_mint_keys.pubkey(),
    &option_writer_keys.pubkey(),
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
#[should_panic(expected = "Error processing Instruction 0: custom program error: 0x7")]
fn test_mint_covered_call_fail_fake_market_account() {
  let client = RpcClient::new_with_commitment(
    "http://localhost:8899".to_string(),
    CommitmentConfig::processed(),
  );
  let options_program_id = &PROGRAM_KEY;
  let underlying_amount_per_contract = 10_000_000_000;
  let quote_amount_per_contract = 50_000_000_000;
  let expiry = 999_999_999_999_999_999;
  let (
    underlying_asset_mint_keys,
    quote_asset_mint_keys,
    option_mint_keys,
    writer_token_mint_keys,
    asset_authority_keys,
    underlying_asset_pool_key,
    _quote_asset_pool_key,
    _option_market_key,
  ) = init_option_market(
    &client,
    &options_program_id,
    underlying_amount_per_contract,
    quote_amount_per_contract,
    expiry,
  )
  .unwrap();
  // Init fake market with different amounts
  let fake_underlying_amount_per_contract = 1;
  let fake_quote_amount_per_contract = 5;
  let (
    _fake_underlying_asset_mint_keys,
    _fake_quote_asset_mint_keys,
    _fake_option_mint_keys,
    _fake_writer_token_mint_keys,
    _fake_asset_authority_keys,
    _fake_underlying_asset_pool_key,
    _fake_quote_asset_pool_key,
    fake_option_market_key,        
  ) = init_option_market(
    &client,
    &options_program_id,
    fake_underlying_amount_per_contract,
    fake_quote_amount_per_contract,
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
    2 * underlying_amount_per_contract,
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
  let option_writer_writer_token_keys = Keypair::new();
  let _option_writer_writer_token_acct = create_spl_account(
    &client,
    &option_writer_writer_token_keys,
    &option_writer_keys.pubkey(),
    &writer_token_mint_keys.pubkey(),
    &option_writer_keys,
  );

  // send TX to mint a covered call
  let mint_covered_call_ix = solana_options::instruction::mint_covered_call(
    &options_program_id,
    &option_mint_keys.pubkey(),
    &option_writer_option_keys.pubkey(),
    &writer_token_mint_keys.pubkey(),
    &option_writer_writer_token_keys.pubkey(),
    &option_writer_underlying_asset_keys.pubkey(),
    &underlying_asset_pool_key,
    &fake_option_market_key,
    &underlying_asset_mint_keys.pubkey(),
    &option_writer_keys.pubkey(),
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
