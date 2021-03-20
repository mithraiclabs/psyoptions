use crate::{
  option_helpers::{
    create_and_add_option_writer, create_exerciser, init_option_market,
    move_option_token_to_exerciser,
  },
  solana_helpers, PROGRAM_KEY,
};
use serial_test::serial;
use solana_client::rpc_client::RpcClient;
use solana_options::{instruction::OptionsInstruction, market::OptionMarket};
use solana_program::{
  instruction::{AccountMeta, Instruction},
  program_pack::Pack,
  pubkey::Pubkey,
};
use solana_sdk::{commitment_config::CommitmentConfig, signature::Signer};
use spl_token::state::{Account, Mint};

#[test]
#[serial]
pub fn test_successful_exchange_writer_token_for_quote_test() {
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
    option_writer_option_mint_keys,
    option_writer_writer_token_keys,
    _option_writer_underlying_asset_keys,
    option_writer_quote_asset_keys,
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

  let exerciser_option_token_keys = move_option_token_to_exerciser(
    &client,
    &option_mint_keys.pubkey(),
    &option_writer_option_mint_keys.pubkey(),
    &option_writer_keys,
    &exerciser_authority_keys,
    &option_writer_keys,
  )
  .unwrap();
  // generate the exercise_covered_call instruction
  let exercise_covered_call_ix = solana_options::instruction::exercise_covered_call(
    &options_program_id,
    &option_mint_keys.pubkey(),
    &option_market_key,
    &exerciser_quote_asset_keys.pubkey(),
    &exerciser_underlying_asset_keys.pubkey(),
    &exerciser_authority_keys.pubkey(),
    &option_market.underlying_asset_pool,
    &option_market.quote_asset_pool,
    &exerciser_option_token_keys.pubkey(),
    &exerciser_authority_keys.pubkey(),
  )
  .unwrap();
  // Send transaction to exercise in order to have assets in the quote pool
  let signers = vec![&exerciser_authority_keys];
  solana_helpers::send_and_confirm_transaction(
    &client,
    exercise_covered_call_ix,
    &exerciser_authority_keys.pubkey(),
    signers,
  )
  .unwrap();

  let quote_asset_pool_acct_data = client.get_account_data(&quote_asset_pool_key).unwrap();
  let initial_quote_asset_pool_acct = Account::unpack(&quote_asset_pool_acct_data[..]).unwrap();
  let option_writer_writer_token_acct_data = client
    .get_account_data(&option_writer_writer_token_keys.pubkey())
    .unwrap();
  let initial_option_writer_writer_token_acct =
    Account::unpack(&option_writer_writer_token_acct_data[..]).unwrap();
  let quote_asset_dest_acct_data = client
    .get_account_data(&option_writer_quote_asset_keys.pubkey())
    .unwrap();
  let initial_quote_asset_dest_acct = Account::unpack(&quote_asset_dest_acct_data[..]).unwrap();
  let initial_writer_token_mint_data = client
    .get_account_data(&writer_token_mint_keys.pubkey())
    .unwrap();
  let initial_writer_token_mint_act = Mint::unpack(&initial_writer_token_mint_data[..]).unwrap();

  let exchange_writer_token_quote_ix =
    solana_options::instruction::exchange_writer_token_for_quote(
      &options_program_id,
      &option_market_key,
      &option_mint_keys.pubkey(),
      &writer_token_mint_keys.pubkey(),
      &option_writer_writer_token_keys.pubkey(),
      &option_writer_keys.pubkey(),
      &option_writer_quote_asset_keys.pubkey(),
      &quote_asset_pool_key,
    )
    .unwrap();
  let signers = vec![&option_writer_keys];
  solana_helpers::send_and_confirm_transaction(
    &client,
    exchange_writer_token_quote_ix,
    &option_writer_keys.pubkey(),
    signers,
  )
  .unwrap();

  // assert the option writer token was burned from the account
  let option_writer_writer_token_acct_data = client
    .get_account_data(&option_writer_writer_token_keys.pubkey())
    .unwrap();
  let option_writer_writer_token_acct =
    Account::unpack(&option_writer_writer_token_acct_data[..]).unwrap();
  assert_eq!(
    option_writer_writer_token_acct.amount,
    initial_option_writer_writer_token_acct.amount - 1
  );

  // assert the wwriter Token supply decreased (i.e. should burn not transfer)
  let writer_token_mint_data = client
    .get_account_data(&writer_token_mint_keys.pubkey())
    .unwrap();
  let writer_token_mint_acct = Mint::unpack(&writer_token_mint_data[..]).unwrap();
  assert_eq!(
    writer_token_mint_acct.supply,
    initial_writer_token_mint_act.supply - 1
  );

  // assert the quote asset destination received quote_amount_per_contract
  let quote_asset_dest_acct_data = client
    .get_account_data(&option_writer_quote_asset_keys.pubkey())
    .unwrap();
  let quote_asset_dest_acct = Account::unpack(&quote_asset_dest_acct_data[..]).unwrap();
  assert_eq!(
    quote_asset_dest_acct.amount,
    initial_quote_asset_dest_acct.amount + quote_amount_per_contract
  );

  // assert quote asset pool decreased by quote amount per contract
  let quote_asset_pool_acct_data = client.get_account_data(&quote_asset_pool_key).unwrap();
  let quote_asset_pool_acct = Account::unpack(&quote_asset_pool_acct_data[..]).unwrap();
  assert_eq!(
    quote_asset_pool_acct.amount,
    initial_quote_asset_pool_acct.amount - quote_amount_per_contract
  );
}

#[test]
#[serial]
#[should_panic(expected = "Error processing Instruction 0: custom program error: 0x6")]
pub fn test_panic_when_non_quote_asset_pool_is_used() {
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

  // Add 2 option writers to it
  let (
    option_writer_option_mint_keys,
    option_writer_writer_token_keys,
    _option_writer_underlying_asset_keys,
    option_writer_quote_asset_keys,
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

  let exerciser_option_token_keys = move_option_token_to_exerciser(
    &client,
    &option_mint_keys.pubkey(),
    &option_writer_option_mint_keys.pubkey(),
    &option_writer_keys,
    &exerciser_authority_keys,
    &option_writer_keys,
  )
  .unwrap();
  // generate the exercise_covered_call instruction
  let exercise_covered_call_ix = solana_options::instruction::exercise_covered_call(
    &options_program_id,
    &option_mint_keys.pubkey(),
    &option_market_key,
    &exerciser_quote_asset_keys.pubkey(),
    &exerciser_underlying_asset_keys.pubkey(),
    &exerciser_authority_keys.pubkey(),
    &option_market.underlying_asset_pool,
    &option_market.quote_asset_pool,
    &exerciser_option_token_keys.pubkey(),
    &exerciser_authority_keys.pubkey(),
  )
  .unwrap();
  // Send transaction to exercise in order to have assets in the quote pool
  let signers = vec![&exerciser_authority_keys];
  solana_helpers::send_and_confirm_transaction(
    &client,
    exercise_covered_call_ix,
    &exerciser_authority_keys.pubkey(),
    signers,
  )
  .unwrap();

  let (option_market_authority, bump_seed) = Pubkey::find_program_address(
    &[&option_mint_keys.pubkey().to_bytes()[..32]],
    &options_program_id,
  );
  let data = OptionsInstruction::ExchangeWriterTokenForQuote { bump_seed }.pack();
  let mut accounts = Vec::with_capacity(9);
  accounts.push(AccountMeta::new_readonly(option_market_key, false));
  accounts.push(AccountMeta::new_readonly(option_mint_keys.pubkey(), false));
  accounts.push(AccountMeta::new_readonly(option_market_authority, false));
  accounts.push(AccountMeta::new(writer_token_mint_keys.pubkey(), false));
  accounts.push(AccountMeta::new(
    option_writer_writer_token_keys.pubkey(),
    false,
  ));
  accounts.push(AccountMeta::new_readonly(option_writer_keys.pubkey(), true));
  accounts.push(AccountMeta::new(
    option_writer_quote_asset_keys.pubkey(),
    false,
  ));
  accounts.push(AccountMeta::new(underlying_asset_pool_key, false));
  accounts.push(AccountMeta::new_readonly(spl_token::id(), false));

  let exchange_writer_token_quote_ix = Instruction {
    program_id: **options_program_id,
    data,
    accounts,
  };
  let signers = vec![&option_writer_keys];
  solana_helpers::send_and_confirm_transaction(
    &client,
    exchange_writer_token_quote_ix,
    &option_writer_keys.pubkey(),
    signers,
  )
  .unwrap();
}

#[test]
#[serial]
#[should_panic(expected = "Error processing Instruction 0: custom program error: 0x8")]
pub fn test_panic_when_not_enough_amount_in_quote_asset_pool() {
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
    _option_writer_option_mint_keys,
    option_writer_writer_token_keys,
    _option_writer_underlying_asset_keys,
    option_writer_quote_asset_keys,
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

  let exchange_writer_token_quote_ix =
    solana_options::instruction::exchange_writer_token_for_quote(
      &options_program_id,
      &option_market_key,
      &option_mint_keys.pubkey(),
      &writer_token_mint_keys.pubkey(),
      &option_writer_writer_token_keys.pubkey(),
      &option_writer_keys.pubkey(),
      &option_writer_quote_asset_keys.pubkey(),
      &quote_asset_pool_key,
    )
    .unwrap();
  let signers = vec![&option_writer_keys];
  solana_helpers::send_and_confirm_transaction(
    &client,
    exchange_writer_token_quote_ix,
    &option_writer_keys.pubkey(),
    signers,
  )
  .unwrap();
}
