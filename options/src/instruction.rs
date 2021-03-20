use arrayref::array_ref;
use solana_program::{
    clock::UnixTimestamp,
    instruction::{AccountMeta, Instruction},
    program_error::ProgramError,
    program_pack::Pack,
    pubkey::Pubkey,
    sysvar,
};
use spl_token;
use std::mem::size_of;
/// Instructions supported by the Options program
#[repr(C)]
#[derive(Debug, PartialEq)]
pub enum OptionsInstruction {
    /// Initializes a new OptionMarket
    ///
    ///
    /// Accounts expected by this instruction:
    ///
    ///   0. `[]` Underlying Asset Mint
    ///   1. `[]` Quote Asset Mint
    ///   2. `[writeable]` Option Mint (uninitialized)
    ///   3. `[writeable]` Writer Token Mint (uninitialized)
    ///   4. `[writeable]` Option Market
    ///   5. `[]` Option Mint Authority
    ///   6. `[writeable]` Underlying Asset Pool (uninitialized)
    ///   7. `[writeable]` Quote Asset Pool (uninitialized)
    ///   8. `[]` Rent Sysvar
    ///   9. `[]` Spl Token Program
    InitializeMarket {
        /// The amount of the **underlying asset** that derives a single contract
        underlying_amount_per_contract: u64,
        /// Pre-computed quote amount for the new market, equal to strike price * amount_per_contract
        quote_amount_per_contract: u64,
        /// The Unix timestamp at which the contracts in this market expire
        expiration_unix_timestamp: UnixTimestamp,
    },
    /// Mints an Options token to represent a Covered Call
    ///
    ///
    ///   0. `[writeable]` Option Mint
    ///   1. `[writeable]` Destination account for minted Option
    ///   2. `[writeable]` Writer Token Mint
    ///   3. `[writeable]` Destination account for minted Writer Token
    ///   4. `[writeable]` Source account for `OptionWriter`'s underlying asset
    ///   5. `[writeable]` Destination account for underlying asset pool
    ///   6. `[writeable]` `OptionMarket` data account
    ///   7. `[signer]` Authority account for underlying asset source
    ///   8. `[]` SPL Token Program
    ///   9. `[]` Program Derived Address for the authority over the Option Mint
    ///   10. `[]` SysVar clock account
    ///   
    MintCoveredCall { bump_seed: u8 },
    /// Exercises the specified OptionWriter
    ///
    /// 0. `[]` Sysvar clock
    /// 1. `[]` SPL Token Program
    /// 2. `[writeable]` Option Market
    /// 3. `[writeable]` Exerciser Quote Asset Source
    /// 4. `[signer]` Exerciser Quote Asset Authority
    /// 5. `[writeable]` Option Writer Quote Asset Destination
    /// 6. `[writeable]` Exerciser Underlying Asset Destination
    /// 7. `[writeable]` Underlying Asset Pool
    /// 8. `[]` Option Mint Authority
    /// 9. `[]` Option Mint
    ExercisePostExpiration {
        bump_seed: u8
    },
    /// Exercise an Options token representing a Covered Call
    ///
    ///   0. `[]` Sysvar clock
    ///   1. `[]` SPL Token Program
    ///   2. `[writeable]` Option Market
    ///   3. `[writeable]` Exerciser Quote Asset Source
    ///   4. `[signer]` Exerciser Authority
    ///   5. `[writeable]` Option Writer Quote Asset Destination
    ///   6. `[writeable]` Exerciser Underlying Asset Destination
    ///   7. `[writeable]` Underlying Asset Pool
    ///   8. `[]` Option Mint Authority
    ///   9. `[writeable]` Option Mint
    ///   10. `[writeable]` Option Token Account
    ///   11. `[signer]` Option Token Account Authority
    ExerciseCoveredCall {
        bump_seed: u8,
    },
    /// Close a single option contract post expiration.
    /// Transfers the underlying asset back to the Option Writer
    /// 
    /// 0. `[]` Option Market
    /// 1. `[]` Option Mint
    /// 2. `[]` Option Mint Authority
    /// 3. `[writeable]` Writer Token Mint
    /// 4. `[writeable]` Writer Token Source (to be burned)
    /// 5. `[signer]` Writer Token Source Authority
    /// 6. `[writeable]` Option Writer Underlying Asset Destination
    /// 7. `[writeable]` Underlying Asset Pool
    /// 8. `[]` Sysvar clock
    /// 9. `[]` SPL Token Program
    ClosePostExpiration {
        bump_seed: u8,
    }
}

impl OptionsInstruction {
    /// Unpacks a byte buffer into a [TokenInstruction](enum.TokenInstruction.html).
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let (&tag, rest) = input
            .split_first()
            .ok_or(ProgramError::InvalidInstructionData)?;
        Ok(match tag {
            0 => {
                let (underlying_amount_per_contract, rest) = Self::unpack_u64(rest)?;
                let (quote_amount_per_contract, rest) = Self::unpack_u64(rest)?;
                let (expiration_unix_timestamp, _rest) = Self::unpack_timestamp(rest)?;
                Self::InitializeMarket {
                    underlying_amount_per_contract,
                    quote_amount_per_contract,
                    expiration_unix_timestamp,
                }
            }
            1 => {
                let (bump_seed, _rest) = Self::unpack_u8(rest)?;
                Self::MintCoveredCall { bump_seed }
            }
            2 => {
                let (bump_seed, _rest) = Self::unpack_u8(rest)?;
                Self::ExercisePostExpiration {
                    bump_seed,
                }
            }
            3 => {
                let (bump_seed, _rest) = Self::unpack_u8(rest)?;
                Self::ExerciseCoveredCall {
                    bump_seed
                }
            }
            4 => {
                let (bump_seed, _rest) = Self::unpack_u8(rest)?;
                Self::ClosePostExpiration {
                    bump_seed
                }
            }
            _ => return Err(ProgramError::InvalidInstructionData.into()),
        })
    }

    /// Packs a OptionInstruction into a byte buffer.
    pub fn pack(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(size_of::<Self>());
        match self {
            &Self::InitializeMarket {
                ref underlying_amount_per_contract,
                ref quote_amount_per_contract,
                ref expiration_unix_timestamp,
            } => {
                buf.push(0);
                buf.extend_from_slice(&underlying_amount_per_contract.to_le_bytes());
                buf.extend_from_slice(&quote_amount_per_contract.to_le_bytes());
                buf.extend_from_slice(&expiration_unix_timestamp.to_le_bytes());
            }
            &Self::MintCoveredCall { ref bump_seed } => {
                buf.push(1);
                buf.extend_from_slice(&bump_seed.to_le_bytes());
            }
            &Self::ExercisePostExpiration {
                ref bump_seed,
            } => {
                buf.push(2);
                buf.extend_from_slice(&bump_seed.to_le_bytes());
            }
            &Self::ExerciseCoveredCall { ref bump_seed } => {
                buf.push(3);
                buf.extend_from_slice(&bump_seed.to_le_bytes());
            }
            &Self::ClosePostExpiration { ref bump_seed } => {
                buf.push(4);
                buf.extend_from_slice(&bump_seed.to_le_bytes());
            }
        };
        buf
    }

    fn unpack_timestamp(input: &[u8]) -> Result<(i64, &[u8]), ProgramError> {
        if input.len() >= 8 {
            let (num_buf, rest) = input.split_at(8);
            let num_arr = array_ref![num_buf, 0, 8];
            let num = UnixTimestamp::from_le_bytes(*num_arr);
            Ok((num, rest))
        } else {
            Err(ProgramError::InvalidInstructionData)
        }
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
    fn unpack_u8(input: &[u8]) -> Result<(u8, &[u8]), ProgramError> {
        if input.len() >= 1 {
            let (num_buf, rest) = input.split_at(1);
            let num_arr = array_ref![num_buf, 0, 1];
            let num = u8::from_le_bytes(*num_arr);
            Ok((num, rest))
        } else {
            Err(ProgramError::InvalidInstructionData)
        }
    }
}

/// Creates an `InitializeMarket` instruction
pub fn initialize_market(
    program_id: &Pubkey,
    underlying_asset_mint: &Pubkey,
    quote_asset_mint: &Pubkey,
    option_mint: &Pubkey,
    writer_token_mint: &Pubkey,
    option_market: &Pubkey,
    underlying_asset_pool: &Pubkey,
    quote_asset_pool: &Pubkey,
    underlying_amount_per_contract: u64,
    quote_amount_per_contract: u64,
    expiration_unix_timestamp: UnixTimestamp,
) -> Result<Instruction, ProgramError> {
    let (option_mint_authority, _bump_seed) = Pubkey::find_program_address(
        &[&option_mint.to_bytes()[..32]],
        &program_id,
    );
    let data = OptionsInstruction::InitializeMarket {
        underlying_amount_per_contract,
        quote_amount_per_contract,
        expiration_unix_timestamp,
    }
    .pack();

    let accounts = vec![
        AccountMeta::new_readonly(*underlying_asset_mint, false),
        AccountMeta::new_readonly(*quote_asset_mint, false),
        AccountMeta::new(*option_mint, false),
        AccountMeta::new(*writer_token_mint, false),
        AccountMeta::new(*option_market, false),
        AccountMeta::new_readonly(option_mint_authority, false),
        AccountMeta::new(*underlying_asset_pool, false),
        AccountMeta::new(*quote_asset_pool, false),
        AccountMeta::new_readonly(sysvar::rent::id(), false),
        AccountMeta::new_readonly(spl_token::id(), false),
    ];
    Ok(Instruction {
        program_id: *program_id,
        accounts,
        data,
    })
}

// TODO add support for Multisignature owner/delegate
/// Creates a `MintCoveredCall` instruction
pub fn mint_covered_call(
    program_id: &Pubkey,
    option_mint: &Pubkey,
    minted_option_dest: &Pubkey,
    writer_token_mint: &Pubkey,
    minted_writer_token_dest: &Pubkey,
    underyling_asset_src: &Pubkey,
    underlying_asset_pool: &Pubkey,
    option_market: &Pubkey,
    authority_pubkey: &Pubkey,
) -> Result<Instruction, ProgramError> {
    let mut accounts = Vec::with_capacity(11);
    accounts.push(AccountMeta::new(*option_mint, false));
    accounts.push(AccountMeta::new(*minted_option_dest, false));
    accounts.push(AccountMeta::new(*writer_token_mint, false));
    accounts.push(AccountMeta::new(*minted_writer_token_dest, false));
    accounts.push(AccountMeta::new(*underyling_asset_src, false));
    accounts.push(AccountMeta::new(*underlying_asset_pool, false));
    accounts.push(AccountMeta::new_readonly(*option_market, false));
    accounts.push(AccountMeta::new_readonly(*authority_pubkey, true));
    accounts.push(AccountMeta::new_readonly(spl_token::id(), false));

    let (option_mint_authority_pubkey, bump_seed) =
        Pubkey::find_program_address(&[&option_mint.to_bytes()[..32]], &program_id);
    accounts.push(AccountMeta::new_readonly(
        option_mint_authority_pubkey,
        false,
    ));
    accounts.push(AccountMeta::new_readonly(sysvar::clock::id(), false));

    let data = OptionsInstruction::MintCoveredCall { bump_seed }.pack();
    Ok(Instruction {
        program_id: *program_id,
        data,
        accounts,
    })
}
/// Creates a `ExercisePostExpiration` instruction
pub fn exercise_post_expiration(
    program_id: &Pubkey,
    option_mint_key: &Pubkey,
    options_market_key: &Pubkey,
    exerciser_quote_asset_key: &Pubkey,
    exerciser_underlying_asset_key: &Pubkey,
    exerciser_authority_key: &Pubkey,
    market_underlying_asset_pool_key: &Pubkey,
) -> Result<Instruction, ProgramError> {

    let (options_spl_authority_pubkey, bump_seed) =
        Pubkey::find_program_address(&[&option_mint_key.to_bytes()[..32]], &program_id);
    let data = OptionsInstruction::ExercisePostExpiration {
        bump_seed,
    }
    .pack();

    let mut accounts = Vec::with_capacity(10);
    accounts.push(AccountMeta::new_readonly(sysvar::clock::id(), false));
    accounts.push(AccountMeta::new_readonly(spl_token::id(), false));
    accounts.push(AccountMeta::new_readonly(*options_market_key, false));
    accounts.push(AccountMeta::new(*exerciser_quote_asset_key, false));
    accounts.push(AccountMeta::new_readonly(*exerciser_authority_key, true));
    accounts.push(AccountMeta::new(*exerciser_underlying_asset_key, false));
    accounts.push(AccountMeta::new(*market_underlying_asset_pool_key, false));
    accounts.push(AccountMeta::new_readonly(
        options_spl_authority_pubkey,
        false,
    ));
    accounts.push(AccountMeta::new_readonly(*option_mint_key, false));

    Ok(Instruction {
        program_id: *program_id,
        data,
        accounts,
    })
}

/// Creates a `ClosePostExpiration` instruction
pub fn close_post_expiration(
    program_id: &Pubkey,
    options_market: &Pubkey,
    underlying_asset_pool: &Pubkey,
    option_mint_key: &Pubkey,
    writer_token_mint: &Pubkey,
    writer_token_source: &Pubkey,
    writer_token_source_authority: &Pubkey,
    underlying_asset_dest: &Pubkey,
) -> Result<Instruction, ProgramError> {

    let (option_mint_authority, bump_seed) =
        Pubkey::find_program_address(&[&option_mint_key.to_bytes()[..32]], &program_id);

    let data = OptionsInstruction::ClosePostExpiration {
        bump_seed
    }
    .pack();

    let mut accounts = Vec::with_capacity(10);
    accounts.push(AccountMeta::new_readonly(*options_market, false));
    accounts.push(AccountMeta::new_readonly(*option_mint_key, false));
    accounts.push(AccountMeta::new_readonly(
        option_mint_authority,
        false,
    ));
    accounts.push(AccountMeta::new(*writer_token_mint, false));
    accounts.push(AccountMeta::new(*writer_token_source, false));
    accounts.push(AccountMeta::new_readonly(*writer_token_source_authority, true));
    accounts.push(AccountMeta::new(*underlying_asset_dest, false));
    accounts.push(AccountMeta::new(*underlying_asset_pool, false));
    accounts.push(AccountMeta::new_readonly(spl_token::id(), false));
    accounts.push(AccountMeta::new_readonly(sysvar::clock::id(), false));

    Ok(Instruction {
        program_id: *program_id,
        data,
        accounts,
    })
}

/// Creates a `ExerciseCoveredCall` instruction
pub fn exercise_covered_call(
    program_id: &Pubkey,
    option_mint_key: &Pubkey,
    options_market_key: &Pubkey,
    exerciser_quote_asset_key: &Pubkey,
    exerciser_underlying_asset_key: &Pubkey,
    exerciser_authority_key: &Pubkey,
    market_underlying_asset_pool_key: &Pubkey,
    contract_token_key: &Pubkey,
    contract_token_authority: &Pubkey,
) -> Result<Instruction, ProgramError> {

    let (options_spl_authority_pubkey, bump_seed) =
        Pubkey::find_program_address(&[&option_mint_key.to_bytes()[..32]], &program_id);
    let data = OptionsInstruction::ExerciseCoveredCall {
        bump_seed,
    }
    .pack();

    let mut accounts = Vec::with_capacity(10);
    accounts.push(AccountMeta::new_readonly(sysvar::clock::id(), false));
    accounts.push(AccountMeta::new_readonly(spl_token::id(), false));
    accounts.push(AccountMeta::new_readonly(*options_market_key, false));
    accounts.push(AccountMeta::new(*exerciser_quote_asset_key, false));
    accounts.push(AccountMeta::new_readonly(*exerciser_authority_key, true));
    accounts.push(AccountMeta::new(*exerciser_underlying_asset_key, false));
    accounts.push(AccountMeta::new(*market_underlying_asset_pool_key, false));
    accounts.push(AccountMeta::new_readonly(
        options_spl_authority_pubkey,
        false,
    ));
    accounts.push(AccountMeta::new(*option_mint_key, false));
    accounts.push(AccountMeta::new(*contract_token_key, false));
    accounts.push(AccountMeta::new_readonly(*contract_token_authority, true));

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
        let underlying_amount_per_contract: u64 = 100;
        let quote_amount_per_contract: u64 = 500; // strike price of 5
        let expiration_unix_timestamp: UnixTimestamp = 1607743435;
        let check = OptionsInstruction::InitializeMarket {
            underlying_amount_per_contract,
            quote_amount_per_contract,
            expiration_unix_timestamp,
        };
        let packed = check.pack();
        // add the tag to the expected buffer
        let mut expect = Vec::from([0u8]);
        // add the other instruction inputs to expected buffer
        expect.extend_from_slice(&underlying_amount_per_contract.to_le_bytes());
        expect.extend_from_slice(&quote_amount_per_contract.to_le_bytes());
        expect.extend_from_slice(&expiration_unix_timestamp.to_le_bytes());
        assert_eq!(packed, expect);
        let unpacked = OptionsInstruction::unpack(&expect).unwrap();
        assert_eq!(unpacked, check);
    }

    #[test]
    fn test_pack_unpack_mint_covered_call() {
        let bump_seed = 1;
        let check = OptionsInstruction::MintCoveredCall { bump_seed };
        let packed = check.pack();
        // add the tag to the expected buffer
        let expect = Vec::from([1u8, bump_seed]);
        assert_eq!(packed, expect);
        let unpacked = OptionsInstruction::unpack(&expect).unwrap();
        assert_eq!(unpacked, check);
    }

    #[test]
    fn test_pack_unpack_exercise_covered_call() {
        let bump_seed = 1;
        let check = OptionsInstruction::ExerciseCoveredCall {
            bump_seed
        };
        let packed = check.pack();
        // add the tag to the expected buffer
        let mut expect = Vec::from([3u8]);
        expect.push(bump_seed);
        assert_eq!(packed, expect);
        let unpacked = OptionsInstruction::unpack(&expect).unwrap();
        assert_eq!(unpacked, check);
    }


    #[test]
    fn test_pack_unpack_close_post_expiration() {
        let bump_seed = 1;
        let check = OptionsInstruction::ClosePostExpiration {
            bump_seed
        };
        let packed = check.pack();
        // add the tag to the expected buffer
        let mut expect = Vec::from([4u8]);
        expect.push(bump_seed);
        assert_eq!(packed, expect);
        let unpacked = OptionsInstruction::unpack(&expect).unwrap();
        assert_eq!(unpacked, check);
    }
}
