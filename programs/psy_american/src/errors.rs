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
}