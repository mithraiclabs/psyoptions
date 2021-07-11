import { struct, u8, nu64, ns64 } from 'buffer-layout';
import {
  PublicKey,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  SystemProgram,
  Connection,
  Keypair,
} from '@solana/web3.js';
import {
  AccountLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Market } from './market';
import { INTRUCTION_TAG_LAYOUT } from './layout';
import { FEE_OWNER_KEY } from './fees';

/**
 * @internal
 * OptionsInstruction::InitializeMarket {
 *      /// The amount of the **underlying asset** that derives a single contract
 *      underlying_amount_per_contract: u64,
 *      /// The quote_amount_per_contract (strike price * amount_per_contract) for the new market
 *      /// i.e. how much quote asset will be swapped when the contract is exercised
 *      quote_amount_per_contract: u64,
 *      /// The Unix timestamp at which the contracts in this market expire
 *      expiration_unix_timestamp: UnixTimestamp,
 *      /// The u8 bump seed for the [Program Derived Address](https://docs.solana.com/developing/programming-model/calling-between-programs#program-derived-addresses)
 *      /// which controls a specific OptionMarket's mints and pools
 *      bump_seed: u8
 *  }
 *
 * UnixTimestamp is really an alias for i64 type.
 */
export const INITIALIZE_MARKET_LAYOUT = struct([
  nu64('underlyingAmountPerContract'),
  nu64('quoteAmountPerContract'),
  ns64('expirationUnixTimestamp'),
  u8('bumpSeed'),
]);

/**
 * Generate the instruction for `InitializeMarket`
 *
 * Instruction to initialize a new option market. Strike price is determined by
 * `quote amount per contract / underlying amount per contract`
 * @param {object} __namedParameters
 */
export const initializeMarketInstruction = async ({
  programId,
  fundingAccountKey,
  underlyingAssetMintKey,
  quoteAssetMintKey,
  optionMintKey,
  writerTokenMintKey,
  underlyingAssetPoolKey,
  quoteAssetPoolKey,
  underlyingAmountPerContract,
  quoteAmountPerContract,
  expirationUnixTimestamp,
}: {
  /** the public key for the PsyOptions program */
  programId: PublicKey;
  /** The payer account that is funding the SOL for the TX */
  fundingAccountKey: PublicKey;
  /** SPL Token mint of the underlying asset */
  underlyingAssetMintKey: PublicKey;
  /** SPL Token mint of the quote asset */
  quoteAssetMintKey: PublicKey;
  /** uninitialized SPL Token mint to be used as the Option Token mint
   * for the new option market */
  optionMintKey: PublicKey;
  /** uninitialized SPL Token mint to be used as the Writer Token mint
   * for the new option market */
  writerTokenMintKey: PublicKey;
  /** unintitialized SPL Token account to store locked underlying asset */
  underlyingAssetPoolKey: PublicKey;
  /** unintitialized SPL Token account to store locked quote asset */
  quoteAssetPoolKey: PublicKey;
  /** amount of underlying asset needed to mint an Option Token */
  underlyingAmountPerContract: number;
  /** The amount of quote asset required to swap for the underlying asset
   * i.e. amountPerContract * strike price */
  quoteAmountPerContract: number;
  /** unix timestamp (in seconds) when the option market expires */
  expirationUnixTimestamp: number;
}): Promise<TransactionInstruction> => {

  // Generate the option market program derived address from the option
  // parameters
  const [optionMarketKey, _marketBumpSeed] = await Market.getDerivedAddressFromParams({
    programId,
    underlyingAssetMintKey,
    quoteAssetMintKey,
    underlyingAmountPerContract,
    quoteAmountPerContract,
    expirationUnixTimestamp
  })
  // Generate the program derived address for signing transfers
  const [marketAuthorityKey, bumpSeed] = await PublicKey.findProgramAddress(
    [optionMarketKey.toBuffer()],
    programId,
  );

  // Get the associated fee address
  const mintFeeKey = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    underlyingAssetMintKey,
    FEE_OWNER_KEY,
  );

  const exerciseFeeKey = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    quoteAssetMintKey,
    FEE_OWNER_KEY,
  );

  // Create a u8 buffer that conforms to the InitializeMarket structure
  const initializeMarketBuffer = Buffer.alloc(INITIALIZE_MARKET_LAYOUT.span);
  INITIALIZE_MARKET_LAYOUT.encode(
    {
      underlyingAmountPerContract,
      quoteAmountPerContract,
      expirationUnixTimestamp,
      bumpSeed,
    },
    initializeMarketBuffer,
    0,
  );

  /*
   * Generate the instruction tag. 0 is the tag that denotes the InitializeMarket instructions
   * The tags can be found the OptionInstruction.unpack function (instruction.rs)
   */
  const tagBuffer = Buffer.alloc(INTRUCTION_TAG_LAYOUT.span);
  INTRUCTION_TAG_LAYOUT.encode(0, tagBuffer, 0);

  // concatentate the tag with the data
  const data = Buffer.concat([tagBuffer, initializeMarketBuffer]);

  return new TransactionInstruction({
    // The order of the accounts must match the instruction.rs implementation
    keys: [
      { pubkey: underlyingAssetMintKey, isSigner: false, isWritable: false },
      { pubkey: quoteAssetMintKey, isSigner: false, isWritable: false },
      { pubkey: optionMintKey, isSigner: false, isWritable: true },
      { pubkey: writerTokenMintKey, isSigner: false, isWritable: true },
      {
        pubkey: marketAuthorityKey,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: underlyingAssetPoolKey,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: quoteAssetPoolKey, isSigner: false, isWritable: true },
      { pubkey: fundingAccountKey, isSigner: true, isWritable: true },
      { pubkey: FEE_OWNER_KEY, isSigner: false, isWritable: false },
      { pubkey: mintFeeKey, isSigner: false, isWritable: true },
      { pubkey: exerciseFeeKey, isSigner: false, isWritable: true },
      { pubkey: optionMarketKey, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      {
        pubkey: ASSOCIATED_TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      },
    ],
    data,
    programId,
  });
};

/**
 * Generate and initialize the Accounts to be used for the new option market.
 *
 * @param connection
 * @param payerKey PublicKey to pay for the creation of these new accounts
 */
export const initializeAccountsForMarket = async ({
  connection,
  payerKey,
}: {
  connection: Connection;
  payerKey: PublicKey;
  programId: string | PublicKey;
}) => {
  const optionMintAccount = new Keypair();
  const writerTokenMintAccount = new Keypair();
  const underlyingAssetPoolAccount = new Keypair();
  const quoteAssetPoolAccount = new Keypair();

  const transaction = new Transaction();

  // Create the Option Mint Account with rent exemption
  // Allocate memory for the account
  const mintRentBalance = await connection.getMinimumBalanceForRentExemption(
    MintLayout.span,
  );
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: payerKey,
      newAccountPubkey: optionMintAccount.publicKey,
      lamports: mintRentBalance,
      space: MintLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
  );
  // Create the Option Mint Account with rent exemption
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: payerKey,
      newAccountPubkey: writerTokenMintAccount.publicKey,
      lamports: mintRentBalance,
      space: MintLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
  );

  const assetPoolRentBalance =
    await connection.getMinimumBalanceForRentExemption(AccountLayout.span);
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: payerKey,
      newAccountPubkey: underlyingAssetPoolAccount.publicKey,
      lamports: assetPoolRentBalance,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
  );
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: payerKey,
      newAccountPubkey: quoteAssetPoolAccount.publicKey,
      lamports: assetPoolRentBalance,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
  );

  const signers = [
    optionMintAccount,
    writerTokenMintAccount,
    underlyingAssetPoolAccount,
    quoteAssetPoolAccount,
  ];

  return {
    transaction,
    signers,
    optionMintKey: optionMintAccount.publicKey,
    writerTokenMintKey: writerTokenMintAccount.publicKey,
    quoteAssetPoolKey: quoteAssetPoolAccount.publicKey,
    underlyingAssetPoolKey: underlyingAssetPoolAccount.publicKey,
  };
};
