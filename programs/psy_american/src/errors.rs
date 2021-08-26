use anchor_lang::prelude::*;

#[error]
pub enum PsyOptionsError {
  #[msg("Same quote and underlying asset, cannot create market")]
  QuoteAndUnderlyingAssetMustDiffer,
  #[msg("Quote amount and underlying amount per contract must be > 0")]
  QuoteOrUnderlyingAmountCannotBe0,
  #[msg("OptionMarket must be the mint authority")]
  OptionMarketMustBeMintAuthority,
  #[msg("OptionMarket must own the underlying asset pool")]
  OptionMarketMustOwnUnderlyingAssetPool,
  #[msg("OptionMarket must own the quote asset pool")]
  OptionMarketMustOwnQuoteAssetPool,
  #[msg("Stop trying to spoof the SPL Token program! Shame on you")]
  ExpectedSPLTokenProgramId,
  #[msg("Mint fee account must be owned by the FEE_OWNER")]
  MintFeeMustBeOwnedByFeeOwner,
  #[msg("Exercise fee account must be owned by the FEE_OWNER")]
  ExerciseFeeMustBeOwnedByFeeOwner,
  #[msg("Mint fee token must be the same as the underlying asset")]
  MintFeeTokenMustMatchUnderlyingAsset,
  #[msg("Exercise fee token must be the same as the quote asset")]
  ExerciseFeeTokenMustMatchQuoteAsset,
}