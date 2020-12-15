use std::mem::size_of;
use solana_program::program_error::ProgramError;
use arrayref::{ array_ref };
/// Instructions supported by the Options program
#[repr(C, u16)]
#[derive(Debug, PartialEq)]
pub enum OptionsInstruction {
    /// Creates a new OptionMarket
    ///
    ///
    /// Accounts expected by this instruction:
    /// 
    ///   0. SPL Program address of Underlying Asset
    ///   1. SPL Program address of Quote Asset
    ///   2. `[writeable]` SPL Program address for contract token 
    ///     (the client must create a new SPL Token prior to creating a market)
    ///   3. `[writeable]` Account with space for the option market we are creating 
    CreateMarket {
        /// The amount of the **underlying asset** that derives a single contract
        amount_per_contract: u64,
        /// The Unix timestamp at which the contracts in this market expire
        expiration_unix_timestamp: u64,
    }
}

impl OptionsInstruction {
    /// Unpacks a byte buffer into a [TokenInstruction](enum.TokenInstruction.html).
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {

        let (&tag, rest) = input.split_first().ok_or(ProgramError::InvalidInstructionData)?;
        Ok(match tag {
            0 => {
                let (amount_per_contract, rest) = Self::unpack_u64(rest)?;
                let (expiration_unix_timestamp, _rest) = Self::unpack_u64(rest)?;
                Self::CreateMarket {
                    amount_per_contract,
                    expiration_unix_timestamp
                }
            }
            _ => return Err(ProgramError::InvalidInstructionData.into()),
        })
    }

    /// Packs a OptionInstruction into a byte buffer.
    pub fn pack(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(size_of::<Self>());
        match self {
            &Self::CreateMarket {
                ref amount_per_contract,
                ref expiration_unix_timestamp,
            } => {
                buf.push(0);
                buf.extend_from_slice(&amount_per_contract.to_le_bytes());
                buf.extend_from_slice(&expiration_unix_timestamp.to_le_bytes());
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pack_unpack_options_instructions() {
        let amount_per_contract: u64 = 100;
        let expiration_unix_timestamp: u64 = 1607743435;
        let check = OptionsInstruction::CreateMarket {
            amount_per_contract,
            expiration_unix_timestamp
        };
        let packed = check.pack();
        // add the tag to the expected buffer
        let mut expect = Vec::from([0u8]);
        // add the other instruction inputs to expected buffer
        expect.extend_from_slice(&amount_per_contract.to_le_bytes());
        expect.extend_from_slice(&expiration_unix_timestamp.to_le_bytes());
        assert_eq!(packed, expect);
        let unpacked = OptionsInstruction::unpack(&expect).unwrap();
        assert_eq!(unpacked, check);
    }
}