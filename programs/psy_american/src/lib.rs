pub mod errors;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

#[program]
pub mod psy_american {
    use super::*;

    /// Initialize a new PsyOptions market
    pub fn initialize_market(
        ctx: Context<InitializeMarket>, 
        underlying_amount_per_contract: u64,
        quote_amount_per_contract: u64,
        expiration_unix_timestamp: i64,
        authority_bump_seed: u8,
        _bump_seed: u8
    ) -> ProgramResult {

        // check that underlying and quote are not the same asset
        if ctx.accounts.underlying_asset_mint.key == ctx.accounts.quote_asset_mint.key {
            return Err(errors::PsyOptionsError::QuoteAndUnderlyingAssetMustDiffer.into())
        }
        // TODO: check that underlying_amount_per_contract and quote_amount_per_contract are not 0

        // TODO: check and create the appropriate fee collection account

        // TODO: Initialize the Option Mint, the SPL token that will denote an options contract

        // TODO: Initialize the Writer Token Mint, the SPL token that will denote a writte options contract

        // TODO: Initialize Underlying Pool Account to hold the underlying asset

        // TODO: Inititlize Quote Asset Pool

        // write the data to the OptionMarket account
        let option_market = &mut ctx.accounts.option_market;
        option_market.option_mint = *ctx.accounts.option_mint.key;
        option_market.writer_token_mint = *ctx.accounts.writer_token_mint.key;
        option_market.underlying_asset_mint = *ctx.accounts.underlying_asset_mint.key;
        option_market.quote_asset_mint = *ctx.accounts.quote_asset_mint.key;
        option_market.underlying_amount_per_contract = underlying_amount_per_contract;
        option_market.quote_amount_per_contract = quote_amount_per_contract;
        option_market.expiration_unix_timestamp = expiration_unix_timestamp;
        option_market.underlying_asset_pool = *ctx.accounts.underlying_asset_pool.key;
        option_market.quote_asset_pool = *ctx.accounts.quote_asset_pool.key;
        option_market.mint_fee_account = *ctx.accounts.mint_fee_recipient.key;
        option_market.exercise_fee_account = *ctx.accounts.exercise_fee_recipient.key;
        option_market.bump_seed = authority_bump_seed;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(
    underlying_amount_per_contract: u64,
    quote_amount_per_contract: u64,
    expiration_unix_timestamp: i64,
    authority_bump_seed: u8,
    bump_seed: u8
)]
pub struct InitializeMarket<'info> {
    #[account(mut, signer)]
    authority: AccountInfo<'info>,
    pub underlying_asset_mint: AccountInfo<'info>,
    pub quote_asset_mint: AccountInfo<'info>,
    #[account(init)]
    pub option_mint: AccountInfo<'info>,
    #[account(init)]
    pub writer_token_mint: AccountInfo<'info>,
    #[account(init)]
    pub quote_asset_pool: AccountInfo<'info>,
    #[account(init)]
    pub underlying_asset_pool: AccountInfo<'info>,
    #[account(
        init,
        seeds = [
            underlying_asset_mint.key.as_ref(),
            quote_asset_mint.key.as_ref(),
            &underlying_amount_per_contract.to_le_bytes(),
            &quote_amount_per_contract.to_le_bytes(),
            &expiration_unix_timestamp.to_le_bytes()
        ],
        bump = bump_seed,
        payer = authority,
    )]
    pub option_market: ProgramAccount<'info, OptionMarket>,
    pub market_authority: AccountInfo<'info>,
    fee_owner: AccountInfo<'info>,
    #[account(mut)]
    pub mint_fee_recipient: AccountInfo<'info>,
    #[account(mut)]
    pub exercise_fee_recipient: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    associated_token_program: AccountInfo<'info>,
    rent: Sysvar<'info, Rent>,
    system_program: AccountInfo<'info>,
}

#[account]
#[derive(Default)]
/// Data structure that contains all the information needed to maintain an open
/// option market.
pub struct OptionMarket {
    /// The SPL Token mint address for the tokens that denote an option
    pub option_mint: Pubkey,
    /// The SPL Token mint address for Writer Tokens that denote a written option
    pub writer_token_mint: Pubkey,
    /// The SPL Token Address that is held in the program's pool when an option is written
    pub underlying_asset_mint: Pubkey,
    /// The SPL Token Address that denominates the strike price
    pub quote_asset_mint: Pubkey,
    /// The amount of the **underlying asset** that derives a single option
    pub underlying_amount_per_contract: u64,
    /// The amount of **quote asset** that must be transfered when an option is exercised
    pub quote_amount_per_contract: u64,
    /// The Unix timestamp at which the contracts in this market expire
    pub expiration_unix_timestamp: i64,
    /// Address for the liquidity pool that contains the underlying assset
    pub underlying_asset_pool: Pubkey,
    /// Address for the liquidity pool that contains the quote asset when
    /// options are exercised
    pub quote_asset_pool: Pubkey,
    /// The SPL Token account (from the Associated Token Program) that collects
    /// fees on mint.
    pub mint_fee_account: Pubkey,
    /// The SPL Token account (from the Associated Token Program) that collects
    /// fees on exercise.
    pub exercise_fee_account: Pubkey,
    /// Bump seed for program derived addresses
    pub bump_seed: u8,
}