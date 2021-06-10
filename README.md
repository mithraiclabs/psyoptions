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

## Deploying and creating a market locally
1. Run local Solana cluster `yarn localnet:up`
2. Build program `cargo build-bpf --manifest-path options/Cargo.toml`
3. Deploy program `solana program deploy --program-id $PWD/options/deployed_programs/psyoptions-local-keypair.json $PWD/options/target/deploy/psyoptions.so`
    * NOTE: To use the above you must set your Solana config file (usually located at _~/.config/solana/cli/config.yml_) to point to the local cluster AND use an appropriate localnet keypair that has some SOL. Follow the docs to [generate keypair](https://docs.solana.com/wallet-guide/file-system-wallet#generate-a-file-system-wallet-keypair) and [airdrop some tokens](https://docs.solana.com/cli/transfer-tokens#airdrop-some-tokens-to-get-started)
4. Run the script to build an options market `npx babel-node scripts/buildAndInitMarket.js YOUR_PROGRAM_ADDRESS`


## Potential Improvements (V1)
* Integration Tests
    * Wrap the load_bpf_program method and cache the program id so it's not being loaded on each test

# Deploying the program

## Dev Net
The program used for Devnet Bet is currently deployed @ `{"programId":"GDvqQy3FkDB2wyNwgZGp5YkmRMUmWbhNNWDMYKbLSZ5N"}`

The old program address for Devnet testing is deployed @ `{"programId":"4DvkJJBUiXMZVYXFGgYQvGceTuM7F5Be4HqWAiR7t2vM"}`

1. Make sure you're on solana CLI >= 1.6.7 `solana-install init v1.6.7`
2. Build the program `cargo build-bpf --manifest-path options/Cargo.toml`
3. Set the target network `solana config set --url https://devnet.solana.com`
4. Deploy the program `solana program deploy --program-id $PWD/options/deployed_programs/psyoptions-devnet-beta-3-keypair.json $PWD/options/target/deploy/psyoptions.so`

# Deploying the bindings to NPM
1. Sign into mithraics npm account via cli
2. build the new package `cd packages/psyoptions-ts` `yarn build:package`
3. publish to npm `npm publish --access public`

# Publishing the crate

`cd options && cargo publish --features "no-entrypoint"`

