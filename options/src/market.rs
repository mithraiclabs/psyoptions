use crate::error::OptionsError;
use arrayref::{array_mut_ref, array_ref, array_refs, mut_array_refs};
use solana_program::{
    clock::UnixTimestamp,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
};
use std::{vec::Vec, mem::size_of};

const PUBLIC_KEY_LEN: usize = 32;
// If MAX_CONTRACTS is updated, please update the JS buffer layouts in the bindings package
const MAX_CONTRACTS: usize = 10;
const REGISTRY_LEN: usize = MAX_CONTRACTS * OptionWriter::LEN;

#[repr(u8)]
#[derive(Clone, Debug, PartialEq)]
pub enum AccountType {
    Market=0,
    Registry=1,
}
impl AccountType {
    fn to_le_bytes(&self) -> [u8;1] {
        match self {
            AccountType::Market => (0 as u8).to_le_bytes(),
            AccountType::Registry => (1 as u8).to_le_bytes(),
        }
    }
}

#[repr(C)]
#[derive(Clone, Debug, PartialEq)]
/// Data strucutre that contains all the addresses that would be needed to transfer
///  the various SPL tokens related to the option market to and from the Option Writer.
pub struct OptionWriter {
    /// The address of an SPL Token account for the Underlying Asset
    pub underlying_asset_acct_address: Pubkey,
    /// The address of an SPL Token account for the Quote Asset
    pub quote_asset_acct_address: Pubkey,
    /// The address of an SPL Token account for the Contract Token(s)
    pub contract_token_acct_address: Pubkey,
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
        let (uaaa, qaaa, ctaa) = array_refs![src, PUBLIC_KEY_LEN, PUBLIC_KEY_LEN, PUBLIC_KEY_LEN];
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
pub struct OptionWriterRegistry {
    /// Byte to denote the account time
    pub account_type: AccountType,
    /// The address of the options market this account belongs to
    pub option_market_address: Pubkey,
    /// Keeps track of the length of the option_writer_registry (number of outstanding contracts)
    pub registry_length: u16,
    /// Stores all option writers that have not been exercised or closed
    pub registry: Vec<OptionWriter>,
}
impl IsInitialized for OptionWriterRegistry {
    fn is_initialized(&self) -> bool {
        true
    }
}
impl Sealed for OptionWriterRegistry {}
impl Pack for OptionWriterRegistry {
    const LEN: usize = size_of::<AccountType>() + PUBLIC_KEY_LEN + 2 + REGISTRY_LEN;
    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let src = array_ref![src, 0, OptionWriterRegistry::LEN];
        let (at, oma, rl, r) = array_refs![src, size_of::<AccountType>(), PUBLIC_KEY_LEN, 2, REGISTRY_LEN];

        let registry_length = u16::from_le_bytes(*rl);
        let mut registry: Vec<OptionWriter> = Vec::with_capacity(registry_length as usize);
        let mut offset = 0;
        for _i in 0..registry_length {
            let option_writer_buff = array_ref![r, offset, OptionWriter::LEN];
            let option_writer = OptionWriter::unpack_from_slice(option_writer_buff)?;
            registry.push(option_writer);
            offset += OptionWriter::LEN;
        }

        Ok(OptionWriterRegistry {
            account_type: AccountType::Registry,
            option_market_address: Pubkey::new(oma),
            registry_length,
            registry,
        })
    }
    fn pack_into_slice(&self, dst: &mut [u8]) {
        let dest = array_mut_ref![dst, 0, OptionWriterRegistry::LEN];
        let (at, oma, rl, r) = mut_array_refs![dest, size_of::<AccountType>(), PUBLIC_KEY_LEN, 2, REGISTRY_LEN];

        at.copy_from_slice(&self.account_type.to_le_bytes());
        oma.copy_from_slice(&self.option_market_address.to_bytes());
        rl.copy_from_slice(&self.registry_length.to_le_bytes());
        let mut offset = 0;
        // I'm not sure if there is a more memory efficient way to handle this. But I guess if the
        // method takes a reference to self (&self) we have to clone the vector in order to iterate
        // and write the data to the new slice without deleting the old data in the process.
        for option_writer in self.registry.clone() {
            option_writer.pack_into_slice(&mut r[offset..offset + OptionWriter::LEN]);
            offset += OptionWriter::LEN;
        }
    }
}

impl OptionWriterRegistry {
    /// Removes an OptionWriter from the OptioMarket instance
    pub fn remove_option_writer(
        mut option_writer_registry: OptionWriterRegistry,
        option_writer: OptionWriter,
    ) -> Result<OptionWriterRegistry, ProgramError> {
        match option_writer_registry
            .registry
            .iter()
            .position(|x| *x == option_writer)
        {
            None => Err(OptionsError::OptionWriterNotFound.into()),
            Some(position) => {
                option_writer_registry.registry.remove(position);
                option_writer_registry.registry_length -= 1;
                Ok(option_writer_registry)
            }
        }
    }
}

#[repr(C)]
#[derive(Clone, Debug, PartialEq)]
/// Data structure that contains all the information needed to maintain an open
/// option market.
pub struct OptionMarket {
    /// The type of account, used for easy filtering with the solana RPC requests
    pub account_type: AccountType,
    /// The SPL Token mint address for the tokens that denote an option contract
    pub option_mint: Pubkey,
    /// The SPL Token Address that is held in the program's pool when a contract is written
    pub underlying_asset_address: Pubkey,
    /// The SPL Token Address that denominates the strike price
    pub quote_asset_address: Pubkey,
    /// The amount of the **underlying asset** that derives a single contract
    pub amount_per_contract: u64,
    /// The price for the **underlying asset** denominated in the **quote asset**
    pub quote_amount_per_contract: u64,
    /// The Unix timestamp at which the contracts in this market expire
    pub expiration_unix_timestamp: UnixTimestamp,
    /// Address for the liquidity pool that contains the underlying assset
    pub asset_pool_address: Pubkey,
    /// Address for the OptionWriterRegistry account
    pub writer_registry_address: Pubkey,
}

impl IsInitialized for OptionMarket {
    fn is_initialized(&self) -> bool {
        true
    }
}
impl Sealed for OptionMarket {}
impl Pack for OptionMarket {
    const LEN: usize = size_of::<AccountType>() + PUBLIC_KEY_LEN
        + PUBLIC_KEY_LEN
        + PUBLIC_KEY_LEN
        + 8
        + 8
        + 8
        + PUBLIC_KEY_LEN
        + PUBLIC_KEY_LEN;
    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let src = array_ref![src, 0, OptionMarket::LEN];
        let (acct_type, oma, uaa, qaa, apc, sp, eut, apa, wra) = array_refs![
            src,
            size_of::<AccountType>(),
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
            account_type: AccountType::Market,
            option_mint: Pubkey::new(oma),
            underlying_asset_address: Pubkey::new(uaa),
            quote_asset_address: Pubkey::new(qaa),
            amount_per_contract: u64::from_le_bytes(*apc), 
            quote_amount_per_contract: u64::from_le_bytes(*sp),
            expiration_unix_timestamp: UnixTimestamp::from_le_bytes(*eut),
            asset_pool_address: Pubkey::new(apa),
            writer_registry_address: Pubkey::new(wra),
        })
    }
    fn pack_into_slice(&self, dst: &mut [u8]) {
        let dest = array_mut_ref![dst, 0, OptionMarket::LEN];
        let (acct_type, oma, uaa, qaa, apc, sp, eut, apa, wra) = mut_array_refs![
            dest,
            size_of::<AccountType>(),
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            8,
            8,
            8,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN
        ];
        acct_type.copy_from_slice(&self.account_type.to_le_bytes());
        oma.copy_from_slice(&self.option_mint.to_bytes());
        uaa.copy_from_slice(&self.underlying_asset_address.to_bytes());
        qaa.copy_from_slice(&self.quote_asset_address.to_bytes());
        apc.copy_from_slice(&self.amount_per_contract.to_le_bytes());
        sp.copy_from_slice(&self.quote_amount_per_contract.to_le_bytes());
        eut.copy_from_slice(&self.expiration_unix_timestamp.to_le_bytes());
        apa.copy_from_slice(&self.asset_pool_address.to_bytes());
        wra.copy_from_slice(&self.writer_registry_address.to_bytes());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn generate_option_writer() -> OptionWriter {
        let underlying_asset_acct_address = Pubkey::new_unique();
        let quote_asset_acct_address = Pubkey::new_unique();
        let contract_token_acct_address = Pubkey::new_unique();

        OptionWriter {
            underlying_asset_acct_address,
            quote_asset_acct_address,
            contract_token_acct_address,
        }
    }

    #[test]
    fn test_pack_unpack_option_writer() {
        let option_writer = generate_option_writer();
        let cloned_option_wrtier = option_writer.clone();

        let mut serialized_option_writer = [0 as u8; OptionWriter::LEN];
        OptionWriter::pack(option_writer, &mut serialized_option_writer).unwrap();
        let serialized_ref = array_ref![serialized_option_writer, 0, OptionWriter::LEN];
        let (uaaa, qaaa, ctaa) = array_refs![
            serialized_ref,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN
        ];
        assert_eq!(
            uaaa,
            &cloned_option_wrtier
                .underlying_asset_acct_address
                .to_bytes()
        );
        assert_eq!(
            qaaa,
            &cloned_option_wrtier.quote_asset_acct_address.to_bytes()
        );
        assert_eq!(
            ctaa,
            &cloned_option_wrtier.contract_token_acct_address.to_bytes()
        );

        let deserialized_option_wrtier: OptionWriter =
            OptionWriter::unpack(&serialized_option_writer).unwrap();

        assert_eq!(deserialized_option_wrtier, cloned_option_wrtier);
    }

    #[test]
    fn text_pack_unpack_option_writer_registry() {
        let registry_length: u16 = 2;
        let option_market_address = Pubkey::new_unique();
        let option_writer_1 = generate_option_writer();
        let option_writer_2 = generate_option_writer();
        let registry = vec![option_writer_1, option_writer_2];

        let option_writer_registry = OptionWriterRegistry {
            account_type: AccountType::Registry,
            option_market_address,
            registry_length,
            registry,
        };
        let cloned_option_writer_registry = option_writer_registry.clone();

        let mut serialized_writer_registry = [0 as u8; OptionWriterRegistry::LEN];
        OptionWriterRegistry::pack(option_writer_registry, &mut serialized_writer_registry)
            .unwrap();
        let serialized_ref = array_ref![serialized_writer_registry, 0, OptionWriterRegistry::LEN];
        let (acct_type, oma, rl, r) = array_refs![serialized_ref, size_of::<AccountType>(), PUBLIC_KEY_LEN, 2, REGISTRY_LEN];

        assert_eq!(acct_type, &AccountType::Registry.to_le_bytes());
        assert_eq!(oma, &option_market_address.to_bytes());
        assert_eq!(rl, &registry_length.to_le_bytes());

        let mut option_writer_registry_buf = [0u8; REGISTRY_LEN];
        let mut offset = 0;
        for option_writer in cloned_option_writer_registry.registry.clone() {
            option_writer.pack_into_slice(
                &mut option_writer_registry_buf[offset..offset + OptionWriter::LEN],
            );
            offset += OptionWriter::LEN;
        }
        assert_eq!(r, &option_writer_registry_buf);
    }

    #[test]
    fn test_pack_unpck_option_market() {
        let option_mint = Pubkey::new_unique();
        let underlying_asset_address = Pubkey::new_unique();
        let quote_asset_address = Pubkey::new_unique();
        let amount_per_contract: u64 = 100;
        let quote_amount_per_contract: u64 = 5;
        let expiration_unix_timestamp: UnixTimestamp = 1607743435;
        let asset_pool_address = Pubkey::new_unique();
        let writer_registry_address = Pubkey::new_unique();

        let option_market = OptionMarket {
            account_type: AccountType::Market,
            option_mint,
            underlying_asset_address,
            quote_asset_address,
            amount_per_contract, 
            quote_amount_per_contract,
            expiration_unix_timestamp,
            asset_pool_address,
            writer_registry_address,
        };
        let cloned_option_market = option_market.clone();

        let mut serialized_option_market = [0 as u8; OptionMarket::LEN];
        OptionMarket::pack(option_market, &mut serialized_option_market).unwrap();
        let serialized_ref = array_ref![serialized_option_market, 0, OptionMarket::LEN];
        let (acct_type, oma, uaa, qaa, apc, sp, eut, apa, wra) = array_refs![
            serialized_ref,
            size_of::<AccountType>(),
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            8,
            8,
            8,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN
        ];
        assert_eq!(acct_type, &AccountType::Market.to_le_bytes());
        assert_eq!(oma, &option_mint.to_bytes());
        assert_eq!(uaa, &underlying_asset_address.to_bytes());
        assert_eq!(qaa, &quote_asset_address.to_bytes());
        assert_eq!(apc, &amount_per_contract.to_le_bytes());
        assert_eq!(sp, &quote_amount_per_contract.to_le_bytes());
        assert_eq!(eut, &expiration_unix_timestamp.to_le_bytes());
        assert_eq!(apa, &asset_pool_address.to_bytes());
        assert_eq!(wra, &writer_registry_address.to_bytes());

        let deserialized_options_market: OptionMarket =
            OptionMarket::unpack(&serialized_option_market).unwrap();

        assert_eq!(deserialized_options_market, cloned_option_market);
    }
}
