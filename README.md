# Solana Options

Exploring architectures for options trading on Serum

# Development

## Dependencies
1. [Docker](https://docs.docker.com/get-docker/)

## Running Unit tests
1. `cargo test --features program --manifest-path options/Cargo.toml`

## Running Integration tests
1. Make sure the local test net is running `yarn localnet:up`
2. Build and test the options program `cargo test-bpf --manifest-path options/Cargo.toml`

## Debugging with lldb
1. Run tests and have them fail
2. Identifier the file that was running (see “Running ******”)
3. in terminal run `rust-lldb +nightly FILE_PATH`
4. set a break point (for example `b instruction.rs:157`)
5. Run tests with `run —test`