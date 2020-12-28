use crate::spl_helpers::create_spl_mint_account_uninitialized;
use solana_client::{client_error::ClientError, rpc_client::RpcClient};
use solana_options::market::OptionMarket;
use solana_program::{program_pack::Pack, pubkey::Pubkey, system_instruction};
use solana_sdk::{
    commitment_config::CommitmentConfig,
    message::Message,
    signature::{Keypair, Signer},
    transaction::Transaction,
};

fn create_options_market(
    client: &RpcClient,
    options_program_id: &Pubkey,
    options_market: &Keypair,
    payer_keys: &Keypair,
) -> Result<(), ClientError> {
    let data_len = OptionMarket::LEN;

    let min_balance = client.get_minimum_balance_for_rent_exemption(data_len)?;

    let instruction = system_instruction::create_account(
        &payer_keys.pubkey(),
        &options_market.pubkey(),
        min_balance,
        data_len as u64,
        options_program_id,
    );

    let message = Message::new(&[instruction], Some(&payer_keys.pubkey()));

    let (blockhash, _, _) = client
        .get_recent_blockhash_with_commitment(CommitmentConfig::recent())?
        .value;

    let mut transaction = Transaction::new_unsigned(message.clone());
    transaction.try_sign(&[payer_keys, options_market], blockhash)?;

    client.send_and_confirm_transaction_with_spinner_and_commitment(
        &transaction,
        CommitmentConfig::recent(),
    )?;
    println!("Created Options Market account {}", options_market.pubkey());

    Ok(())
}

pub fn create_accounts_for_options_market(
    client: &RpcClient,
    options_program_id: &Pubkey,
    spl_mint: &Keypair,
    options_market: &Keypair,
    payer_keys: &Keypair,
) -> Result<(), ClientError> {
    create_spl_mint_account_uninitialized(client, spl_mint, payer_keys)?;
    create_options_market(client, options_program_id, options_market, payer_keys)?;

    Ok(())
}
