use arrayref::{array_mut_ref, array_ref, array_refs, mut_array_refs};
use solana_program::{
    account_info::AccountInfo,
    clock::UnixTimestamp,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
};

use crate::error::PsyOptionsError;

const PUBLIC_KEY_LEN: usize = 32;

#[repr(C)]
#[derive(Clone, Debug, PartialEq)]
/// Data structure for a basic initialized account
pub struct InitializedAccount {
    /// whether the derived account has been initialized or not
    pub initialized: bool,
}
impl InitializedAccount {
    pub fn from_account_info(
        account_info: &AccountInfo,
        program_id: &Pubkey,
    ) -> Result<Self, ProgramError> {
        if account_info.owner != program_id {
            return Err(ProgramError::InvalidArgument);
        }
        let initialized_account_data = account_info.try_borrow_data()?;
        InitializedAccount::unpack(&initialized_account_data)
    }

    pub fn check_account_exists(input: &[u8]) -> Result<(), ProgramError> {
        if input.len() > 0 {
            return Err(PsyOptionsError::MarketExists.into());
        }
        Ok(())
    }
}
impl IsInitialized for InitializedAccount {
    fn is_initialized(&self) -> bool {
        self.initialized
    }
}
impl Sealed for InitializedAccount {}
impl Pack for InitializedAccount {
    const LEN: usize = 1;
    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let src = array_ref![src, 0, InitializedAccount::LEN];
        let initialized = match src {
            [0] => false,
            [1] => true,
            _ => return Err(ProgramError::InvalidAccountData),
        };
        Ok(InitializedAccount {initialized})
    }
    fn pack_into_slice(&self, dst: &mut [u8]) {
        let dest = array_mut_ref![dst, 0, InitializedAccount::LEN];
        dest[0] = self.initialized as u8
    }
}


#[repr(C)]
#[derive(Clone, Debug, PartialEq)]
/// Data structure that contains all the information needed to maintain an open
/// option market.
pub struct OptionMarket {
    /// The SPL Token mint address for the tokens that denote an option
    pub option_mint: Pubkey,
    /// The SPL Token mint address for Writer Tokens that denote a written option
    pub writer_token_mint: Pubkey,
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
    /// The SPL Token account (from the Associated Token Program) that collects
    /// fees on mint.
    pub mint_fee_account: Pubkey,
    /// The SPL Token account (from the Associated Token Program) that collects
    /// fees on exercise.
    pub exercise_fee_account: Pubkey,
    /// Bump seed for program derived addresses
    pub bump_seed: u8,
    /// whether the OptionMarket has been initialized or not
    pub initialized: bool,
}

impl OptionMarket {
    pub fn from_account_info(
        account_info: &AccountInfo,
        program_id: &Pubkey,
    ) -> Result<Self, ProgramError> {
        if account_info.owner != program_id {
            return Err(ProgramError::InvalidArgument);
        }
        let option_market_data = account_info.try_borrow_data()?;
        OptionMarket::unpack(&option_market_data)
    }
}

impl IsInitialized for OptionMarket {
    fn is_initialized(&self) -> bool {
        self.initialized
    }
}
impl Sealed for OptionMarket {}
impl Pack for OptionMarket {
    const LEN: usize = PUBLIC_KEY_LEN
        + PUBLIC_KEY_LEN
        + PUBLIC_KEY_LEN
        + PUBLIC_KEY_LEN
        + 8
        + 8
        + 8
        + PUBLIC_KEY_LEN
        + PUBLIC_KEY_LEN
        + PUBLIC_KEY_LEN
        + PUBLIC_KEY_LEN
        + 1
        + 1;
    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let src = array_ref![src, 0, OptionMarket::LEN];
        let (
            option_mint,
            writer_token_mint,
            underlying_asset_mint,
            quote_asset_mint,
            underlying_amount_per_contract,
            quote_amount_per_contract,
            expiration_unix_timestamp,
            underlying_asset_pool,
            quote_asset_pool,
            mint_fee_account,
            exercise_fee_account,
            bump_seed,
            initialized,
        ) = array_refs![
            src,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            8,
            8,
            8,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            1,
            1
        ];
        let initialized = match initialized {
            [0] => false,
            [1] => true,
            _ => return Err(ProgramError::InvalidAccountData),
        };
        Ok(OptionMarket {
            option_mint: Pubkey::new(option_mint),
            writer_token_mint: Pubkey::new(writer_token_mint),
            underlying_asset_mint: Pubkey::new(underlying_asset_mint),
            quote_asset_mint: Pubkey::new(quote_asset_mint),
            underlying_amount_per_contract: u64::from_le_bytes(*underlying_amount_per_contract),
            quote_amount_per_contract: u64::from_le_bytes(*quote_amount_per_contract),
            expiration_unix_timestamp: UnixTimestamp::from_le_bytes(*expiration_unix_timestamp),
            underlying_asset_pool: Pubkey::new(underlying_asset_pool),
            quote_asset_pool: Pubkey::new(quote_asset_pool),
            bump_seed: u8::from_le_bytes(*bump_seed),
            mint_fee_account: Pubkey::new(mint_fee_account),
            exercise_fee_account: Pubkey::new(exercise_fee_account),
            initialized,
        })
    }
    fn pack_into_slice(&self, dst: &mut [u8]) {
        let dest = array_mut_ref![dst, 0, OptionMarket::LEN];
        let (
            option_mint_ref,
            writer_token_mint_ref,
            underlying_asset_mint_ref,
            quote_asset_mint_ref,
            underlying_amount_per_contract_ref,
            quote_amount_per_contract_ref,
            expiration_unix_timestamp_ref,
            underlying_asset_pool_ref,
            quote_asset_pool_ref,
            mint_fee_account_ref,
            exercise_fee_account_ref,
            bump_seed_ref,
            initialized_ref,
        ) = mut_array_refs![
            dest,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            8,
            8,
            8,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            1,
            1
        ];
        option_mint_ref.copy_from_slice(&self.option_mint.to_bytes());
        writer_token_mint_ref.copy_from_slice(&self.writer_token_mint.to_bytes());
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
        mint_fee_account_ref.copy_from_slice(&self.mint_fee_account.to_bytes());
        exercise_fee_account_ref.copy_from_slice(&self.exercise_fee_account.to_bytes());
        bump_seed_ref.copy_from_slice(&self.bump_seed.to_le_bytes());
        initialized_ref[0] = self.initialized as u8
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pack_unpack_init_account() {
        let initialized = true;
        let acct = InitializedAccount {
            initialized
        };

        let mut serialized_init_account = [0 as u8; InitializedAccount::LEN];
        InitializedAccount::pack(acct, &mut serialized_init_account).unwrap();
        let serialized_ref = array_ref![serialized_init_account, 0, InitializedAccount::LEN];
        assert_eq!(serialized_ref[0], true as u8);

        let deserialized_init_acct: InitializedAccount = InitializedAccount::unpack(&serialized_init_account).unwrap();
        assert_eq!(deserialized_init_acct.initialized, true);
    }

    #[test]
    fn test_pack_unpck_option_market() {
        let bump_seed: u8 = 1;
        let option_mint = Pubkey::new_unique();
        let writer_token_mint = Pubkey::new_unique();
        let underlying_asset_mint = Pubkey::new_unique();
        let quote_asset_mint = Pubkey::new_unique();
        let underlying_amount_per_contract: u64 = 100;
        let quote_amount_per_contract: u64 = 5;
        let expiration_unix_timestamp: UnixTimestamp = 1607743435;
        let underlying_asset_pool = Pubkey::new_unique();
        let quote_asset_pool = Pubkey::new_unique();
        let mint_fee_account = Pubkey::new_unique();
        let exercise_fee_account = Pubkey::new_unique();

        let option_market = OptionMarket {
            option_mint,
            writer_token_mint,
            underlying_asset_mint,
            quote_asset_mint,
            underlying_amount_per_contract,
            quote_amount_per_contract,
            expiration_unix_timestamp,
            underlying_asset_pool,
            quote_asset_pool,
            mint_fee_account,
            exercise_fee_account,
            bump_seed,
            initialized: true,
        };
        let cloned_option_market = option_market.clone();

        let mut serialized_option_market = [0 as u8; OptionMarket::LEN];
        OptionMarket::pack(option_market, &mut serialized_option_market).unwrap();
        let serialized_ref = array_ref![serialized_option_market, 0, OptionMarket::LEN];
        let (
            option_mint_ref,
            writer_token_mint_ref,
            underlying_asset_mint_ref,
            quote_asset_mint_ref,
            underlying_amount_per_contract_ref,
            quote_amount_per_contract_ref,
            expiration_unix_timestamp_ref,
            underlying_asset_pool_ref,
            quote_asset_pool_ref,
            mint_fee_account_ref,
            exercise_fee_account_ref,
            bump_seed_ref,
            initialized_ref
        ) = array_refs![
            serialized_ref,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            8,
            8,
            8,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            PUBLIC_KEY_LEN,
            1,
            1
        ];
        assert_eq!(option_mint_ref, &option_mint.to_bytes());
        assert_eq!(writer_token_mint_ref, &writer_token_mint.to_bytes());
        assert_eq!(underlying_asset_mint_ref, &underlying_asset_mint.to_bytes());
        assert_eq!(quote_asset_mint_ref, &quote_asset_mint.to_bytes());
        assert_eq!(mint_fee_account_ref, &mint_fee_account.to_bytes());
        assert_eq!(exercise_fee_account_ref, &exercise_fee_account.to_bytes());
        assert_eq!(
            underlying_amount_per_contract_ref,
            &underlying_amount_per_contract.to_le_bytes()
        );
        assert_eq!(
            quote_amount_per_contract_ref,
            &quote_amount_per_contract.to_le_bytes()
        );
        assert_eq!(
            expiration_unix_timestamp_ref,
            &expiration_unix_timestamp.to_le_bytes()
        );
        assert_eq!(underlying_asset_pool_ref, &underlying_asset_pool.to_bytes());
        assert_eq!(quote_asset_pool_ref, &quote_asset_pool.to_bytes());

        let deserialized_options_market: OptionMarket =
            OptionMarket::unpack(&serialized_option_market).unwrap();

        assert_eq!(deserialized_options_market, cloned_option_market);
        assert_eq!(bump_seed_ref, &bump_seed.to_le_bytes());
        assert_eq!(initialized_ref, &[1 as u8]);
    }
}
