use crate::error::OptionsError;
use arrayref::{array_mut_ref, array_ref, array_refs, mut_array_refs};
use solana_program::{
    clock::UnixTimestamp,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
};

const PUBLIC_KEY_LEN: usize = 32;

#[repr(C)]
#[derive(Clone, Debug, PartialEq)]
/// Data structure that contains all the information needed to maintain an open
/// option market.
pub struct OptionMarket {
    /// The SPL Token mint address for the tokens that denote an option
    pub option_mint: Pubkey,
    /// The SPL Token Address that is held in the program's pool when an option is written
    pub underlying_asset_mint: Pubkey,
    /// The SPL Token Address that denominates the strike price
    pub quote_asset_mint: Pubkey,
    /// The amount of the **underlying asset** that derives a single option
    pub underlying_amount_per_contract: u64,
    /// The amount of **quote asset** that must be transfered when an option is exercised
    pub quote_amount_per_contract: u64,
    /// The Unix timestamp at which the contracts in this market expire
    pub expiration_unix_timestamp: UnixTimestamp,
    /// Address for the liquidity pool that contains the underlying assset
    pub underlying_asset_pool: Pubkey,
    /// Address for the liquidity pool that contains the quote asset when
    /// options are exercised
    pub quote_asset_pool: Pubkey,
}

impl IsInitialized for OptionMarket {
    fn is_initialized(&self) -> bool {
        true
    }
}
impl Sealed for OptionMarket {}
impl Pack for OptionMarket {
    const LEN: usize = PUBLIC_KEY_LEN
        + PUBLIC_KEY_LEN
        + PUBLIC_KEY_LEN
        + 8
        + 8
        + 8
        + PUBLIC_KEY_LEN
        + PUBLIC_KEY_LEN;
    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let src = array_ref![src, 0, OptionMarket::LEN];
        let (
            option_mint,
            underlying_asset_mint,
            quote_asset_mint,
            underlying_amount_per_contract,
            quote_amount_per_contract,
            expiration_unix_timestamp,
            underlying_asset_pool,
            quote_asset_pool,
        ) = array_refs![
            src,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            8,
            8,
            8,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN
        ];
        Ok(OptionMarket {
            option_mint: Pubkey::new(option_mint),
            underlying_asset_mint: Pubkey::new(underlying_asset_mint),
            quote_asset_mint: Pubkey::new(quote_asset_mint),
            underlying_amount_per_contract: u64::from_le_bytes(*underlying_amount_per_contract),
            quote_amount_per_contract: u64::from_le_bytes(*quote_amount_per_contract),
            expiration_unix_timestamp: UnixTimestamp::from_le_bytes(*expiration_unix_timestamp),
            underlying_asset_pool: Pubkey::new(underlying_asset_pool),
            quote_asset_pool: Pubkey::new(quote_asset_pool),
        })
    }
    fn pack_into_slice(&self, dst: &mut [u8]) {
        let dest = array_mut_ref![dst, 0, OptionMarket::LEN];
        let (
            option_mint_ref,
            underlying_asset_mint_ref,
            quote_asset_mint_ref,
            underlying_amount_per_contract_ref,
            quote_amount_per_contract_ref,
            expiration_unix_timestamp_ref,
            underlying_asset_pool_ref,
            quote_asset_pool_ref,
        ) = mut_array_refs![
            dest,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            8,
            8,
            8,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN
        ];
        option_mint_ref.copy_from_slice(&self.option_mint.to_bytes());
        underlying_asset_mint_ref.copy_from_slice(&self.underlying_asset_mint.to_bytes());
        quote_asset_mint_ref.copy_from_slice(&self.quote_asset_mint.to_bytes());
        underlying_amount_per_contract_ref
            .copy_from_slice(&self.underlying_amount_per_contract.to_le_bytes());
        quote_amount_per_contract_ref
            .copy_from_slice(&self.quote_amount_per_contract.to_le_bytes());
        expiration_unix_timestamp_ref
            .copy_from_slice(&self.expiration_unix_timestamp.to_le_bytes());
        underlying_asset_pool_ref.copy_from_slice(&self.underlying_asset_pool.to_bytes());
        quote_asset_pool_ref.copy_from_slice(&self.quote_asset_pool.to_bytes());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pack_unpck_option_market() {
        let option_mint = Pubkey::new_unique();
        let underlying_asset_mint = Pubkey::new_unique();
        let quote_asset_mint = Pubkey::new_unique();
        let underlying_amount_per_contract: u64 = 100;
        let quote_amount_per_contract: u64 = 5;
        let expiration_unix_timestamp: UnixTimestamp = 1607743435;
        let underlying_asset_pool = Pubkey::new_unique();
        let quote_asset_pool = Pubkey::new_unique();

        let option_market = OptionMarket {
            option_mint,
            underlying_asset_mint,
            quote_asset_mint,
            underlying_amount_per_contract,
            quote_amount_per_contract,
            expiration_unix_timestamp,
            underlying_asset_pool,
            quote_asset_pool,
        };
        let cloned_option_market = option_market.clone();

        let mut serialized_option_market = [0 as u8; OptionMarket::LEN];
        OptionMarket::pack(option_market, &mut serialized_option_market).unwrap();
        let serialized_ref = array_ref![serialized_option_market, 0, OptionMarket::LEN];
        let (oma, uaa, qaa, apc, sp, eut, apa, wra) = array_refs![
            serialized_ref,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            8,
            8,
            8,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN
        ];
        assert_eq!(oma, &option_mint.to_bytes());
        assert_eq!(uaa, &underlying_asset_mint.to_bytes());
        assert_eq!(qaa, &quote_asset_mint.to_bytes());
        assert_eq!(apc, &underlying_amount_per_contract.to_le_bytes());
        assert_eq!(sp, &quote_amount_per_contract.to_le_bytes());
        assert_eq!(eut, &expiration_unix_timestamp.to_le_bytes());
        assert_eq!(apa, &underlying_asset_pool.to_bytes());
        assert_eq!(wra, &quote_asset_pool.to_bytes());

        let deserialized_options_market: OptionMarket =
            OptionMarket::unpack(&serialized_option_market).unwrap();

        assert_eq!(deserialized_options_market, cloned_option_market);
    }
}
