use crate::{
    instruction::OptionsInstruction,
    market::{AccountType, OptionWriterRegistry, OptionMarket, OptionWriter},
    error::OptionsError
};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::{UnixTimestamp, Clock},
    entrypoint::ProgramResult,
    program::{invoke, invoke_signed},
    program_pack::Pack,
    pubkey::Pubkey,
    sysvar::Sysvar,
};
use spl_token::{
    instruction as token_instruction,
    state::Account as TokenAccount
};

pub struct Processor {}
impl Processor {
    pub fn process_init_market(
        _program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount_per_contract: u64,
        quote_amount_per_contract: u64,
        expiration_unix_timestamp: UnixTimestamp,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let underlying_asset_acct = next_account_info(account_info_iter)?;
        let quote_asset_acct = next_account_info(account_info_iter)?;
        let option_mint_acct = next_account_info(account_info_iter)?;
        let option_market_data_acct = next_account_info(account_info_iter)?;
        let option_mint_authority = next_account_info(account_info_iter)?;
        let underlying_asset_pool_acct = next_account_info(account_info_iter)?;
        let rent_info = next_account_info(account_info_iter)?;
        let spl_program_acct = next_account_info(account_info_iter)?;
        let option_writer_registry_acct = next_account_info(account_info_iter)?;

        if quote_asset_acct.key == underlying_asset_acct.key {
            return Err(OptionsError::QuoteAndUnderlyingAssetMustDiffer.into());
        }
        // Initialize the Mint for the SPL token that will denote an Options contract
        let init_token_mint_ix = token_instruction::initialize_mint(
            &spl_token::id(),
            option_mint_acct.key,
            option_mint_authority.key,
            None,
            0,
        )?;
        invoke(
            &init_token_mint_ix,
            &[
                option_mint_acct.clone(),
                rent_info.clone(),
                spl_program_acct.clone(),
            ],
        )?;

        // Initialize SPL account to hold the underlying asset
        let init_underlying_pool_ix = token_instruction::initialize_account(
            &spl_token::id(),
            underlying_asset_pool_acct.key,
            underlying_asset_acct.key,
            option_mint_authority.key,
        )?;
        invoke(
            &init_underlying_pool_ix,
            &[
                underlying_asset_pool_acct.clone(),
                underlying_asset_acct.clone(),
                option_mint_authority.clone(),
                rent_info.clone(),
                spl_program_acct.clone(),
            ],
        )?;

        // Add all relevant data to the OptionMarket data accountz
        OptionMarket::pack(
            OptionMarket {
                account_type: AccountType::Market,
                option_mint: *option_mint_acct.key,
                underlying_asset_address: *underlying_asset_acct.key,
                quote_asset_address: *quote_asset_acct.key,
                amount_per_contract,
                quote_amount_per_contract,
                expiration_unix_timestamp,
                asset_pool_address: *underlying_asset_pool_acct.key,
                writer_registry_address: *option_writer_registry_acct.key,
            },
            &mut option_market_data_acct.data.borrow_mut(),
        )?;
        Ok(())
    }

    pub fn process_mint_covered_call(accounts: &[AccountInfo], bump_seed: u8) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let option_mint_acct = next_account_info(account_info_iter)?;
        let minted_option_dest_acct = next_account_info(account_info_iter)?;
        let underyling_asset_src_acct = next_account_info(account_info_iter)?;
        let underlying_asset_pool_acct = next_account_info(account_info_iter)?;
        let quote_asset_dest_acct = next_account_info(account_info_iter)?;
        let option_market_acct = next_account_info(account_info_iter)?;
        let authority_acct = next_account_info(account_info_iter)?;
        let spl_program_acct = next_account_info(account_info_iter)?;
        let writer_registry_acct = next_account_info(account_info_iter)?;
        let option_mint_authority_acct = next_account_info(account_info_iter)?;
        let clock_sysvar_info = next_account_info(account_info_iter)?;
        // Get the amount of underlying asset for transfer
        let option_market_data = option_market_acct.try_borrow_data()?;
        let option_market = OptionMarket::unpack(&option_market_data)?;

        // Deserialize the account into a clock struct
        let clock = Clock::from_account_info(&clock_sysvar_info)?;
        // Verify that the expiration date for the options market has not passed
        if clock.unix_timestamp > option_market.expiration_unix_timestamp {
            return Err(OptionsError::CantMintExpired.into());
        }

        // Verify that the mint of the provided quote asset account matches the mint of the 
        //  option's quote asset mint
        let quote_asset_dest_acct_info = TokenAccount::unpack(&quote_asset_dest_acct.data.borrow())?;
        if quote_asset_dest_acct_info.mint != option_market.quote_asset_address {
            return Err(OptionsError::IncorrectQuoteAssetKey.into());
        }

        // transfer the amount per contract of underlying asset from the src to the pool
        let transfer_tokens_ix = token_instruction::transfer(
            &spl_program_acct.key,
            &underyling_asset_src_acct.key,
            &underlying_asset_pool_acct.key,
            &authority_acct.key,
            &[],
            option_market.amount_per_contract,
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

        // mint an option contract token to the user
        let mint_to_ix = token_instruction::mint_to(
            &spl_program_acct.key,
            &option_mint_acct.key,
            &minted_option_dest_acct.key,
            &option_mint_authority_acct.key,
            &[],
            1,
        )?;
        invoke_signed(
            &mint_to_ix,
            &[
                option_mint_authority_acct.clone(),
                minted_option_dest_acct.clone(),
                option_mint_acct.clone(),
                spl_program_acct.clone(),
            ],
            &[&[&option_mint_acct.key.to_bytes(), &[bump_seed]]],
        )?;

        // add writer account to registry
        let option_writer = OptionWriter {
            underlying_asset_acct_address: *underyling_asset_src_acct.key,
            quote_asset_acct_address: *quote_asset_dest_acct.key,
            contract_token_acct_address: *minted_option_dest_acct.key,
        };
        // Add the writer to the registry
        let mut writer_registry_data = writer_registry_acct.try_borrow_mut_data()?;
        let mut writer_registry = OptionWriterRegistry::unpack(&writer_registry_data)?;
        writer_registry.registry.push(option_writer);
        // increment registry_length
        writer_registry.registry_length += 1;
        OptionWriterRegistry::pack(writer_registry, &mut writer_registry_data)?;

        Ok(())
    }

    pub fn process_exercise_covered_call(accounts: &[AccountInfo], option_writer: OptionWriter, bump_seed: u8) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let clock_sysvar_info = next_account_info(account_info_iter)?;
        let spl_program_acct = next_account_info(account_info_iter)?;
        let option_market_acct = next_account_info(account_info_iter)?;
        let exerciser_quote_asset_acct = next_account_info(account_info_iter)?;
        let exerciser_authority_acct = next_account_info(account_info_iter)?;
        let option_writer_quote_asset_acct = next_account_info(account_info_iter)?;
        let exerciser_underlying_asset_acct = next_account_info(account_info_iter)?;
        let market_underlying_asset_pool_acct = next_account_info(account_info_iter)?;
        let options_spl_authority_acct = next_account_info(account_info_iter)?;
        let option_mint_acct = next_account_info(account_info_iter)?;
        let contract_token_acct = next_account_info(account_info_iter)?;
        let contract_token_authority_acct = next_account_info(account_info_iter)?;
        let writer_registry_acct = next_account_info(account_info_iter)?;

        let option_market_data = option_market_acct.try_borrow_data()?;
        let option_market = OptionMarket::unpack(&option_market_data)?;

        let clock = Clock::from_account_info(&clock_sysvar_info)?;
        // Verify that the OptionMarket has not expired
        if clock.unix_timestamp > option_market.expiration_unix_timestamp {
            return Err(OptionsError::OptionMarketHasExpired.into());
        }

        // Burn an option token that was in the account passed in
        let burn_option_ix = token_instruction::burn(
            &spl_program_acct.key,
            &contract_token_acct.key,
            &option_mint_acct.key,
            &contract_token_authority_acct.key,
            &[],
            1,
        )?;
        invoke_signed(
            &burn_option_ix,
            &[
                contract_token_acct.clone(),
                option_mint_acct.clone(),
                contract_token_authority_acct.clone(),
                spl_program_acct.clone(),
            ],
            &[&[&option_mint_acct.key.to_bytes(), &[bump_seed]]],
        )?;

        // transfer the quote asset from the Exerciser to the OptionWriter
        let transer_quote_tokens_ix = token_instruction::transfer(
            &spl_program_acct.key,
            &exerciser_quote_asset_acct.key, 
            &option_writer_quote_asset_acct.key, 
            &exerciser_authority_acct.key, 
            &[], 
            option_market.quote_amount_per_contract
        )?;
        invoke(
            &transer_quote_tokens_ix,
            &[
                spl_program_acct.clone(),
                exerciser_quote_asset_acct.clone(),
                option_writer_quote_asset_acct.clone(),
                exerciser_authority_acct.clone()
            ]
        )?;

        // transfer underlying asset from the pool to the exerciser's account
        let transfer_underlying_tokens_ix = token_instruction::transfer(
            &spl_program_acct.key,
            &market_underlying_asset_pool_acct.key,
            &exerciser_underlying_asset_acct.key,
            &options_spl_authority_acct.key,
            &[],
            option_market.amount_per_contract,
        )?;
        invoke_signed(
            &transfer_underlying_tokens_ix,
            &[
                market_underlying_asset_pool_acct.clone(),
                exerciser_underlying_asset_acct.clone(),
                options_spl_authority_acct.clone(),
                spl_program_acct.clone(),
            ],
            &[&[&option_mint_acct.key.to_bytes(), &[bump_seed]]]
        )?;

        // Remove the option writer and decrement the 
        let mut writer_registry_data = writer_registry_acct.try_borrow_mut_data()?;
        let writer_registry = OptionWriterRegistry::unpack(&writer_registry_data)?;
        let updated_writer_registry = OptionWriterRegistry::remove_option_writer(writer_registry, option_writer)?;
        OptionWriterRegistry::pack(updated_writer_registry, &mut writer_registry_data)?;
        Ok(())
    }

    pub fn process_exercise_post_expiration(accounts: &[AccountInfo], option_writer: OptionWriter, bump_seed: u8) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let clock_sysvar_info = next_account_info(account_info_iter)?;
        let spl_program_acct = next_account_info(account_info_iter)?;
        let option_market_acct = next_account_info(account_info_iter)?;
        let exerciser_quote_asset_acct = next_account_info(account_info_iter)?;
        let exerciser_authority_acct = next_account_info(account_info_iter)?;
        let option_writer_quote_asset_acct = next_account_info(account_info_iter)?;
        let exerciser_underlying_asset_acct = next_account_info(account_info_iter)?;
        let market_underlying_asset_pool_acct = next_account_info(account_info_iter)?;
        let options_spl_authority_acct = next_account_info(account_info_iter)?;
        let option_mint_acct = next_account_info(account_info_iter)?;
        let writer_registry_acct = next_account_info(account_info_iter)?;

        let option_market_data = option_market_acct.try_borrow_data()?;
        let option_market = OptionMarket::unpack(&option_market_data)?;

        let clock = Clock::from_account_info(&clock_sysvar_info)?;
        // Verify that the OptionMarket has already expired
        if clock.unix_timestamp <= option_market.expiration_unix_timestamp {
            return Err(OptionsError::OptionMarketNotExpired.into());
        }

        // transfer the quote asset from the Exerciser to the OptionWriter
        let transer_quote_tokens_ix = token_instruction::transfer(
            &spl_program_acct.key,
            &exerciser_quote_asset_acct.key, 
            &option_writer_quote_asset_acct.key, 
            &exerciser_authority_acct.key, 
            &[], 
            option_market.quote_amount_per_contract
        )?;
        invoke(
            &transer_quote_tokens_ix,
            &[
                spl_program_acct.clone(),
                exerciser_quote_asset_acct.clone(),
                option_writer_quote_asset_acct.clone(),
                exerciser_authority_acct.clone()
            ]
        )?;

        // transfer underlying asset from the pool to the exerciser's account
        let transfer_underlying_tokens_ix = token_instruction::transfer(
            &spl_program_acct.key,
            &market_underlying_asset_pool_acct.key,
            &exerciser_underlying_asset_acct.key,
            &options_spl_authority_acct.key,
            &[],
            option_market.amount_per_contract,
        )?;
        invoke_signed(
            &transfer_underlying_tokens_ix,
            &[
                market_underlying_asset_pool_acct.clone(),
                exerciser_underlying_asset_acct.clone(),
                options_spl_authority_acct.clone(),
                spl_program_acct.clone(),
            ],
            &[&[&option_mint_acct.key.to_bytes(), &[bump_seed]]]
        )?;

        // Remove the option writer and decrement the 
        let mut writer_registry_data = writer_registry_acct.try_borrow_mut_data()?;
        let writer_registry = OptionWriterRegistry::unpack(&writer_registry_data)?;
        let updated_writer_registry = OptionWriterRegistry::remove_option_writer(writer_registry, option_writer)?;
        OptionWriterRegistry::pack(updated_writer_registry, &mut writer_registry_data)?;
        Ok(())
    }

    pub fn process_close_post_expiration(accounts: &[AccountInfo], option_writer: OptionWriter, bump_seed: u8) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let clock_sysvar_info = next_account_info(account_info_iter)?;
        let spl_program_acct = next_account_info(account_info_iter)?;
        let option_market_acct = next_account_info(account_info_iter)?;
        let option_writer_underlying_asset_acct = next_account_info(account_info_iter)?;
        let market_underlying_asset_pool_acct = next_account_info(account_info_iter)?;
        let options_spl_authority_acct = next_account_info(account_info_iter)?;
        let option_mint_acct = next_account_info(account_info_iter)?;
        let writer_registry_acct = next_account_info(account_info_iter)?;

        let option_market_data = option_market_acct.try_borrow_data()?;
        let option_market = OptionMarket::unpack(&option_market_data)?;

        let clock = Clock::from_account_info(&clock_sysvar_info)?;
        // Verify that the OptionMarket has already expired
        if clock.unix_timestamp <= option_market.expiration_unix_timestamp {
            return Err(OptionsError::OptionMarketNotExpired.into());
        }

        // transfer underlying asset from the pool to the option writers's account
        let transfer_underlying_tokens_ix = token_instruction::transfer(
            &spl_program_acct.key,
            &market_underlying_asset_pool_acct.key,
            &option_writer_underlying_asset_acct.key,
            &options_spl_authority_acct.key,
            &[],
            option_market.amount_per_contract,
        )?;
        invoke_signed(
            &transfer_underlying_tokens_ix,
            &[
                market_underlying_asset_pool_acct.clone(),
                option_writer_underlying_asset_acct.clone(),
                options_spl_authority_acct.clone(),
                spl_program_acct.clone(),
            ],
            &[&[&option_mint_acct.key.to_bytes(), &[bump_seed]]]
        )?;

        // Remove the option writer and decrement the 
        let mut writer_registry_data = writer_registry_acct.try_borrow_mut_data()?;
        let writer_registry = OptionWriterRegistry::unpack(&writer_registry_data)?;
        let updated_writer_registry = OptionWriterRegistry::remove_option_writer(writer_registry, option_writer)?;
        OptionWriterRegistry::pack(updated_writer_registry, &mut writer_registry_data)?;
        Ok(())
    }

    pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], input: &[u8]) -> ProgramResult {
        let instruction = OptionsInstruction::unpack(input)?;

        match instruction {
            OptionsInstruction::InitializeMarket {
                amount_per_contract,
                quote_amount_per_contract,
                expiration_unix_timestamp,
            } => Self::process_init_market(
                program_id,
                accounts,
                amount_per_contract,
                quote_amount_per_contract,
                expiration_unix_timestamp,
            ),
            OptionsInstruction::MintCoveredCall { bump_seed } => {
                Self::process_mint_covered_call(accounts, bump_seed)
            },
            OptionsInstruction::ExercisePostExpiration {option_writer, bump_seed} => {
                Self::process_exercise_post_expiration(accounts, option_writer, bump_seed)
            }
            OptionsInstruction::ExerciseCoveredCall { option_writer, bump_seed } => {
                Self::process_exercise_covered_call(accounts, option_writer, bump_seed)
            }
            OptionsInstruction::ClosePostExpiration { option_writer, bump_seed } => {
                Self::process_close_post_expiration(accounts, option_writer, bump_seed)
            }
        }
    }
}
