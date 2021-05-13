use crate::{error::OptionsError, fees, instruction::OptionsInstruction, market::OptionMarket};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::{Clock, UnixTimestamp},
    entrypoint::ProgramResult,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    sysvar::Sysvar,
};
use spl_token::{check_id as check_spl_token_owner, instruction as token_instruction};

pub fn validate_spl_token_accounts(accounts: Vec<&AccountInfo>) -> bool {
    for account in &accounts {
        if !check_spl_token_owner(account.owner) {
            return false;
        }
    }
    return true;
}

pub struct Processor {}
impl Processor {
    pub fn process_init_market(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        underlying_amount_per_contract: u64,
        quote_amount_per_contract: u64,
        expiration_unix_timestamp: UnixTimestamp,
        bump_seed: u8,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let underlying_asset_mint_acct = next_account_info(account_info_iter)?;
        let quote_asset_mint_acct = next_account_info(account_info_iter)?;
        let option_mint_acct = next_account_info(account_info_iter)?;
        let writer_token_mint_acct = next_account_info(account_info_iter)?;
        let option_market_acct = next_account_info(account_info_iter)?;
        let market_authority_acct = next_account_info(account_info_iter)?;
        let underlying_asset_pool_acct = next_account_info(account_info_iter)?;
        let quote_asset_pool_acct = next_account_info(account_info_iter)?;
        let funding_account = next_account_info(account_info_iter)?;
        let fee_owner_acct = next_account_info(account_info_iter)?;
        let mint_fee_account = next_account_info(account_info_iter)?;
        let exercise_fee_account = next_account_info(account_info_iter)?;
        let sys_rent_acct = next_account_info(account_info_iter)?;
        let spl_token_program_acct = next_account_info(account_info_iter)?;
        let sys_program_acct = next_account_info(account_info_iter)?;
        let spl_associated_token_acct = next_account_info(account_info_iter)?;

        let option_market = OptionMarket::from_account_info(option_market_acct, program_id)?;

        if option_market.underlying_amount_per_contract > 0 {
            // if the underlying amount is non zero, then we know the market has been initialized
            return Err(OptionsError::MarketAlreadyInitialized.into());
        }
        if quote_asset_mint_acct.key == underlying_asset_mint_acct.key {
            return Err(OptionsError::QuoteAndUnderlyingAssetMustDiffer.into());
        }

        if underlying_amount_per_contract == 0 || quote_amount_per_contract == 0 {
            // don't let options with underlying amount 0 be created
            return Err(OptionsError::InvalidInitializationParameters.into());
        }

        if fees::fee_amount(underlying_amount_per_contract) > 0 {
            // Create the fee account if it doesn't exist already.
            // If the fee is <= 0 then there will be a flat SOL fee
            fees::check_or_create_fee_account(
                funding_account,
                spl_associated_token_acct,
                mint_fee_account,
                fee_owner_acct,
                underlying_asset_mint_acct,
                spl_token_program_acct,
                sys_program_acct,
                sys_rent_acct,
            )?;
        }

        if fees::fee_amount(quote_amount_per_contract) > 0 {
            // initialize exercise fee account if it doesn't exist
            // If the fee is <= 0 then there will be a flat SOL fee
            fees::check_or_create_fee_account(
                funding_account,
                spl_associated_token_acct,
                exercise_fee_account,
                fee_owner_acct,
                quote_asset_mint_acct,
                spl_token_program_acct,
                sys_program_acct,
                sys_rent_acct,
            )?;
        }

        // Initialize the Option Mint, the SPL token that will denote an options contract
        let init_option_mint_ix = token_instruction::initialize_mint(
            &spl_token::id(),
            option_mint_acct.key,
            market_authority_acct.key,
            None,
            0,
        )?;
        invoke(
            &init_option_mint_ix,
            &[
                option_mint_acct.clone(),
                sys_rent_acct.clone(),
                spl_token_program_acct.clone(),
            ],
        )?;

        // Initialize the Writer Token Mint, the SPL token that will denote a writte options contract
        let init_writer_token_mint_ix = token_instruction::initialize_mint(
            &spl_token::id(),
            writer_token_mint_acct.key,
            market_authority_acct.key,
            None,
            0,
        )?;
        invoke(
            &init_writer_token_mint_ix,
            &[
                writer_token_mint_acct.clone(),
                sys_rent_acct.clone(),
                spl_token_program_acct.clone(),
            ],
        )?;

        // Initialize SPL account to hold the underlying asset
        let init_underlying_pool_ix = token_instruction::initialize_account(
            &spl_token::id(),
            underlying_asset_pool_acct.key,
            underlying_asset_mint_acct.key,
            market_authority_acct.key,
        )?;
        invoke(
            &init_underlying_pool_ix,
            &[
                underlying_asset_pool_acct.clone(),
                underlying_asset_mint_acct.clone(),
                market_authority_acct.clone(),
                sys_rent_acct.clone(),
                spl_token_program_acct.clone(),
            ],
        )?;

        // Inititlize SPL account to hold quote asset
        let init_quote_asset_pool_ix = token_instruction::initialize_account(
            &spl_token::id(),
            quote_asset_pool_acct.key,
            quote_asset_mint_acct.key,
            market_authority_acct.key,
        )?;
        invoke(
            &init_quote_asset_pool_ix,
            &[
                quote_asset_pool_acct.clone(),
                quote_asset_mint_acct.clone(),
                market_authority_acct.clone(),
                sys_rent_acct.clone(),
                spl_token_program_acct.clone(),
            ],
        )?;

        // Add all relevant data to the OptionMarket data account
        OptionMarket::pack(
            OptionMarket {
                option_mint: *option_mint_acct.key,
                writer_token_mint: *writer_token_mint_acct.key,
                underlying_asset_mint: *underlying_asset_mint_acct.key,
                quote_asset_mint: *quote_asset_mint_acct.key,
                underlying_amount_per_contract,
                quote_amount_per_contract,
                expiration_unix_timestamp,
                underlying_asset_pool: *underlying_asset_pool_acct.key,
                quote_asset_pool: *quote_asset_pool_acct.key,
                mint_fee_account: *mint_fee_account.key,
                exercise_fee_account: *exercise_fee_account.key,
                bump_seed,
            },
            &mut option_market_acct.data.borrow_mut(),
        )?;
        Ok(())
    }

    pub fn process_mint_covered_call(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let funding_acct = next_account_info(account_info_iter)?;
        let option_mint_acct = next_account_info(account_info_iter)?;
        let minted_option_dest_acct = next_account_info(account_info_iter)?;
        let writer_token_mint_acct = next_account_info(account_info_iter)?;
        let writer_token_dest_acct = next_account_info(account_info_iter)?;
        let underyling_asset_src_acct = next_account_info(account_info_iter)?;
        let underlying_asset_pool_acct = next_account_info(account_info_iter)?;
        let option_market_acct = next_account_info(account_info_iter)?;
        let fee_recipient_acct = next_account_info(account_info_iter)?;
        let fee_owner_acct = next_account_info(account_info_iter)?;
        let authority_acct = next_account_info(account_info_iter)?;
        let spl_program_acct = next_account_info(account_info_iter)?;
        let market_authority_acct = next_account_info(account_info_iter)?;
        let clock_sysvar_info = next_account_info(account_info_iter)?;
        let system_program_acct = next_account_info(account_info_iter)?;

        let option_market = OptionMarket::from_account_info(option_market_acct, program_id)?;

        // Validate that the option mint and writer token mint are the same as the market
        if option_market.option_mint != *option_mint_acct.key
            || option_market.writer_token_mint != *writer_token_mint_acct.key
        {
            return Err(OptionsError::IncorrectMarketTokens.into());
        }

        // Deserialize the account into a clock struct
        let clock = Clock::from_account_info(&clock_sysvar_info)?;
        // Verify that the expiration date for the options market has not passed
        if clock.unix_timestamp > option_market.expiration_unix_timestamp {
            return Err(OptionsError::CantMintExpired.into());
        }

        // transfer the amount per contract of underlying asset from the src to the pool
        let transfer_tokens_ix = token_instruction::transfer(
            &spl_program_acct.key,
            &underyling_asset_src_acct.key,
            &option_market.underlying_asset_pool,
            &authority_acct.key,
            &[],
            option_market.underlying_amount_per_contract,
        )?;
        invoke(
            &transfer_tokens_ix,
            &[
                underyling_asset_src_acct.clone(),
                underlying_asset_pool_acct.clone(),
                authority_acct.clone(),
                spl_program_acct.clone(),
            ],
        )?;

        // transfer the fee amount to the fee_recipient
        fees::transfer_fee(
            funding_acct,
            system_program_acct,
            spl_program_acct,
            fee_recipient_acct,
            underyling_asset_src_acct,
            authority_acct,
            fee_owner_acct,
            option_market.underlying_amount_per_contract,
            option_market.underlying_asset_mint,
        )?;

        // mint an option token to the user
        let mint_option_ix = token_instruction::mint_to(
            &spl_program_acct.key,
            &option_market.option_mint,
            &minted_option_dest_acct.key,
            &market_authority_acct.key,
            &[],
            1,
        )?;
        invoke_signed(
            &mint_option_ix,
            &[
                market_authority_acct.clone(),
                minted_option_dest_acct.clone(),
                option_mint_acct.clone(),
                spl_program_acct.clone(),
            ],
            &[&[
                &option_market_acct.key.to_bytes(),
                &[option_market.bump_seed],
            ]],
        )?;

        // mint a writer token to the user
        let mint_writer_token_ix = token_instruction::mint_to(
            &spl_program_acct.key,
            &option_market.writer_token_mint,
            &writer_token_dest_acct.key,
            &market_authority_acct.key,
            &[],
            1,
        )?;
        invoke_signed(
            &mint_writer_token_ix,
            &[
                market_authority_acct.clone(),
                writer_token_dest_acct.clone(),
                writer_token_mint_acct.clone(),
                spl_program_acct.clone(),
            ],
            &[&[
                &option_market_acct.key.to_bytes(),
                &[option_market.bump_seed],
            ]],
        )?;

        Ok(())
    }

    pub fn process_exercise_covered_call(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let funding_acct = next_account_info(account_info_iter)?;
        let option_market_acct = next_account_info(account_info_iter)?;
        let exerciser_quote_asset_acct = next_account_info(account_info_iter)?;
        let exerciser_authority_acct = next_account_info(account_info_iter)?;
        let exerciser_underlying_asset_acct = next_account_info(account_info_iter)?;
        let underlying_asset_pool_acct = next_account_info(account_info_iter)?;
        let quote_asset_pool_acct = next_account_info(account_info_iter)?;
        let market_authority_acct = next_account_info(account_info_iter)?;
        let option_mint_acct = next_account_info(account_info_iter)?;
        let option_token_acct = next_account_info(account_info_iter)?;
        let option_token_authority_acct = next_account_info(account_info_iter)?;
        let quote_asset_mint_acct = next_account_info(account_info_iter)?;
        let exercise_fee_acct = next_account_info(account_info_iter)?;
        let fee_owner_acct = next_account_info(account_info_iter)?;
        let system_program_acct = next_account_info(account_info_iter)?;
        let clock_sysvar_info = next_account_info(account_info_iter)?;
        let spl_program_acct = next_account_info(account_info_iter)?;

        if validate_spl_token_accounts(vec![
            exerciser_quote_asset_acct,
            exerciser_underlying_asset_acct,
            underlying_asset_pool_acct,
            quote_asset_pool_acct,
            option_mint_acct,
            option_token_acct,
            quote_asset_mint_acct,
            exercise_fee_acct,
        ]) {
            return Err(ProgramError::InvalidAccountData);
        }

        let option_market = OptionMarket::from_account_info(option_market_acct, program_id)?;

        let clock = Clock::from_account_info(&clock_sysvar_info)?;
        // Verify that the OptionMarket has not expired
        if clock.unix_timestamp > option_market.expiration_unix_timestamp {
            return Err(OptionsError::OptionMarketHasExpired.into());
        }

        // transfer the fee amount to the fee_recipient
        fees::transfer_fee(
            funding_acct,
            system_program_acct,
            spl_program_acct,
            exercise_fee_acct,
            exerciser_quote_asset_acct,
            exerciser_authority_acct,
            fee_owner_acct,
            option_market.quote_amount_per_contract,
            option_market.quote_asset_mint,
        )?;

        // Burn an option token that was in the account passed in
        let burn_option_ix = token_instruction::burn(
            &spl_program_acct.key,
            &option_token_acct.key,
            &option_market.option_mint,
            &option_token_authority_acct.key,
            &[],
            1,
        )?;
        invoke_signed(
            &burn_option_ix,
            &[
                option_token_acct.clone(),
                option_mint_acct.clone(),
                option_token_authority_acct.clone(),
                spl_program_acct.clone(),
            ],
            &[&[
                &option_market_acct.key.to_bytes(),
                &[option_market.bump_seed],
            ]],
        )?;

        // transfer the quote asset from the Exerciser to the quote asset pool
        let transer_quote_tokens_ix = token_instruction::transfer(
            &spl_program_acct.key,
            &exerciser_quote_asset_acct.key,
            &option_market.quote_asset_pool,
            &exerciser_authority_acct.key,
            &[],
            option_market.quote_amount_per_contract,
        )?;
        invoke(
            &transer_quote_tokens_ix,
            &[
                spl_program_acct.clone(),
                exerciser_quote_asset_acct.clone(),
                quote_asset_pool_acct.clone(),
                exerciser_authority_acct.clone(),
            ],
        )?;

        // transfer underlying asset from the pool to the exerciser's account
        let transfer_underlying_tokens_ix = token_instruction::transfer(
            &spl_program_acct.key,
            &option_market.underlying_asset_pool,
            &exerciser_underlying_asset_acct.key,
            &market_authority_acct.key,
            &[],
            option_market.underlying_amount_per_contract,
        )?;
        invoke_signed(
            &transfer_underlying_tokens_ix,
            &[
                underlying_asset_pool_acct.clone(),
                exerciser_underlying_asset_acct.clone(),
                market_authority_acct.clone(),
                spl_program_acct.clone(),
            ],
            &[&[
                &option_market_acct.key.to_bytes(),
                &[option_market.bump_seed],
            ]],
        )?;

        Ok(())
    }

    pub fn process_close_position(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let spl_program_acct = next_account_info(account_info_iter)?;
        let option_market_acct = next_account_info(account_info_iter)?;
        let option_mint_acct = next_account_info(account_info_iter)?;
        let market_authority_acct = next_account_info(account_info_iter)?;
        let option_token_src_acct = next_account_info(account_info_iter)?;
        let option_token_src_auth_acct = next_account_info(account_info_iter)?;
        let writer_token_mint_acct = next_account_info(account_info_iter)?;
        let writer_token_source_acct = next_account_info(account_info_iter)?;
        let writer_token_source_authority_acct = next_account_info(account_info_iter)?;
        let underlying_asset_dest_acct = next_account_info(account_info_iter)?;
        let underlying_asset_pool_acct = next_account_info(account_info_iter)?;

        let option_market = OptionMarket::from_account_info(option_market_acct, program_id)?;

        // validate the Writer Token and Option Token mints are for the market specified
        if option_market.option_mint != *option_mint_acct.key
            || option_market.writer_token_mint != *writer_token_mint_acct.key
        {
            return Err(OptionsError::IncorrectMarketTokens.into());
        }
        if *underlying_asset_pool_acct.key != option_market.underlying_asset_pool {
            return Err(OptionsError::IncorrectPool.into());
        }
        // Burn Writer Token
        let burn_writer_token_ix = token_instruction::burn(
            &spl_program_acct.key,
            &writer_token_source_acct.key,
            &option_market.writer_token_mint,
            &writer_token_source_authority_acct.key,
            &[],
            1,
        )?;
        invoke_signed(
            &burn_writer_token_ix,
            &[
                writer_token_source_acct.clone(),
                writer_token_mint_acct.clone(),
                writer_token_source_authority_acct.clone(),
                spl_program_acct.clone(),
            ],
            &[&[
                &option_market_acct.key.to_bytes(),
                &[option_market.bump_seed],
            ]],
        )?;

        // Burn Option Token
        let burn_option_token_ix = token_instruction::burn(
            &spl_program_acct.key,
            &option_token_src_acct.key,
            &option_market.option_mint,
            &option_token_src_auth_acct.key,
            &[],
            1,
        )?;
        invoke_signed(
            &burn_option_token_ix,
            &[
                option_token_src_acct.clone(),
                option_mint_acct.clone(),
                option_token_src_auth_acct.clone(),
                spl_program_acct.clone(),
            ],
            &[&[
                &option_market_acct.key.to_bytes(),
                &[option_market.bump_seed],
            ]],
        )?;

        // transfer underlying asset from the pool to the option writers's account
        let transfer_underlying_tokens_ix = token_instruction::transfer(
            &spl_program_acct.key,
            &option_market.underlying_asset_pool,
            &underlying_asset_dest_acct.key,
            &market_authority_acct.key,
            &[],
            option_market.underlying_amount_per_contract,
        )?;
        invoke_signed(
            &transfer_underlying_tokens_ix,
            &[
                underlying_asset_pool_acct.clone(),
                underlying_asset_dest_acct.clone(),
                market_authority_acct.clone(),
                spl_program_acct.clone(),
            ],
            &[&[
                &option_market_acct.key.to_bytes(),
                &[option_market.bump_seed],
            ]],
        )?;

        Ok(())
    }

    pub fn process_close_post_expiration(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let option_market_acct = next_account_info(account_info_iter)?;
        let market_authority_acct = next_account_info(account_info_iter)?;
        let writer_token_mint_acct = next_account_info(account_info_iter)?;
        let writer_token_source_acct = next_account_info(account_info_iter)?;
        let writer_token_source_authority_acct = next_account_info(account_info_iter)?;
        let underlying_asset_dest_acct = next_account_info(account_info_iter)?;
        let underlying_asset_pool_acct = next_account_info(account_info_iter)?;
        let spl_program_acct = next_account_info(account_info_iter)?;
        let clock_sysvar_info = next_account_info(account_info_iter)?;

        let option_market = OptionMarket::from_account_info(option_market_acct, program_id)?;

        let clock = Clock::from_account_info(&clock_sysvar_info)?;
        // Verify that the OptionMarket has already expired
        if clock.unix_timestamp <= option_market.expiration_unix_timestamp {
            return Err(OptionsError::OptionMarketNotExpired.into());
        }
        if *underlying_asset_pool_acct.key != option_market.underlying_asset_pool {
            return Err(OptionsError::IncorrectPool.into());
        }

        // Burn Writer Token
        let burn_writer_token_ix = token_instruction::burn(
            &spl_program_acct.key,
            &writer_token_source_acct.key,
            &option_market.writer_token_mint,
            &writer_token_source_authority_acct.key,
            &[],
            1,
        )?;
        invoke_signed(
            &burn_writer_token_ix,
            &[
                writer_token_source_acct.clone(),
                writer_token_mint_acct.clone(),
                writer_token_source_authority_acct.clone(),
                spl_program_acct.clone(),
            ],
            &[&[
                &option_market_acct.key.to_bytes(),
                &[option_market.bump_seed],
            ]],
        )?;

        // transfer underlying asset from the pool to the option writers's account
        let transfer_underlying_tokens_ix = token_instruction::transfer(
            &spl_program_acct.key,
            &option_market.underlying_asset_pool,
            &underlying_asset_dest_acct.key,
            &market_authority_acct.key,
            &[],
            option_market.underlying_amount_per_contract,
        )?;
        invoke_signed(
            &transfer_underlying_tokens_ix,
            &[
                underlying_asset_pool_acct.clone(),
                underlying_asset_dest_acct.clone(),
                market_authority_acct.clone(),
                spl_program_acct.clone(),
            ],
            &[&[
                &option_market_acct.key.to_bytes(),
                &[option_market.bump_seed],
            ]],
        )?;

        Ok(())
    }

    pub fn process_exchange_writer_token_for_quote(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let option_market_acct = next_account_info(account_info_iter)?;
        let market_authority_acct = next_account_info(account_info_iter)?;
        let writer_token_mint_acct = next_account_info(account_info_iter)?;
        let writer_token_source_acct = next_account_info(account_info_iter)?;
        let writer_token_source_authority_acct = next_account_info(account_info_iter)?;
        let quote_asset_dest_acct = next_account_info(account_info_iter)?;
        let quote_asset_pool_acct = next_account_info(account_info_iter)?;
        let spl_token_program_acct = next_account_info(account_info_iter)?;

        let option_market = OptionMarket::from_account_info(option_market_acct, program_id)?;

        if *quote_asset_pool_acct.key != option_market.quote_asset_pool {
            return Err(OptionsError::IncorrectPool.into());
        }
        if *writer_token_mint_acct.key != option_market.writer_token_mint {
            return Err(OptionsError::IncorrectMarketTokens.into());
        }

        // Burn Writer Token
        let burn_writer_token_ix = token_instruction::burn(
            &spl_token_program_acct.key,
            &writer_token_source_acct.key,
            &option_market.writer_token_mint,
            &writer_token_source_authority_acct.key,
            &[],
            1,
        )?;
        invoke_signed(
            &burn_writer_token_ix,
            &[
                writer_token_source_acct.clone(),
                writer_token_mint_acct.clone(),
                writer_token_source_authority_acct.clone(),
                spl_token_program_acct.clone(),
            ],
            &[&[
                &option_market_acct.key.to_bytes(),
                &[option_market.bump_seed],
            ]],
        )?;

        // transfer quote asset from the pool to the destination account
        let transfer_underlying_tokens_ix = token_instruction::transfer(
            &spl_token_program_acct.key,
            &option_market.quote_asset_pool,
            &quote_asset_dest_acct.key,
            &market_authority_acct.key,
            &[],
            option_market.quote_amount_per_contract,
        )?;
        invoke_signed(
            &transfer_underlying_tokens_ix,
            &[
                quote_asset_pool_acct.clone(),
                quote_asset_dest_acct.clone(),
                market_authority_acct.clone(),
                spl_token_program_acct.clone(),
            ],
            &[&[
                &option_market_acct.key.to_bytes(),
                &[option_market.bump_seed],
            ]],
        )?;

        Ok(())
    }

    pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], input: &[u8]) -> ProgramResult {
        let instruction = OptionsInstruction::unpack(input)?;

        match instruction {
            OptionsInstruction::InitializeMarket {
                underlying_amount_per_contract,
                quote_amount_per_contract,
                expiration_unix_timestamp,
                bump_seed,
            } => Self::process_init_market(
                program_id,
                accounts,
                underlying_amount_per_contract,
                quote_amount_per_contract,
                expiration_unix_timestamp,
                bump_seed,
            ),
            OptionsInstruction::MintCoveredCall {} => {
                Self::process_mint_covered_call(program_id, accounts)
            }
            OptionsInstruction::ExerciseCoveredCall {} => {
                Self::process_exercise_covered_call(program_id, accounts)
            }
            OptionsInstruction::ClosePostExpiration {} => {
                Self::process_close_post_expiration(program_id, accounts)
            }
            OptionsInstruction::ClosePosition {} => {
                Self::process_close_position(program_id, accounts)
            }
            OptionsInstruction::ExchangeWriterTokenForQuote {} => {
                Self::process_exchange_writer_token_for_quote(program_id, accounts)
            }
        }
    }
}
