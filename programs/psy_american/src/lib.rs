pub mod errors;
pub mod fees;
pub mod serum_proxy;

use anchor_lang::{AccountsExit, Key, prelude::*};
use anchor_spl::token::{self, Burn, Mint, MintTo, TokenAccount, Transfer, Token};
use spl_token::state::Account as SPLTokenAccount;
use solana_program::{program::invoke, program_error::ProgramError, program_pack::Pack, system_instruction, system_program};
use serum_dex::instruction::{initialize_market as init_serum_market_instruction};
use anchor_spl::dex::{
    MarketProxy, OpenOrdersPda, ReferralFees,
};

declare_id!("R2y9ip6mxmWUj4pt54jP2hz2dgvMozy9VTSwMWE7evs");

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
        // (nice to have) Validate the expiration is in the future
        if expiration_unix_timestamp < ctx.accounts.clock.unix_timestamp {
            return Err(errors::ErrorCode::ExpirationIsInThePast.into())
        }
        // check that underlying_amount_per_contract and quote_amount_per_contract are not 0
        if underlying_amount_per_contract <= 0 || quote_amount_per_contract <= 0 {
            return Err(errors::ErrorCode::QuoteOrUnderlyingAmountCannotBe0.into())
        }

        let fee_accounts = validate_fee_accounts(
            &ctx.remaining_accounts, 
            &ctx.accounts.underlying_asset_mint.key(),
            &ctx.accounts.quote_asset_mint.key(),
            underlying_amount_per_contract,
            quote_amount_per_contract
        )?;

        // write the data to the OptionMarket account
        let option_market = &mut ctx.accounts.option_market;
        option_market.option_mint = *ctx.accounts.option_mint.to_account_info().key;
        option_market.writer_token_mint = *ctx.accounts.writer_token_mint.to_account_info().key;
        option_market.underlying_asset_mint = *ctx.accounts.underlying_asset_mint.to_account_info().key;
        option_market.quote_asset_mint = *ctx.accounts.quote_asset_mint.to_account_info().key;
        option_market.underlying_amount_per_contract = underlying_amount_per_contract;
        option_market.quote_amount_per_contract = quote_amount_per_contract;
        option_market.expiration_unix_timestamp = expiration_unix_timestamp;
        option_market.underlying_asset_pool = *ctx.accounts.underlying_asset_pool.to_account_info().key;
        option_market.quote_asset_pool = *ctx.accounts.quote_asset_pool.to_account_info().key;
        option_market.mint_fee_account = fee_accounts.mint_fee_key;
        option_market.exercise_fee_account = fee_accounts.exercise_fee_key;
        option_market.expired = false;
        option_market.bump_seed = bump_seed;

        Ok(())
    }

    #[access_control(MintOption::unexpired_market(&ctx) MintOption::accounts(&ctx) validate_size(size))]
    pub fn mint_option<'a, 'b, 'c, 'info>(ctx: Context<'a, 'b, 'c, 'info, MintOption<'info>>, size: u64) -> ProgramResult {
        let option_market = &ctx.accounts.option_market;
        let mint_fee_account = validate_mint_fee_acct(
            option_market,
            ctx.remaining_accounts
        )?;

        // Take a mint fee
        let mint_fee_amount_per_contract = fees::fee_amount(option_market.underlying_amount_per_contract);
        if mint_fee_amount_per_contract > 0 {
            match mint_fee_account {
                Some(account) => {
                    let cpi_accounts = Transfer {
                        from: ctx.accounts.underlying_asset_src.to_account_info(),
                        to: account.clone(),
                        authority: ctx.accounts.user_authority.clone(),
                    };
                    let cpi_token_program = ctx.accounts.token_program.clone();
                    let cpi_ctx = CpiContext::new(cpi_token_program.to_account_info(), cpi_accounts);
                    let total_fee = mint_fee_amount_per_contract.checked_mul(size).ok_or(errors::ErrorCode::NumberOverflow)?;
                    token::transfer(cpi_ctx, total_fee)?;
                },
                None => {}
            }
        } else {
            // Handle NFT case with SOL fee
            let total_fee = fees::NFT_MINT_LAMPORTS.checked_mul(size).ok_or(errors::ErrorCode::NumberOverflow)?;
            invoke(
                &system_instruction::transfer(&ctx.accounts.user_authority.key, &fees::fee_owner_key::ID, total_fee),
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
        let cpi_ctx = CpiContext::new(cpi_token_program.to_account_info(), cpi_accounts);
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
        let cpi_ctx = CpiContext::new_with_signer(cpi_token_program.to_account_info(), cpi_accounts, signer);
        token::mint_to(cpi_ctx, size)?;

        // Mint a new WriterToken(s)
        let cpi_accounts = MintTo {
            mint: ctx.accounts.writer_token_mint.to_account_info(),
            to: ctx.accounts.minted_writer_token_dest.to_account_info(),
            authority: ctx.accounts.option_market.to_account_info(),
        };
        let cpi_token_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_token_program.to_account_info(), cpi_accounts, signer);
        token::mint_to(cpi_ctx, size)?;

        Ok(())
    }

    #[access_control(MintOptionV2::unexpired_market(&ctx) MintOptionV2::accounts(&ctx) validate_size(size))]
    pub fn mint_option_v2<'a, 'b, 'c, 'info>(ctx: Context<'a, 'b, 'c, 'info, MintOptionV2<'info>>, size: u64) -> ProgramResult {
        let option_market = &ctx.accounts.option_market;

        // Transfer the underlying assets to the underlying assets pool
        let cpi_accounts = Transfer {
            from: ctx.accounts.underlying_asset_src.to_account_info(),
            to: ctx.accounts.underlying_asset_pool.to_account_info(),
            authority: ctx.accounts.user_authority.clone(),
        };
        let cpi_token_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new(cpi_token_program.to_account_info(), cpi_accounts);
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
        let cpi_ctx = CpiContext::new_with_signer(cpi_token_program.to_account_info(), cpi_accounts, signer);
        token::mint_to(cpi_ctx, size)?;

        // Mint a new WriterToken(s)
        let cpi_accounts = MintTo {
            mint: ctx.accounts.writer_token_mint.to_account_info(),
            to: ctx.accounts.minted_writer_token_dest.to_account_info(),
            authority: ctx.accounts.option_market.to_account_info(),
        };
        let cpi_token_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_token_program.to_account_info(), cpi_accounts, signer);
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
            ctx.accounts.token_program.to_account_info().clone(),
            Burn {
                mint: ctx.accounts.option_mint.to_account_info(),
                to: ctx.accounts.exerciser_option_token_src.to_account_info(),
                authority: ctx.accounts.option_authority.to_account_info(),
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
        let cpi_ctx = CpiContext::new(cpi_token_program.to_account_info(), cpi_accounts);
        let quote_transfer_amount = option_market.quote_amount_per_contract.checked_mul(size).unwrap();
        token::transfer(cpi_ctx, quote_transfer_amount)?;

        // Transfer the underlying assets from the pool to the exerciser
        let cpi_accounts = Transfer {
            from: ctx.accounts.underlying_asset_pool.to_account_info(),
            to: ctx.accounts.underlying_asset_dest.to_account_info(),
            authority: ctx.accounts.option_market.to_account_info(),
        };
        let cpi_token_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_token_program.to_account_info(), cpi_accounts, signer);
        let underlying_transfer_amount = option_market.underlying_amount_per_contract.checked_mul(size).unwrap();
        token::transfer(cpi_ctx, underlying_transfer_amount)?;

        // Transfer an exercise fee
        let exercise_fee_account = validate_exercise_fee_acct(&ctx.accounts.option_market, ctx.remaining_accounts)?;
        let exercise_fee_amount_per_contract = fees::fee_amount(option_market.quote_amount_per_contract);
        if exercise_fee_amount_per_contract > 0 {
            match exercise_fee_account {
                Some(account) => {
                    let cpi_accounts = Transfer {
                        from: ctx.accounts.quote_asset_src.to_account_info(),
                        to: account.clone(),
                        authority: ctx.accounts.user_authority.clone(),
                    };
                    let cpi_token_program = ctx.accounts.token_program.clone();
                    let cpi_ctx = CpiContext::new(cpi_token_program.to_account_info(), cpi_accounts);
                    let total_fee = exercise_fee_amount_per_contract.checked_mul(size).ok_or(errors::ErrorCode::NumberOverflow)?;
                    token::transfer(cpi_ctx, total_fee)?;
                },
                None => {}
            }
        } else {
            // Handle NFT case with SOL fee
            let total_fee = fees::NFT_MINT_LAMPORTS.checked_mul(size).ok_or(errors::ErrorCode::NumberOverflow)?;
            invoke(
                &system_instruction::transfer(&ctx.accounts.user_authority.key, &fees::fee_owner_key::ID, total_fee),
            &[
                ctx.accounts.user_authority.clone(),
                ctx.accounts.fee_owner.clone(),
                ctx.accounts.system_program.clone(),
            ],
            )?;
        }
        Ok(())
    }

    #[access_control(ClosePostExp::accounts(&ctx) ClosePostExp::expired_market(&ctx))]
    pub fn close_post_expiration(ctx: Context<ClosePostExp>, size: u64) -> ProgramResult {
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
            ctx.accounts.token_program.to_account_info().clone(),
            Burn {
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
        let cpi_ctx = CpiContext::new_with_signer(cpi_token_program.to_account_info(), cpi_accounts, signer);
        let underlying_transfer_amount = option_market.underlying_amount_per_contract.checked_mul(size).unwrap();
        token::transfer(cpi_ctx, underlying_transfer_amount)?;
        Ok(())
    }

    #[access_control(CloseOptionPosition::accounts(&ctx))]
    pub fn close_option_position(ctx: Context<CloseOptionPosition>, size: u64) -> ProgramResult {
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
            ctx.accounts.token_program.to_account_info().clone(),
            token::Burn {
                mint: ctx.accounts.writer_token_mint.to_account_info(),
                to: ctx.accounts.writer_token_src.to_account_info(),
                authority: ctx.accounts.user_authority.to_account_info(),
            },
            signer,
        );
        token::burn(cpi_ctx, size)?;

        // Burn the Optiontokens
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info().clone(),
            Burn {
                mint: ctx.accounts.option_token_mint.to_account_info(),
                to: ctx.accounts.option_token_src.to_account_info(),
                authority: ctx.accounts.user_authority.to_account_info(),
            },
            signer,
        );
        token::burn(cpi_ctx, size)?;


        // Transfer the underlying assets from the pool to the destination
        let cpi_accounts = Transfer {
            from: ctx.accounts.underlying_asset_pool.to_account_info(),
            to: ctx.accounts.underlying_asset_dest.to_account_info(),
            authority: ctx.accounts.option_market.to_account_info(),
        };
        let cpi_token_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_token_program.to_account_info(), cpi_accounts, signer);
        let underlying_transfer_amount = option_market.underlying_amount_per_contract.checked_mul(size).unwrap();
        token::transfer(cpi_ctx, underlying_transfer_amount)?;
        Ok(())
    }

    #[access_control(BurnWriterForQuote::accounts(&ctx) BurnWriterForQuote::quotes_in_pool(&ctx, size))]
    pub fn burn_writer_for_quote(ctx: Context<BurnWriterForQuote>, size: u64)  -> ProgramResult {
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
            ctx.accounts.token_program.to_account_info().clone(),
            Burn {
                mint: ctx.accounts.writer_token_mint.to_account_info(),
                to: ctx.accounts.writer_token_src.to_account_info(),
                authority: ctx.accounts.user_authority.to_account_info(),
            },
            signer,
        );
        token::burn(cpi_ctx, size)?;

        // Transfer the quote assets to the writer's account
        let cpi_accounts = Transfer {
            from: ctx.accounts.quote_asset_pool.to_account_info(),
            to: ctx.accounts.writer_quote_dest.to_account_info(),
            authority: ctx.accounts.option_market.to_account_info(),
        };
        let cpi_token_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_token_program.to_account_info(), cpi_accounts, signer);
        let quote_transfer_amount = option_market.quote_amount_per_contract.checked_mul(size).unwrap();
        token::transfer(cpi_ctx, quote_transfer_amount)?;
        

        Ok(())
    }

    #[access_control(InitSerumMarket::accounts(&ctx))]
    pub fn init_serum_market(ctx: Context<InitSerumMarket>, _market_space: u64, vault_signer_nonce: u64, coin_lot_size: u64, pc_lot_size: u64, pc_dust_threshold: u64) -> ProgramResult {
        let ix = init_serum_market_instruction(
            ctx.accounts.serum_market.key,
            ctx.accounts.dex_program.key,
            &ctx.accounts.option_mint.key(),
            &ctx.accounts.pc_mint.key(),
            &ctx.accounts.coin_vault.key(),
            &ctx.accounts.pc_vault.key(),
            Some(&ctx.accounts.market_authority.key()),
            Some(&ctx.accounts.market_authority.key()),
            ctx.accounts.bids.key,
            ctx.accounts.asks.key,
            ctx.accounts.request_queue.key,
            ctx.accounts.event_queue.key,
            coin_lot_size,
            pc_lot_size,
            vault_signer_nonce,
            pc_dust_threshold
        )?;
        invoke(&ix, &[
            ctx.accounts.serum_market.to_account_info(),
            ctx.accounts.dex_program.to_account_info(),
            ctx.accounts.option_mint.to_account_info(),
            ctx.accounts.pc_mint.to_account_info(),
            ctx.accounts.coin_vault.to_account_info(),
            ctx.accounts.pc_vault.to_account_info(),
            ctx.accounts.market_authority.to_account_info(),
            ctx.accounts.bids.to_account_info(),
            ctx.accounts.asks.to_account_info(),
            ctx.accounts.request_queue.to_account_info(),
            ctx.accounts.event_queue.to_account_info(),
            ctx.accounts.rent.to_account_info(),
        ])?;

        Ok(())
    }

    pub fn entry(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
        MarketProxy::new()
            .middleware(&mut serum_proxy::Validation::new())
            .middleware(&mut ReferralFees::new(serum_proxy::referral::ID))
            .middleware(&mut OpenOrdersPda::new())
            .run(program_id, accounts, data)
    }
}

struct FeeAccounts {
    mint_fee_key: Pubkey,
    exercise_fee_key: Pubkey
}

/// Validate that the size is greater than 0
fn validate_size(size: u64) -> Result<(), ProgramError> {
    if size <= 0 {
        return Err(errors::ErrorCode::SizeCantBeLessThanEqZero.into())
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
            return Err(errors::ErrorCode::ExpectedSPLTokenProgramId.into())
        }
        let mint_fee_account = SPLTokenAccount::unpack_from_slice(&mint_fee_recipient.try_borrow_data()?)?;
        if mint_fee_account.owner != fees::fee_owner_key::ID {
            return Err(errors::ErrorCode::MintFeeMustBeOwnedByFeeOwner.into()) 
        }
        // check that the mint fee recipient account's mint is also the underlying mint
        if mint_fee_account.mint != *underlying_asset_mint {
            return Err(errors::ErrorCode::MintFeeTokenMustMatchUnderlyingAsset.into())
        }

        fee_accounts.mint_fee_key = *mint_fee_recipient.key;
    }

    // if the exercise fee account is required, check that it exists and has the proper owner
    if fees::fee_amount(quote_amount_per_contract) > 0 {
        let exercise_fee_recipient = next_account_info(account_info_iter)?;
        if exercise_fee_recipient.owner != &spl_token::ID {
            return Err(errors::ErrorCode::ExpectedSPLTokenProgramId.into())
        }
        let exercise_fee_account = SPLTokenAccount::unpack_from_slice(&exercise_fee_recipient.try_borrow_data()?)?;
        if exercise_fee_account.owner != fees::fee_owner_key::ID {
            return Err(errors::ErrorCode::ExerciseFeeMustBeOwnedByFeeOwner.into()) 
        }
        // check that the exercise fee recipient account's mint is also the quote mint
        if exercise_fee_account.mint != *quote_asset_mint {
            return Err(errors::ErrorCode::ExerciseFeeTokenMustMatchQuoteAsset.into())
        }

        fee_accounts.exercise_fee_key = *exercise_fee_recipient.key;
    }
    Ok(fee_accounts)
}

fn validate_mint_fee_acct<'c, 'info>(
    option_market: &Box<anchor_lang::Account<'info, OptionMarket>>,
    remaining_accounts: &'c [AccountInfo<'info>]
) -> Result<Option<&'c AccountInfo<'info>>, ProgramError> {
    let account_info_iter = &mut remaining_accounts.iter();
    let acct;
    if fees::fee_amount(option_market.underlying_amount_per_contract) > 0 {
        let mint_fee_recipient = next_account_info(account_info_iter)?;
        if mint_fee_recipient.owner != &spl_token::ID {
            return Err(errors::ErrorCode::ExpectedSPLTokenProgramId.into())
        }
        let mint_fee_account = SPLTokenAccount::unpack_from_slice(&mint_fee_recipient.try_borrow_data()?)?;
        if mint_fee_account.owner != fees::fee_owner_key::ID {
            return Err(errors::ErrorCode::MintFeeMustBeOwnedByFeeOwner.into()) 
        }
        // check that the mint fee recipient account's mint is also the underlying mint
        if mint_fee_account.mint != option_market.underlying_asset_mint {
            return Err(errors::ErrorCode::MintFeeTokenMustMatchUnderlyingAsset.into())
        }
        if *mint_fee_recipient.key != option_market.mint_fee_account {
            return Err(errors::ErrorCode::MintFeeKeyDoesNotMatchOptionMarket.into())
        }
        acct = Some(mint_fee_recipient);
    } else {
        acct = None;
    }
    Ok(acct)
}

fn validate_exercise_fee_acct<'c, 'info>(
    option_market: &Box<anchor_lang::Account<'info, OptionMarket>>,
    remaining_accounts: &'c [AccountInfo<'info>]
) -> Result<Option<&'c AccountInfo<'info>>, ProgramError> {
    let account_info_iter = &mut remaining_accounts.iter();
    let acct;
    if fees::fee_amount(option_market.quote_amount_per_contract) > 0 {
        let exercise_fee_recipient = next_account_info(account_info_iter)?;
        if exercise_fee_recipient.owner != &spl_token::ID {
            return Err(errors::ErrorCode::ExpectedSPLTokenProgramId.into())
        }
        let exercise_fee_account = SPLTokenAccount::unpack_from_slice(&exercise_fee_recipient.try_borrow_data()?)?;
        if exercise_fee_account.owner != fees::fee_owner_key::ID {
            return Err(errors::ErrorCode::ExerciseFeeMustBeOwnedByFeeOwner.into()) 
        }
        // check that the mint fee recipient account's mint is also the underlying mint
        if exercise_fee_account.mint != option_market.quote_asset_mint {
            return Err(errors::ErrorCode::ExerciseFeeTokenMustMatchQuoteAsset.into())
        }
        // Check the exercise fee account matches the one on the OptionMarket
        if *exercise_fee_recipient.key != option_market.exercise_fee_account {
            return Err(errors::ErrorCode::ExerciseFeeKeyDoesNotMatchOptionMarket.into())
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
    pub authority: AccountInfo<'info>,
    pub underlying_asset_mint: Box<Account<'info, Mint>>,
    pub quote_asset_mint: Box<Account<'info, Mint>>,
    #[account(init,
        seeds = [&option_market.key().to_bytes()[..], b"optionToken"],
        bump,
        payer = authority,
        mint::decimals = 0,
        mint::authority = option_market
    )]
    pub option_mint: Box<Account<'info, Mint>>,
    #[account(init,
        seeds = [&option_market.key().to_bytes()[..], b"writerToken"],
        bump,
        payer = authority,
        mint::decimals = 0,
        mint::authority = option_market
    )]
    pub writer_token_mint: Box<Account<'info, Mint>>,
    #[account(init,
        seeds = [&option_market.key().to_bytes()[..], b"quoteAssetPool"],
        bump,
        payer = authority,    
        token::mint = quote_asset_mint,
        token::authority = option_market,
    )]
    pub quote_asset_pool: Box<Account<'info, TokenAccount>>,
    #[account(init,
        seeds = [&option_market.key().to_bytes()[..], b"underlyingAssetPool"],
        bump,
        payer = authority,    
        token::mint = underlying_asset_mint,
        token::authority = option_market,
    )]
    pub underlying_asset_pool: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        seeds = [
            underlying_asset_mint.key().as_ref(),
            quote_asset_mint.key().as_ref(),
            &underlying_amount_per_contract.to_le_bytes(),
            &quote_amount_per_contract.to_le_bytes(),
            &expiration_unix_timestamp.to_le_bytes()
        ],
        bump = bump_seed,
        payer = authority,
    )]
    pub option_market: Box<Account<'info, OptionMarket>>,
    pub fee_owner: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
}
impl<'info> InitializeMarket<'info> {
    fn accounts(ctx: &Context<InitializeMarket<'info>>) -> Result<(), ProgramError> {
        if ctx.accounts.option_mint.mint_authority.unwrap() != *ctx.accounts.option_market.to_account_info().key {
            return Err(errors::ErrorCode::OptionMarketMustBeMintAuthority.into());
        }
        if ctx.accounts.writer_token_mint.mint_authority.unwrap() != *ctx.accounts.option_market.to_account_info().key {
            return Err(errors::ErrorCode::OptionMarketMustBeMintAuthority.into());
        }
        if ctx.accounts.underlying_asset_pool.owner != *ctx.accounts.option_market.to_account_info().key {
            return Err(errors::ErrorCode::OptionMarketMustOwnUnderlyingAssetPool.into());
        }
        if ctx.accounts.quote_asset_pool.owner != *ctx.accounts.option_market.to_account_info().key {
            return Err(errors::ErrorCode::OptionMarketMustOwnQuoteAssetPool.into());
        }
        // check that underlying and quote are not the same asset
        if ctx.accounts.underlying_asset_mint.to_account_info().key == ctx.accounts.quote_asset_mint.to_account_info().key {
            return Err(errors::ErrorCode::QuoteAndUnderlyingAssetMustDiffer.into())
        }
        Ok(())
    }
}

#[derive(Accounts)]
pub struct MintOption<'info> {
    /// The user authority must be the authority that has ownership of the `underlying_asset_src`
    #[account(mut, signer)]
    pub user_authority: AccountInfo<'info>,
    pub underlying_asset_mint: AccountInfo<'info>,
    #[account(mut)]
    pub underlying_asset_pool: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub underlying_asset_src: Box<Account<'info, TokenAccount>>,
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


    pub token_program: Program<'info, Token>,
    pub associated_token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: AccountInfo<'info>,
}
impl<'info> MintOption<'info> {
    fn accounts(ctx: &Context<MintOption<'info>>) -> Result<(), ProgramError> {
        // Validate the underlying asset pool is the same as on the OptionMarket
        if *ctx.accounts.underlying_asset_pool.to_account_info().key != ctx.accounts.option_market.underlying_asset_pool {
            return Err(errors::ErrorCode::UnderlyingPoolAccountDoesNotMatchMarket.into())
        }

        // Validate the option mint is the same as on the OptionMarket
        if *ctx.accounts.option_mint.to_account_info().key != ctx.accounts.option_market.option_mint {
            return Err(errors::ErrorCode::OptionTokenMintDoesNotMatchMarket.into())
        }

        // Validate the writer token mint is the same as on the OptionMarket
        if *ctx.accounts.writer_token_mint.to_account_info().key != ctx.accounts.option_market.writer_token_mint {
            return Err(errors::ErrorCode::WriterTokenMintDoesNotMatchMarket.into())
        }

        // Validate the fee owner is correct
        if *ctx.accounts.fee_owner.key != fees::fee_owner_key::ID {
            return Err(errors::ErrorCode::FeeOwnerDoesNotMatchProgram.into())
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
            return Err(errors::ErrorCode::OptionMarketExpiredCantMint.into())
        }
        Ok(())
    }
}

#[derive(Accounts)]
pub struct MintOptionV2<'info> {
    /// The user authority must be the authority that has ownership of the `underlying_asset_src`
    #[account(mut, signer)]
    pub user_authority: AccountInfo<'info>,
    pub underlying_asset_mint: AccountInfo<'info>,
    #[account(mut)]
    pub underlying_asset_pool: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub underlying_asset_src: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub option_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub minted_option_dest: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub writer_token_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub minted_writer_token_dest: Box<Account<'info, TokenAccount>>,
    pub option_market: Box<Account<'info, OptionMarket>>,

    pub token_program: Program<'info, Token>,
}
impl<'info> MintOptionV2<'info> {
    fn accounts(ctx: &Context<MintOptionV2<'info>>) -> Result<(), ProgramError> {
        // Validate the underlying asset pool is the same as on the OptionMarket
        if *ctx.accounts.underlying_asset_pool.to_account_info().key != ctx.accounts.option_market.underlying_asset_pool {
            return Err(errors::ErrorCode::UnderlyingPoolAccountDoesNotMatchMarket.into())
        }

        // Validate the option mint is the same as on the OptionMarket
        if *ctx.accounts.option_mint.to_account_info().key != ctx.accounts.option_market.option_mint {
            return Err(errors::ErrorCode::OptionTokenMintDoesNotMatchMarket.into())
        }

        // Validate the writer token mint is the same as on the OptionMarket
        if *ctx.accounts.writer_token_mint.to_account_info().key != ctx.accounts.option_market.writer_token_mint {
            return Err(errors::ErrorCode::WriterTokenMintDoesNotMatchMarket.into())
        }

        Ok(())
    }
    fn unexpired_market(ctx: &Context<MintOptionV2<'info>>) -> Result<(), ProgramError> {
        // Validate the market is not expired
        if ctx.accounts.option_market.expiration_unix_timestamp < Clock::get()?.unix_timestamp {
            return Err(errors::ErrorCode::OptionMarketExpiredCantMint.into())
        }
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ExerciseOption<'info> {
    /// The user_authority must be the authority that has ownership of the `quote_asset_src` account
    #[account(mut, signer)]
    pub user_authority: AccountInfo<'info>,
    /// The owner of the `exerciser_option_token_src` account
    #[account(mut, signer)]
    pub option_authority: AccountInfo<'info>,
    pub option_market: Box<Account<'info, OptionMarket>>,
    #[account(mut)]
    pub option_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub exerciser_option_token_src: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub underlying_asset_pool: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub underlying_asset_dest: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub quote_asset_pool: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub quote_asset_src: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub fee_owner: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
}
impl<'info> ExerciseOption<'info> {
    fn accounts(ctx: &Context<ExerciseOption>) -> Result<(), ProgramError> {
        // Validate the quote asset pool is the same as on the OptionMarket
        if *ctx.accounts.quote_asset_pool.to_account_info().key != ctx.accounts.option_market.quote_asset_pool {
            return Err(errors::ErrorCode::QuotePoolAccountDoesNotMatchMarket.into())
        }

        // Validate the underlying asset pool is the same as on the OptionMarket
        if *ctx.accounts.underlying_asset_pool.to_account_info().key != ctx.accounts.option_market.underlying_asset_pool {
            return Err(errors::ErrorCode::UnderlyingPoolAccountDoesNotMatchMarket.into())
        }

        // Validate the option mint is the same as on the OptionMarket
        if *ctx.accounts.option_mint.to_account_info().key != ctx.accounts.option_market.option_mint {
            return Err(errors::ErrorCode::OptionTokenMintDoesNotMatchMarket.into())
        }

        // Validate the underlying destination has the same mint as the pool
        if ctx.accounts.underlying_asset_dest.mint != ctx.accounts.option_market.underlying_asset_mint {
            return Err(errors::ErrorCode::UnderlyingDestMintDoesNotMatchUnderlyingAsset.into())
        }

        // Validate the fee owner is correct
        if *ctx.accounts.fee_owner.key != fees::fee_owner_key::ID {
            return Err(errors::ErrorCode::FeeOwnerDoesNotMatchProgram.into())
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
            return Err(errors::ErrorCode::OptionMarketExpiredCantExercise.into())
        }
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ClosePostExp<'info> {
    #[account(signer)]
    pub user_authority: AccountInfo<'info>,
    pub option_market: Box<Account<'info, OptionMarket>>,
    #[account(mut)]
    pub writer_token_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub writer_token_src: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub underlying_asset_pool: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub underlying_asset_dest: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}
impl<'info> ClosePostExp<'info> {
    fn accounts(ctx: &Context<ClosePostExp>) -> Result<(), ProgramError> {
        // Validate the underlying asset pool is the same as on the OptionMarket
        if *ctx.accounts.underlying_asset_pool.to_account_info().key != ctx.accounts.option_market.underlying_asset_pool {
            return Err(errors::ErrorCode::UnderlyingPoolAccountDoesNotMatchMarket.into())
        }

        // Validate the writer mint is the same as on the OptionMarket
        if *ctx.accounts.writer_token_mint.to_account_info().key != ctx.accounts.option_market.writer_token_mint {
            return Err(errors::ErrorCode::WriterTokenMintDoesNotMatchMarket.into())
        }

        // Validate the underlying destination has the same mint as the option underlying
        if ctx.accounts.underlying_asset_dest.mint != ctx.accounts.option_market.underlying_asset_mint {
            return Err(errors::ErrorCode::UnderlyingDestMintDoesNotMatchUnderlyingAsset.into())
        }

        Ok(())
    }
    fn expired_market(ctx: &Context<ClosePostExp>) -> Result<(), ProgramError> {
        // Validate the market is expired
        if ctx.accounts.option_market.expiration_unix_timestamp >= ctx.accounts.clock.unix_timestamp {
            return Err(errors::ErrorCode::OptionMarketNotExpiredCantClose.into())
        }
        Ok(())
    }
}


#[derive(Accounts)]
pub struct CloseOptionPosition<'info> {
    #[account(signer)]
    pub user_authority: AccountInfo<'info>,
    pub option_market: Box<Account<'info, OptionMarket>>,
    #[account(mut)]
    pub writer_token_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub writer_token_src: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub option_token_mint: Account<'info, Mint>,
    #[account(mut)]
    pub option_token_src: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub underlying_asset_pool: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub underlying_asset_dest: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}
impl<'info> CloseOptionPosition<'info> {
    fn accounts(ctx: &Context<CloseOptionPosition>) -> ProgramResult {
        // Validate the WriterToken mint is the same as the OptionMarket
        if *ctx.accounts.writer_token_mint.to_account_info().key != ctx.accounts.option_market.writer_token_mint {
            return Err(errors::ErrorCode::WriterTokenMintDoesNotMatchMarket.into())
        }

        // Validate the OptionToken mint is the same as the OptionMarket
        if *ctx.accounts.option_token_mint.to_account_info().key != ctx.accounts.option_market.option_mint {
            return Err(errors::ErrorCode::OptionTokenMintDoesNotMatchMarket.into())
        }

        // Validate the underlying asset pool is the same as the OptionMarket
        if *ctx.accounts.underlying_asset_pool.to_account_info().key != ctx.accounts.option_market.underlying_asset_pool {
            return Err(errors::ErrorCode::UnderlyingPoolAccountDoesNotMatchMarket.into())
        }

        Ok(())
    }
}


#[derive(Accounts)]
pub struct BurnWriterForQuote<'info> {
    #[account(signer)]
    pub user_authority: AccountInfo<'info>,
    pub option_market: Box<Account<'info, OptionMarket>>,
    #[account(mut)]
    pub writer_token_mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub writer_token_src: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub quote_asset_pool: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub writer_quote_dest: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}
impl<'info> BurnWriterForQuote<'info> {
    fn accounts(ctx: &Context<BurnWriterForQuote>) -> ProgramResult{
        // Validate the Quote asset pool matches the OptionMarket
        if ctx.accounts.quote_asset_pool.key() != ctx.accounts.option_market.quote_asset_pool {
            return Err(errors::ErrorCode::QuotePoolAccountDoesNotMatchMarket.into())
        }

        // Validate WriteToken mint matches the OptionMarket
        if ctx.accounts.writer_token_mint.key() != ctx.accounts.option_market.writer_token_mint {
            return Err(errors::ErrorCode::WriterTokenMintDoesNotMatchMarket.into())
        }

        Ok(())
    }

    // Validate there is enough quote assets in the pool
    fn quotes_in_pool(ctx: &Context<BurnWriterForQuote>, size: u64) -> ProgramResult {
        if ctx.accounts.quote_asset_pool.amount < size.checked_mul(ctx.accounts.option_market.quote_amount_per_contract).unwrap() {
            return Err(errors::ErrorCode::NotEnoughQuoteAssetsInPool.into())
        }
        Ok(())
    }
}


#[derive(Accounts)]
#[instruction(market_space: u64, vault_signer_nonce: u64, coin_lot_size: u64, pc_lot_size: u64, pc_dust_threshold: u64)]
pub struct InitSerumMarket<'info> {
    #[account(mut, signer)]
    pub user_authority: AccountInfo<'info>,
    // General market accounts
    #[account(mut)]
    pub option_market: Box<Account<'info, OptionMarket>>,
    #[account(init,
        seeds = [&option_market.key().to_bytes()[..], &pc_mint.key().to_bytes()[..], b"serumMarket"],
        bump,
        space = market_space as usize,
        payer = user_authority,
        owner = *dex_program.key
    )]
    pub serum_market: AccountInfo<'info>,
    // system accounts
    pub system_program: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
    pub dex_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub pc_mint: Box<Account<'info, Mint>>,
    pub option_mint: Box<Account<'info, Mint>>,
    // INIT SERUM MARKET ACCOUNTS
    #[account(init,
        seeds = [&option_market.key().to_bytes()[..], &pc_mint.key().to_bytes()[..], b"requestQueue"],
        bump,
        space = 5120 + 12,
        payer = user_authority,
        owner = *dex_program.key
    )]
    request_queue: AccountInfo<'info>,
    #[account(mut)]
    pub event_queue: AccountInfo<'info>,
    #[account(mut)]
    pub bids: AccountInfo<'info>,
    #[account(mut)]
    pub asks: AccountInfo<'info>,
    #[account(init,
        seeds = [&option_market.key().to_bytes()[..], &pc_mint.key().to_bytes()[..], b"coinVault"],
        bump,
        payer = user_authority,    
        token::mint = option_mint,
        token::authority = vault_signer,
    )]
    pub coin_vault: Box<Account<'info, TokenAccount>>,
    #[account(init,
        seeds = [&option_market.key().to_bytes()[..], &pc_mint.key().to_bytes()[..], b"pcVault"],
        bump,
        payer = user_authority,
        token::mint = pc_mint,
        token::authority = vault_signer,
    )]
    pub pc_vault: Box<Account<'info, TokenAccount>>,
    pub vault_signer: AccountInfo<'info>,
    pub market_authority: AccountInfo<'info>,
}
impl<'info> InitSerumMarket<'info> {
    // Validate the coin_mint is the same as the OptionMarket.option_mint
    pub fn accounts(ctx: &Context<InitSerumMarket>) -> ProgramResult {
        if ctx.accounts.option_mint.key() != ctx.accounts.option_market.option_mint {
            return Err(errors::ErrorCode::CoinMintIsNotOptionMint.into())
        }
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
    /// A flag to set and use to when running a memcmp query. 
    /// This will be set when Serum markets are closed and expiration is validated
    pub expired: bool,
    /// Bump seed for the market PDA
    pub bump_seed: u8
}