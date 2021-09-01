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

/// Take a u64 denoting the amount of basis points and convert to a U64F64
fn fee_bps(bps: u64) -> U64F64 {
  U64F64(((bps as u128) << 64) / 10_000)
}

fn fee_rate() -> U64F64 {
  U64F64(fee_bps(5).0 + 1)
}

/// Calculates the fee for Minting and Exercising.
///
/// NOTE: SPL Tokens have an arbitrary amount of decimals. So an option market
/// for an NFT will have `underlying_amount_per_contract` and should return a
/// mint fee of 0. This is something to keep in mind.
pub fn fee_amount(asset_quantity: u64) -> u64 {
  let rate = fee_rate();
  rate.mul_u64(asset_quantity).floor()
}