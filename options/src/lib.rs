pub mod instruction;
pub mod market;
pub mod error;
pub mod fees;

#[cfg(not(feature = "no-entrypoint"))]
pub mod processor;

#[cfg(not(feature = "no-entrypoint"))]
mod entrypoint;
