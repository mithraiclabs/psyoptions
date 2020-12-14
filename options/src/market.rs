use solana_program::{
    program_error::ProgramError,
    program_pack::{ IsInitialized, Pack, Sealed },
    pubkey::Pubkey,
};
use arrayref::{ array_ref, array_refs, array_mut_ref, mut_array_refs };

const PUBLIC_KEY_LEN: usize = 32;
const MAX_CONTRACTS: u32 = 20_000;

#[repr(C)]
#[derive(Clone, Debug, PartialEq)]
/// Data strucutre that contains all the addresses that would be needed to transfer
///  the various SPL tokens related to the option market to and from the Option Writer. 
pub struct OptionWriter {
    /// The address of an SPL Token account for the Underlying Asset
    underlying_asset_acct_address: Pubkey,
    /// The address of an SPL Token account for the Quote Asset
    quote_asset_acct_address: Pubkey,
    /// The address of an SPL Token account for the Contract Token(s)
    contract_token_acct_address: Pubkey
}
impl IsInitialized for OptionWriter {
    fn is_initialized(&self) -> bool {
      true
    }
  }
impl Sealed for OptionWriter {}
impl Pack for OptionWriter {
    const LEN: usize = PUBLIC_KEY_LEN + PUBLIC_KEY_LEN + PUBLIC_KEY_LEN;
    
    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let src = array_ref![src, 0, OptionWriter::LEN];
        let (
            uaaa, qaaa, ctaa
        ) = array_refs![src, PUBLIC_KEY_LEN, PUBLIC_KEY_LEN, PUBLIC_KEY_LEN];
        Ok(OptionWriter {
            underlying_asset_acct_address: Pubkey::new(uaaa),
            quote_asset_acct_address: Pubkey::new(qaaa),
            contract_token_acct_address: Pubkey::new(ctaa), 
        })
    }
    fn pack_into_slice(&self, dst: &mut [u8]) {
        let dest = array_mut_ref![dst, 0, OptionWriter::LEN];
        let (uaaa, qaaa, ctaa) = 
            mut_array_refs![dest, PUBLIC_KEY_LEN, PUBLIC_KEY_LEN, PUBLIC_KEY_LEN];
        uaaa.copy_from_slice(&self.underlying_asset_acct_address.to_bytes());
        qaaa.copy_from_slice(&self.quote_asset_acct_address.to_bytes());
        ctaa.copy_from_slice(&self.contract_token_acct_address.to_bytes());

    }
}


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
    const LEN: usize = PUBLIC_KEY_LEN + PUBLIC_KEY_LEN + 8 + 8 + PUBLIC_KEY_LEN;
    
    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let src = array_ref![src, 0, OptionMarket::LEN];
        let (
            uaa, qaa, apc, eut, apa
        ) = array_refs![src, PUBLIC_KEY_LEN, PUBLIC_KEY_LEN, 8, 8, PUBLIC_KEY_LEN];
        Ok(OptionMarket {
            underlying_asset_address: Pubkey::new(uaa),
            quote_asset_address: Pubkey::new(qaa),
            amount_per_contract: u64::from_le_bytes(*apc), 
            expiration_unix_timestamp: i64::from_le_bytes(*eut),
            asset_pool_address: Pubkey::new(apa)
        })
    }
    fn pack_into_slice(&self, dst: &mut [u8]) {
        let dest = array_mut_ref![dst, 0, OptionMarket::LEN];
        let (uaa, qaa, apc, eut, apa) = 
            mut_array_refs![dest, PUBLIC_KEY_LEN, PUBLIC_KEY_LEN, 8, 8, PUBLIC_KEY_LEN];
        uaa.copy_from_slice(&self.underlying_asset_address.to_bytes());
        qaa.copy_from_slice(&self.quote_asset_address.to_bytes());
        apc.copy_from_slice(&self.amount_per_contract.to_le_bytes());
        eut.copy_from_slice(&self.expiration_unix_timestamp.to_le_bytes());
        apa.copy_from_slice(&self.asset_pool_address.to_bytes());

    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pack_unpack_option_writer() {
        let underlying_asset_acct_address = Pubkey::new_unique();
        let quote_asset_acct_address = Pubkey::new_unique();
        let contract_token_acct_address = Pubkey::new_unique();

        let option_writer = OptionWriter {
            underlying_asset_acct_address,
            quote_asset_acct_address,
            contract_token_acct_address
        };


        let mut serialized_option_writer = [0 as u8; OptionWriter::LEN];
        OptionWriter::pack(option_writer, &mut serialized_option_writer).unwrap();
        let serialized_ref = array_ref![serialized_option_writer, 0, OptionWriter::LEN]; 
        let (
            uaaa, qaaa, ctaa
        ) = array_refs![serialized_ref, PUBLIC_KEY_LEN, PUBLIC_KEY_LEN, PUBLIC_KEY_LEN];
        assert_eq!(uaaa, &underlying_asset_acct_address.to_bytes());
        assert_eq!(qaaa, &quote_asset_acct_address.to_bytes());
        assert_eq!(ctaa, &contract_token_acct_address.to_bytes());

        let deserialized_option_wrtier: OptionWriter = 
        OptionWriter::unpack(&serialized_option_writer).unwrap();

        // Create another option_writer var because the first was moved
        let option_writer = OptionWriter {
            underlying_asset_acct_address,
            quote_asset_acct_address,
            contract_token_acct_address
        };

        assert_eq!(deserialized_option_wrtier, option_writer);
    }

    #[test]
    fn test_pack_unpck_option_market() {
        let underlying_asset_address = Pubkey::new_unique();
        let quote_asset_address = Pubkey::new_unique();
        let amount_per_contract = 100 as u64;
        let expiration_unix_timestamp = 1607743435 as i64;
        let asset_pool_address = Pubkey::new_unique();

        let option_market = OptionMarket {
            underlying_asset_address: underlying_asset_address,
            quote_asset_address: quote_asset_address,
            amount_per_contract: amount_per_contract, 
            expiration_unix_timestamp: expiration_unix_timestamp,
            asset_pool_address: asset_pool_address
        };


        let mut serialized_option_market = [0 as u8; OptionMarket::LEN];
        OptionMarket::pack(option_market, &mut serialized_option_market).unwrap();
        let serialized_ref = array_ref![serialized_option_market, 0, OptionMarket::LEN]; 
        let (
            uaa, qaa, apc, eut, apa
        ) = array_refs![serialized_ref, PUBLIC_KEY_LEN, PUBLIC_KEY_LEN, 8, 8, PUBLIC_KEY_LEN];
        assert_eq!(uaa, &underlying_asset_address.to_bytes());
        assert_eq!(qaa, &quote_asset_address.to_bytes());
        assert_eq!(apc, &amount_per_contract.to_le_bytes());
        assert_eq!(eut, &expiration_unix_timestamp.to_le_bytes());
        assert_eq!(apa, &asset_pool_address.to_bytes());

        let deserialized_options_market: OptionMarket = 
        OptionMarket::unpack(&serialized_option_market).unwrap();

        // Create another option_market var because the first was moved
        let option_market = OptionMarket {
            underlying_asset_address: underlying_asset_address,
            quote_asset_address: quote_asset_address,
            amount_per_contract: amount_per_contract, 
            expiration_unix_timestamp: expiration_unix_timestamp,
            asset_pool_address: asset_pool_address
        };

        assert_eq!(deserialized_options_market, option_market);
    }
}