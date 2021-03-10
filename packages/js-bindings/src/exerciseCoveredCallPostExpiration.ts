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

export const EXERCISE_COVERED_CALL_POST_EXP_LAYOUT = struct([
  ...optionWriterStructArray,
  u8('bumpSeed'),
]);

export const exerciseCoveredCallPostExpirationInstruction = async (
  programId: PublicKey,
  optionWriterUnderlyingAssetKey: PublicKey,
  optionWriterQuoteAssetKey: PublicKey,
  optionWriterContractTokenKey: PublicKey,
  optionMarketKey: PublicKey,
  optionWriterRegistry: PublicKey,
  exerciserQuoteAssetKey: PublicKey,
  exerciserQuoteAssetAuthorityKey: PublicKey,
  exerciserUnderlyingAssetKey: PublicKey,
  underlyingAssetPoolKey: PublicKey,
  optionMintKey: PublicKey,
) => {
  const exerciseCoveredCallPostExpBuffer = Buffer.alloc(
    EXERCISE_COVERED_CALL_POST_EXP_LAYOUT.span,
  );

  // Generate the program derived address needed
  const [
    optionMintAuthorityPubkey,
    bumpSeed,
  ] = await PublicKey.findProgramAddress([optionMintKey.toBuffer()], programId);
  EXERCISE_COVERED_CALL_POST_EXP_LAYOUT.encode(
    {
      bumpSeed,
      underlyingAssetAcctAddress: optionWriterUnderlyingAssetKey,
      quoteAssetAcctAddress: optionWriterQuoteAssetKey,
      contractTokenAcctAddress: optionWriterContractTokenKey,
    },
    exerciseCoveredCallPostExpBuffer,
    0,
  );

  /*
   * Generate the instruction tag. 2 is the tag that denotes the ExercisePostExpiration instructions
   * The tags can be found the OptionInstruction.unpack function (instruction.rs)
   */
  const tagBuffer = Buffer.alloc(INTRUCTION_TAG_LAYOUT.span);
  INTRUCTION_TAG_LAYOUT.encode(2, tagBuffer, 0);

  // concatentate the tag with the data
  const data = Buffer.concat([tagBuffer, exerciseCoveredCallPostExpBuffer]);

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
    { pubkey: optionMintAuthorityPubkey, isSigner: false, isWritable: false },
    { pubkey: optionMintKey, isSigner: false, isWritable: true },
    { pubkey: optionWriterRegistry, isSigner: false, isWritable: true },
  ];

  return new TransactionInstruction({
    data,
    keys,
    programId,
  });
};

export const exerciseCoveredCallPostExpiration = async (
  connection: Connection,
  payer: Account,
  programId: PublicKey | string,
  optionWriterUnderlyingAssetKey: PublicKey,
  optionWriterQuoteAssetKey: PublicKey,
  optionWriterContractTokenKey: PublicKey,
  optionMarketKey: PublicKey,
  optionWriterRegistry: PublicKey,
  exerciserQuoteAssetKey: PublicKey,
  exerciserQuoteAssetAuthorityAccount: Account,
  exerciserUnderlyingAssetKey: PublicKey,
  underlyingAssetPoolKey: PublicKey,
  optionMintKey: PublicKey,
) => {
  const programPubkey =
    programId instanceof PublicKey ? programId : new PublicKey(programId);

  const transaction = new Transaction();
  const exerciseInstruction = await exerciseCoveredCallPostExpirationInstruction(
    programPubkey,
    optionWriterUnderlyingAssetKey,
    optionWriterQuoteAssetKey,
    optionWriterContractTokenKey,
    optionMarketKey,
    optionWriterRegistry,
    exerciserQuoteAssetKey,
    exerciserQuoteAssetAuthorityAccount.publicKey,
    exerciserUnderlyingAssetKey,
    underlyingAssetPoolKey,
    optionMintKey,
  );
  transaction.add(exerciseInstruction);

  const signers = [payer, exerciserQuoteAssetAuthorityAccount];
  transaction.feePayer = payer.publicKey;
  const { blockhash } = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;

  return { transaction, signers };
};

/**
 * Exercise an Option post expiration from a random Option Writer in the registry
 *
 * @param connection solana web3 connection
 * @param payer Account paying for the transaction
 * @param programId Pubkey for the Option Program
 * @param optionMarketKey Pubkey for the Option Market Data Account
 * @param exerciserQuoteAssetKey  Pubkey of where the Quote Asset will be sent from
 * @param exerciserQuoteAssetAuthorityAccount Account that owns and can sign TXs on behalf
 * of the Quote Asset Pubkey above
 * @param exerciserUnderlyingAssetKey  Pubkey of where the Underlying Asset will be sent to
 */
export const exerciseCoveredCallPostExpirationWithRandomOptionWriter = async (
  connection: Connection,
  payer: Account,
  programId: PublicKey | string,
  optionMarketKey: PublicKey,
  exerciserQuoteAssetKey: PublicKey,
  exerciserQuoteAssetAuthorityAccount: Account,
  exerciserUnderlyingAssetKey: PublicKey,
) => {
  const [
    optionWriterToExercise,
    optionMarketData,
  ] = await getRandomOptionWriter(connection, optionMarketKey);

  return exerciseCoveredCallPostExpiration(
    connection,
    payer,
    programId,
    optionWriterToExercise.underlyingAssetAcctAddress,
    optionWriterToExercise.quoteAssetAcctAddress,
    optionWriterToExercise.contractTokenAcctAddress,
    optionMarketKey,
    optionMarketData.writerRegistryAddress,
    exerciserQuoteAssetKey,
    exerciserQuoteAssetAuthorityAccount,
    exerciserUnderlyingAssetKey,
    optionMarketData.underlyingAssetPoolAddress,
    optionMarketData.optionMintAddress,
  );
};
