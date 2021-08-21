use anchor_lang::prelude::*;

#[error]
pub enum PsyOptionsError {
  #[msg("Same quote and underlying asset, cannot create market")]
  QuoteAndUnderlyingAssetMustDiffer,
  #[msg("Quote amount and underlying amount per contract must be > 0")]
  QuoteOrUnderlyingAmountCannotBe0,
}