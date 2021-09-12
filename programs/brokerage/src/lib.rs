use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, TokenAccount, Transfer};

#[program]
pub mod brokerage {
    use super::*;
    pub fn initialize(ctx: Context<Initialize>, amount: u64) -> ProgramResult {
        let cpi_accounts = Transfer {
            from: ctx.accounts.option_source.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.authority.clone(),
        };
        let cpi_token_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new(cpi_token_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,
    #[account(mut)]
    pub option_source: CpiAccount<'info, TokenAccount>,
    pub option_mint: AccountInfo<'info>,
    #[account(init,
        seeds = [&option_mint.key().to_bytes()[..], b"vault"],
        bump,
        payer = authority,    
        token::mint = option_mint,
        token::authority = vault_authority,
    )]
    pub vault: CpiAccount<'info, TokenAccount>,
    pub vault_authority: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
    rent: Sysvar<'info, Rent>,
    system_program: AccountInfo<'info>,
}
