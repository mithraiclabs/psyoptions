use solana_client::rpc_client::RpcClient;
use solana_options::market::{OptionMarket, OptionWriter};
use solana_program::program_pack::Pack;
use solana_sdk::{
  commitment_config::CommitmentConfig,
  pubkey::Pubkey,
  signature::{Keypair, Signer},
};
use spl_token::state::{Account, Mint};
mod option_helpers;
mod solana_helpers;

struct InitializeOptionMarket {
  amount_per_contract: u64,
  option_market_key: Pubkey,
  option_mint_key: Pubkey,
  quote_asset_mint: Pubkey,
  underlying_asset_mint: Pubkey,
  underlying_asset_pool_key: Pubkey,
}

fn create_and_init_mint(client: &RpcClient) -> InitializeOptionMarket {
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

  InitializeOptionMarket {
    amount_per_contract,
    option_market_key: options_market_keys.pubkey(),
    option_mint_key: options_spl_mint.pubkey(),
    quote_asset_mint: quote_spl.pubkey(),
    underlying_asset_mint: underlying_spl.pubkey(),
    underlying_asset_pool_key: underlying_spl_pool.pubkey(),
  }
}

#[test]
fn test_mint_covered_call_integration() {
  let client = RpcClient::new_with_commitment(
    "http://localhost:8899".to_string(),
    CommitmentConfig::recent(),
  );
  let initialized_option_market = create_and_init_mint(&client);
  let InitializeOptionMarket {
    amount_per_contract,
    option_market_key,
    option_mint_key,
    quote_asset_mint,
    underlying_asset_mint,
    underlying_asset_pool_key,
  } = initialized_option_market;

  let option_writer_keys = solana_helpers::create_account_with_lamports(&client, 10000000);
  let option_writer_underlying_asset_keys = Keypair::new();
  let _option_writer_underlying_asset_acct = option_helpers::create_spl_account(
    &client,
    &option_writer_underlying_asset_keys,
    &option_writer_keys.pubkey(),
    &underlying_asset_mint,
    &option_writer_keys,
  );
  let option_writer_quote_asset_keys = Keypair::new();
  let _option_writer_quote_asset_acct = option_helpers::create_spl_account(
    &client,
    &option_writer_quote_asset_keys,
    &option_writer_keys.pubkey(),
    &quote_asset_mint,
    &option_writer_keys,
  );
  let option_writer_option_keys = Keypair::new();
  let _option_writer_option_acct = option_helpers::create_spl_account(
    &client,
    &option_writer_option_keys,
    &option_writer_keys.pubkey(),
    &option_mint_key,
    &option_writer_keys,
  );

  // TODO send TX to mint a covered call

  // assert option writer's Option account has balance of 1
  let option_writer_option_acct_data = client
    .get_account_data(&option_writer_option_keys.pubkey())
    .unwrap();
  let option_writer_option_acct = Account::unpack(&option_writer_option_acct_data[..]).unwrap();
  assert_eq!(option_writer_option_acct.mint, option_mint_key);
  assert_eq!(option_writer_option_acct.amount, 1);

  // assert option market underlying asset pool has increased by the amount per option contract
  let underlying_asset_pool_acct_data =
    client.get_account_data(&underlying_asset_pool_key).unwrap();
  let underlying_asset_pool_acct = Account::unpack(&underlying_asset_pool_acct_data[..]).unwrap();
  assert_eq!(underlying_asset_pool_acct.mint, underlying_asset_mint);
  assert_eq!(underlying_asset_pool_acct.amount, amount_per_contract);

  // assert that the total supply of options has incremented to 1
  let option_mint_data = client.get_account_data(&option_mint_key).unwrap();
  let option_mint = Mint::unpack(&option_mint_data[..]).unwrap();
  assert_eq!(option_mint.supply, 1);

  // assert that the option market registry contains the proper entry
  let option_market_data = client.get_account_data(&option_market_key).unwrap();
  let option_market = OptionMarket::unpack(&option_market_data[..]).unwrap();
  assert_eq!(option_market.registry_length, 1);
  assert_eq!(
    option_market.option_writer_registry[0],
    OptionWriter {
      underlying_asset_acct_address: option_writer_underlying_asset_keys.pubkey(),
      quote_asset_acct_address: option_writer_quote_asset_keys.pubkey(),
      contract_token_acct_address: option_writer_option_keys.pubkey(),
    }
  )
}
