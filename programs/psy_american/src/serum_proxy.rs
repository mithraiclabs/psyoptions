use anchor_lang::prelude::*;
use anchor_spl::dex::{
    Context, MarketMiddleware
};
use solana_program::clock::Clock;

use crate::{OptionMarket, errors};

pub struct Validation {
    pub market_auth_bump: u8,
}
impl Validation {
    pub fn new() -> Self {
        Self {
            market_auth_bump: 0
        }
    }
}
impl MarketMiddleware for Validation {
    fn instruction(&mut self, data: &mut &[u8]) -> ProgramResult {
        // Strip the Validation discriminator
        let disc = data[0];
        *data = &data[1..];
        // 6 is the Prune instruction, strip and set the marketAuthorityBump
        if disc == 6 {
            self.market_auth_bump = data[0];
            *data = &data[1..];
        }
        Ok(())
    }

    fn prune(&self, ctx: &mut Context, _limit: u16) -> ProgramResult {
        // Validate that the OptionMarket has expired
        // deserialize the OptionMarket
        let option_market_account = ctx.accounts[0].clone();
        ctx.accounts = (&ctx.accounts[1..]).to_vec();
        let option_market_acct = Account::<OptionMarket>::try_from(&option_market_account)?;
        if option_market_acct.into_inner().expiration_unix_timestamp >= Clock::get()?.unix_timestamp {
            return Err(errors::ErrorCode::CannotPruneActiveMarket.into())
        }
        // Sign with the seeds
        ctx.accounts[3].is_signer = true;
        let seeds = vec![
            b"open-orders-init".to_vec(),
            ctx.dex_program_id.as_ref().to_vec(),
            // The serum market address 
            ctx.accounts[0].key.as_ref().to_vec(),
            // this needs to be the market authority bump seed
            vec![self.market_auth_bump]
        ];
        ctx.seeds.push(seeds);
        Ok(())
    }

    fn fallback(&self, _ctx: &mut Context) -> ProgramResult {
        Ok(())
    }
}

pub mod referral {
    solana_program::declare_id!("6c33US7ErPmLXZog9SyChQUYUrrJY51k4GmzdhrbhNnD");
}
