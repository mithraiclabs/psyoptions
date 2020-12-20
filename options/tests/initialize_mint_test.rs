use solana_client::rpc_client::RpcClient;
use solana_sdk::signature::Keypair;
mod option_helpers;
mod solana_helpers;

#[test]

fn test_integration() {
    let client = RpcClient::new("http://localhost:8899".to_string());
    let options_program_id = solana_helpers::load_bpf_program(&client, "solana_options");

    let payer_keys = solana_helpers::create_account_with_lamports(&client, 10000000000);
    let spl_mint = Keypair::new();
    let options_market = Keypair::new();

    option_helpers::create_accounts_for_options_market(
        &client,
        &options_program_id,
        &spl_mint,
        &options_market,
        &payer_keys,
    )
    .unwrap();
}
