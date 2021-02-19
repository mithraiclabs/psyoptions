import { struct, u8 } from 'buffer-layout';
import {
  Account,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { INTRUCTION_TAG_LAYOUT } from './layout';
import { TOKEN_PROGRAM_ID } from './utils';

export const MINT_COVERED_CALL_LAYOUT = struct([u8('bumpSeed')]);

export const mintCoveredCallInstruction = async (
  programId: PublicKey,
  optionMintAccount: PublicKey,
  mintedOptionDest: PublicKey,
  underlyingAssetSrc: PublicKey,
  underlyingAssetPool: PublicKey,
  quoteAssetDest: PublicKey,
  optionMarket: PublicKey,
  authorityPubkey: PublicKey,
) => {
  const mintCoveredCallBuffer = Buffer.alloc(MINT_COVERED_CALL_LAYOUT.span);
  // Generate the program derived address needed
  const [
    optionsSplAuthorityPubkey,
    bumpSeed,
  ] = await PublicKey.findProgramAddress(
    [optionMintAccount.toBuffer()],
    programId,
  );
  MINT_COVERED_CALL_LAYOUT.encode({ bumpSeed }, mintCoveredCallBuffer, 0);

  /*
   * Generate the instruction tag. 1 is the tag that denotes the MintCoveredCall instructions
   * The tags can be found the OptionInstruction.unpack function (instruction.rs)
   */
  const tagBuffer = Buffer.alloc(INTRUCTION_TAG_LAYOUT.span);
  INTRUCTION_TAG_LAYOUT.encode(0, tagBuffer, 0);

  // concatentate the tag with the data
  const data = Buffer.concat([tagBuffer, mintCoveredCallBuffer]);

  const keys = [
    { pubkey: optionMintAccount, isSigner: false, isWritable: true },
    { pubkey: mintedOptionDest, isSigner: false, isWritable: true },
    { pubkey: underlyingAssetSrc, isSigner: false, isWritable: true },
    { pubkey: underlyingAssetPool, isSigner: false, isWritable: true },
    { pubkey: quoteAssetDest, isSigner: false, isWritable: false },
    { pubkey: optionMarket, isSigner: false, isWritable: true },
    { pubkey: authorityPubkey, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: optionsSplAuthorityPubkey, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    data,
    programId,
  });
};

export const mintCoveredCall = async (
  programId: PublicKey | string,
  optionMintAccount: PublicKey,
  mintedOptionDest: PublicKey,
  underlyingAssetSrc: PublicKey,
  underlyingAssetPool: PublicKey,
  quoteAssetDest: PublicKey,
  optionMarket: PublicKey,
  // The OptionWriter's account that has authority over their underlying asset account
  authorityAccount: Account,
) => {
  const programPubkey =
    programId instanceof PublicKey ? programId : new PublicKey(programId);

  const transaction = new Transaction();
  const mintInstruction = await mintCoveredCallInstruction(
    programPubkey,
    optionMintAccount,
    mintedOptionDest,
    underlyingAssetSrc,
    underlyingAssetPool,
    quoteAssetDest,
    optionMarket,
    authorityAccount.publicKey,
  );
  transaction.add(mintInstruction);

  const signers = [authorityAccount];

  return { transaction, signers };
};
