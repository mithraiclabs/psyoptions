// Add test helpers here for discovery
mod option_helpers;
mod solana_helpers;
mod spl_helpers;

// Add test files here for automatic discovery
mod close_post_expiration_test;
mod exercise_covered_call_test;
mod exercise_post_exirpation_test;
mod initialize_mint_test;
mod mint_covered_call_test;

use solana_client::rpc_client::RpcClient;
use solana_sdk::{
  commitment_config::CommitmentConfig,
  pubkey::Pubkey,
};

#[macro_use]
extern crate lazy_static;

lazy_static! {
  static ref PROGRAM_KEY: Pubkey = {
    let client = RpcClient::new_with_commitment(
      "http://localhost:8899".to_string(),
      CommitmentConfig::processed(),
    );
    solana_helpers::load_bpf_program(&client, "solana_options")
  };
}
