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

export const MINT_COVERED_CALL_LAYOUT = struct([u8('bumpSeed')]);

export const mintCoveredCallInstruction = async (
  programId: PublicKey,
  // The SPL Mint for the tokens that denote an option contract
  optionMint: PublicKey,
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
  ] = await PublicKey.findProgramAddress([optionMint.toBuffer()], programId);
  MINT_COVERED_CALL_LAYOUT.encode({ bumpSeed }, mintCoveredCallBuffer, 0);

  /*
   * Generate the instruction tag. 1 is the tag that denotes the MintCoveredCall instructions
   * The tags can be found the OptionInstruction.unpack function (instruction.rs)
   */
  const tagBuffer = Buffer.alloc(INTRUCTION_TAG_LAYOUT.span);
  INTRUCTION_TAG_LAYOUT.encode(1, tagBuffer, 0);

  // concatentate the tag with the data
  const data = Buffer.concat([tagBuffer, mintCoveredCallBuffer]);

  const keys: AccountMeta[] = [
    { pubkey: optionMint, isSigner: false, isWritable: true },
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
  connection: Connection,
  payer: Account,
  programId: PublicKey | string,
  mintedOptionDest: PublicKey,
  underlyingAssetSrc: PublicKey,
  quoteAssetDest: PublicKey,
  optionMarket: PublicKey,
  // The OptionWriter's account that has authority over their underlying asset account
  underlyingAssetAuthorityAccount: Account,
  // The following arguments should be read from the OptionMarket data account
  optionMintAddress: PublicKey,
  underlyingAssetPool: PublicKey,
) => {
  const programPubkey =
    programId instanceof PublicKey ? programId : new PublicKey(programId);

  const transaction = new Transaction();
  const mintInstruction = await mintCoveredCallInstruction(
    programPubkey,
    optionMintAddress,
    mintedOptionDest,
    underlyingAssetSrc,
    underlyingAssetPool,
    quoteAssetDest,
    optionMarket,
    underlyingAssetAuthorityAccount.publicKey,
  );
  transaction.add(mintInstruction);

  const signers = [payer];
  transaction.feePayer = payer.publicKey;
  const { blockhash } = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;
  if (payer.publicKey !== underlyingAssetAuthorityAccount.publicKey) {
    signers.push(underlyingAssetAuthorityAccount);
    transaction.partialSign(...signers.slice(1));
  }

  return { transaction, signers };
};

/**
 * This is method is for convenience if the client does not have the
 * OptionMarket data already available.
 */
export const readMarketAndMintCoveredCall = async (
  connection: Connection,
  payer: Account,
  programId: PublicKey | string,
  mintedOptionDest: PublicKey,
  underlyingAssetSrc: PublicKey,
  quoteAssetDest: PublicKey,
  optionMarket: PublicKey,
  // The OptionWriter's account that has authority over their underlying asset account
  underlyingAssetAuthorityAccount: Account,
) => {
  const optionMarketData = await getOptionMarketData(connection, optionMarket);

  return mintCoveredCall(
    connection,
    payer,
    programId,
    mintedOptionDest,
    underlyingAssetSrc,
    quoteAssetDest,
    optionMarket,
    underlyingAssetAuthorityAccount,
    optionMarketData.optionMintAddress,
    optionMarketData.underlyingAssetPoolAddress,
  );
};
