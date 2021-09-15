import {
  AccountMeta,
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import { struct } from 'buffer-layout';
import { INTRUCTION_TAG_LAYOUT, uint64 } from './layout';
import { TOKEN_PROGRAM_ID } from './utils';
import { getOptionMarketData } from './utils/getOptionMarketData';

export const CLOSE_POST_EXPIRATION_COVERED_CALL = struct([uint64('size')]);

/**
 * Generate the instruction for `ClosePostExpiration`
 *
 * This instruction will burn a Writer Token and transfer underlying asset back to the
 * specified account. The amount of underlying asset transfered depends on the underlying
 * amount per contract, aka `contract size`.
 *
 * **Note this instruction can only be called after the option market has expired**
 *
 * @param programId the public key for the PsyOptions program
 * @param optionMarketKey public key for the opton market
 * @param underlyingAssetDestKey public key of the account to send the underlying asset to
 * @param underlyingAssetPoolKey public key of the underlying asset pool
 * for the market, where the asset will be transfered from
 * @param writerTokenMintKey public key of the writer token mint for the option market
 * @param writerTokenSourceKey public key of the account where the Writer Token will be burned from
 * @param writerTokenSourceAuthorityKey owner of the writerTokenSourceKey, likely the wallet
 * making the transaction
 * @param size number of positions to close (writer tokens to burn)
 * @returns
 */
export const closePostExpirationCoveredCallInstruction = async ({
  programId,
  optionMarketKey,
  underlyingAssetDestKey,
  underlyingAssetPoolKey,
  writerTokenMintKey,
  writerTokenSourceAuthorityKey,
  writerTokenSourceKey,
  size = new BN(1),
}: {
  programId: PublicKey;
  optionMarketKey: PublicKey;
  underlyingAssetPoolKey: PublicKey;
  writerTokenMintKey: PublicKey;
  writerTokenSourceKey: PublicKey;
  writerTokenSourceAuthorityKey: PublicKey;
  underlyingAssetDestKey: PublicKey;
  size?: BN;
}) => {
  const closePostExpirationIXBuffer = Buffer.alloc(
    CLOSE_POST_EXPIRATION_COVERED_CALL.span,
  );
  // Generate the program derived address needed
  const [marketAuthorityKey] = await PublicKey.findProgramAddress(
    [optionMarketKey.toBuffer()],
    programId,
  );
  CLOSE_POST_EXPIRATION_COVERED_CALL.encode(
    { size },
    closePostExpirationIXBuffer,
  );

  /*
   * Generate the instruction tag. 3 is the tag that denotes the ClosePostExpiration instructions
   * The tags can be found the OptionInstruction.unpack function (instruction.rs)
   */
  const tagBuffer = Buffer.alloc(INTRUCTION_TAG_LAYOUT.span);
  INTRUCTION_TAG_LAYOUT.encode(3, tagBuffer, 0);

  const keys: AccountMeta[] = [
    { pubkey: optionMarketKey, isSigner: false, isWritable: false },
    { pubkey: marketAuthorityKey, isSigner: false, isWritable: false },
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
    data: Buffer.concat([tagBuffer, closePostExpirationIXBuffer]),
    programId,
  });
};

export const closePostExpirationCoveredCall = async ({
  connection,
  payerKey,
  programId,
  optionMarketKey,
  underlyingAssetPoolKey,
  underlyingAssetDestKey,
  writerTokenMintKey,
  writerTokenSourceAuthorityKey,
  writerTokenSourceKey,
  size = new BN(1),
}: {
  connection: Connection;
  payerKey: PublicKey;
  programId: PublicKey | string;
  optionMintKey: PublicKey;
  optionMarketKey: PublicKey;
  underlyingAssetPoolKey: PublicKey;
  writerTokenMintKey: PublicKey;
  writerTokenSourceKey: PublicKey;
  writerTokenSourceAuthorityKey: PublicKey;
  underlyingAssetDestKey: PublicKey;
  size?: BN;
}) => {
  const programPubkey =
    programId instanceof PublicKey ? programId : new PublicKey(programId);

  const transaction = new Transaction();
  const closePostExpiration = await closePostExpirationCoveredCallInstruction({
    programId: programPubkey,
    optionMarketKey,
    underlyingAssetPoolKey,
    underlyingAssetDestKey,
    writerTokenMintKey,
    writerTokenSourceAuthorityKey,
    writerTokenSourceKey,
    size,
  });
  transaction.add(closePostExpiration);
  const signers: Keypair[] = [];
  transaction.feePayer = payerKey;
  const { blockhash } = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;

  return { transaction, signers };
};

/**
 * Fetches the underlying asset pool address from on chain for convenience
 * @param connection
 * @param payerKey
 * @param programId
 * @param optionMarketKey
 */
export const closePostExpirationOption = async ({
  connection,
  payerKey,
  programId,
  optionMarketKey,
  underlyingAssetDestKey,
  writerTokenSourceAuthorityKey,
  writerTokenSourceKey,
  size = new BN(1),
}: {
  connection: Connection;
  payerKey: PublicKey;
  programId: PublicKey | string;
  optionMarketKey: PublicKey;
  underlyingAssetDestKey: PublicKey;
  writerTokenSourceKey: PublicKey;
  writerTokenSourceAuthorityKey: PublicKey;
  size?: BN;
}) => {
  const programPubkey =
    programId instanceof PublicKey ? programId : new PublicKey(programId);
  const optionMarketData = await getOptionMarketData({
    connection,
    optionMarketKey,
  });

  const transaction = new Transaction();
  const closePostExpiration = await closePostExpirationCoveredCallInstruction({
    programId: programPubkey,
    optionMarketKey,
    underlyingAssetDestKey,
    underlyingAssetPoolKey: optionMarketData.underlyingAssetPoolKey,
    writerTokenMintKey: optionMarketData.writerTokenMintKey,
    writerTokenSourceAuthorityKey,
    writerTokenSourceKey,
    size,
  });
  transaction.add(closePostExpiration);
  const signers: Keypair[] = [];
  transaction.feePayer = payerKey;
  const { blockhash } = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;

  return { transaction, signers };
};
