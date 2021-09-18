use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, TokenAccount, Transfer};
use psy_american::{OptionMarket, ExerciseOption};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnB");

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

    pub fn exercise<'a, 'b, 'c, 'info>(ctx: Context<'a, 'b, 'c, 'info, Exercise<'info>>, vault_authority_bump: u8) -> ProgramResult {
        msg!("before CPI");
        let cpi_program = ctx.accounts.psy_american_program.clone();
        let cpi_accounts = ExerciseOption {
            user_authority: ctx.accounts.authority.to_account_info(),
            option_authority: ctx.accounts.vault_authority.to_account_info(),
            option_market: ctx.accounts.option_market.clone(),
            option_mint: ctx.accounts.option_mint.clone(),
            exerciser_option_token_src: ctx.accounts.exerciser_option_token_src.clone(),
            underlying_asset_pool: ctx.accounts.underlying_asset_pool.clone(),
            underlying_asset_dest: ctx.accounts.underlying_asset_dest.clone(),
            quote_asset_pool: ctx.accounts.quote_asset_pool.clone(),
            quote_asset_src: ctx.accounts.quote_asset_src.clone(),
            fee_owner: ctx.accounts.fee_owner.clone(),
            token_program: ctx.accounts.token_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
            clock: ctx.accounts.clock.clone()
        };
        let key = ctx.accounts.option_market.key();

        let seeds = &[
            key.as_ref(),
            b"vaultAuthority",
            &[vault_authority_bump]
        ];
        let signer = &[&seeds[..]];
        let mut cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        cpi_ctx.remaining_accounts = ctx.remaining_accounts.to_vec();
        psy_american::cpi::exercise_option(cpi_ctx, ctx.accounts.exerciser_option_token_src.amount)
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,
    #[account(mut)]
    pub option_source: Box<Account<'info, TokenAccount>>,
    pub option_mint: AccountInfo<'info>,
    #[account(init,
        seeds = [&option_mint.key().to_bytes()[..], b"vault"],
        bump,
        payer = authority,    
        token::mint = option_mint,
        token::authority = vault_authority,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub vault_authority: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
    rent: Sysvar<'info, Rent>,
    system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Exercise<'info> {
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,
    pub psy_american_program: AccountInfo<'info>,
    #[account(mut)]
    pub vault_authority: AccountInfo<'info>,
    // Exercise CPI accounts
    option_market: Box<Account<'info, OptionMarket>>,
    #[account(mut)]
    option_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    exerciser_option_token_src: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    underlying_asset_pool: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    underlying_asset_dest: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    quote_asset_pool: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    quote_asset_src: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    fee_owner: AccountInfo<'info>,

    token_program: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    clock: Sysvar<'info, Clock>,
}
