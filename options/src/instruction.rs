use crate::market::OptionWriter;
use arrayref::array_ref;
use solana_program::{
    clock::UnixTimestamp,
    instruction::{AccountMeta, Instruction},
    msg,
    program_error::ProgramError,
    program_pack::Pack,
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
    ///   4. `[]` Authority for Option Mint
    ///   5. `[writeable]` Pool for underlying asset deposits - Uninitialized
    ///   6. `[]` Rent Sysvar
    ///   7. `[]` Spl Token Program
    InitializeMarket {
        /// The amount of the **underlying asset** that derives a single contract
        amount_per_contract: u64,
        /// The strike price for the new market
        strike_price: u64,
        /// The Unix timestamp at which the contracts in this market expire
        expiration_unix_timestamp: UnixTimestamp,
    },
    /// Mints an Options token to represent a Covered Call
    ///
    ///
    ///   0. `[writeable]` Option Mint
    ///   1. `[writeable]` Destination account for minted Option
    ///   2. `[writeable]` Source account for `OptionWriter`'s underlying asset
    ///   3. `[writeable]` Destination account for underlying asset pool
    ///   4. `[writeable]` Destination account for `OptionWriter`'s quote asset
    ///   5. `[]` Destination account for quote asset
    ///     (this is stored in the mint registry to be used in the event of option exerciese)
    ///   6. `[writeable]` `OptionMarket` data account
    ///   7. `[]` Authority account for the various `OptionWriter` accounts
    ///   8. `[]` SPL Token Program
    ///   9. `[]` Program Derived Address for the authority over the Option Mint
    ///   10. `[]` SysVar clock account
    ///   
    MintCoveredCall { bump_seed: u8 },
    /// Exercises the specified OptionWriter
    ///
    /// 0. `[]` Sys var clock account
    /// 1. `[writeable]` Option Market data account address
    /// 2. `[writeable]` option exerciser's containing quote asset for swap
    /// 3. `[writeable]` option writer's quote asset account to receive
    /// 4. `[writeable]` option exerciser's underlying asset address to receive
    /// 5. `[writeable]` Option Market's underlying asset pool address
    ///
    ExercisePostExpiration {
        option_writer: OptionWriter,
        bump_seed: u8,
    },
    /// Exercise an Options token representing a Covered Call
    ///
    ///   0. `[writeable]` Option Mint
    ///   1. `[writeable]` Option Market
    ///   2. `[writeable]` Option Account to burn from
    ///   3. `[]` Authority of Option Account
    ///   4. `[writeable]` Underlying Asset Pool
    ///   5. `[writeable]` Underlying Asset Destination
    ///   6. `[]` Program Derived Address with authority for Option Mint
    ///   7. `[]` SPL Token Program
    ExerciseCoveredCall {
        option_writer: OptionWriter,
        bump_seed: u8,
    },
    /// Close a single option contract post expiration
    /// 
    /// 
    ClosePostExpiration {
        option_writer: OptionWriter,
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
                let (amount_per_contract, rest) = Self::unpack_u64(rest)?;
                let (strike_price, rest) = Self::unpack_u64(rest)?;
                let (expiration_unix_timestamp, _rest) = Self::unpack_timestamp(rest)?;
                Self::InitializeMarket {
                    amount_per_contract,
                    strike_price,
                    expiration_unix_timestamp,
                }
            }
            1 => {
                let (bump_seed, _rest) = Self::unpack_u8(rest)?;
                Self::MintCoveredCall { bump_seed }
            }
            2 => {
                msg!("Options: unpacking ExercisePostExpiration");
                let (option_writer, rest) = Self::unpack_option_writer(rest)?;
                let (bump_seed, _rest) = Self::unpack_u8(rest)?;
                Self::ExercisePostExpiration {
                    option_writer,
                    bump_seed,
                }
            }
            3 => {
                let (option_writer, rest) = Self::unpack_option_writer(rest)?;
                let (bump_seed, _rest) = Self::unpack_u8(rest)?;
                Self::ExerciseCoveredCall { 
                    option_writer,
                    bump_seed 
                }
            }
            4 => {
                let (option_writer, _rest) = Self::unpack_option_writer(rest)?;
                Self::ClosePostExpiration {
                    option_writer
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
                ref amount_per_contract,
                ref strike_price,
                ref expiration_unix_timestamp,
            } => {
                buf.push(0);
                buf.extend_from_slice(&amount_per_contract.to_le_bytes());
                buf.extend_from_slice(&strike_price.to_le_bytes());
                buf.extend_from_slice(&expiration_unix_timestamp.to_le_bytes());
            }
            &Self::MintCoveredCall { ref bump_seed } => {
                buf.push(1);
                buf.extend_from_slice(&bump_seed.to_le_bytes());
            }
            &Self::ExercisePostExpiration {
                ref option_writer,
                ref bump_seed,
            } => {
                buf.push(2);
                let mut option_writer_slice = [0u8; OptionWriter::LEN];
                option_writer.pack_into_slice(&mut option_writer_slice);
                buf.extend_from_slice(&option_writer_slice);
                buf.extend_from_slice(&bump_seed.to_le_bytes());
            }
            &Self::ExerciseCoveredCall { ref option_writer, ref bump_seed } => {
                buf.push(3);
                let mut option_writer_slice = [0u8; OptionWriter::LEN];
                option_writer.pack_into_slice(&mut option_writer_slice);
                buf.extend_from_slice(&option_writer_slice);
                buf.extend_from_slice(&bump_seed.to_le_bytes());
            }
            &Self::ClosePostExpiration { ref option_writer } => {
                buf.push(4);
                let mut option_writer_slice = [0u8; OptionWriter::LEN];
                option_writer.pack_into_slice(&mut option_writer_slice);
                buf.extend_from_slice(&option_writer_slice);
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
    fn unpack_option_writer(input: &[u8]) -> Result<(OptionWriter, &[u8]), ProgramError> {
        if input.len() >= OptionWriter::LEN {
            let (writer_buf, rest) = input.split_at(OptionWriter::LEN);
            let writer_arr = array_ref![writer_buf, 0, OptionWriter::LEN];
            let option_writer = OptionWriter::unpack(writer_arr)?;
            Ok((option_writer, rest))
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
    expiration_unix_timestamp: UnixTimestamp,
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

// TODO add support for Multisignature owner/delegate
/// Creates a `MintCoveredCall` instruction
pub fn mint_covered_call(
    program_id: &Pubkey,
    option_mint: &Pubkey,
    minted_option_dest: &Pubkey,
    underyling_asset_src: &Pubkey,
    underlying_asset_pool: &Pubkey,
    quote_asset_dest: &Pubkey,
    option_market: &Pubkey,
    authority_pubkey: &Pubkey,
) -> Result<Instruction, ProgramError> {
    let mut accounts = Vec::with_capacity(9);
    accounts.push(AccountMeta::new(*option_mint, false));
    accounts.push(AccountMeta::new(*minted_option_dest, false));
    accounts.push(AccountMeta::new(*underyling_asset_src, false));
    accounts.push(AccountMeta::new(*underlying_asset_pool, false));
    accounts.push(AccountMeta::new_readonly(*quote_asset_dest, false));
    accounts.push(AccountMeta::new(*option_market, false));
    accounts.push(AccountMeta::new_readonly(*authority_pubkey, true));
    accounts.push(AccountMeta::new_readonly(spl_token::id(), false));

    let (options_spl_authority_pubkey, bump_seed) =
        Pubkey::find_program_address(&[&option_mint.to_bytes()[..32]], &program_id);
    accounts.push(AccountMeta::new_readonly(
        options_spl_authority_pubkey,
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
    option_writer: &OptionWriter,
    option_mint_key: &Pubkey,
    options_market_key: &Pubkey,
    exerciser_quote_asset_key: &Pubkey,
    exerciser_underlying_asset_key: &Pubkey,
    exerciser_authority_key: &Pubkey,
    market_underlying_asset_pool_key: &Pubkey,
) -> Result<Instruction, ProgramError> {
    let cloned_writer = option_writer.clone();

    let (options_spl_authority_pubkey, bump_seed) =
        Pubkey::find_program_address(&[&option_mint_key.to_bytes()[..32]], &program_id);
    let data = OptionsInstruction::ExercisePostExpiration {
        option_writer: cloned_writer,
        bump_seed,
    }
    .pack();

    let mut accounts = Vec::with_capacity(9);
    accounts.push(AccountMeta::new_readonly(sysvar::clock::id(), false));
    accounts.push(AccountMeta::new_readonly(spl_token::id(), false));
    accounts.push(AccountMeta::new(*options_market_key, false));
    accounts.push(AccountMeta::new(*exerciser_quote_asset_key, false));
    accounts.push(AccountMeta::new_readonly(*exerciser_authority_key, true));
    accounts.push(AccountMeta::new(
        option_writer.quote_asset_acct_address,
        false,
    ));
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
    option_writer: &OptionWriter,
    option_mint_key: &Pubkey,
    market_underlying_asset_pool_key: &Pubkey,
) -> Result<Instruction, ProgramError> {

    let cloned_writer = option_writer.clone();

    let data = OptionsInstruction::ClosePostExpiration {
        option_writer: cloned_writer
    }
    .pack();

    let mut accounts = Vec::with_capacity(9);
    accounts.push(AccountMeta::new_readonly(sysvar::clock::id(), false));
    accounts.push(AccountMeta::new_readonly(spl_token::id(), false));
    accounts.push(AccountMeta::new(
        option_writer.underlying_asset_acct_address,
        false,
    ));
    accounts.push(AccountMeta::new(*market_underlying_asset_pool_key, false));
    accounts.push(AccountMeta::new_readonly(*option_mint_key, false));

    Ok(Instruction {
        program_id: *program_id,
        data,
        accounts,
    })
}

/// Creates a `ExerciseCoveredCall` instruction
pub fn exercise_covered_call(
    program_id: &Pubkey,
    option_writer: &OptionWriter,
    option_mint_key: &Pubkey,
    options_market_key: &Pubkey,
    exerciser_quote_asset_key: &Pubkey,
    exerciser_underlying_asset_key: &Pubkey,
    exerciser_authority_key: &Pubkey,
    market_underlying_asset_pool_key: &Pubkey,
    contract_token_key: &Pubkey,
    contract_token_authority: &Pubkey,
) -> Result<Instruction, ProgramError> {
    let cloned_writer = option_writer.clone();

    let (options_spl_authority_pubkey, bump_seed) =
        Pubkey::find_program_address(&[&option_mint_key.to_bytes()[..32]], &program_id);
    let data = OptionsInstruction::ExerciseCoveredCall {
        option_writer: cloned_writer,
        bump_seed,
    }
    .pack();

    let mut accounts = Vec::with_capacity(10);
    accounts.push(AccountMeta::new_readonly(sysvar::clock::id(), false));
    accounts.push(AccountMeta::new_readonly(spl_token::id(), false));
    accounts.push(AccountMeta::new(*options_market_key, false));
    accounts.push(AccountMeta::new(*exerciser_quote_asset_key, false));
    accounts.push(AccountMeta::new_readonly(*exerciser_authority_key, true));
    accounts.push(AccountMeta::new(
        option_writer.quote_asset_acct_address,
        false,
    ));
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
        let amount_per_contract: u64 = 100;
        let strike_price: u64 = 5;
        let expiration_unix_timestamp: UnixTimestamp = 1607743435;
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
        let option_writer = OptionWriter {
            underlying_asset_acct_address: Pubkey::new_unique(),
            quote_asset_acct_address: Pubkey::new_unique(),
            contract_token_acct_address: Pubkey::new_unique()
        };
        let cloned_option_wrtier = option_writer.clone();
        let check = OptionsInstruction::ExerciseCoveredCall { 
            option_writer,
            bump_seed 
        };
        let packed = check.pack();
        // add the tag to the expected buffer
        let mut option_writer_slice = [0u8; OptionWriter::LEN];
        cloned_option_wrtier.pack_into_slice(&mut option_writer_slice);
        let mut expect = Vec::from([3u8]);
        expect.extend_from_slice(&option_writer_slice);
        expect.push(bump_seed);
        assert_eq!(packed, expect);
        let unpacked = OptionsInstruction::unpack(&expect).unwrap();
        assert_eq!(unpacked, check);
    }


    #[test]
    fn test_pack_unpack_close_post_expiration() {
        let option_writer = OptionWriter {
            underlying_asset_acct_address: Pubkey::new_unique(),
            quote_asset_acct_address: Pubkey::new_unique(),
            contract_token_acct_address: Pubkey::new_unique()
        };
        let cloned_option_wrtier = option_writer.clone();
        let check = OptionsInstruction::ClosePostExpiration { 
            option_writer
        };
        let packed = check.pack();
        // add the tag to the expected buffer
        let mut option_writer_slice = [0u8; OptionWriter::LEN];
        cloned_option_wrtier.pack_into_slice(&mut option_writer_slice);
        let mut expect = Vec::from([4u8]);
        expect.extend_from_slice(&option_writer_slice);
        assert_eq!(packed, expect);
        let unpacked = OptionsInstruction::unpack(&expect).unwrap();
        assert_eq!(unpacked, check);
    }
}
