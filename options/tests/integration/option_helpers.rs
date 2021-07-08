use crate::{
    solana_helpers::{create_account_with_lamports, send_and_confirm_transaction},
    spl_helpers::{
        create_spl_account, create_spl_account_uninitialized, create_spl_mint_account,
        create_spl_mint_account_uninitialized, mint_tokens_to_account,
    },
};
use psyoptions::market::OptionMarket;
use solana_client::{client_error::ClientError, rpc_client::RpcClient};
use solana_program::{clock::UnixTimestamp, pubkey::Pubkey};
use solana_sdk::signature::{Keypair, Signer};

use spl_token::instruction as token_instruction;

pub fn create_accounts_for_options_market(
    client: &RpcClient,
    option_mint_keys: &Keypair,
    writer_token_keys: &Keypair,
    payer_keys: &Keypair,
) -> Result<(), ClientError> {
    create_spl_mint_account_uninitialized(client, option_mint_keys, payer_keys)?;
    create_spl_mint_account_uninitialized(client, writer_token_keys, payer_keys)?;
    Ok(())
}

/// Set up function to initialize an options market.
/// Returns a tuple consisting of
/// - Underlying Asset Mint Keypair
/// - Quote Asset Mint Keypair
/// - Option Mint Keypair
/// - Underyling/Quote Mint Authority Keypair
/// - Underlying Asset Pool Pubkey
/// - Quote Asset Pool Pubkey
/// - Option Market Pubkey
pub fn init_option_market(
    client: &RpcClient,
    program_id: &Pubkey,
    amount_per_contract: u64,
    quote_amount_per_contract: u64,
    expiry: UnixTimestamp,
) -> Result<
    (
        Keypair,
        Keypair,
        Keypair,
        Keypair,
        Keypair,
        Pubkey,
        Pubkey,
        Pubkey,
    ),
    ClientError,
> {
    let payer_keys = create_account_with_lamports(&client, 10_000_000_000);
    let option_mint_keys = Keypair::new();
    let writer_token_mint_keys = Keypair::new();

    let underlying_asset_mint_keys = Keypair::new();
    let quote_asset_mint_keys = Keypair::new();
    let underlying_asset_pool_keys = Keypair::new();
    let quote_asset_pool_keys = Keypair::new();

    let (options_market_key, _no_duplication_bump) = Pubkey::find_program_address(
        &[
            &underlying_asset_mint_keys.pubkey().to_bytes(),
            &quote_asset_mint_keys.pubkey().to_bytes(),
            &amount_per_contract.to_le_bytes(),
            &quote_amount_per_contract.to_le_bytes(),
            &expiry.to_le_bytes(),
        ],
        &program_id,
    );

    // create the spl mints to be used in the options market
    create_spl_mint_account(&client, &underlying_asset_mint_keys, &payer_keys).unwrap();
    create_spl_mint_account(&client, &quote_asset_mint_keys, &payer_keys).unwrap();
    create_spl_account_uninitialized(&client, &underlying_asset_pool_keys, &payer_keys).unwrap();
    create_spl_account_uninitialized(&client, &quote_asset_pool_keys, &payer_keys).unwrap();

    create_accounts_for_options_market(
        &client,
        &option_mint_keys,
        &writer_token_mint_keys,
        &payer_keys,
    )?;

    let init_market_ix = psyoptions::instruction::initialize_market(
        &program_id,
        &underlying_asset_mint_keys.pubkey(),
        &quote_asset_mint_keys.pubkey(),
        &option_mint_keys.pubkey(),
        &writer_token_mint_keys.pubkey(),
        &underlying_asset_pool_keys.pubkey(),
        &quote_asset_pool_keys.pubkey(),
        &payer_keys.pubkey(),
        amount_per_contract,
        quote_amount_per_contract,
        expiry,
    )
    .unwrap();
    let signers = vec![&payer_keys];
    send_and_confirm_transaction(&client, init_market_ix, &payer_keys.pubkey(), signers)?;
    Ok((
        underlying_asset_mint_keys,
        quote_asset_mint_keys,
        option_mint_keys,
        writer_token_mint_keys,
        payer_keys,
        underlying_asset_pool_keys.pubkey(),
        quote_asset_pool_keys.pubkey(),
        options_market_key,
    ))
}
/// Creates and seeds the necessary accounts for an entity, then mints a
/// covered call with those accounts
///
/// returns tuple containing
/// - option_writer_option_keys - the account that contains the option contract token
/// - option_writer_ooption_authority
pub fn create_and_add_option_writer(
    client: &RpcClient,
    options_program_id: &Pubkey,
    underlying_asset_mint_keys: &Keypair,
    asset_authority_keys: &Keypair,
    quote_asset_mint_keys: &Keypair,
    option_mint_keys: &Keypair,
    writer_token_mint_keys: &Keypair,
    underlying_asset_pool_key: &Pubkey,
    option_market_key: &Pubkey,
    amount_per_contract: u64,
    size: u64,
) -> Result<(Keypair, Keypair, Keypair, Keypair, Keypair), ClientError> {
    let option_writer_keys = create_account_with_lamports(&client, 10_000_000_000);
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
        2 * size * amount_per_contract,
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
    let _option_writer_option_acct = create_spl_account(
        &client,
        &option_writer_writer_token_keys,
        &option_writer_keys.pubkey(),
        &writer_token_mint_keys.pubkey(),
        &option_writer_keys,
    );

    // failing to mint here because fee recipient is bad

    // send TX to mint a covered call
    let mint_covered_call_ix = psyoptions::instruction::mint_covered_call(
        &options_program_id,
        &option_writer_keys.pubkey(),
        &option_mint_keys.pubkey(),
        &option_writer_option_keys.pubkey(),
        &writer_token_mint_keys.pubkey(),
        &option_writer_writer_token_keys.pubkey(),
        &option_writer_underlying_asset_keys.pubkey(),
        &underlying_asset_pool_key,
        &option_market_key,
        &underlying_asset_mint_keys.pubkey(),
        &option_writer_keys.pubkey(),
        size,
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
    Ok((
        option_writer_option_keys,
        option_writer_writer_token_keys,
        option_writer_underlying_asset_keys,
        option_writer_quote_asset_keys,
        option_writer_keys,
    ))
}

/// Creates the necessary accounts and adds tokens to those accounts for someone to
/// exercise for a given option market
///
/// Returns a tuple consisting of
/// - Exercisor Authority Keypair
/// - Exercisor Quote Asset Account Keypair
/// - Exercisor Underlying Asset Account Keypair
pub fn create_exerciser(
    client: &RpcClient,
    asset_authority_keys: &Keypair,
    underlying_asset_mint_keys: &Keypair,
    quote_asset_mint_keys: &Keypair,
    option_market: &OptionMarket,
    size: u64,
) -> Result<(Keypair, Keypair, Keypair), ClientError> {
    // create the Authority account
    let exerciser_authority_keys = create_account_with_lamports(&client, 10_000_000_000);
    // create an account to receive the underlying asset
    let exerciser_underlying_asset_keys = Keypair::new();
    let _exerciser_underlying_asset_acct = create_spl_account(
        &client,
        &exerciser_underlying_asset_keys,
        &exerciser_authority_keys.pubkey(),
        &underlying_asset_mint_keys.pubkey(),
        &exerciser_authority_keys,
    );
    // create and seed an Account with the quote asset
    let exerciser_quote_asset_keys = Keypair::new();
    let _exerciser_quote_asset_acct = create_spl_account(
        &client,
        &exerciser_quote_asset_keys,
        &exerciser_authority_keys.pubkey(),
        &quote_asset_mint_keys.pubkey(),
        &exerciser_authority_keys,
    );
    // add >= amount_per_contract of underlying asset to the src account
    let _mint_to_res = mint_tokens_to_account(
        &client,
        &spl_token::id(),
        &quote_asset_mint_keys.pubkey(),
        &exerciser_quote_asset_keys.pubkey(),
        &asset_authority_keys.pubkey(),
        vec![&asset_authority_keys],
        // mint 2x the amount needed to account for fees
        2 * size * option_market.quote_amount_per_contract,
    )
    .unwrap();

    Ok((
        exerciser_authority_keys,
        exerciser_quote_asset_keys,
        exerciser_underlying_asset_keys,
    ))
}

/// Create an Option Token account for the Exerciser. Transfer an option token from
///  a Writer to the Exercisor.
///
pub fn move_option_token_to_exerciser(
    client: &RpcClient,
    option_mint: &Pubkey,
    writer_option_mint: &Pubkey,
    writer_option_token_authority: &Keypair,
    exerciser_authority_keys: &Keypair,
    payer_keys: &Keypair,
    size: u64,
) -> Result<Keypair, ClientError> {
    // TODO create an option token account for the Exerciser
    let exerciser_option_token_keys = Keypair::new();
    let _exerciser_underlying_asset_acct = create_spl_account(
        &client,
        &exerciser_option_token_keys,
        &exerciser_authority_keys.pubkey(),
        &option_mint,
        &exerciser_authority_keys,
    );

    let transfer_option_token_ix = token_instruction::transfer(
        &spl_token::id(),
        &writer_option_mint,
        &exerciser_option_token_keys.pubkey(),
        &writer_option_token_authority.pubkey(),
        &[],
        size,
    )
    .unwrap();
    let signers = vec![payer_keys, writer_option_token_authority];
    send_and_confirm_transaction(
        &client,
        transfer_option_token_ix,
        &payer_keys.pubkey(),
        signers,
    )?;

    Ok(exerciser_option_token_keys)
}
