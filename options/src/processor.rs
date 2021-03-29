use crate::{error::OptionsError, instruction::OptionsInstruction, market::OptionMarket};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::{Clock, UnixTimestamp},
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_pack::Pack,
    pubkey::Pubkey,
    sysvar::Sysvar,
};
use spl_token::{instruction as token_instruction, state::Account as TokenAccount};

pub struct Processor {}
impl Processor {
    pub fn process_init_market(
        _program_id: &Pubkey,
        accounts: &[AccountInfo],
        underlying_amount_per_contract: u64,
        quote_amount_per_contract: u64,
        expiration_unix_timestamp: UnixTimestamp,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let underlying_asset_mint_acct = next_account_info(account_info_iter)?;
        let quote_asset_mint_acct = next_account_info(account_info_iter)?;
        let option_mint_acct = next_account_info(account_info_iter)?;
        let writer_token_mint_acct = next_account_info(account_info_iter)?;
        let option_market_data_acct = next_account_info(account_info_iter)?;
        let market_authority_acct = next_account_info(account_info_iter)?;
        let underlying_asset_pool_acct = next_account_info(account_info_iter)?;
        let quote_asset_pool_acct = next_account_info(account_info_iter)?;
        let rent_info = next_account_info(account_info_iter)?;
        let spl_program_acct = next_account_info(account_info_iter)?;

        if quote_asset_mint_acct.key == underlying_asset_mint_acct.key {
            return Err(OptionsError::QuoteAndUnderlyingAssetMustDiffer.into());
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
                rent_info.clone(),
                spl_program_acct.clone(),
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
                rent_info.clone(),
                spl_program_acct.clone(),
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
                rent_info.clone(),
                spl_program_acct.clone(),
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
                rent_info.clone(),
                spl_program_acct.clone(),
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
            },
            &mut option_market_data_acct.data.borrow_mut(),
        )?;
        Ok(())
    }

    pub fn process_mint_covered_call(program_id: &Pubkey, accounts: &[AccountInfo], bump_seed: u8) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let option_mint_acct = next_account_info(account_info_iter)?;
        let minted_option_dest_acct = next_account_info(account_info_iter)?;
        let writer_token_mint_acct = next_account_info(account_info_iter)?;
        let writer_token_dest_acct = next_account_info(account_info_iter)?;
        let underyling_asset_src_acct = next_account_info(account_info_iter)?;
        let underlying_asset_pool_acct = next_account_info(account_info_iter)?;
        let option_market_acct = next_account_info(account_info_iter)?;
        let authority_acct = next_account_info(account_info_iter)?;
        let spl_program_acct = next_account_info(account_info_iter)?;
        let market_authority_acct = next_account_info(account_info_iter)?;
        let clock_sysvar_info = next_account_info(account_info_iter)?;

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
            &[&[&option_market_acct.key.to_bytes(), &[bump_seed]]],
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
            &[&[&option_market_acct.key.to_bytes(), &[bump_seed]]],
        )?;

        Ok(())
    }

    pub fn process_exercise_covered_call(program_id: &Pubkey, accounts: &[AccountInfo], bump_seed: u8) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let clock_sysvar_info = next_account_info(account_info_iter)?;
        let spl_program_acct = next_account_info(account_info_iter)?;
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

        let option_market = OptionMarket::from_account_info(option_market_acct, program_id)?;

        let clock = Clock::from_account_info(&clock_sysvar_info)?;
        // Verify that the OptionMarket has not expired
        if clock.unix_timestamp > option_market.expiration_unix_timestamp {
            return Err(OptionsError::OptionMarketHasExpired.into());
        }

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
            &[&[&option_market_acct.key.to_bytes(), &[bump_seed]]],
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
            &[&[&option_market_acct.key.to_bytes(), &[bump_seed]]],
        )?;

        Ok(())
    }

    pub fn process_close_position(program_id: &Pubkey, accounts: &[AccountInfo], bump_seed: u8) -> ProgramResult {
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
            &[&[&option_market_acct.key.to_bytes(), &[bump_seed]]],
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
            &[&[&option_market_acct.key.to_bytes(), &[bump_seed]]],
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
            &[&[&option_market_acct.key.to_bytes(), &[bump_seed]]],
        )?;

        Ok(())
    }

    pub fn process_close_post_expiration(program_id: &Pubkey, accounts: &[AccountInfo], bump_seed: u8) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let option_market_acct = next_account_info(account_info_iter)?;
        let option_mint_acct = next_account_info(account_info_iter)?;
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
            &[&[&option_market_acct.key.to_bytes(), &[bump_seed]]],
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
            &[&[&option_market_acct.key.to_bytes(), &[bump_seed]]],
        )?;

        Ok(())
    }

    pub fn process_exchange_writer_token_for_quote(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        bump_seed: u8,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let option_market_acct = next_account_info(account_info_iter)?;
        let option_mint_acct = next_account_info(account_info_iter)?;
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
            &[&[&option_market_acct.key.to_bytes(), &[bump_seed]]],
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
            &[&[&option_market_acct.key.to_bytes(), &[bump_seed]]],
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
            } => Self::process_init_market(
                program_id,
                accounts,
                underlying_amount_per_contract,
                quote_amount_per_contract,
                expiration_unix_timestamp,
            ),
            OptionsInstruction::MintCoveredCall { bump_seed } => {
                Self::process_mint_covered_call(program_id, accounts, bump_seed)
            }
            OptionsInstruction::ExerciseCoveredCall { bump_seed } => {
                Self::process_exercise_covered_call(program_id, accounts, bump_seed)
            }
            OptionsInstruction::ClosePostExpiration { bump_seed } => {
                Self::process_close_post_expiration(program_id, accounts, bump_seed)
            }
            OptionsInstruction::ClosePosition { bump_seed } => {
                Self::process_close_position(program_id, accounts, bump_seed)
            }
            OptionsInstruction::ExchangeWriterTokenForQuote { bump_seed } => {
                Self::process_exchange_writer_token_for_quote(program_id, accounts, bump_seed)
            }
        }
    }
}
