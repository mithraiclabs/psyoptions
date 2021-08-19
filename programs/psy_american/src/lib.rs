use anchor_lang::prelude::*;

#[program]
pub mod psy_american {
    use super::*;

    /// Initialize a new PsyOptions market
    pub fn initialize_market(_ctx: Context<InitializeMarket>) -> ProgramResult {

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeMarket {
}
