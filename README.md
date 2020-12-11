# Template for Solana project

## Getting Started

### Install deps
```
yarn install
```

### Build all Solana programs
```
yarn build
```

### Run JS integration tests
```
yarn test
```

### Run rust unit tests
```
yarn test:programs [PROGRAM_NAME]
```

### Creating new program
```
yarn generate-program PROGRAM_NAME
```


## TODO
- better set up testing to add fresh accounts and other utilities for each test module at a more global level
- create this into a package with a cli
