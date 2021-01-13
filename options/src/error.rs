//! Error types

use solana_program::{decode_error::DecodeError, program_error::ProgramError};
use thiserror::Error;

/// Errors that may be returned by the Options program.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum OptionsError {
    /// Expiration date is in the past and the client tried to mint a contract token
    #[error("Expiration has passed, cannot mint")]
    CantMintExpired,
    /// The mint that controls the account passed as the quote_asset account does not match 
    ///  the mint of the quote asset on the market
    #[error("Incorrect mint on the quote asset account, cannot mint")]
    IncorrectQuoteAssetKey,
    /// The quote asset and underlying asset cannot be the same
    #[error("Same quote and underlying asset, cannot create market")]
    QuoteAndUnderlyingAssetMustDiffer,
}
impl From<OptionsError> for ProgramError {
    fn from(e: OptionsError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
impl<T> DecodeError<T> for OptionsError {
    fn type_of() -> &'static str {
        "OptionsError"
    }
}
