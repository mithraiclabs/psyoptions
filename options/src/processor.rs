use crate::{
    instruction::OptionsInstruction,
    market::{OptionMarket, OptionWriter},
};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    program::{invoke, invoke_signed},
    program_pack::Pack,
    pubkey::Pubkey,
};
use spl_token::instruction as token_instruction;

pub struct Processor {}
impl Processor {
    pub fn process_init_market(
        _program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount_per_contract: u64,
        strike_price: u64,
        expiration_unix_timestamp: u64,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let underlying_asset_acct = next_account_info(account_info_iter)?;
        let quote_asset_acct = next_account_info(account_info_iter)?;
        let contract_token_act = next_account_info(account_info_iter)?;
        let option_market_data_acct = next_account_info(account_info_iter)?;
        let contract_token_authority = next_account_info(account_info_iter)?;
        let underlying_asset_pool_acct = next_account_info(account_info_iter)?;
        let rent_info = next_account_info(account_info_iter)?;
        let spl_program_acct = next_account_info(account_info_iter)?;
        // Initialize the Mint for the SPL token that will denote an Options contract
        let init_token_mint_ix = token_instruction::initialize_mint(
            &spl_token::id(),
            contract_token_act.key,
            contract_token_authority.key,
            None,
            0,
        )?;
        invoke(
            &init_token_mint_ix,
            &[
                contract_token_act.clone(),
                rent_info.clone(),
                spl_program_acct.clone(),
            ],
        )?;

        // Initialize SPL account to hold the underlying asset
        let init_underlying_pool_ix = token_instruction::initialize_account(
            &spl_token::id(),
            underlying_asset_pool_acct.key,
            underlying_asset_acct.key,
            contract_token_authority.key,
        )?;
        invoke(
            &init_underlying_pool_ix,
            &[
                underlying_asset_pool_acct.clone(),
                underlying_asset_acct.clone(),
                contract_token_authority.clone(),
                rent_info.clone(),
                spl_program_acct.clone(),
            ],
        )?;

        // Add all relevant data to the OptionMarket data accountz
        OptionMarket::pack(
            OptionMarket {
                underlying_asset_address: *underlying_asset_acct.key,
                quote_asset_address: *quote_asset_acct.key,
                amount_per_contract,
                strike_price,
                expiration_unix_timestamp,
                asset_pool_address: *underlying_asset_pool_acct.key,
                registry_length: 0,
                option_writer_registry: vec![],
            },
            &mut option_market_data_acct.data.borrow_mut(),
        )?;
        Ok(())
    }

    pub fn process_mint_covered_call(accounts: &[AccountInfo], bump_seed: u8) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let option_mint_acct = next_account_info(account_info_iter)?;
        let underlying_asset_mint_acct = next_account_info(account_info_iter)?;
        let minted_option_dest_acct = next_account_info(account_info_iter)?;
        let underyling_asset_src_acct = next_account_info(account_info_iter)?;
        let underlying_asset_pool_acct = next_account_info(account_info_iter)?;
        let quote_asset_dest_acct = next_account_info(account_info_iter)?;
        let option_market_acct = next_account_info(account_info_iter)?;
        let authority_acct = next_account_info(account_info_iter)?;
        let spl_program_acct = next_account_info(account_info_iter)?;
        let option_mint_authority_acct = next_account_info(account_info_iter)?;
        // Get the amount of underlying asset for transfer
        let option_market_data = option_market_acct.try_borrow_mut_data()?;
        let mut option_market = OptionMarket::unpack(&option_market_data)?;

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
            contract_token_acct_address: *option_mint_acct.key
        };
        option_market.option_writer_registry.push(option_writer);
        OptionMarket::pack(
            option_market,
            &mut option_market_acct.data.borrow_mut(),
        )?;

        Ok(())
    }

    pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], input: &[u8]) -> ProgramResult {
        let instruction = OptionsInstruction::unpack(input)?;
        match instruction {
            OptionsInstruction::InitializeMarket {
                amount_per_contract,
                strike_price,
                expiration_unix_timestamp,
            } => Self::process_init_market(
                program_id,
                accounts,
                amount_per_contract,
                strike_price,
                expiration_unix_timestamp,
            ),
            OptionsInstruction::MintCoveredCall { bump_seed } => {
                Self::process_mint_covered_call(accounts, bump_seed)
            }
        }
    }
}
