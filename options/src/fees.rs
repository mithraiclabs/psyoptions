use solana_program::{
  account_info::AccountInfo,
  program::invoke,
  program_error::ProgramError,
  program_pack::{IsInitialized, Pack},
  pubkey::Pubkey,
};
use spl_associated_token_account::{create_associated_token_account, get_associated_token_address};
use spl_token::state::Account;

/// The fee_owner_key will own all of the associated accounts where token fees are paid to.
/// In the future this should be a program derived address owned by a fully decntralized
/// fee sweeping program.
pub mod fee_owner_key {
  use solana_program::declare_id;
  declare_id!("7XbrrKfaoEbdSXksZ98ST1Wv6gATVAvFGcZEvxhdKAt2");
}

/// Given an SPL Token Mint key and associated fee account (the fee account the instruction passed in)
/// 1. Get the derived associated token address
/// 2. Check that the address is the same as what was passed in and the owner is correct
/// 3. Check if the token address is initialized
/// 4. If not initialized, call cross program invocation to `create_associated_token_account` to
/// initialize
/// 5. Return the fee accounts public key
pub fn validate_fee_account<'a>(
  mint: Pubkey,
  fee_owner_account: AccountInfo,
  fee_account: AccountInfo<'a>,
) -> Result<AccountInfo<'a>, ProgramError> {
  let _account_address = get_associated_token_address(&fee_owner_key::ID, &mint);
  let token_account = {
    let account_data = fee_account.try_borrow_data()?;
    Account::unpack(&account_data)?
  };
  // check that the account's owner is the fee owner
  if token_account.owner != fee_owner_key::ID {
    return Err(ProgramError::InvalidAccountData);
  }
  // check that the mint is the correct fee mint
  if token_account.mint != mint {
    return Err(ProgramError::InvalidAccountData);
  }
  // if the token account is not initialized create it
  if !token_account.is_initialized() {
    let create_account_ix =
      create_associated_token_account(&fee_owner_key::ID, &fee_owner_key::ID, &mint);
    invoke(&create_account_ix, &[fee_owner_account.clone()])?;
  }
  Ok(fee_account)
}
