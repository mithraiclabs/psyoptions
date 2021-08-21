export enum PsyOptionError {
  // Expiration date is in the past and the client tried to mint a contract token
  CantMintExpired = 0,
  // The mint that controls the account passed as the quote_asset account does not match
  //  the mint of the quote asset on the market
  IncorrectQuoteAssetKey,
  // The quote asset and underlying asset cannot be the same
  QuoteAndUnderlyingAssetMustDiffer,
  // The OptionWriter was not found in the market registry
  OptionWriterNotFound,
  // The OptionMarket has not expired yet and this operation requires it to be expired
  OptionMarketNotExpired,
  // The OptionMarket has expired operation isn't possible
  OptionMarketHasExpired,
  // The wrong pool key was used
  IncorrectPool,
  // The Option Token or Writer Token does not match the Option Market
  IncorrectMarketTokens,
  // The OptionMarket address provided does not match
  BadMarketAddress,
  // The OptionMarket owner is not the program
  BadMarketOwner,
  // The OptionMarket has already been initiated
  MarketAlreadyInitialized,
  // Initalizing the market with invalid parameters
  InvalidInitializationParameters,
  // The fee owner does not match the program's designated fee owner
  BadFeeOwner,
  // Incorrect token program ID
  InvalidTokenProgram,
  // Duplicate markets not allowed
  DuplicateMarketExists,
  // Wrong seeds used for the duplication account
  WrongDuplicationAccount,
}