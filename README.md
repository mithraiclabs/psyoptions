# Solana Options

Exploring architectures for options trading on Serum

# Development

## Dependencies
1. [Docker](https://docs.docker.com/get-docker/)

## Running Unit tests
1. `cargo test --features program --lib --manifest-path options/Cargo.toml`

## Running Integration tests
1. Make sure the local test net is running `yarn localnet:up`
2. Build and test the options program `cargo test-bpf --manifest-path options/Cargo.toml`

## Debugging with lldb
1. Run tests and have them fail
2. Identifier the file that was running (see “Running ******”)
3. in terminal run `rust-lldb +nightly FILE_PATH`
4. set a break point (for example `b instruction.rs:157`)
5. Run tests with `run —test`


## Potential Improvements (V1)
* Integration Tests
    * Wrap the load_bpf_program method and cache the program id so it's not being loaded on each test

# Deploying the program

## Dev Net

1. Make sure you're on solana CLI >= 1.5.6 `solana-install init v1.5.6`
2. Build the program `cargo build-bpf --manifest-path options/Cargo.toml`
3. Set the target network `solana config set --url https://devnet.solana.com`
4. Deploy the program `solana program deploy YOUR_KEY_PAIR $PWD/options/target/deploy/solana_options.so --keypair YOUR_KEY_PAIR`
