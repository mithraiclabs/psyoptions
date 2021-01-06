//! Error types

use solana_program::{decode_error::DecodeError, program_error::ProgramError};
use thiserror::Error;

/// Errors that may be returned by the Options program.
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum OptionsError {
    /// Expiration date is in the past and the client tried to mint a contract token
    #[error("Expiration has passed, cannot mint")]
    CantMintExpired,
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
