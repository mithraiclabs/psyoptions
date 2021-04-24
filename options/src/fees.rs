use crate::market::OptionMarket;
use solana_program::{
  account_info::AccountInfo,
  program::invoke,
  program_error::ProgramError,
  program_pack::{IsInitialized, Pack},
  pubkey::Pubkey,
};
use spl_associated_token_account::{create_associated_token_account, get_associated_token_address};
use spl_token::state::{Account, Mint};

/// The fee_owner_key will own all of the associated accounts where token fees are paid to.
/// In the future this should be a program derived address owned by a fully decntralized
/// fee sweeping program.
pub mod fee_owner_key {
  use solana_program::declare_id;
  declare_id!("7XbrrKfaoEbdSXksZ98ST1Wv6gATVAvFGcZEvxhdKAt2");
}

/// Floating points are not ideal for the Solana runtime, so we need a integer type than
/// can handle fraction parts for us. The highest 64 bits are the integer, the lower 64
/// bits are the decimals.
#[repr(transparent)]
#[derive(Copy, Clone)]
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

/// Take a u64 denoting the amount of basis points and convert to a U64F64
fn fee_bps(bps: u64) -> U64F64 {
  U64F64(((bps as u128) << 64) / 10_000)
}

fn fee_rate() -> U64F64 {
  fee_bps(3)
}

/// Calculates the fee for Minting.
/// 
/// NOTE: SPL Tokens have an arbitrary amount of decimals. So an option market
/// for an NFT will have `underlying_amount_per_contract` and should return a
/// mint fee of 0. This is something to keep in mind. 
pub fn mint_fee(market: OptionMarket) -> u64 {
  let rate = fee_rate();
  rate.mul_u64(market.underlying_amount_per_contract).floor()
}