#!/usr/bin/env bash

cd "$(dirname "$0")"

if [ "$1" ]; then
  PROGRAM_NAME="$1"
  SOLANA_VERSION="1.3.17"
  if [ "$2" ]; then
    SOLANA_VERSION="$2"
  fi

  cd ../programs
  cargo new $PROGRAM_NAME --lib
  cd $PROGRAM_NAME

# generate proper Cargo.toml file
cat > Cargo.toml << EOF
[package]
name = "${PROGRAM_NAME}"
version = "0.0.1"
authors = [""]
edition = "2018"

# See more keys and their definitions at https://doc.rust-lang.org/cargo/reference/manifest.html

[features]
no-entrypoint = []
program = ["solana-sdk/program"]
default = ["solana-sdk/default"]

[dependencies]
solana-sdk = { version = "=${SOLANA_VERSION}", default-features = false, optional = true }

[lib]
name = "solana_bpf_${PROGRAM_NAME}" # very important to match this structure, used in the build script
crate-type = ["cdylib", "lib"]
EOF

  touch Xargo.toml
# generate Xargo.toml
cat > Xargo.toml << EOF
[target.bpfel-unknown-unknown.dependencies.std]
features = []
EOF

# generate basic solana program file
cat > ./src/lib.rs << EOF
#![cfg(feature = "program")]

use solana_sdk::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    pubkey::Pubkey
};

// Declare and export the program's entrypoint
entrypoint!(process_instruction);

fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {

    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn it_works() {
        assert_eq!(2 + 2, 4);
    }
}

EOF

else
  echo "Please specify program name as the first argument."
fi
