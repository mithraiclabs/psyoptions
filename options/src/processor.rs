use solana_program::{account_info::{ AccountInfo, next_account_info }, entrypoint::ProgramResult, pubkey::Pubkey};

use crate::instruction::OptionsInstruction;

pub struct Processor {}
impl Processor {
    pub fn process_create_market(accounts: &[AccountInfo], _amount_per_contract: u64, _strike_price:u64, _expiration_unix_timestamp: u64) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let _underlying_asset_acct = next_account_info(account_info_iter)?;
        let _quote_asset_acct = next_account_info(account_info_iter)?;
        let _contract_token_act = next_account_info(account_info_iter)?;
        let _new_market_acct = next_account_info(account_info_iter)?;
        // TODO assert that the **contract_token_act** has decimals set to 0, and there are no tokens in circulation
        // TODO set the mint authority of the **contract_token_act** to our program derived address
        // TODO create another program derived address but for the **Underlying Asset Liquidity Pool**
        // TODO Store all data in the New Market Account
        Ok(())
    }
    pub fn process(
        _program_id: &Pubkey,
        accounts: &[AccountInfo],
        input: &[u8],
    ) -> ProgramResult {
        let instruction = OptionsInstruction::unpack(input)?;
        match instruction {
            OptionsInstruction::InitializeMarket {
                amount_per_contract,
                strike_price,
                expiration_unix_timestamp
            } => {
                Self::process_create_market(accounts, amount_per_contract, strike_price, expiration_unix_timestamp)
            }
        }
    }
}
