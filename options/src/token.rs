use crate::market::OptionMarket;
use solana_program::{
    account_info::AccountInfo, program::invoke, program_error::ProgramError, pubkey::Pubkey,
};
use spl_token::instruction as token_instruction;

/**
 * Functions for interacting with the SPL token program
 */

/// Initialize the mint of SPL token to represent the options contracts
pub fn initialize_mint(
    program_id: &Pubkey,
    seeds: &[&[u8]],
    mint_account: &AccountInfo,
    market_creator: &AccountInfo,
    token_program: &AccountInfo,
) -> Result<Pubkey, ProgramError> {
    // Generate Pubkey for program to own the SPL mint
    let program_derived_address = Pubkey::create_program_address(seeds, program_id)?;

    let mint_token_ix = token_instruction::initialize_mint(
        &spl_token::ID,
        mint_account.key,
        program_derived_address,
        None,
        0,
    );

    invoke(mint_token_ix, &[mint_account.clone(), token_program.clone()]);
}
