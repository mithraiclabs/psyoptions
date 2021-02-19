import {
  Account,
  AccountMeta,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { struct, u8 } from 'buffer-layout';
import { INTRUCTION_TAG_LAYOUT } from './layout';
import { optionWriterStructArray } from './market';
import { TOKEN_PROGRAM_ID } from './utils';

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
      underlyingAssetAcctAddress: optionWriterUnderlyingAssetKey.toBuffer(),
      quoteAssetAcctAddress: optionWriterQuoteAssetKey.toBuffer(),
      contractTokenAcctAddress: optionWriterContractTokenKey.toBuffer(),
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
  ];

  return new TransactionInstruction({
    data,
    keys,
    programId,
  });
};

export const exerciseCoveredCallPostExpiration = async (
  programId: PublicKey | string,
  optionWriterUnderlyingAssetKey: PublicKey,
  optionWriterQuoteAssetKey: PublicKey,
  optionWriterContractTokenKey: PublicKey,
  optionMarketKey: PublicKey,
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
    exerciserQuoteAssetKey,
    exerciserQuoteAssetAuthorityAccount.publicKey,
    exerciserUnderlyingAssetKey,
    underlyingAssetPoolKey,
    optionMintKey,
  );
  transaction.add(exerciseInstruction);

  const signers = [exerciserQuoteAssetAuthorityAccount];

  return { transaction, signers };
};
