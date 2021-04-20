import { struct, u8 } from 'buffer-layout';
import {
  Account,
  AccountMeta,
  Connection,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { INTRUCTION_TAG_LAYOUT } from './layout';
import { TOKEN_PROGRAM_ID } from './utils';
import { getOptionMarketData } from './utils/getOptionMarketData';

export const MINT_COVERED_CALL_LAYOUT = struct([]);

/**
 * Generate the instruction for `MintCoveredCall`
 *
 * Mints an Option Token and Writer Token after successfully transfering
 * underlying asset to the option market's pool.
 *
 * @param programId the public key for the PsyOptions program
 * @param optionMarketKey public key for the opton market
 * @param optionMintKey public key of the option token mint for the option market
 * @param mintedOptionDestKey public key where the option will be minted to
 * @param writerTokenDestKey public key where the Writer Token will be minted to
 * @param writerTokenMintKey public key of the Writer Token mint for the option market
 * @param underlyingAssetPoolKey public key of the underlying asset pool
 * for the market, where the asset will be transfered to
 * @param underlyingAssetSrcKey account the underlying asset will be transfered from
 * @param authorityPubkey onwer of the underlyingAssetSrcKey, likely the wallet
 * making the transaction
 * @returns
 */
export const mintCoveredCallInstruction = async ({
  authorityPubkey,
  programId,
  optionMarketKey,
  optionMintKey,
  mintedOptionDestKey,
  writerTokenDestKey,
  writerTokenMintKey,
  underlyingAssetPoolKey,
  underlyingAssetSrcKey,
}: {
  programId: PublicKey;
  // The SPL Mint for the tokens that denote an option contract
  optionMintKey: PublicKey;
  mintedOptionDestKey: PublicKey;
  writerTokenMintKey: PublicKey;
  writerTokenDestKey: PublicKey;
  underlyingAssetSrcKey: PublicKey;
  underlyingAssetPoolKey: PublicKey;
  optionMarketKey: PublicKey;
  authorityPubkey: PublicKey;
}) => {
  // Generate the program derived address needed
  const [marketAuthorityKey] = await PublicKey.findProgramAddress(
    [optionMarketKey.toBuffer()],
    programId,
  );

  /*
   * Generate the instruction tag. 1 is the tag that denotes the MintCoveredCall instructions
   * The tags can be found the OptionInstruction.unpack function (instruction.rs)
   */
  const tagBuffer = Buffer.alloc(INTRUCTION_TAG_LAYOUT.span);
  INTRUCTION_TAG_LAYOUT.encode(1, tagBuffer, 0);

  const keys: AccountMeta[] = [
    { pubkey: optionMintKey, isSigner: false, isWritable: true },
    { pubkey: mintedOptionDestKey, isSigner: false, isWritable: true },
    { pubkey: writerTokenMintKey, isSigner: false, isWritable: true },
    { pubkey: writerTokenDestKey, isSigner: false, isWritable: true },
    { pubkey: underlyingAssetSrcKey, isSigner: false, isWritable: true },
    { pubkey: underlyingAssetPoolKey, isSigner: false, isWritable: true },
    { pubkey: optionMarketKey, isSigner: false, isWritable: false },
    { pubkey: authorityPubkey, isSigner: true, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: marketAuthorityKey, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    data: tagBuffer,
    programId,
  });
};

export const mintCoveredCall = async ({
  authorityAccount,
  connection,
  payer,
  programId,
  mintedOptionDestKey,
  underlyingAssetSrcKey,
  underlyingAssetPoolKey,
  optionMintKey,
  optionMarketKey,
  writerTokenMintKey,
  writerTokenDestKey,
}: {
  connection: Connection;
  payer: Account;
  programId: PublicKey | string;
  mintedOptionDestKey: PublicKey;
  underlyingAssetSrcKey: PublicKey;
  optionMarketKey: PublicKey;
  // The OptionWriter's account that has authority over their underlying asset account
  authorityAccount: Account;
  // The following arguments should be read from the OptionMarket data account
  optionMintKey: PublicKey;
  underlyingAssetPoolKey: PublicKey;
  writerTokenMintKey: PublicKey;
  writerTokenDestKey: PublicKey;
}) => {
  const programPubkey =
    programId instanceof PublicKey ? programId : new PublicKey(programId);

  const transaction = new Transaction();
  const mintInstruction = await mintCoveredCallInstruction({
    programId: programPubkey,
    optionMintKey,
    mintedOptionDestKey,
    writerTokenMintKey,
    writerTokenDestKey,
    underlyingAssetSrcKey,
    underlyingAssetPoolKey,
    optionMarketKey,
    authorityPubkey: authorityAccount.publicKey,
  });
  transaction.add(mintInstruction);

  const signers = [payer];
  transaction.feePayer = payer.publicKey;
  const { blockhash } = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;
  if (payer.publicKey !== authorityAccount.publicKey) {
    signers.push(authorityAccount);
    transaction.partialSign(...signers.slice(1));
  }

  return { transaction, signers };
};

/**
 * This is method is for convenience if the client does not have the
 * OptionMarket data already available.
 */
export const readMarketAndMintCoveredCall = async ({
  connection,
  payer,
  programId,
  mintedOptionDestKey,
  writerTokenDestKey,
  underlyingAssetAuthorityAccount,
  underlyingAssetSrcKey,
  optionMarketKey,
}: {
  connection: Connection;
  payer: Account;
  programId: PublicKey | string;
  mintedOptionDestKey: PublicKey;
  writerTokenDestKey: PublicKey;
  underlyingAssetSrcKey: PublicKey;
  optionMarketKey: PublicKey;
  // The OptionWriter's account that has authority over their underlying asset account
  underlyingAssetAuthorityAccount: Account;
}) => {
  const optionMarketData = await getOptionMarketData({
    connection,
    optionMarketKey,
  });

  return mintCoveredCall({
    connection,
    payer,
    programId,
    mintedOptionDestKey,
    underlyingAssetSrcKey,
    optionMarketKey,
    authorityAccount: underlyingAssetAuthorityAccount,
    optionMintKey: optionMarketData.optionMintKey,
    underlyingAssetPoolKey: optionMarketData.underlyingAssetPoolKey,
    writerTokenMintKey: optionMarketData.writerTokenMintKey,
    writerTokenDestKey,
  });
};
