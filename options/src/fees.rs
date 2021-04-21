use solana_program::pubkey::Pubkey;
use spl_associated_token_account::get_associated_token_address;

/// The fee_owner_key will own all of the associated accounts where token fees are paid to.
/// In the future this should be a program derived address owned by a fully decntralized
/// fee sweeping program.
pub mod fee_owner_key {
  use solana_program::declare_id;
  declare_id!("7XbrrKfaoEbdSXksZ98ST1Wv6gATVAvFGcZEvxhdKAt2");
}

/// Given an SPL Token Mint key
/// 1. Get the derived associated token address
/// 2. Check if the token address is initialized
/// 3. If not initialized, call cross program invocation to `create_associated_token_account` to
/// initialize
/// 4. Return the fee accounts public key
pub fn get_or_create_fee_account(mint: Pubkey) {
  let _account_address = get_associated_token_address(&fee_owner_key::ID, &mint);

}