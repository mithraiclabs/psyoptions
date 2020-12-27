use arrayref::array_ref;
use solana_program::{
    instruction::{AccountMeta, Instruction},
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar,
};
use spl_token;
use std::mem::size_of;
/// Instructions supported by the Options program
#[repr(C, u16)]
#[derive(Debug, PartialEq)]
pub enum OptionsInstruction {
    /// Initializes a new OptionMarket
    ///
    ///
    /// Accounts expected by this instruction:
    ///
    ///   0. `[]` Underlying Asset Mint
    ///   1. `[]` Quote Asset Mint
    ///   2. `[writeable]` SPL Program address for contract token
    ///     (the client must create a new SPL Token prior to creating a market)
    ///   3. `[writeable]` Account with space for the option market we are creating
    ///   4. `[]` Account with space for the option market we are creating
    ///   5. `[writeable]` Pool for underlying asset deposits - Uninitialized
    ///   6. `[]` Rent Sysvar
    ///   7. `[]` Spl Token Program
    InitializeMarket {
        /// The amount of the **underlying asset** that derives a single contract
        amount_per_contract: u64,
        /// The strike price for the new market
        strike_price: u64,
        /// The Unix timestamp at which the contracts in this market expire
        expiration_unix_timestamp: u64,
    },
    /// Mints an Options token to represent a Covered Call
    ///
    ///   0. `[writeable]` Option Mint
    ///   1. `[]` Underlying Asser Mint
    ///   2. `[writeable]` Destination account for minted Option
    ///   3. `[writeable]` Source account for underlying asset
    ///   4. `[writeable]` Destination account for underlying asset pool
    ///   5. `[]` Destination account for quote asset
    ///     (this is stored in the mint registry to be used in the even of option exerciese)
    ///   
    MintCoveredCall {},
}

impl OptionsInstruction {
    /// Unpacks a byte buffer into a [TokenInstruction](enum.TokenInstruction.html).
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let (&tag, rest) = input
            .split_first()
            .ok_or(ProgramError::InvalidInstructionData)?;
        Ok(match tag {
            0 => {
                let (amount_per_contract, rest) = Self::unpack_u64(rest)?;
                let (strike_price, rest) = Self::unpack_u64(rest)?;
                let (expiration_unix_timestamp, _rest) = Self::unpack_u64(rest)?;
                Self::InitializeMarket {
                    amount_per_contract,
                    strike_price,
                    expiration_unix_timestamp,
                }
            }
            1 => Self::MintCoveredCall {},
            _ => return Err(ProgramError::InvalidInstructionData.into()),
        })
    }

    /// Packs a OptionInstruction into a byte buffer.
    pub fn pack(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(size_of::<Self>());
        match self {
            &Self::InitializeMarket {
                ref amount_per_contract,
                ref strike_price,
                ref expiration_unix_timestamp,
            } => {
                buf.push(0);
                buf.extend_from_slice(&amount_per_contract.to_le_bytes());
                buf.extend_from_slice(&strike_price.to_le_bytes());
                buf.extend_from_slice(&expiration_unix_timestamp.to_le_bytes());
            }
            &Self::MintCoveredCall {} => {
                buf.push(1);
            }
        };
        buf
    }

    fn unpack_u64(input: &[u8]) -> Result<(u64, &[u8]), ProgramError> {
        if input.len() >= 8 {
            let (num_buf, rest) = input.split_at(8);
            let num_arr = array_ref![num_buf, 0, 8];
            let num = u64::from_le_bytes(*num_arr);
            Ok((num, rest))
        } else {
            Err(ProgramError::InvalidInstructionData)
        }
    }
}

/// Creates an `InitializeMarket` instruction
pub fn initiailize_market(
    options_program_id: &Pubkey,
    underlying_asset_pubkey: &Pubkey,
    quote_asset_pubkey: &Pubkey,
    contract_spl_token_pubkey: &Pubkey,
    option_market_data_pubkey: &Pubkey,
    underlying_asset_pool_pubkey: &Pubkey,
    amount_per_contract: u64,
    strike_price: u64,
    expiration_unix_timestamp: u64,
) -> Result<Instruction, ProgramError> {
    let (options_spl_authority_pubkey, _bump_seed) = Pubkey::find_program_address(
        &[&contract_spl_token_pubkey.to_bytes()[..32]],
        &options_program_id,
    );
    let data = OptionsInstruction::InitializeMarket {
        amount_per_contract,
        strike_price,
        expiration_unix_timestamp,
    }
    .pack();

    let accounts = vec![
        AccountMeta::new_readonly(*underlying_asset_pubkey, false),
        AccountMeta::new_readonly(*quote_asset_pubkey, false),
        AccountMeta::new(*contract_spl_token_pubkey, false),
        AccountMeta::new(*option_market_data_pubkey, false),
        AccountMeta::new_readonly(options_spl_authority_pubkey, false),
        AccountMeta::new(*underlying_asset_pool_pubkey, false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
        AccountMeta::new_readonly(spl_token::id(), false),
    ];
    Ok(Instruction {
        program_id: *options_program_id,
        accounts,
        data,
    })
}

/// Creates a `MintCoveredCall` instruction
pub fn mint_covered_call(
    program_id: &Pubkey,
    option_mint: &Pubkey,
    underlying_asset_mint: &Pubkey,
    minted_option_dest: &Pubkey,
    underyling_asset_src: &Pubkey,
    underlying_asset_pool: &Pubkey,
    quote_asset_dest: &Pubkey,
) -> Result<Instruction, ProgramError> {
    let accounts = vec![
        AccountMeta::new(*option_mint, false),
        AccountMeta::new_readonly(*underlying_asset_mint, false),
        AccountMeta::new(*minted_option_dest, false),
        AccountMeta::new(*underyling_asset_src, false),
        AccountMeta::new(*underlying_asset_pool, false),
        AccountMeta::new_readonly(*quote_asset_dest, false),
    ];
    let data = OptionsInstruction::MintCoveredCall {}.pack();
    Ok(Instruction {
        program_id: *program_id,
        data,
        accounts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pack_unpack_init_market() {
        let amount_per_contract: u64 = 100;
        let strike_price: u64 = 5;
        let expiration_unix_timestamp: u64 = 1607743435;
        let check = OptionsInstruction::InitializeMarket {
            amount_per_contract,
            strike_price,
            expiration_unix_timestamp,
        };
        let packed = check.pack();
        // add the tag to the expected buffer
        let mut expect = Vec::from([0u8]);
        // add the other instruction inputs to expected buffer
        expect.extend_from_slice(&amount_per_contract.to_le_bytes());
        expect.extend_from_slice(&strike_price.to_le_bytes());
        expect.extend_from_slice(&expiration_unix_timestamp.to_le_bytes());
        assert_eq!(packed, expect);
        let unpacked = OptionsInstruction::unpack(&expect).unwrap();
        assert_eq!(unpacked, check);
    }

    #[test]
    fn test_pack_unpack_mint_covered_call() {
        let check = OptionsInstruction::MintCoveredCall {};
        let packed = check.pack();
        // add the tag to the expected buffer
        let expect = Vec::from([1u8]);
        assert_eq!(packed, expect);
        let unpacked = OptionsInstruction::unpack(&expect).unwrap();
        assert_eq!(unpacked, check);
    }
}
