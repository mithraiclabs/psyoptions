use solana_program::{account_info::AccountInfo, entrypoint::ProgramResult, pubkey::Pubkey};

pub struct Processor {}

/// todo
impl Processor {
    pub fn process(
        _program_id: &Pubkey,
        _accounts: &[AccountInfo],
        _input: &[u8],
    ) -> ProgramResult {
        Ok(())
    }
}
