use solana_program::{
  account_info::AccountInfo,
  program::invoke,
  program_error::ProgramError,
  program_pack::{Pack, IsInitialized},
};
use spl_associated_token_account::{create_associated_token_account, get_associated_token_address};
use spl_token::state::Account as SPLTokenAccount;

/// The fee_owner_key will own all of the associated accounts where token fees are paid to.
/// In the future this should be a program derived address owned by a fully decntralized
/// fee sweeping program.
pub mod fee_owner_key {
  use solana_program::declare_id;
  declare_id!("6c33US7ErPmLXZog9SyChQUYUrrJY51k4GmzdhrbhNnD");
}

/// Markets with an NFT or not enough underlying assets per contract to warrent
/// a 3bps fee will be charged 1/2 a SOL to MINT. This is arbitrarily made up 
/// and subject to change based on feedback and eventually governance.
pub const NFT_MINT_LAMPORTS: u64 = 1_000_000_000 / 2;

/// Floating points are not ideal for the Solana runtime, so we need a integer type than
/// can handle fraction parts for us. The highest 64 bits are the integer, the lower 64
/// bits are the decimals.
#[repr(transparent)]
#[derive(Copy, Clone, Debug)]
struct U64F64(u128);

impl U64F64 {
  #[inline(always)]
  const fn mul_u64(self, other: u64) -> U64F64 {
    U64F64(self.0 * other as u128)
  }

  #[inline(always)]
  const fn floor(self) -> u64 {
    (self.0 >> 64) as u64
  }
}

/// Given an SPL Token Mint key and associated fee account (the fee account the instruction
/// passed in) validate that the fee_account is correct for the fee mint. If the account is
/// not initialized then call the create instruction.
///
/// 1. Get the derived associated token address
/// 2. Check that the address is the same as what was passed in and the owner is correct
/// 3. Check if the token address is initialized
/// 4. If not initialized, call cross program invocation to `create_associated_token_account` to
/// initialize
pub fn validate_fee_account<'a, 'b>(
  funding_account: &AccountInfo<'a>,
  spl_associated_token_program_acct: &AccountInfo<'a>,
  fee_account: &AccountInfo<'a>,
  fee_owner_acct: &AccountInfo<'a>,
  underlying_mint_acct: &AccountInfo<'a>,
  spl_token_program_acct: &AccountInfo<'a>,
  sys_program_acct: &AccountInfo<'a>,
  sys_rent_acct: &AccountInfo<'a>,
) -> Result<(), ProgramError> {
  let account_address = get_associated_token_address(&fee_owner_key::ID, &underlying_mint_acct.key);
  // Validate the fee recipient account is correct
  if account_address != *fee_account.key {
    return Err(ProgramError::InvalidAccountData);
  }
  // validate the spl_associated_token_account passed in is the correct one.
  if *spl_associated_token_program_acct.key != spl_associated_token_account::id() {
    return Err(ProgramError::InvalidAccountData);
  }
  let token_account_exists = {
    let account_data = fee_account.try_borrow_data()?;
    if account_data.len() == SPLTokenAccount::LEN {
      let account = SPLTokenAccount::unpack_from_slice(&account_data)?;
      account.is_initialized()
    } else {
      false
    } 
  };
  if !token_account_exists {
    let create_account_ix =
      create_associated_token_account(&funding_account.key, &fee_owner_key::ID, &underlying_mint_acct.key);
    invoke(
      &create_account_ix,
      &[
        spl_associated_token_program_acct.clone(),
        funding_account.clone(),
        fee_account.clone(),
        fee_owner_acct.clone(),
        underlying_mint_acct.clone(),
        spl_token_program_acct.clone(),
        sys_program_acct.clone(),
        sys_rent_acct.clone(),
      ],
    )?;
  }
  Ok(())
}

/// Take a u64 denoting the amount of basis points and convert to a U64F64
fn fee_bps(bps: u64) -> U64F64 {
  U64F64(((bps as u128) << 64) / 10_000)
}

fn fee_rate() -> U64F64 {
  fee_bps(5)
}

/// Calculates the fee for Minting.
///
/// NOTE: SPL Tokens have an arbitrary amount of decimals. So an option market
/// for an NFT will have `underlying_amount_per_contract` and should return a
/// mint fee of 0. This is something to keep in mind.
pub fn mint_fee(underlying_amount_per_contract: u64) -> u64 {
  let rate = fee_rate();
  rate.mul_u64(underlying_amount_per_contract).floor()
}

/// Calculates the fee for Exercising.
///
/// NOTE: SPL Tokens have an arbitrary amount of decimals. So an option market
/// for an NFT could have a `quote_amount_per_contract` and should return a
/// fee of 0. This is something to keep in mind.
pub fn exercise_fee(quote_amount_per_contract: u64) -> u64 {
  let rate = fee_rate();
  rate.mul_u64(quote_amount_per_contract).floor()
}
