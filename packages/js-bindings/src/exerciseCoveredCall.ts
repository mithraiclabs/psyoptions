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
import { optionWriterStructArray } from './market';
import { TOKEN_PROGRAM_ID } from './utils';
import { getRandomOptionWriter } from './utils/getRandomOptionWriter';

export const EXERCISE_COVERED_CALL_LAYOUT = struct([
  ...optionWriterStructArray,
  u8('bumpSeed'),
]);

export const exerciseCoveredCallInstruction = async (
  programId: PublicKey,
  optionWriterUnderlyingAssetKey: PublicKey,
  optionWriterQuoteAssetKey: PublicKey,
  optionWriterContractTokenKey: PublicKey,
  optionMintKey: PublicKey,
  optionMarketKey: PublicKey,
  exerciserQuoteAssetKey: PublicKey,
  exerciserUnderlyingAssetKey: PublicKey,
  exerciserQuoteAssetAuthorityKey: PublicKey,
  underlyingAssetPoolKey: PublicKey,
  exerciserContractTokenKey: PublicKey,
  exerciserContractTokenAuthorityKey: PublicKey,
) => {
  const exerciseCoveredCallBuffer = Buffer.alloc(
    EXERCISE_COVERED_CALL_LAYOUT.span,
  );

  // Generate the program derived address needed
  const [
    optionsSplAuthorityPubkey,
    bumpSeed,
  ] = await PublicKey.findProgramAddress([optionMintKey.toBuffer()], programId);
  EXERCISE_COVERED_CALL_LAYOUT.encode(
    {
      bumpSeed,
      underlyingAssetAcctAddress: optionWriterUnderlyingAssetKey.toBuffer(),
      quoteAssetAcctAddress: optionWriterQuoteAssetKey.toBuffer(),
      contractTokenAcctAddress: optionWriterContractTokenKey.toBuffer(),
    },
    exerciseCoveredCallBuffer,
    0,
  );

  /*
   * Generate the instruction tag. 3 is the tag that denotes the ExerciseCoveredCall instructions
   * The tags can be found the OptionInstruction.unpack function (instruction.rs)
   */
  const tagBuffer = Buffer.alloc(INTRUCTION_TAG_LAYOUT.span);
  INTRUCTION_TAG_LAYOUT.encode(3, tagBuffer, 0);

  // concatentate the tag with the data
  const data = Buffer.concat([tagBuffer, exerciseCoveredCallBuffer]);

  const keys: AccountMeta[] = [
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: optionMarketKey, isSigner: false, isWritable: true },
    { pubkey: exerciserQuoteAssetKey, isSigner: false, isWritable: true },
    {
      pubkey: exerciserQuoteAssetAuthorityKey,
      isSigner: true,
      isWritable: false,
    },
    { pubkey: optionWriterQuoteAssetKey, isSigner: false, isWritable: true },
    { pubkey: exerciserUnderlyingAssetKey, isSigner: false, isWritable: true },
    { pubkey: underlyingAssetPoolKey, isSigner: false, isWritable: true },
    { pubkey: optionsSplAuthorityPubkey, isSigner: false, isWritable: false },
    { pubkey: optionMintKey, isSigner: false, isWritable: true },
    { pubkey: exerciserContractTokenKey, isSigner: false, isWritable: true },
    {
      pubkey: exerciserContractTokenAuthorityKey,
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

export const exerciseCoveredCall = async (
  connection: Connection,
  payer: Account,
  programId: PublicKey | string,
  optionWriterUnderlyingAssetKey: PublicKey,
  optionWriterQuoteAssetKey: PublicKey,
  optionWriterContractTokenKey: PublicKey,
  optionMintKey: PublicKey,
  optionMarketKey: PublicKey,
  exerciserQuoteAssetKey: PublicKey,
  exerciserUnderlyingAssetKey: PublicKey,
  exerciserQuoteAssetAuthorityAccount: Account,
  underlyingAssetPoolKey: PublicKey,
  exerciserContractTokenKey: PublicKey,
  exerciserContractTokenAuthorityAccount: Account,
) => {
  const programPubkey =
    programId instanceof PublicKey ? programId : new PublicKey(programId);

  const transaction = new Transaction();
  const exerciseInstruction = await exerciseCoveredCallInstruction(
    programPubkey,
    optionWriterUnderlyingAssetKey,
    optionWriterQuoteAssetKey,
    optionWriterContractTokenKey,
    optionMintKey,
    optionMarketKey,
    exerciserQuoteAssetKey,
    exerciserUnderlyingAssetKey,
    exerciserQuoteAssetAuthorityAccount.publicKey,
    underlyingAssetPoolKey,
    exerciserContractTokenKey,
    exerciserContractTokenAuthorityAccount.publicKey,
  );
  transaction.add(exerciseInstruction);

  const signers = [
    payer,
    exerciserQuoteAssetAuthorityAccount,
    exerciserContractTokenAuthorityAccount,
  ];
  transaction.feePayer = payer.publicKey;
  const { blockhash } = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.partialSign(...signers.slice(1));

  return { transaction, signers };
};

/**
 *  Exercise an Option from a random Option Writer in the registry
 *
 * @param connection solana web3 connection
 * @param payer Account paying for the transaction
 * @param programId Pubkey for the Option Program
 * @param optionMarketKey Pubkey for the Option Market Data Account
 * @param exerciserQuoteAssetKey  Pubkey of where the Quote Asset will be sent from
 * @param exerciserUnderlyingAssetKey  Pubkey of where the Underlying Asset will be sent to
 * @param exerciserQuoteAssetAuthorityAccount Account that owns and can sign TXs on behalf
 * of the Quote Asset Pubkey above
 * @param exerciserContractTokenKey Pubkey for the account to burn the Option Mint from
 * @param exerciserContractTokenAuthorityAccount Account that owns the Pubkey to burn
 * Option Mint from
 */
export const exerciseCoveredCallWithRandomOptionWriter = async (
  connection: Connection,
  payer: Account,
  programId: PublicKey | string,
  optionMarketKey: PublicKey,
  exerciserQuoteAssetKey: PublicKey,
  exerciserUnderlyingAssetKey: PublicKey,
  exerciserQuoteAssetAuthorityAccount: Account,
  exerciserContractTokenKey: PublicKey,
  exerciserContractTokenAuthorityAccount: Account,
) => {
  const [
    optionWriterToExercise,
    optionMarketData,
  ] = await getRandomOptionWriter(connection, optionMarketKey);

  return exerciseCoveredCall(
    connection,
    payer,
    programId,
    new PublicKey(optionWriterToExercise.underlyingAssetAcctAddress),
    new PublicKey(optionWriterToExercise.quoteAssetAcctAddress),
    new PublicKey(optionWriterToExercise.contractTokenAcctAddress),
    new PublicKey(optionMarketData.optionMintAddress),
    optionMarketKey,
    exerciserQuoteAssetKey,
    exerciserUnderlyingAssetKey,
    exerciserQuoteAssetAuthorityAccount,
    new PublicKey(optionMarketData.underlyingAssetPoolAddress),
    exerciserContractTokenKey,
    exerciserContractTokenAuthorityAccount,
  );
};
