import {
  AccountMeta,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import { struct } from 'buffer-layout';
import { INTRUCTION_TAG_LAYOUT, uint64 } from './layout';
import { TOKEN_PROGRAM_ID } from './utils';

export const CLOSE_POSITION = struct([uint64('size')]);

/**
 * Generate the instruction for `ClosePosition`.
 *
 * This instruction will burn a Writer Token and an Option Token. Upon burning
 * these tokens, the program will transfer the locked underlying asset to the specified
 * public key. The amount of underlying asset transfered depends on the underlying amount
 * per contract, aka `contract size`.
 *
 * @param programId the public key for the PsyOptions program
 * @param optionMarketKey public key for the opton market
 * @param underlyingAssetPoolKey public key of the underlying asset pool
 * for the market, where the asset will be transfered from
 * @param optionMintKey public key of the option token mint for the option market
 * @param optionTokenSrcKey public key of the account where the Option Token will be burned from
 * @param optionTokenSrcAuthKey Onwer of the optionTokenSrcKey, likely the wallet that
 * owns the account
 * @param writerTokenMintKey public key of the writer token mint for the option market
 * @param writerTokenSourceKey public key of the account where the Writer Token will be burned from
 * @param writerTokenSourceAuthorityKey owner of the writerTokenSourceKey, likely the wallet making
 * the transaction
 * @param underlyingAssetDestKey public key of the account to send the underlying asset to
 * @param size number of options & writer tokens to burn
 * @returns
 */
export const closePositionInstruction = async ({
  programId,
  optionMarketKey,
  underlyingAssetPoolKey,
  optionMintKey,
  optionTokenSrcKey,
  optionTokenSrcAuthKey,
  writerTokenMintKey,
  writerTokenSourceKey,
  writerTokenSourceAuthorityKey,
  underlyingAssetDestKey,
  size = new BN(1),
}: {
  programId: PublicKey;
  optionMarketKey: PublicKey;
  underlyingAssetPoolKey: PublicKey;
  optionMintKey: PublicKey;
  optionTokenSrcKey: PublicKey;
  optionTokenSrcAuthKey: PublicKey;
  writerTokenMintKey: PublicKey;
  writerTokenSourceKey: PublicKey;
  writerTokenSourceAuthorityKey: PublicKey;
  underlyingAssetDestKey: PublicKey;
  size?: BN;
}) => {
  const closePositionIXBuffer = Buffer.alloc(CLOSE_POSITION.span);
  // Generate the program derived address needed
  const [marketAuthorityKey] = await PublicKey.findProgramAddress(
    [optionMarketKey.toBuffer()],
    programId,
  );
  CLOSE_POSITION.encode({ size }, closePositionIXBuffer);

  /*
   * Generate the instruction tag. 4 is the tag that denotes the ClosePosition instruction
   * The tags can be found the OptionInstruction.unpack function (instruction.rs)
   */
  const tagBuffer = Buffer.alloc(INTRUCTION_TAG_LAYOUT.span);
  INTRUCTION_TAG_LAYOUT.encode(4, tagBuffer, 0);

  const keys: AccountMeta[] = [
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: optionMarketKey, isSigner: false, isWritable: false },
    { pubkey: optionMintKey, isSigner: false, isWritable: true },
    { pubkey: marketAuthorityKey, isSigner: false, isWritable: false },
    { pubkey: optionTokenSrcKey, isSigner: false, isWritable: true },
    { pubkey: optionTokenSrcAuthKey, isSigner: false, isWritable: false },
    { pubkey: writerTokenMintKey, isSigner: false, isWritable: true },
    { pubkey: writerTokenSourceKey, isSigner: false, isWritable: true },
    {
      pubkey: writerTokenSourceAuthorityKey,
      isSigner: true,
      isWritable: false,
    },
    { pubkey: underlyingAssetDestKey, isSigner: false, isWritable: true },
    { pubkey: underlyingAssetPoolKey, isSigner: false, isWritable: true },
  ];

  return new TransactionInstruction({
    keys,
    data: Buffer.concat([tagBuffer, closePositionIXBuffer]),
    programId,
  });
};

export const closePosition = async ({
  connection,
  payerKey,
  programId,
  optionMarketKey,
  underlyingAssetPoolKey,
  optionMintKey,
  optionTokenSrcKey,
  optionTokenSrcAuthKey,
  writerTokenMintKey,
  writerTokenSourceKey,
  writerTokenSourceAuthorityKey,
  underlyingAssetDestKey,
  size = new BN(1),
}: {
  connection: Connection;
  payerKey: PublicKey;
  programId: PublicKey | string;
  optionMarketKey: PublicKey;
  underlyingAssetPoolKey: PublicKey;
  optionMintKey: PublicKey;
  optionTokenSrcKey: PublicKey;
  optionTokenSrcAuthKey: PublicKey;
  writerTokenMintKey: PublicKey;
  writerTokenSourceKey: PublicKey;
  writerTokenSourceAuthorityKey: PublicKey;
  underlyingAssetDestKey: PublicKey;
  size?: BN;
}) => {
  const programPubkey =
    programId instanceof PublicKey ? programId : new PublicKey(programId);

  const transaction = new Transaction();
  const closePositionIx = await closePositionInstruction({
    programId: programPubkey,
    optionMarketKey,
    underlyingAssetPoolKey,
    optionMintKey,
    optionTokenSrcKey,
    optionTokenSrcAuthKey,
    writerTokenMintKey,
    writerTokenSourceKey,
    writerTokenSourceAuthorityKey,
    underlyingAssetDestKey,
    size,
  });
  transaction.add(closePositionIx);
  const signers: Keypair[] = [];
  transaction.feePayer = payerKey;
  const { blockhash } = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;

  return { transaction, signers };
};
