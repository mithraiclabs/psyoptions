# Solana Options

Exploring architectures for options trading on Serum

# Development

## Dependencies

1. [Docker](https://docs.docker.com/get-docker/)

## Running Unit tests

1. `cargo test --features program --lib --manifest-path options/Cargo.toml`

## Running Integration tests

1. Make sure the local test net is running `solana-test-validator`
2. Build and test the options program `cargo test-bpf --manifest-path options/Cargo.toml`

## Debugging with lldb

1. Run tests and have them fail
2. Identifier the file that was running (see “Running **\*\***”)
3. in terminal run `rust-lldb +nightly FILE_PATH`
4. set a break point (for example `b instruction.rs:157`)
5. Run tests with `run —test`

## Deploying and creating a market locally

1. Run local Solana cluster `yarn localnet:up`
2. Build program `cargo build-bpf --manifest-path options/Cargo.toml`
3. Deploy program `solana program deploy --program-id $PWD/options/deployed_programs/psyoptions-local-keypair.json $PWD/options/target/deploy/psyoptions.so`
   - NOTE: To use the above you must set your Solana config file (usually located at _~/.config/solana/cli/config.yml_) to point to the local cluster AND use an appropriate localnet keypair that has some SOL. Follow the docs to [generate keypair](https://docs.solana.com/wallet-guide/file-system-wallet#generate-a-file-system-wallet-keypair) and [airdrop some tokens](https://docs.solana.com/cli/transfer-tokens#airdrop-some-tokens-to-get-started)
4. Run the script to build an options market `npx babel-node scripts/buildAndInitMarket.js YOUR_PROGRAM_ADDRESS`

## Potential Improvements (V1)

- Integration Tests
  - Wrap the load_bpf_program method and cache the program id so it's not being loaded on each test

# Deploying the program

## Mainnet

1. Build with anchor `anchor build -p psy_american --verifiable`
2. Use an insecure computer to run `solana program write-buffer <target-path> --buffer <buffer-keypair>`
3. change authority `solana program set-buffer-authority <buffer-address> --new-buffer-authority <hardware-wallet-address>`
4. Verify the buffer binary is correct `anchor verify -p <lib-name> <buffer-address> --provider.cluster mainnet`
5. Switch to hardeware wallet.
6. Deploy/upgrade with a single transaction from the hardware wallet. `solana program deploy --buffer <buffer-keypair> --program-id <program-keypair> --keypair <hardware-wallet-keypair>`

## Dev Net

The program used for Devnet Bet is currently deployed @ `{"programId":"R2y9ip6mxmWUj4pt54jP2hz2dgvMozy9VTSwMWE7evs"}`

1. Make sure you're on solana CLI >= 1.8.0 `solana-install init v1.8.1`
2. Build the program `cargo build-bpf --manifest-path options/Cargo.toml`
3. Set the target network `solana config set --url https://api.devnet.solana.com`
4. Deploy the program `solana program deploy --program-id $PWD/options/deployed_programs/psyoptions-devnet-beta-3-keypair.json $PWD/options/target/deploy/psyoptions.so`

# Deploying the bindings to NPM

1. Sign into mithraics npm account via cli
2. build the new package `cd packages/psyoptions-ts` `yarn build:package`
3. publish to npm `npm publish --access public`

# Publishing the crate

`cd options && cargo publish --features "no-entrypoint"`

# Found a bug??

Please report to developers@psyoptions.io. Include which part of the protocol(s)/code it impacts and the severity.

A more formal bug bounty will be posted soon
