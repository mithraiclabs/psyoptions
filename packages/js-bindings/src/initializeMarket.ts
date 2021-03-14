import BigNumber from 'bignumber.js';
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
import { OPTION_MARKET_LAYOUT, OPTION_WRITER_REGISTRY_LAYOUT } from './market';
import { INTRUCTION_TAG_LAYOUT } from './layout';
import { TOKEN_PROGRAM_ID } from './utils';

/**
 *
 * OptionsInstruction::InitializeMarket {
 *      /// The amount of the **underlying asset** that derives a single contract
 *      amount_per_contract: u64,
 *      /// The quote_amount_per_contract (strike price * amount_per_contract) for the new market
 *      /// i.e. how much quote asset will be swapped when the contract is exercised
 *      quote_amount_per_contract: u64,
 *      /// The Unix timestamp at which the contracts in this market expire
 *      expiration_unix_timestamp: UnixTimestamp,
 *  }
 *
 * UnixTimestamp is really an alias for i64 type.
 */
export const INITIALIZE_MARKET_LAYOUT = struct([
  nu64('amountPerContract'),
  nu64('quoteAmountPerContract'),
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
  // The public key for the new OptionWriterRegistry account
  optionWriterRegistryKey: PublicKey,
  // The amount of underlying asset per contract
  amountPerContract: number,
  // The amount of quote asset required to swap for the underlying asset
  // i.e. amountPerContract * strike price
  quoteAmountPerContract: number,
  expirationUnixTimestamp: number,
) => {
  // Create a u8 buffer that conforms to the InitializeMarket structure
  const initializeMarketBuffer = Buffer.alloc(INITIALIZE_MARKET_LAYOUT.span);
  INITIALIZE_MARKET_LAYOUT.encode(
    {
      amountPerContract,
      quoteAmountPerContract,
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
      { pubkey: optionWriterRegistryKey, isSigner: false, isWritable: false },
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
  underlyingAssetDecimals: number,
  quoteAssetDecimals: number,
  amountPerContract: BigNumber,
  quoteAmountPerContract: BigNumber,
  expirationUnixTimestamp: number,
) => {
  const programPubkey =
    programId instanceof PublicKey ? programId : new PublicKey(programId);

  const optionMintAccount = new Account();
  const optionMarketDataAccount = new Account();
  const underlyingAssetPoolAccount = new Account();
  const optionWriterRegistryAccount = new Account();

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

  // Create the OptionWriterRegistry account
  const writerRegistryRentBalance = await connection.getMinimumBalanceForRentExemption(
    OPTION_WRITER_REGISTRY_LAYOUT.span,
  );
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: optionWriterRegistryAccount.publicKey,
      lamports: writerRegistryRentBalance,
      space: OPTION_WRITER_REGISTRY_LAYOUT.span,
      programId: programPubkey,
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

  // TODO -- can we encode these to the buffer without converting back to the built-in number type?
  const amountPerContractU64 = amountPerContract
    .multipliedBy(new BigNumber(10).pow(underlyingAssetDecimals))
    .toNumber();
  const quoteAmountPerContractU64 = quoteAmountPerContract
    .multipliedBy(new BigNumber(10).pow(quoteAssetDecimals))
    .toNumber();

  const initMarketInstruction = await initializeMarketInstruction(
    programPubkey,
    underlyingAssetMint,
    quoteAssetMint,
    optionMintAccount.publicKey,
    optionMarketDataAccount.publicKey,
    underlyingAssetPoolAccount.publicKey,
    optionWriterRegistryAccount.publicKey,
    amountPerContractU64,
    quoteAmountPerContractU64,
    expirationUnixTimestamp,
  );

  transaction.add(initMarketInstruction);
  const signers = [
    payer,
    optionMintAccount,
    underlyingAssetPoolAccount,
    optionMarketDataAccount,
    optionWriterRegistryAccount,
  ];
  transaction.feePayer = payer.publicKey;
  const { blockhash } = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.partialSign(...signers.slice(1));

  return {
    transaction,
    signers,
    optionMarketDataAddress: optionMarketDataAccount.publicKey,
    optionMintAddress: optionMintAccount.publicKey,
  };
};
