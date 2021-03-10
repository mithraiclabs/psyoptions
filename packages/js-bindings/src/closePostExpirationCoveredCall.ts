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

export const CLOSE_POST_EXPIRATION_COVERED_CALL = struct([
  ...optionWriterStructArray,
  u8('bumpSeed'),
]);

export const closePostExpirationCoveredCallInstruction = async (
  programId: PublicKey,
  optionWriterUnderlyingAssetKey: PublicKey,
  optionWriterQuoteAssetKey: PublicKey,
  optionWriterContractTokenKey: PublicKey,
  optionMintKey: PublicKey,
  optionMarketKey: PublicKey,
  underlyingAssetPoolKey: PublicKey,
  optionWriterRegistryKey: PublicKey,
) => {
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
      underlyingAssetAcctAddress: optionWriterUnderlyingAssetKey,
      quoteAssetAcctAddress: optionWriterQuoteAssetKey,
      contractTokenAcctAddress: optionWriterContractTokenKey,
    },
    closePostExpirationBuffer,
    0,
  );

  /*
   * Generate the instruction tag. 4 is the tag that denotes the ClosePostExpiration instructions
   * The tags can be found the OptionInstruction.unpack function (instruction.rs)
   */
  const tagBuffer = Buffer.alloc(INTRUCTION_TAG_LAYOUT.span);
  INTRUCTION_TAG_LAYOUT.encode(4, tagBuffer, 0);

  // concatentate the tag with the data
  const data = Buffer.concat([tagBuffer, closePostExpirationBuffer]);

  const keys: AccountMeta[] = [
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: optionMarketKey, isSigner: false, isWritable: true },
    {
      pubkey: optionWriterUnderlyingAssetKey,
      isSigner: false,
      isWritable: true,
    },
    { pubkey: underlyingAssetPoolKey, isSigner: false, isWritable: true },
    { pubkey: optionMintAuthorityPubkey, isSigner: false, isWritable: false },
    { pubkey: optionMintKey, isSigner: false, isWritable: false },
    { pubkey: optionWriterRegistryKey, isSigner: false, isWritable: true },
  ];

  return new TransactionInstruction({
    keys,
    data,
    programId,
  });
};

export const closePostExpirationCoveredCall = async (
  connection: Connection,
  payer: Account,
  programId: PublicKey | string,
  optionWriterUnderlyingAssetKey: PublicKey,
  optionWriterQuoteAssetKey: PublicKey,
  optionWriterContractTokenKey: PublicKey,
  optionMintKey: PublicKey,
  optionMarketKey: PublicKey,
  underlyingAssetPoolKey: PublicKey,
  optionWriterRegistryKey: PublicKey,
) => {
  const programPubkey =
    programId instanceof PublicKey ? programId : new PublicKey(programId);

  const transaction = new Transaction();
  const closePostExpiration = await closePostExpirationCoveredCallInstruction(
    programPubkey,
    optionWriterUnderlyingAssetKey,
    optionWriterQuoteAssetKey,
    optionWriterContractTokenKey,
    optionMintKey,
    optionMarketKey,
    underlyingAssetPoolKey,
    optionWriterRegistryKey,
  );
  transaction.add(closePostExpiration);
  const signers = [payer];
  transaction.feePayer = payer.publicKey;
  const { blockhash } = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;

  return { transaction, signers };
};
