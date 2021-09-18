import { ASSOCIATED_TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
import {
  AccountMeta,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import { struct } from 'buffer-layout';
import { FEE_OWNER_KEY } from './fees';
import { INTRUCTION_TAG_LAYOUT, uint64 } from './layout';
import { TOKEN_PROGRAM_ID } from './utils';
import { getOptionMarketData } from './utils/getOptionMarketData';

export const EXERCISE_COVERED_CALL_LAYOUT = struct([uint64('size')]);

/**
 * Generate the instruction for `ExerciseCoveredCall`.
 *
 * This instruction will burn an Option Token, transfer quote asset
 * to the quote asset pool, and transfer underlying asset from the
 * underlying asset pool to the specified account. The amount of underlying asset
 * transfered depends on the underlying amount per contract, aka `contract size`.
 * The amount of quote asset transfered depends on the quote amount
 * per contract, aka `contract size * price`.
 *
 * **Note this instruction may only be called prior to the option market expiration**
 *
 * @param programId the public key for the PsyOptions program
 * @param optionMintKey public key of the option token mint for the option market
 * @param optionMarketKey public key for the opton market
 * @param exerciserQuoteAssetKey public key where the quote asset will be transfered from
 * @param exerciserUnderlyingAssetKey public key where the underlying asset will be transfered to
 * @param exerciserQuoteAssetAuthorityKey owner of the exerciserQuoteAssetKey, likely the wallet
 * @param underlyingAssetPoolKey public key of the underlying asset pool
 * for the market, where the asset will be transfered from
 * @param quoteAssetPoolKey public key of the quote asset pool
 * for the market, where the asset will be transfered to
 * @param optionTokenKey public key of the account where the Option Token will be burned from
 * @param optionTokenAuthorityKey onwer of the optionTokenKey, likely the wallet
 * @param fundingAccountKey The payer account that is funding the SOL for the TX
 * making the transaction
 * @param quoteAssetMintKey public key for the quote asset mint
 * @param size number of options to exercise
 * @returns
 */
export const exerciseCoveredCallInstruction = async ({
  programId,
  optionMintKey,
  optionMarketKey,
  exerciserQuoteAssetKey,
  exerciserUnderlyingAssetKey,
  exerciserQuoteAssetAuthorityKey,
  underlyingAssetPoolKey,
  quoteAssetPoolKey,
  optionTokenKey,
  optionTokenAuthorityKey,
  fundingAccountKey,
  quoteAssetMintKey,
  size = new BN(1),
}: {
  programId: PublicKey;
  // The payer account that is funding the SOL for the TX
  fundingAccountKey: PublicKey;
  optionMintKey: PublicKey;
  optionMarketKey: PublicKey;
  exerciserQuoteAssetKey: PublicKey;
  exerciserUnderlyingAssetKey: PublicKey;
  exerciserQuoteAssetAuthorityKey: PublicKey;
  underlyingAssetPoolKey: PublicKey;
  quoteAssetPoolKey: PublicKey;
  optionTokenKey: PublicKey;
  optionTokenAuthorityKey: PublicKey;
  quoteAssetMintKey: PublicKey;
  size?: BN;
}) => {
  const exerciseIXBuffer = Buffer.alloc(EXERCISE_COVERED_CALL_LAYOUT.span);
  // Generate the program derived address needed
  const [marketAuthorityKey] = await PublicKey.findProgramAddress(
    [optionMarketKey.toBuffer()],
    programId,
  );
  EXERCISE_COVERED_CALL_LAYOUT.encode({ size }, exerciseIXBuffer);

  /*
   * Generate the instruction tag. 3 is the tag that denotes the ExerciseCoveredCall instructions
   * The tags can be found the OptionInstruction.unpack function (instruction.rs)
   */
  const tagBuffer = Buffer.alloc(INTRUCTION_TAG_LAYOUT.span);
  INTRUCTION_TAG_LAYOUT.encode(2, tagBuffer, 0);

  // Get the associated fee address
  const feeRecipientKey = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    quoteAssetMintKey,
    FEE_OWNER_KEY,
  );

  const keys: AccountMeta[] = [
    { pubkey: fundingAccountKey, isSigner: false, isWritable: true },
    { pubkey: optionMarketKey, isSigner: false, isWritable: false },
    { pubkey: exerciserQuoteAssetKey, isSigner: false, isWritable: true },
    {
      pubkey: exerciserQuoteAssetAuthorityKey,
      isSigner: true,
      isWritable: false,
    },
    { pubkey: exerciserUnderlyingAssetKey, isSigner: false, isWritable: true },
    { pubkey: underlyingAssetPoolKey, isSigner: false, isWritable: true },
    { pubkey: quoteAssetPoolKey, isSigner: false, isWritable: true },
    { pubkey: marketAuthorityKey, isSigner: false, isWritable: false },
    { pubkey: optionMintKey, isSigner: false, isWritable: true },
    { pubkey: optionTokenKey, isSigner: false, isWritable: true },
    {
      pubkey: optionTokenAuthorityKey,
      isSigner: true,
      isWritable: false,
    },
    { pubkey: quoteAssetMintKey, isSigner: false, isWritable: false },
    { pubkey: feeRecipientKey, isSigner: false, isWritable: true },
    { pubkey: FEE_OWNER_KEY, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    data: Buffer.concat([tagBuffer, exerciseIXBuffer]),
    programId,
  });
};

export const exerciseCoveredCall = async ({
  connection,
  payerKey,
  programId,
  optionMintKey,
  optionMarketKey,
  exerciserQuoteAssetKey,
  exerciserUnderlyingAssetKey,
  exerciserQuoteAssetAuthorityKey,
  underlyingAssetPoolKey,
  quoteAssetPoolKey,
  optionTokenKey,
  optionTokenAuthorityKey,
  quoteAssetMintKey,
  size = new BN(1),
}: {
  connection: Connection;
  payerKey: PublicKey;
  programId: PublicKey | string;
  optionMintKey: PublicKey;
  optionMarketKey: PublicKey;
  exerciserQuoteAssetKey: PublicKey;
  exerciserUnderlyingAssetKey: PublicKey;
  exerciserQuoteAssetAuthorityKey: PublicKey;
  underlyingAssetPoolKey: PublicKey;
  quoteAssetPoolKey: PublicKey;
  optionTokenKey: PublicKey;
  optionTokenAuthorityKey: PublicKey;
  quoteAssetMintKey: PublicKey;
  size?: BN;
}) => {
  const programPubkey =
    programId instanceof PublicKey ? programId : new PublicKey(programId);

  const transaction = new Transaction();
  const exerciseInstruction = await exerciseCoveredCallInstruction({
    programId: programPubkey,
    optionMintKey,
    optionMarketKey,
    exerciserQuoteAssetKey,
    exerciserUnderlyingAssetKey,
    exerciserQuoteAssetAuthorityKey,
    underlyingAssetPoolKey,
    quoteAssetPoolKey,
    optionTokenKey,
    optionTokenAuthorityKey,
    fundingAccountKey: payerKey,
    quoteAssetMintKey,
    size,
  });
  transaction.add(exerciseInstruction);

  const signers: Keypair[] = [];
  transaction.feePayer = payerKey;
  const { blockhash } = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;

  return { transaction, signers };
};

/**
 *  Exercise an option
 *
 * @param connection solana web3 connection
 * @param payer Account paying for the transaction
 * @param programId Pubkey for the Option Program
 * @param optionMarketKey Pubkey for the Option Market Data Account
 * @param exerciserQuoteAssetKey  Pubkey of where the Quote Asset will be sent from
 * @param exerciserUnderlyingAssetKey  Pubkey of where the Underlying Asset will be sent to
 * @param exerciserQuoteAssetAuthorityAccount Account that owns and can sign TXs on behalf
 * of the Quote Asset Pubkey above
 * @param optionTokenKey Pubkey for the account to burn the Option Mint from
 * @param optionTokenAuthorityAccount Account that owns the Pubkey to burn
 * Option Mint from
 * @param size number of options to be exercised
 */
export const exerciseCoveredCallWithMarketKey = async ({
  connection,
  payerKey,
  programId,
  optionMarketKey,
  exerciserQuoteAssetKey,
  exerciserUnderlyingAssetKey,
  exerciserQuoteAssetAuthorityKey,
  optionTokenKey,
  optionTokenAuthorityKey,
  size = new BN(1),
}: {
  connection: Connection;
  payerKey: PublicKey;
  programId: PublicKey | string;
  optionMarketKey: PublicKey;
  exerciserQuoteAssetKey: PublicKey;
  exerciserUnderlyingAssetKey: PublicKey;
  exerciserQuoteAssetAuthorityKey: PublicKey;
  optionTokenKey: PublicKey;
  optionTokenAuthorityKey: PublicKey;
  size?: BN;
}) => {
  const optionMarketData = await getOptionMarketData({
    connection,
    optionMarketKey,
  });

  return exerciseCoveredCall({
    connection,
    payerKey,
    programId,
    optionMintKey: optionMarketData.optionMintKey,
    optionMarketKey,
    exerciserQuoteAssetKey,
    exerciserUnderlyingAssetKey,
    exerciserQuoteAssetAuthorityKey,
    underlyingAssetPoolKey: optionMarketData.underlyingAssetPoolKey,
    quoteAssetPoolKey: optionMarketData.quoteAssetPoolKey,
    optionTokenKey,
    optionTokenAuthorityKey,
    quoteAssetMintKey: optionMarketData.quoteAssetMintKey,
    size,
  });
};
