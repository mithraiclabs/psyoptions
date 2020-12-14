use solana_client::rpc_client::RpcClient;
mod helpers;

#[test]

fn test_integration() {
    let client = RpcClient::new("http://localhost:8899".to_string());
    helpers::load_bpf_program(&client, "solana_options");
}
