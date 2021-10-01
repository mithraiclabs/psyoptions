use anchor_lang::prelude::*;

#[error]
pub enum ErrorCode {
  #[msg("Expiration must be in the future")]
  ExpirationIsInThePast,
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
  #[msg("OptionMarket is expired, can't mint")]
  OptionMarketExpiredCantMint,
  #[msg("Underlying pool account does not match the value on the OptionMarket")]
  UnderlyingPoolAccountDoesNotMatchMarket,
  #[msg("OptionToken mint does not match the value on the OptionMarket")]
  OptionTokenMintDoesNotMatchMarket,
  #[msg("WriterToken mint does not match the value on the OptionMarket")]
  WriterTokenMintDoesNotMatchMarket,
  #[msg("MintFee key does not match the value on the OptionMarket")]
  MintFeeKeyDoesNotMatchOptionMarket,
  #[msg("The size argument must be > 0")]
  SizeCantBeLessThanEqZero,
  #[msg("exerciseFee key does not match the value on the OptionMarket")]
  ExerciseFeeKeyDoesNotMatchOptionMarket,
  #[msg("Quote pool account does not match the value on the OptionMarket")]
  QuotePoolAccountDoesNotMatchMarket,
  #[msg("Underlying destination mint must match underlying asset mint address")]
  UnderlyingDestMintDoesNotMatchUnderlyingAsset,
  #[msg("Fee owner does not match the program's fee owner")]
  FeeOwnerDoesNotMatchProgram,
  #[msg("OptionMarket is expired, can't exercise")]
  OptionMarketExpiredCantExercise,
  #[msg("OptionMarket has not expired, can't close")]
  OptionMarketNotExpiredCantClose,
  #[msg("Not enough assets in the quote asset pool")]
  NotEnoughQuoteAssetsInPool,
  #[msg("Invalid auth token provided")]
  InvalidAuth,
  #[msg("Coin mint must match option mint")]
  CoinMintIsNotOptionMint,
  #[msg("Cannot prune the market while it's still active")]
  CannotPruneActiveMarket,
  #[msg("Numberical overflow")]
  NumberOverflow,
}
