// Note. This example depends on unreleased Serum DEX changes.
use crate::errors;
use anchor_lang::prelude::*;
use anchor_spl::dex::serum_dex::instruction::{CancelOrderInstructionV2, NewOrderInstructionV3};
use anchor_spl::dex::{
    Context, MarketMiddleware,
};
use solana_program::entrypoint::ProgramResult;
use solana_program::sysvar::rent;

pub mod referral {
    solana_program::declare_id!("6c33US7ErPmLXZog9SyChQUYUrrJY51k4GmzdhrbhNnD");
}
