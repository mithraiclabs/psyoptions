use anchor_lang::prelude::*;

#[error]
pub enum PsyOptionsError {
  #[msg("Same quote and underlying asset, cannot create market")]
  QuoteAndUnderlyingAssetMustDiffer,
}