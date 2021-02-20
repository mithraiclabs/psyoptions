import { struct, nu64, ns64 } from 'buffer-layout';
import {
  PublicKey,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  Account,
  Transaction,
  SystemProgram,
  Connection,
} from '@solana/web3.js';
import { AccountLayout, MintLayout } from '@solana/spl-token';
import { OPTION_MARKET_LAYOUT } from './market';
import { INTRUCTION_TAG_LAYOUT } from './layout';
import { TOKEN_PROGRAM_ID } from './utils';

/**
 *
 * OptionsInstruction::InitializeMarket {
 *      /// The amount of the **underlying asset** that derives a single contract
 *      amount_per_contract: u64,
 *      /// The strike price for the new market
 *      strike_price: u64,
 *      /// The Unix timestamp at which the contracts in this market expire
 *      expiration_unix_timestamp: UnixTimestamp,
 *  }
 *
 * UnixTimestamp is really an alias for i64 type.
 */
export const INITIALIZE_MARKET_LAYOUT = struct([
  nu64('amountPerContract'),
  nu64('strikePrice'),
  ns64('expirationUnixTimestamp'),
]);

export const initializeMarketInstruction = async (
  programId: PublicKey, // the deployed program account
  // The public key of the SPL Token Mint for the underlying asset
  underlyingAssetMint: PublicKey,
  // The public key of the SPL Token Mint for the quote asset
  quoteAssetMint: PublicKey,
  // The public key of the SPL Token Mint for the new option SPL token
  optionMintAccount: PublicKey,
  // The public key for a new Account that will store the data for the options market
  optionMarketDataAccount: PublicKey,
  // The public key for a new Account that will be the underlying asset pool
  underlyingAssetPoolAccount: PublicKey,
  amountPerContract: number,
  strikePrice: number,
  expirationUnixTimestamp: number,
) => {
  // Create a u8 buffer that conforms to the InitializeMarket structure
  const initializeMarketBuffer = Buffer.alloc(INITIALIZE_MARKET_LAYOUT.span);
  INITIALIZE_MARKET_LAYOUT.encode(
    {
      amountPerContract,
      strikePrice,
      expirationUnixTimestamp,
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

  // Generate the program derived address needed
  let optionsSplAuthorityPubkey;
  try {
    const [tmpOptionsSplAuthorityPubkey] = await PublicKey.findProgramAddress(
      [optionMintAccount.toBuffer()],
      programId,
    );
    optionsSplAuthorityPubkey = tmpOptionsSplAuthorityPubkey;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('findProgramAddress Error: ', error);
  }

  const instruction = new TransactionInstruction({
    // The order of the accounts must match the instruction.rs implementation
    keys: [
      { pubkey: underlyingAssetMint, isSigner: false, isWritable: false },
      { pubkey: quoteAssetMint, isSigner: false, isWritable: false },
      { pubkey: optionMintAccount, isSigner: false, isWritable: true },
      { pubkey: optionMarketDataAccount, isSigner: false, isWritable: true },
      { pubkey: optionsSplAuthorityPubkey, isSigner: false, isWritable: false },
      {
        pubkey: underlyingAssetPoolAccount,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
    programId,
  });

  return instruction;
};

export const initializeMarket = async (
  connection: Connection,
  payer: Account,
  programId: PublicKey | string, // the deployed program account
  // The public key of the SPL Token Mint for the underlying asset
  underlyingAssetMint: PublicKey,
  // The public key of the SPL Token Mint for the quote asset
  quoteAssetMint: PublicKey,
  amountPerContract: number,
  strikePrice: number,
  expirationUnixTimestamp: number,
) => {
  const programPubkey =
    programId instanceof PublicKey ? programId : new PublicKey(programId);

  const optionMintAccount = new Account();
  const optionMarketDataAccount = new Account();
  const underlyingAssetPoolAccount = new Account();

  const transaction = new Transaction();

  // Create the Option Mint Account with rent exemption
  // Allocate memory for the account
  const optionMintRentBalance = await connection.getMinimumBalanceForRentExemption(
    MintLayout.span,
  );
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: optionMintAccount.publicKey,
      lamports: optionMintRentBalance,
      space: MintLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
  );

  const optionMarketDataRentBalance = await connection.getMinimumBalanceForRentExemption(
    OPTION_MARKET_LAYOUT.span,
  );
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: optionMarketDataAccount.publicKey,
      lamports: optionMarketDataRentBalance,
      space: OPTION_MARKET_LAYOUT.span,
      programId: programPubkey,
    }),
  );

  const assetPoolRentBalance = await connection.getMinimumBalanceForRentExemption(
    AccountLayout.span,
  );
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: underlyingAssetPoolAccount.publicKey,
      lamports: assetPoolRentBalance,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
  );

  const initMarketInstruction = await initializeMarketInstruction(
    programPubkey,
    underlyingAssetMint,
    quoteAssetMint,
    optionMintAccount.publicKey,
    optionMarketDataAccount.publicKey,
    underlyingAssetPoolAccount.publicKey,
    amountPerContract,
    strikePrice,
    expirationUnixTimestamp,
  );

  transaction.add(initMarketInstruction);
  const signers = [
    payer,
    optionMintAccount,
    underlyingAssetPoolAccount,
    optionMarketDataAccount,
  ];
  transaction.feePayer = payer.publicKey;
  const { blockhash } = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.partialSign(...signers.slice(1));

  return {
    transaction,
    signers,
    optionMarketDataAddress: optionMarketDataAccount.publicKey,
  };
};
