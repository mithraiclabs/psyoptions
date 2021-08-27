pub mod errors;
pub mod fees;

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, TokenAccount};
use spl_token::state::Account as SPLTokenAccount;
use solana_program::{ program_error::ProgramError, program_pack::Pack };

#[program]
pub mod psy_american {
    use super::*;

    #[access_control(InitializeMarket::accounts(&ctx, underlying_amount_per_contract, quote_amount_per_contract))]
    /// Initialize a new PsyOptions market
    pub fn initialize_market(
        ctx: Context<InitializeMarket>, 
        underlying_amount_per_contract: u64,
        quote_amount_per_contract: u64,
        expiration_unix_timestamp: i64,
        bump_seed: u8
    ) -> ProgramResult {
        // check that underlying_amount_per_contract and quote_amount_per_contract are not 0
        if underlying_amount_per_contract <= 0 || quote_amount_per_contract <= 0 {
            return Err(errors::PsyOptionsError::QuoteOrUnderlyingAmountCannotBe0.into())
        }

        let fee_accounts = validate_fee_accounts(&ctx, underlying_amount_per_contract, quote_amount_per_contract)?;

        // write the data to the OptionMarket account
        let option_market = &mut ctx.accounts.option_market;
        option_market.option_mint = *ctx.accounts.option_mint.to_account_info().key;
        option_market.writer_token_mint = *ctx.accounts.writer_token_mint.to_account_info().key;
        option_market.underlying_asset_mint = *ctx.accounts.underlying_asset_mint.key;
        option_market.quote_asset_mint = *ctx.accounts.quote_asset_mint.key;
        option_market.underlying_amount_per_contract = underlying_amount_per_contract;
        option_market.quote_amount_per_contract = quote_amount_per_contract;
        option_market.expiration_unix_timestamp = expiration_unix_timestamp;
        option_market.underlying_asset_pool = *ctx.accounts.underlying_asset_pool.to_account_info().key;
        option_market.quote_asset_pool = *ctx.accounts.quote_asset_pool.to_account_info().key;
        option_market.mint_fee_account = fee_accounts.mint_fee_key;
        option_market.exercise_fee_account = fee_accounts.exercise_fee_key;
        option_market.bump_seed = bump_seed;

        Ok(())
    }

    pub fn mint_option(ctx: Context<MintOption>, size: u64) -> ProgramResult {
        // Mint a new option
        let cpi_accounts = MintTo {
            mint: ctx.accounts.option_mint.to_account_info(),
            to: ctx.accounts.minted_option_dest.to_account_info(),
            authority: ctx.accounts.option_market.to_account_info(),
        };
        let option_market = &ctx.accounts.option_market;
        let seeds = &[
            option_market.underlying_asset_mint.as_ref(),
            option_market.quote_asset_mint.as_ref(),
            &option_market.underlying_amount_per_contract.to_le_bytes(),
            &option_market.quote_amount_per_contract.to_le_bytes(),
            &option_market.expiration_unix_timestamp.to_le_bytes(),
            &[option_market.bump_seed]
        ];
        let signer = &[&seeds[..]];
        let cpi_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::mint_to(cpi_ctx, size)?;

        Ok(())
    }
}


struct FeeAccounts {
    mint_fee_key: Pubkey,
    exercise_fee_key: Pubkey
}
fn validate_fee_accounts<'info>(
    ctx: &Context<InitializeMarket>,
    underlying_amount_per_contract: u64,
    quote_amount_per_contract: u64
) -> Result<FeeAccounts, ProgramError> {
    let account_info_iter = &mut ctx.remaining_accounts.iter();
    let mut fee_accounts = FeeAccounts {
        mint_fee_key: fees::fee_owner_key::ID,
        exercise_fee_key: fees::fee_owner_key::ID,
    };

    // if the mint fee account is required, check that it exists and has the proper owner
    if fees::fee_amount(underlying_amount_per_contract) > 0 {
        let mint_fee_recipient = next_account_info(account_info_iter)?;
        msg!("mint fee program owner: {:?}", mint_fee_recipient.owner);
        if mint_fee_recipient.owner != &spl_token::ID {
            return Err(errors::PsyOptionsError::ExpectedSPLTokenProgramId.into())
        }
        let mint_fee_account = SPLTokenAccount::unpack_from_slice(&mint_fee_recipient.try_borrow_data()?)?;
        msg!("mint owner: {:?}, fee_owner: {:?}", mint_fee_account.owner, fees::fee_owner_key::ID);
        if mint_fee_account.owner != fees::fee_owner_key::ID {
            return Err(errors::PsyOptionsError::MintFeeMustBeOwnedByFeeOwner.into()) 
        }
        // check that the mint fee recipient account's mint is also the underlying mint
        if mint_fee_account.mint != *ctx.accounts.underlying_asset_mint.key {
            return Err(errors::PsyOptionsError::MintFeeTokenMustMatchUnderlyingAsset.into())
        }

        fee_accounts.mint_fee_key = *mint_fee_recipient.key;
    }

    // if the exercise fee account is required, check that it exists and has the proper owner
    if fees::fee_amount(quote_amount_per_contract) > 0 {
        let exercise_fee_recipient = next_account_info(account_info_iter)?;
        msg!("exercise_fee_recipient owner: {:?}", exercise_fee_recipient.owner);
        if exercise_fee_recipient.owner != &spl_token::ID {
            return Err(errors::PsyOptionsError::ExpectedSPLTokenProgramId.into())
        }
        let exercise_fee_account = SPLTokenAccount::unpack_from_slice(&exercise_fee_recipient.try_borrow_data()?)?;
        msg!("owner: {:?}, fee_owner: {:?}", exercise_fee_account.owner, fees::fee_owner_key::ID);
        if exercise_fee_account.owner != fees::fee_owner_key::ID {
            return Err(errors::PsyOptionsError::ExerciseFeeMustBeOwnedByFeeOwner.into()) 
        }
        // check that the exercise fee recipient account's mint is also the quote mint
        if exercise_fee_account.mint != *ctx.accounts.quote_asset_mint.key {
            return Err(errors::PsyOptionsError::ExerciseFeeTokenMustMatchQuoteAsset.into())
        }

        fee_accounts.exercise_fee_key = *exercise_fee_recipient.key;
    }
    Ok(fee_accounts)
}

#[derive(Accounts)]
#[instruction(
    underlying_amount_per_contract: u64,
    quote_amount_per_contract: u64,
    expiration_unix_timestamp: i64,
    bump_seed: u8
)]
pub struct InitializeMarket<'info> {
    #[account(mut, signer)]
    authority: AccountInfo<'info>,
    pub underlying_asset_mint: AccountInfo<'info>,
    pub quote_asset_mint: AccountInfo<'info>,
    pub option_mint: CpiAccount<'info, Mint>,
    pub writer_token_mint: CpiAccount<'info, Mint>,
    pub quote_asset_pool: CpiAccount<'info, TokenAccount>,
    pub underlying_asset_pool: CpiAccount<'info, TokenAccount>,
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
    fee_owner: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    associated_token_program: AccountInfo<'info>,
    rent: Sysvar<'info, Rent>,
    system_program: AccountInfo<'info>,
}
impl<'info> InitializeMarket<'info> {
    fn accounts(ctx: &Context<InitializeMarket<'info>>, underlying_amount_per_contract: u64, quote_amount_per_contract: u64) -> Result<(), ProgramError> {
        if ctx.accounts.option_mint.mint_authority.unwrap() != *ctx.accounts.option_market.to_account_info().key {
            return Err(errors::PsyOptionsError::OptionMarketMustBeMintAuthority.into());
        }
        if ctx.accounts.writer_token_mint.mint_authority.unwrap() != *ctx.accounts.option_market.to_account_info().key {
            return Err(errors::PsyOptionsError::OptionMarketMustBeMintAuthority.into());
        }
        if ctx.accounts.underlying_asset_pool.owner != *ctx.accounts.option_market.to_account_info().key {
            return Err(errors::PsyOptionsError::OptionMarketMustOwnUnderlyingAssetPool.into());
        }
        if ctx.accounts.quote_asset_pool.owner != *ctx.accounts.option_market.to_account_info().key {
            return Err(errors::PsyOptionsError::OptionMarketMustOwnQuoteAssetPool.into());
        }
        // check that underlying and quote are not the same asset
        if ctx.accounts.underlying_asset_mint.key == ctx.accounts.quote_asset_mint.key {
            return Err(errors::PsyOptionsError::QuoteAndUnderlyingAssetMustDiffer.into())
        }
        Ok(())
    }
}

#[derive(Accounts)]
pub struct MintOption<'info> {
    #[account(signer)]
    authority: AccountInfo<'info>,
    underlying_asset_mint: AccountInfo<'info>,
    #[account(mut)]
    underlying_asset_pool: CpiAccount<'info, TokenAccount>,
    #[account(mut)]
    underlying_asset_src: CpiAccount<'info, TokenAccount>,
    #[account(mut)]
    option_mint: CpiAccount<'info, Mint>,
    #[account(mut)]
    minted_option_dest: CpiAccount<'info, TokenAccount>,
    #[account(mut)]
    writer_token_mint: CpiAccount<'info, Mint>,
    #[account(mut)]
    minted_writer_token_dest: CpiAccount<'info, TokenAccount>,
    option_market: ProgramAccount<'info, OptionMarket>,
    fee_owner: AccountInfo<'info>,

    token_program: AccountInfo<'info>,
    associated_token_program: AccountInfo<'info>,
    clock: Sysvar<'info, Clock>,
    rent: Sysvar<'info, Rent>,
    system_program: AccountInfo<'info>,
}
impl<'info> MintOption<'info> {
    fn accounts(_ctx: &Context<MintOption<'info>>) -> Result<(), ProgramError> {
        Ok(())
    }
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