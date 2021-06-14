//! Error types

use solana_program::{decode_error::DecodeError, program_error::ProgramError};
use thiserror::Error;

/// Errors that may be returned by the Options program.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum PsyOptionsError {
    /// Expiration date is in the past and the client tried to mint a contract token
    #[error("PsyOptionsError::CantMintExpired Expiration has passed, cannot mint")]
    CantMintExpired,
    /// The mint that controls the account passed as the quote_asset account does not match
    ///  the mint of the quote asset on the market
    #[error("PsyOptionsError::IncorrectQuoteAssetKey Incorrect mint on the quote asset account, cannot mint")]
    IncorrectQuoteAssetKey,
    /// The quote asset and underlying asset cannot be the same
    #[error("PsyOptionsError::QuoteAndUnderlyingAssetMustDiffer Same quote and underlying asset, cannot create market")]
    QuoteAndUnderlyingAssetMustDiffer,
    /// The OptionWriter was not found in the market registry
    #[error("PsyOptionsError::OptionWriterNotFound OptionWriter was not found in registry")]
    OptionWriterNotFound,
    /// The OptionMarket has not expired yet and this operation requires it to be expired
    #[error("PsyOptionsError::OptionMarketNotExpired OptionMarket has not expired yet")]
    OptionMarketNotExpired,
    /// The OptionMarket has expired operation isn't possible
    #[error("PsyOptionsError::OptionMarketHasExpired OptionMarket has expired")]
    OptionMarketHasExpired,
    /// The wrong pool key was used
    #[error("PsyOptionsError::IncorrectPool Incorrect pool was accessed")]
    IncorrectPool,
    /// The Option Token or Writer Token does not match the Option Market
    #[error("PsyOptionsError::IncorrectMarketTokens Option or writer token does not match market")]
    IncorrectMarketTokens,
    /// The OptionMarket address provided does not match
    #[error("PsyOptionsError::BadMarketAddress The OptionMarket address does not match")]
    BadMarketAddress,
    /// The OptionMarket owner is not the program
    #[error("PsyOptionsError::BadMarketOwner The OptionMarket owner is incorrect")]
    BadMarketOwner,
    /// The OptionMarket has already been initiated
    #[error("PsyOptionsError::MarketAlreadyInitialized The OptionMarket is already initiated")]
    MarketAlreadyInitialized,
    /// Initalizing the market with invalid parameters
    #[error("PsyOptionsError::InvalidInitializationParameters Initializing the market with invalid parameters")]
    InvalidInitializationParameters,
    /// The fee owner does not match the program's designated fee owner
    #[error("PsyOptionsError::BadFeeOwner The fee owner is incorrect")]
    BadFeeOwner,
    /// Incorrect token program ID
    #[error("PsyOptionsError::InvalidTokenProgram Invalid token program id")]
    InvalidTokenProgram,
}
impl From<PsyOptionsError> for ProgramError {
    fn from(e: PsyOptionsError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
impl<T> DecodeError<T> for PsyOptionsError {
    fn type_of() -> &'static str {
        "PsyOptionsError"
    }
}
