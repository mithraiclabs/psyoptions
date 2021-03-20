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

export const CLOSE_POSITION = struct([u8('bumpSeed')]);

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
}) => {
  const closePositionBuffer = Buffer.alloc(CLOSE_POSITION.span);
  // Generate the program derived address needed
  const [optionMintAuthorityKey, bumpSeed] = await PublicKey.findProgramAddress(
    [optionMintKey.toBuffer()],
    programId,
  );

  CLOSE_POSITION.encode(
    {
      bumpSeed,
    },
    closePositionBuffer,
    0,
  );
  /*
   * Generate the instruction tag. 4 is the tag that denotes the ClosePosition instruction
   * The tags can be found the OptionInstruction.unpack function (instruction.rs)
   */
  const tagBuffer = Buffer.alloc(INTRUCTION_TAG_LAYOUT.span);
  INTRUCTION_TAG_LAYOUT.encode(4, tagBuffer, 0);

  // concatentate the tag with the data
  const data = Buffer.concat([tagBuffer, closePositionBuffer]);

  const keys: AccountMeta[] = [
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: optionMarketKey, isSigner: false, isWritable: false },
    { pubkey: optionMintKey, isSigner: false, isWritable: true },
    { pubkey: optionMintAuthorityKey, isSigner: false, isWritable: false },
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
    data,
    programId,
  });
};
