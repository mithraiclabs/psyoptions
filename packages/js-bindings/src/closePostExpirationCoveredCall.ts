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

export const CLOSE_POST_EXPIRATION_COVERED_CALL = struct([u8('bumpSeed')]);

export const closePostExpirationCoveredCallInstruction = async ({
  programId,
  optionMarketKey,
  optionMintKey,
  underlyingAssetDestKey,
  underlyingAssetPoolKey,
  writerTokenMintKey,
  writerTokenSourceAuthorityKey,
  writerTokenSourceKey,
}: {
  programId: PublicKey;
  optionMintKey: PublicKey;
  optionMarketKey: PublicKey;
  underlyingAssetPoolKey: PublicKey;
  writerTokenMintKey: PublicKey;
  writerTokenSourceKey: PublicKey;
  writerTokenSourceAuthorityKey: PublicKey;
  underlyingAssetDestKey: PublicKey;
}) => {
  const closePostExpirationBuffer = Buffer.alloc(
    CLOSE_POST_EXPIRATION_COVERED_CALL.span,
  );

  // Generate the program derived address needed
  const [
    optionMintAuthorityPubkey,
    bumpSeed,
  ] = await PublicKey.findProgramAddress([optionMintKey.toBuffer()], programId);

  CLOSE_POST_EXPIRATION_COVERED_CALL.encode(
    {
      bumpSeed,
    },
    closePostExpirationBuffer,
    0,
  );

  /*
   * Generate the instruction tag. 4 is the tag that denotes the ClosePostExpiration instructions
   * The tags can be found the OptionInstruction.unpack function (instruction.rs)
   */
  const tagBuffer = Buffer.alloc(INTRUCTION_TAG_LAYOUT.span);
  INTRUCTION_TAG_LAYOUT.encode(3, tagBuffer, 0);

  // concatentate the tag with the data
  const data = Buffer.concat([tagBuffer, closePostExpirationBuffer]);

  const keys: AccountMeta[] = [
    { pubkey: optionMarketKey, isSigner: false, isWritable: false },
    { pubkey: optionMintKey, isSigner: false, isWritable: false },
    { pubkey: optionMintAuthorityPubkey, isSigner: false, isWritable: false },
    { pubkey: writerTokenMintKey, isSigner: false, isWritable: true },
    { pubkey: writerTokenSourceKey, isSigner: false, isWritable: true },
    {
      pubkey: writerTokenSourceAuthorityKey,
      isSigner: true,
      isWritable: false,
    },
    { pubkey: underlyingAssetDestKey, isSigner: false, isWritable: true },
    { pubkey: underlyingAssetPoolKey, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    data,
    programId,
  });
};

export const closePostExpirationCoveredCall = async ({
  connection,
  payer,
  programId,
  optionMarketKey,
  optionMintKey,
  underlyingAssetPoolKey,
  underlyingAssetDestKey,
  writerTokenMintKey,
  writerTokenSourceAuthorityKey,
  writerTokenSourceKey,
}: {
  connection: Connection;
  payer: Account;
  programId: PublicKey | string;
  optionMintKey: PublicKey;
  optionMarketKey: PublicKey;
  underlyingAssetPoolKey: PublicKey;
  writerTokenMintKey: PublicKey;
  writerTokenSourceKey: PublicKey;
  writerTokenSourceAuthorityKey: PublicKey;
  underlyingAssetDestKey: PublicKey;
}) => {
  const programPubkey =
    programId instanceof PublicKey ? programId : new PublicKey(programId);

  const transaction = new Transaction();
  const closePostExpiration = await closePostExpirationCoveredCallInstruction({
    programId: programPubkey,
    optionMintKey,
    optionMarketKey,
    underlyingAssetPoolKey,
    underlyingAssetDestKey,
    writerTokenMintKey,
    writerTokenSourceAuthorityKey,
    writerTokenSourceKey,
  });
  transaction.add(closePostExpiration);
  const signers = [payer];
  transaction.feePayer = payer.publicKey;
  const { blockhash } = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;

  return { transaction, signers };
};

/**
 * Fetches the underlying asset pool address from on chain for convenience
 * @param connection
 * @param payer
 * @param programId
 * @param optionMarketKey
 */
export const closePostExpirationOption = async ({
  connection,
  payer,
  programId,
  optionMarketKey,
  underlyingAssetDestKey,
  writerTokenSourceAuthorityKey,
  writerTokenSourceKey,
}: {
  connection: Connection;
  payer: Account;
  programId: PublicKey | string;
  optionMarketKey: PublicKey;
  underlyingAssetDestKey: PublicKey;
  writerTokenSourceKey: PublicKey;
  writerTokenSourceAuthorityKey: PublicKey;
}) => {
  const programPubkey =
    programId instanceof PublicKey ? programId : new PublicKey(programId);
  const optionMarketData = await getOptionMarketData(
    connection,
    optionMarketKey,
  );

  const transaction = new Transaction();
  const closePostExpiration = await closePostExpirationCoveredCallInstruction({
    programId: programPubkey,
    optionMarketKey,
    optionMintKey: optionMarketData.optionMintAddress,
    underlyingAssetDestKey,
    underlyingAssetPoolKey: optionMarketData.underlyingAssetPoolAddress,
    writerTokenMintKey: optionMarketData.writerTokenMintKey,
    writerTokenSourceAuthorityKey,
    writerTokenSourceKey,
  });
  transaction.add(closePostExpiration);
  const signers = [payer];
  transaction.feePayer = payer.publicKey;
  const { blockhash } = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;

  return { transaction, signers };
};
