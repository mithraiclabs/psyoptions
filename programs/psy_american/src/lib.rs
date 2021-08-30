pub mod errors;
pub mod fees;

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, TokenAccount, Transfer};
use spl_token::state::Account as SPLTokenAccount;
use solana_program::{program::invoke, program_error::ProgramError, program_pack::Pack, system_instruction, system_program};

#[program]
pub mod psy_american {
    use super::*;

    #[access_control(InitializeMarket::accounts(&ctx))]
    /// Initialize a new PsyOptions market
    pub fn initialize_market(
        ctx: Context<InitializeMarket>, 
        underlying_amount_per_contract: u64,
        quote_amount_per_contract: u64,
        expiration_unix_timestamp: i64,
        bump_seed: u8
    ) -> ProgramResult {
        // TODO: (nice to have) Validate the expiration is in the future

        // check that underlying_amount_per_contract and quote_amount_per_contract are not 0
        if underlying_amount_per_contract <= 0 || quote_amount_per_contract <= 0 {
            return Err(errors::PsyOptionsError::QuoteOrUnderlyingAmountCannotBe0.into())
        }

        let fee_accounts = validate_fee_accounts(
            &ctx.remaining_accounts, 
            &ctx.accounts.underlying_asset_mint.key,
            &ctx.accounts.quote_asset_mint.key,
            underlying_amount_per_contract,
            quote_amount_per_contract
        )?;

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

    #[access_control(MintOption::unexpired_market(&ctx) MintOption::accounts(&ctx) validate_size(size))]
    pub fn mint_option<'a, 'b, 'c, 'info>(ctx: Context<'a, 'b, 'c, 'info, MintOption<'info>>, size: u64) -> ProgramResult {
        let option_market = &ctx.accounts.option_market;
        let mint_fee_account = validate_mint_fee_acct(
            &option_market,
            ctx.remaining_accounts
        )?;

        // Take a mint fee
        let mint_fee_amount = fees::fee_amount(option_market.underlying_amount_per_contract);
        if mint_fee_amount > 0 {
            match mint_fee_account {
                Some(account) => {
                    let cpi_accounts = Transfer {
                        from: ctx.accounts.underlying_asset_src.to_account_info(),
                        to: account.clone(),
                        authority: ctx.accounts.user_authority.clone(),
                    };
                    let cpi_token_program = ctx.accounts.token_program.clone();
                    let cpi_ctx = CpiContext::new(cpi_token_program, cpi_accounts);
                    token::transfer(cpi_ctx, mint_fee_amount)?;
                },
                None => {}
            }
        } else {
            // Handle NFT case with SOL fee
            invoke(
                &system_instruction::transfer(&ctx.accounts.user_authority.key, &fees::fee_owner_key::ID, fees::NFT_MINT_LAMPORTS),
            &[
                ctx.accounts.user_authority.clone(),
                ctx.accounts.fee_owner.clone(),
                ctx.accounts.system_program.clone(),
            ],
            )?;
        }

        // Transfer the underlying assets to the underlying assets pool
        let cpi_accounts = Transfer {
            from: ctx.accounts.underlying_asset_src.to_account_info(),
            to: ctx.accounts.underlying_asset_pool.to_account_info(),
            authority: ctx.accounts.user_authority.clone(),
        };
        let cpi_token_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new(cpi_token_program, cpi_accounts);
        let underlying_transfer_amount = option_market.underlying_amount_per_contract.checked_mul(size).unwrap();
        token::transfer(cpi_ctx, underlying_transfer_amount)?;

        let seeds = &[
            option_market.underlying_asset_mint.as_ref(),
            option_market.quote_asset_mint.as_ref(),
            &option_market.underlying_amount_per_contract.to_le_bytes(),
            &option_market.quote_amount_per_contract.to_le_bytes(),
            &option_market.expiration_unix_timestamp.to_le_bytes(),
            &[option_market.bump_seed]
        ];
        let signer = &[&seeds[..]];

        // Mint a new OptionToken(s)
        let cpi_accounts = MintTo {
            mint: ctx.accounts.option_mint.to_account_info(),
            to: ctx.accounts.minted_option_dest.to_account_info(),
            authority: ctx.accounts.option_market.to_account_info(),
        };
        let cpi_token_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_token_program, cpi_accounts, signer);
        token::mint_to(cpi_ctx, size)?;

        // Mint a new WriterToken(s)
        let cpi_accounts = MintTo {
            mint: ctx.accounts.writer_token_mint.to_account_info(),
            to: ctx.accounts.minted_writer_token_dest.to_account_info(),
            authority: ctx.accounts.option_market.to_account_info(),
        };
        let cpi_token_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_token_program, cpi_accounts, signer);
        token::mint_to(cpi_ctx, size)?;

        Ok(())
    }

    #[access_control(ExerciseOption::accounts(&ctx) ExerciseOption::unexpired_market(&ctx))]
    pub fn exercise_option<'a, 'b, 'c, 'info>(ctx: Context<'a, 'b, 'c, 'info, ExerciseOption<'info>>, size: u64) -> ProgramResult {
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
        // Burn the size of option tokens
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.clone(),
            token::Burn {
                mint: ctx.accounts.option_mint.to_account_info(),
                to: ctx.accounts.exerciser_option_token_src.to_account_info(),
                authority: ctx.accounts.user_authority.to_account_info(),
            },
            signer,
        );
        token::burn(cpi_ctx, size)?;

        // Transfer the quote assets to the pool
        let cpi_accounts = Transfer {
            from: ctx.accounts.quote_asset_src.to_account_info(),
            to: ctx.accounts.quote_asset_pool.to_account_info(),
            authority: ctx.accounts.user_authority.to_account_info(),
        };
        let cpi_token_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new(cpi_token_program, cpi_accounts);
        let quote_transfer_amount = option_market.quote_amount_per_contract.checked_mul(size).unwrap();
        token::transfer(cpi_ctx, quote_transfer_amount)?;

        // Transfer the underlying assets from the pool to the exerciser
        let cpi_accounts = Transfer {
            from: ctx.accounts.underlying_asset_pool.to_account_info(),
            to: ctx.accounts.underlying_asset_dest.to_account_info(),
            authority: ctx.accounts.option_market.to_account_info(),
        };
        let cpi_token_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_token_program, cpi_accounts, signer);
        let underlying_transfer_amount = option_market.underlying_amount_per_contract.checked_mul(size).unwrap();
        token::transfer(cpi_ctx, underlying_transfer_amount)?;
    
        // Transfer an exercise fee
        let exercise_fee_account = validate_exercise_fee_acct(&ctx.accounts.option_market, ctx.remaining_accounts)?;
        let exercise_fee_amount = fees::fee_amount(option_market.quote_amount_per_contract);
        if exercise_fee_amount > 0 {
            match exercise_fee_account {
                Some(account) => {
                    let cpi_accounts = Transfer {
                        from: ctx.accounts.quote_asset_src.to_account_info(),
                        to: account.clone(),
                        authority: ctx.accounts.user_authority.clone(),
                    };
                    let cpi_token_program = ctx.accounts.token_program.clone();
                    let cpi_ctx = CpiContext::new(cpi_token_program, cpi_accounts);
                    token::transfer(cpi_ctx, exercise_fee_amount)?;
                },
                None => {}
            }
        } else {
            // Handle NFT case with SOL fee
            invoke(
                &system_instruction::transfer(&ctx.accounts.user_authority.key, &fees::fee_owner_key::ID, fees::NFT_MINT_LAMPORTS),
            &[
                ctx.accounts.user_authority.clone(),
                ctx.accounts.fee_owner.clone(),
                ctx.accounts.system_program.clone(),
            ],
            )?;
        }
        Ok(())
    }

    pub fn close_post_expiration(ctx: Context<ClosePostExp>, size: u64) -> ProgramResult {
        // TODO: validate the market has expired

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

        // Burn the size of WriterTokens
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.clone(),
            token::Burn {
                mint: ctx.accounts.writer_token_mint.to_account_info(),
                to: ctx.accounts.writer_token_src.to_account_info(),
                authority: ctx.accounts.user_authority.to_account_info(),
            },
            signer,
        );
        token::burn(cpi_ctx, size)?;

        // Transfer the underlying from the pool to the user
        let cpi_accounts = Transfer {
            from: ctx.accounts.underlying_asset_pool.to_account_info(),
            to: ctx.accounts.underlying_asset_dest.to_account_info(),
            authority: ctx.accounts.option_market.to_account_info(),
        };
        let cpi_token_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_token_program, cpi_accounts, signer);
        let underlying_transfer_amount = option_market.underlying_amount_per_contract.checked_mul(size).unwrap();
        token::transfer(cpi_ctx, underlying_transfer_amount)?;
        Ok(())
    }
}

struct FeeAccounts {
    mint_fee_key: Pubkey,
    exercise_fee_key: Pubkey
}

/// Validate that the size is greater than 0
fn validate_size(size: u64) -> Result<(), ProgramError> {
    if size <= 0 {
        return Err(errors::PsyOptionsError::SizeCantBeLessThanEqZero.into())
    }
    Ok(())
}

fn validate_fee_accounts<'info>(
    remaining_accounts: &[AccountInfo],
    underlying_asset_mint: &Pubkey,
    quote_asset_mint: &Pubkey,
    underlying_amount_per_contract: u64,
    quote_amount_per_contract: u64
) -> Result<FeeAccounts, ProgramError> {
    let account_info_iter = &mut remaining_accounts.iter();
    let mut fee_accounts = FeeAccounts {
        mint_fee_key: fees::fee_owner_key::ID,
        exercise_fee_key: fees::fee_owner_key::ID,
    };

    // if the mint fee account is required, check that it exists and has the proper owner
    if fees::fee_amount(underlying_amount_per_contract) > 0 {
        let mint_fee_recipient = next_account_info(account_info_iter)?;
        if mint_fee_recipient.owner != &spl_token::ID {
            return Err(errors::PsyOptionsError::ExpectedSPLTokenProgramId.into())
        }
        let mint_fee_account = SPLTokenAccount::unpack_from_slice(&mint_fee_recipient.try_borrow_data()?)?;
        if mint_fee_account.owner != fees::fee_owner_key::ID {
            return Err(errors::PsyOptionsError::MintFeeMustBeOwnedByFeeOwner.into()) 
        }
        // check that the mint fee recipient account's mint is also the underlying mint
        if mint_fee_account.mint != *underlying_asset_mint {
            return Err(errors::PsyOptionsError::MintFeeTokenMustMatchUnderlyingAsset.into())
        }

        fee_accounts.mint_fee_key = *mint_fee_recipient.key;
    }

    // if the exercise fee account is required, check that it exists and has the proper owner
    if fees::fee_amount(quote_amount_per_contract) > 0 {
        let exercise_fee_recipient = next_account_info(account_info_iter)?;
        if exercise_fee_recipient.owner != &spl_token::ID {
            return Err(errors::PsyOptionsError::ExpectedSPLTokenProgramId.into())
        }
        let exercise_fee_account = SPLTokenAccount::unpack_from_slice(&exercise_fee_recipient.try_borrow_data()?)?;
        if exercise_fee_account.owner != fees::fee_owner_key::ID {
            return Err(errors::PsyOptionsError::ExerciseFeeMustBeOwnedByFeeOwner.into()) 
        }
        // check that the exercise fee recipient account's mint is also the quote mint
        if exercise_fee_account.mint != *quote_asset_mint {
            return Err(errors::PsyOptionsError::ExerciseFeeTokenMustMatchQuoteAsset.into())
        }

        fee_accounts.exercise_fee_key = *exercise_fee_recipient.key;
    }
    Ok(fee_accounts)
}

fn validate_mint_fee_acct<'c, 'info>(
    option_market: &ProgramAccount<OptionMarket>,
    remaining_accounts: &'c [AccountInfo<'info>]
) -> Result<Option<&'c AccountInfo<'info>>, ProgramError> {
    let account_info_iter = &mut remaining_accounts.iter();
    let acct;
    if fees::fee_amount(option_market.underlying_amount_per_contract) > 0 {
        let mint_fee_recipient = next_account_info(account_info_iter)?;
        if mint_fee_recipient.owner != &spl_token::ID {
            return Err(errors::PsyOptionsError::ExpectedSPLTokenProgramId.into())
        }
        let mint_fee_account = SPLTokenAccount::unpack_from_slice(&mint_fee_recipient.try_borrow_data()?)?;
        if mint_fee_account.owner != fees::fee_owner_key::ID {
            return Err(errors::PsyOptionsError::MintFeeMustBeOwnedByFeeOwner.into()) 
        }
        // check that the mint fee recipient account's mint is also the underlying mint
        if mint_fee_account.mint != option_market.underlying_asset_mint {
            return Err(errors::PsyOptionsError::MintFeeTokenMustMatchUnderlyingAsset.into())
        }
        if *mint_fee_recipient.key != option_market.mint_fee_account {
            return Err(errors::PsyOptionsError::MintFeeKeyDoesNotMatchOptionMarket.into())
        }
        acct = Some(mint_fee_recipient);
    } else {
        acct = None;
    }
    Ok(acct)
}

fn validate_exercise_fee_acct<'c, 'info>(
    option_market: &ProgramAccount<OptionMarket>,
    remaining_accounts: &'c [AccountInfo<'info>]
) -> Result<Option<&'c AccountInfo<'info>>, ProgramError> {
    let account_info_iter = &mut remaining_accounts.iter();
    let acct;
    if fees::fee_amount(option_market.quote_amount_per_contract) > 0 {
        let exercise_fee_recipient = next_account_info(account_info_iter)?;
        if exercise_fee_recipient.owner != &spl_token::ID {
            return Err(errors::PsyOptionsError::ExpectedSPLTokenProgramId.into())
        }
        let exercise_fee_account = SPLTokenAccount::unpack_from_slice(&exercise_fee_recipient.try_borrow_data()?)?;
        if exercise_fee_account.owner != fees::fee_owner_key::ID {
            return Err(errors::PsyOptionsError::ExerciseFeeMustBeOwnedByFeeOwner.into()) 
        }
        // check that the mint fee recipient account's mint is also the underlying mint
        if exercise_fee_account.mint != option_market.quote_asset_mint {
            return Err(errors::PsyOptionsError::ExerciseFeeTokenMustMatchQuoteAsset.into())
        }
        // Check the exercise fee account matches the one on the OptionMarket
        if *exercise_fee_recipient.key != option_market.exercise_fee_account {
            return Err(errors::PsyOptionsError::ExerciseFeeKeyDoesNotMatchOptionMarket.into())
        }
        acct = Some(exercise_fee_recipient);
    } else {
        acct = None;
    }
    Ok(acct)
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
    fn accounts(ctx: &Context<InitializeMarket<'info>>) -> Result<(), ProgramError> {
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
    #[account(mut, signer)]
    user_authority: AccountInfo<'info>,
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
    #[account(mut)]
    fee_owner: AccountInfo<'info>,


    token_program: AccountInfo<'info>,
    associated_token_program: AccountInfo<'info>,
    clock: Sysvar<'info, Clock>,
    rent: Sysvar<'info, Rent>,
    system_program: AccountInfo<'info>,
}
impl<'info> MintOption<'info> {
    fn accounts(ctx: &Context<MintOption<'info>>) -> Result<(), ProgramError> {
        // Validate the underlying asset pool is the same as on the OptionMarket
        if *ctx.accounts.underlying_asset_pool.to_account_info().key != ctx.accounts.option_market.underlying_asset_pool {
            return Err(errors::PsyOptionsError::UnderlyingPoolAccountDoesNotMatchMarket.into())
        }

        // Validate the option mint is the same as on the OptionMarket
        if *ctx.accounts.option_mint.to_account_info().key != ctx.accounts.option_market.option_mint {
            return Err(errors::PsyOptionsError::OptionTokenMintDoesNotMatchMarket.into())
        }

        // Validate the writer token mint is the same as on the OptionMarket
        if *ctx.accounts.writer_token_mint.to_account_info().key != ctx.accounts.option_market.writer_token_mint {
            return Err(errors::PsyOptionsError::WriterTokenMintDoesNotMatchMarket.into())
        }

        // Validate the fee owner is correct
        if *ctx.accounts.fee_owner.key != fees::fee_owner_key::ID {
            return Err(errors::PsyOptionsError::FeeOwnerDoesNotMatchProgram.into())
        }

        // Validate the system program account passed in is correct
        if !system_program::check_id(ctx.accounts.system_program.key) {
            return Err(ProgramError::InvalidAccountData);
        }

        Ok(())
    }
    fn unexpired_market(ctx: &Context<MintOption<'info>>) -> Result<(), ProgramError> {
        // Validate the market is not expired
        if ctx.accounts.option_market.expiration_unix_timestamp < ctx.accounts.clock.unix_timestamp {
            return Err(errors::PsyOptionsError::OptionMarketExpiredCantMint.into())
        }
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ExerciseOption<'info> {
    #[account(mut, signer)]
    user_authority: AccountInfo<'info>,
    option_market: ProgramAccount<'info, OptionMarket>,
    #[account(mut)]
    option_mint: CpiAccount<'info, Mint>,
    #[account(mut)]
    exerciser_option_token_src: CpiAccount<'info, TokenAccount>,
    #[account(mut)]
    underlying_asset_pool: CpiAccount<'info, TokenAccount>,
    #[account(mut)]
    underlying_asset_dest: CpiAccount<'info, TokenAccount>,
    #[account(mut)]
    quote_asset_pool: CpiAccount<'info, TokenAccount>,
    #[account(mut)]
    quote_asset_src: CpiAccount<'info, TokenAccount>,
    #[account(mut)]
    fee_owner: AccountInfo<'info>,

    token_program: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    clock: Sysvar<'info, Clock>,
}
impl<'info> ExerciseOption<'info> {
    fn accounts(ctx: &Context<ExerciseOption>) -> Result<(), ProgramError> {
        // Validate the quote asset pool is the same as on the OptionMarket
        if *ctx.accounts.quote_asset_pool.to_account_info().key != ctx.accounts.option_market.quote_asset_pool {
            return Err(errors::PsyOptionsError::QuotePoolAccountDoesNotMatchMarket.into())
        }

        // Validate the underlying asset pool is the same as on the OptionMarket
        if *ctx.accounts.underlying_asset_pool.to_account_info().key != ctx.accounts.option_market.underlying_asset_pool {
            return Err(errors::PsyOptionsError::UnderlyingPoolAccountDoesNotMatchMarket.into())
        }

        // Validate the option mint is the same as on the OptionMarket
        if *ctx.accounts.option_mint.to_account_info().key != ctx.accounts.option_market.option_mint {
            return Err(errors::PsyOptionsError::OptionTokenMintDoesNotMatchMarket.into())
        }

        // Validate the underlying destination has the same mint as the pool
        if ctx.accounts.underlying_asset_dest.mint != ctx.accounts.option_market.underlying_asset_mint {
            return Err(errors::PsyOptionsError::UnderlyingDestMintDoesNotMatchUnderlyingAsset.into())
        }

        // Validate the fee owner is correct
        if *ctx.accounts.fee_owner.key != fees::fee_owner_key::ID {
            return Err(errors::PsyOptionsError::FeeOwnerDoesNotMatchProgram.into())
        }

        // Validate the system program account passed in is correct
        if !system_program::check_id(ctx.accounts.system_program.key) {
            return Err(ProgramError::InvalidAccountData);
        }

        Ok(())
    }
    fn unexpired_market(ctx: &Context<ExerciseOption>) -> Result<(), ProgramError> {
        // Validate the market is not expired
        if ctx.accounts.option_market.expiration_unix_timestamp < ctx.accounts.clock.unix_timestamp {
            return Err(errors::PsyOptionsError::OptionMarketExpiredCantExercise.into())
        }
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ClosePostExp<'info> {
    #[account(signer)]
    user_authority: AccountInfo<'info>,
    option_market: ProgramAccount<'info, OptionMarket>,
    #[account(mut)]
    writer_token_mint: CpiAccount<'info, Mint>,
    #[account(mut)]
    writer_token_src: CpiAccount<'info, TokenAccount>,
    #[account(mut)]
    underlying_asset_pool: CpiAccount<'info, TokenAccount>,
    #[account(mut)]
    underlying_asset_dest: CpiAccount<'info, TokenAccount>,

    token_program: AccountInfo<'info>,
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