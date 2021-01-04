use crate::{
  option_helpers::{init_option_market},
  solana_helpers::{create_account_with_lamports, load_bpf_program, send_and_confirm_transaction},
  spl_helpers::{create_spl_account, mint_tokens_to_account},
};
use solana_client::rpc_client::RpcClient;
use solana_options::market::OptionMarket;
use solana_program::program_pack::Pack;
use solana_sdk::{
  commitment_config::CommitmentConfig,
  signature::{Keypair, Signer},
};
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

  // TODO move the mint covered call setup to option_helpers
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
  )
  .unwrap();
  let signers = vec![&option_writer_keys];
  send_and_confirm_transaction(
    &client,
    mint_covered_call_ix,
    &option_writer_keys.pubkey(),
    signers,
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
