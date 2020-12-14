use solana_program::pubkey::Pubkey;
// Do we need an enum? Or could these just be individual functions and we have an instruction 
//  decode function?
#[repr(C, u16)]
#[derive(Debug, PartialEq)]
pub enum OptionsInstruction {
    /**
    * 0. SPL Program address of Underlying Asset
    * 1. SPL Program address of Quote Asset
    */
    CreateMarket {
        underlying_asset_address: Pubkey,
        quote_asset_address: Pubkey,
    }
}