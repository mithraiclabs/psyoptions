import {
  Account,
  AccountMeta,
  Connection,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { struct, u8 } from 'buffer-layout';
import { INTRUCTION_TAG_LAYOUT } from './layout';
import { TOKEN_PROGRAM_ID } from './utils';
import { getOptionMarketData } from './utils/getOptionMarketData';

export const EXERCISE_COVERED_CALL_LAYOUT = struct([u8('bumpSeed')]);

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
}: {
  programId: PublicKey;
  optionMintKey: PublicKey;
  optionMarketKey: PublicKey;
  exerciserQuoteAssetKey: PublicKey;
  exerciserUnderlyingAssetKey: PublicKey;
  exerciserQuoteAssetAuthorityKey: PublicKey;
  underlyingAssetPoolKey: PublicKey;
  quoteAssetPoolKey: PublicKey;
  optionTokenKey: PublicKey;
  optionTokenAuthorityKey: PublicKey;
}) => {
  const exerciseCoveredCallBuffer = Buffer.alloc(
    EXERCISE_COVERED_CALL_LAYOUT.span,
  );

  // Generate the program derived address needed
  const [marketAuthorityKey, bumpSeed] = await PublicKey.findProgramAddress(
    [optionMintKey.toBuffer()],
    programId,
  );
  EXERCISE_COVERED_CALL_LAYOUT.encode(
    {
      bumpSeed,
    },
    exerciseCoveredCallBuffer,
    0,
  );

  /*
   * Generate the instruction tag. 3 is the tag that denotes the ExerciseCoveredCall instructions
   * The tags can be found the OptionInstruction.unpack function (instruction.rs)
   */
  const tagBuffer = Buffer.alloc(INTRUCTION_TAG_LAYOUT.span);
  INTRUCTION_TAG_LAYOUT.encode(2, tagBuffer, 0);

  // concatentate the tag with the data
  const data = Buffer.concat([tagBuffer, exerciseCoveredCallBuffer]);

  const keys: AccountMeta[] = [
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
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
  ];

  return new TransactionInstruction({
    keys,
    data,
    programId,
  });
};

export const exerciseCoveredCall = async ({
  connection,
  payer,
  programId,
  optionMintKey,
  optionMarketKey,
  exerciserQuoteAssetKey,
  exerciserUnderlyingAssetKey,
  exerciserQuoteAssetAuthorityAccount,
  underlyingAssetPoolKey,
  quoteAssetPoolKey,
  optionTokenKey,
  optionTokenAuthorityAccount,
}: {
  connection: Connection;
  payer: Account;
  programId: PublicKey | string;
  optionMintKey: PublicKey;
  optionMarketKey: PublicKey;
  exerciserQuoteAssetKey: PublicKey;
  exerciserUnderlyingAssetKey: PublicKey;
  exerciserQuoteAssetAuthorityAccount: Account;
  underlyingAssetPoolKey: PublicKey;
  quoteAssetPoolKey: PublicKey;
  optionTokenKey: PublicKey;
  optionTokenAuthorityAccount: Account;
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
    exerciserQuoteAssetAuthorityKey:
      exerciserQuoteAssetAuthorityAccount.publicKey,
    underlyingAssetPoolKey,
    quoteAssetPoolKey,
    optionTokenKey,
    optionTokenAuthorityKey: optionTokenAuthorityAccount.publicKey,
  });
  transaction.add(exerciseInstruction);

  const signers = [
    payer,
    exerciserQuoteAssetAuthorityAccount,
    optionTokenAuthorityAccount,
  ];
  transaction.feePayer = payer.publicKey;
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
 */
export const exerciseCoveredCallWithMarketKey = async ({
  connection,
  payer,
  programId,
  optionMarketKey,
  exerciserQuoteAssetKey,
  exerciserUnderlyingAssetKey,
  exerciserQuoteAssetAuthorityAccount,
  optionTokenKey,
  optionTokenAuthorityAccount,
}: {
  connection: Connection;
  payer: Account;
  programId: PublicKey | string;
  optionMarketKey: PublicKey;
  exerciserQuoteAssetKey: PublicKey;
  exerciserUnderlyingAssetKey: PublicKey;
  exerciserQuoteAssetAuthorityAccount: Account;
  optionTokenKey: PublicKey;
  optionTokenAuthorityAccount: Account;
}) => {
  const optionMarketData = await getOptionMarketData({
    connection,
    optionMarketKey,
  });

  return exerciseCoveredCall({
    connection,
    payer,
    programId,
    optionMintKey: optionMarketData.optionMintKey,
    optionMarketKey,
    exerciserQuoteAssetKey,
    exerciserUnderlyingAssetKey,
    exerciserQuoteAssetAuthorityAccount,
    underlyingAssetPoolKey: optionMarketData.underlyingAssetPoolKey,
    quoteAssetPoolKey: optionMarketData.quoteAssetPoolKey,
    optionTokenKey,
    optionTokenAuthorityAccount,
  });
};
