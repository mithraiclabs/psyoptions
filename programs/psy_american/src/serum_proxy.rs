// Note. This example depends on unreleased Serum DEX changes.
use crate::errors;
use anchor_lang::prelude::*;
use anchor_spl::dex::serum_dex::instruction::{CancelOrderInstructionV2, NewOrderInstructionV3};
use anchor_spl::dex::{
    Context, Logger, MarketMiddleware, MarketProxy, OpenOrdersPda, ReferralFees,
};
use solana_program::entrypoint::ProgramResult;
use solana_program::sysvar::rent;

/// Performs token based authorization, confirming the identity of the user.
/// The identity token must be given as the fist account.
pub struct Identity;

impl MarketMiddleware for Identity {
    /// Accounts:
    ///
    /// 0. Authorization token.
    /// ..
    fn init_open_orders(&self, ctx: &mut Context) -> ProgramResult {
        verify_and_strip_auth(ctx)
    }

    /// Accounts:
    ///
    /// 0. Authorization token.
    /// ..
    fn new_order_v3(&self, ctx: &mut Context, _ix: &NewOrderInstructionV3) -> ProgramResult {
        verify_and_strip_auth(ctx)
    }

    /// Accounts:
    ///
    /// 0. Authorization token.
    /// ..
    fn cancel_order_v2(&self, ctx: &mut Context, _ix: &CancelOrderInstructionV2) -> ProgramResult {
        verify_and_strip_auth(ctx)
    }

    /// Accounts:
    ///
    /// 0. Authorization token.
    /// ..
    fn cancel_order_by_client_id_v2(&self, ctx: &mut Context, _client_id: u64) -> ProgramResult {
        verify_and_strip_auth(ctx)
    }

    /// Accounts:
    ///
    /// 0. Authorization token.
    /// ..
    fn settle_funds(&self, ctx: &mut Context) -> ProgramResult {
        verify_and_strip_auth(ctx)
    }

    /// Accounts:
    ///
    /// 0. Authorization token.
    /// ..
    fn close_open_orders(&self, ctx: &mut Context) -> ProgramResult {
        verify_and_strip_auth(ctx)
    }

    /// Accounts:
    ///
    /// 0. Authorization token.
    /// ..
    fn fallback(&self, ctx: &mut Context) -> ProgramResult {
        verify_and_strip_auth(ctx)
    }
}

// Utils.

fn verify_and_strip_auth(ctx: &mut Context) -> ProgramResult {
    // The rent sysvar is used as a dummy example of an identity token.
    let auth = &ctx.accounts[0];
    // msg!("checking auth: {:?}\nAgainst rent: {:?}", auth, rent::ID);
    if auth.key != &rent::ID {
      return Err(errors::ErrorCode::InvalidAuth.into())
    }

    // Strip off the account before possing on the message.
    ctx.accounts = (&ctx.accounts[1..]).to_vec();
    // msg!("left over accounts: {:?}", ctx.accounts.into_iter().map(|x| x.key));

    Ok(())
}

// Constants.

pub mod referral {
    // This is a dummy address for testing. Do not use in production.
    solana_program::declare_id!("6c33US7ErPmLXZog9SyChQUYUrrJY51k4GmzdhrbhNnD");
}
