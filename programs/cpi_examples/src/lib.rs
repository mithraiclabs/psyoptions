use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, TokenAccount, Transfer};
use psy_american::{OptionMarket, ExerciseOption};

declare_id!("Fk8QcXcNpf5chR5RcviUjgaLVtULgvovGXUXGPMwLioF");

#[program]
pub mod cpi_examples {
    use psy_american::MintOption;

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

    pub fn init_mint_vault(_ctx: Context<InitMintVault>) -> ProgramResult {
        Ok(())
    }

    pub fn mint<'a, 'b, 'c, 'info>(ctx: Context<'a, 'b, 'c, 'info, MintCtx<'info>>, size: u64, vault_authority_bump: u8) -> ProgramResult {
        let cpi_program = ctx.accounts.psy_american_program.clone();
        let cpi_accounts = MintOption {
            // The authority that has control over the underlying assets. In this case it's the 
            // vault authority set in _init_mint_vault_
            user_authority: ctx.accounts.vault_authority.to_account_info(),
            // The Mint of the underlying asset for the contracts. Also the mint that is in the vault.
            underlying_asset_mint: ctx.accounts.underlying_asset_mint.to_account_info(),
            // The underlying asset pool for the OptionMarket
            underlying_asset_pool: ctx.accounts.underlying_asset_pool.clone(),
            // The source account where the underlying assets are coming from. In this case it's the vault.
            underlying_asset_src: ctx.accounts.vault.clone(),
            // The mint of the option
            option_mint: ctx.accounts.option_mint.clone(),
            // The destination for the minted options
            minted_option_dest: ctx.accounts.minted_option_dest.clone(),
            // The Mint of the writer token for the OptionMarket
            writer_token_mint: ctx.accounts.writer_token_mint.clone(),
            // The destination for the minted WriterTokens
            minted_writer_token_dest: ctx.accounts.minted_writer_token_dest.clone(),
            // The PsyOptions OptionMarket to mint from
            option_market: ctx.accounts.option_market.clone(),
            // The fee_owner that is a constant in the PsyAmerican contract
            fee_owner: ctx.accounts.fee_owner.to_account_info(),
            // The rest are self explanatory, we can't spell everything out for you ;)
            token_program: ctx.accounts.token_program.to_account_info(),
            associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
            clock: ctx.accounts.clock.clone(),
            rent: ctx.accounts.rent.clone(),
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let key = ctx.accounts.underlying_asset_mint.key();

        let seeds = &[
            key.as_ref(),
            b"vaultAuthority",
            &[vault_authority_bump]
        ];
        let signer = &[&seeds[..]];
        let mut cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        cpi_ctx.remaining_accounts = ctx.remaining_accounts.to_vec();
        psy_american::cpi::mint_option(cpi_ctx, size)
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


#[derive(Accounts)]
pub struct InitMintVault<'info> {
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,
    pub underlying_asset: Box<Account<'info, Mint>>,
    #[account(init,
        seeds = [&underlying_asset.key().to_bytes()[..], b"vault"],
        bump,
        payer = authority,    
        token::mint = underlying_asset,
        token::authority = vault_authority,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    pub vault_authority: AccountInfo<'info>,

    pub token_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct MintCtx<'info> {
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,
    pub psy_american_program: AccountInfo<'info>,
    /// The vault where the underlying assets are held. This is the PsyAmerican 
    /// `underlying_asset_src`
    #[account(mut)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub vault_authority: AccountInfo<'info>,

    /// Mint CPI acounts
    pub underlying_asset_mint: AccountInfo<'info>,
    #[account(mut)]
    pub underlying_asset_pool: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub option_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub minted_option_dest: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub writer_token_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub minted_writer_token_dest: Box<Account<'info, TokenAccount>>,
    pub option_market: Box<Account<'info, OptionMarket>>,
    #[account(mut)]
    pub fee_owner: AccountInfo<'info>,


    pub token_program: AccountInfo<'info>,
    pub associated_token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: AccountInfo<'info>,
}