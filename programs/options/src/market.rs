use solana_program::{
    program_error::ProgramError,
    program_pack::{ IsInitialized, Pack, Sealed },
    pubkey::Pubkey,
};
use arrayref::{ array_ref, array_refs, array_mut_ref, mut_array_refs };

const PUBLIC_KEY_LEN: usize = 32;

#[repr(C)]
#[derive(Clone, Debug, PartialEq)]
/// Data structure that contains all the information needed to maintain an open
/// option market.
pub struct OptionMarket {
    /// The SPL Token Address that is held in the program's pool when a contract is written
    pub underlying_asset_address: Pubkey,
    /// The SPL Token Address that denominates the strike price
    pub quote_asset_address: Pubkey,
    /// The amount of the **underlying asset** that derives a single contract
    pub amount_per_contract: u64,
    /// The Unix timestamp at which the contracts in this market expire
    pub expiration_unix_timestamp: i64,
    /// The limit on the number of total contracts that can be in circulation
    pub contract_supply_limit: u64,
    /// Program Derived Address for the liquidity pool that contains the underlying assset
    pub asset_pool_address: Pubkey,
}
impl IsInitialized for OptionMarket {
    fn is_initialized(&self) -> bool {
      true
    }
  }
impl Sealed for OptionMarket {}
impl Pack for OptionMarket {
    const LEN: usize = PUBLIC_KEY_LEN + PUBLIC_KEY_LEN + 8 + 8 + 8 + PUBLIC_KEY_LEN;
    
    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let src = array_ref![src, 0, OptionMarket::LEN];
        let (
            uaa, qaa, apc, eut, csl, apa
        ) = array_refs![src, PUBLIC_KEY_LEN, PUBLIC_KEY_LEN, 8, 8, 8, PUBLIC_KEY_LEN];
        Ok(OptionMarket {
            underlying_asset_address: Pubkey::new(uaa),
            quote_asset_address: Pubkey::new(qaa),
            amount_per_contract: u64::from_le_bytes(*apc), 
            expiration_unix_timestamp: i64::from_le_bytes(*eut),
            contract_supply_limit: u64::from_le_bytes(*csl),
            asset_pool_address: Pubkey::new(apa)
        })
    }
    fn pack_into_slice(&self, dst: &mut [u8]) {
        let dest = array_mut_ref![dst, 0, OptionMarket::LEN];
        let (mut uaa, mut qaa, mut apc, mut eut, mut csl, mut apa) = 
            mut_array_refs![dest, PUBLIC_KEY_LEN, PUBLIC_KEY_LEN, 8, 8, 8, PUBLIC_KEY_LEN];
        uaa = &mut self.underlying_asset_address.to_bytes();
        qaa = &mut self.quote_asset_address.to_bytes();
        apc = &mut self.amount_per_contract.to_le_bytes();
        eut = &mut self.expiration_unix_timestamp.to_le_bytes();
        csl = &mut self.contract_supply_limit.to_le_bytes();
        apa = &mut self.asset_pool_address.to_bytes();
    }
  }


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pack_unpck_option_market() {
        let underlying_asset_address = Pubkey::new_unique();
        let quote_asset_address = Pubkey::new_unique();
        let amount_per_contract = 100 as u64;
        let expiration_unix_timestamp = 1607743435 as i64;
        let contract_supply_limit = 10 as u64;
        let asset_pool_address = Pubkey::new_unique();

        let option_market = OptionMarket {
            underlying_asset_address: underlying_asset_address,
            quote_asset_address: quote_asset_address,
            amount_per_contract: amount_per_contract, 
            expiration_unix_timestamp: expiration_unix_timestamp,
            contract_supply_limit: contract_supply_limit,
            asset_pool_address: asset_pool_address
        };


        let mut serialized_option_market = [0 as u8; OptionMarket::LEN];
        OptionMarket::pack(option_market, &mut serialized_option_market).unwrap();
        let serialized_ref = array_ref![serialized_option_market, 0, OptionMarket::LEN]; 
        let (
            uaa, qaa, apc, eut, csl, apa
        ) = array_refs![serialized_ref, PUBLIC_KEY_LEN, PUBLIC_KEY_LEN, 8, 8, 8, PUBLIC_KEY_LEN];
        assert_eq!(uaa, &underlying_asset_address.to_bytes());
        assert_eq!(qaa, &quote_asset_address.to_bytes());
        assert_eq!(apc, &amount_per_contract.to_le_bytes());
        assert_eq!(eut, &expiration_unix_timestamp.to_le_bytes());
        assert_eq!(csl, &contract_supply_limit.to_le_bytes());
        assert_eq!(apa, &asset_pool_address.to_bytes());

        let deserialized_options_market: OptionMarket = 
        OptionMarket::unpack(&serialized_option_market).unwrap();

        // Create another option_market var because the first was moved
        let option_market = OptionMarket {
            underlying_asset_address: underlying_asset_address,
            quote_asset_address: quote_asset_address,
            amount_per_contract: amount_per_contract, 
            expiration_unix_timestamp: expiration_unix_timestamp,
            contract_supply_limit: contract_supply_limit,
            asset_pool_address: asset_pool_address
        };

        assert_eq!(deserialized_options_market, option_market);
    }
}