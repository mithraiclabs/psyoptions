import {
  Account,
  AccountMeta,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { struct, u8 } from 'buffer-layout';
import { INTRUCTION_TAG_LAYOUT } from './layout';
import { TOKEN_PROGRAM_ID } from './utils';

export const EXCHANGE_WRITER_TOKEN_FOR_QUOTE = struct([u8('bumpSeed')]);

export const exchangeWriterTokenForQuoteInstruction = async ({
  programId,
  optionMarketKey,
  writerTokenMintKey,
  writerTokenSourceKey,
  writerTokenSourceAuthorityKey,
  quoteAssetDestKey,
  quoteAssetPoolKey,
}: {
  programId: PublicKey;
  optionMarketKey: PublicKey;
  writerTokenMintKey: PublicKey;
  writerTokenSourceKey: PublicKey;
  writerTokenSourceAuthorityKey: PublicKey;
  quoteAssetDestKey: PublicKey;
  quoteAssetPoolKey: PublicKey;
}) => {
  const exchangeWriterTokenForQuoteBuffer = Buffer.alloc(
    EXCHANGE_WRITER_TOKEN_FOR_QUOTE.span,
  );
  // Generate the program derived address needed
  const [marketAuthorityKey, bumpSeed] = await PublicKey.findProgramAddress(
    [optionMarketKey.toBuffer()],
    programId,
  );

  EXCHANGE_WRITER_TOKEN_FOR_QUOTE.encode(
    {
      bumpSeed,
    },
    exchangeWriterTokenForQuoteBuffer,
    0,
  );
  /*
   * Generate the instruction tag. 5 is the tag that denotes the
   * ExchangeWriterTokenForQuote instruction The tags can be found the
   * OptionInstruction.unpack function (instruction.rs)
   */
  const tagBuffer = Buffer.alloc(INTRUCTION_TAG_LAYOUT.span);
  INTRUCTION_TAG_LAYOUT.encode(5, tagBuffer, 0);

  // concatentate the tag with the data
  const data = Buffer.concat([tagBuffer, exchangeWriterTokenForQuoteBuffer]);

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
    { pubkey: quoteAssetDestKey, isSigner: false, isWritable: true },
    { pubkey: quoteAssetPoolKey, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    data,
    programId,
  });
};

export const exchangeWriterTokenForQuote = async ({
  connection,
  payer,
  programId,
  optionMarketKey,
  writerTokenMintKey,
  writerTokenSourceKey,
  writerTokenSourceAuthorityKey,
  quoteAssetDestKey,
  quoteAssetPoolKey,
}: {
  connection: Connection;
  payer: Account;
  programId: PublicKey | string;
  optionMarketKey: PublicKey;
  writerTokenMintKey: PublicKey;
  writerTokenSourceKey: PublicKey;
  writerTokenSourceAuthorityKey: PublicKey;
  quoteAssetDestKey: PublicKey;
  quoteAssetPoolKey: PublicKey;
}) => {
  const programPubkey =
    programId instanceof PublicKey ? programId : new PublicKey(programId);

  const transaction = new Transaction();
  const closePositionIx = await exchangeWriterTokenForQuoteInstruction({
    programId: programPubkey,
    optionMarketKey,
    writerTokenMintKey,
    writerTokenSourceKey,
    writerTokenSourceAuthorityKey,
    quoteAssetDestKey,
    quoteAssetPoolKey,
  });
  transaction.add(closePositionIx);
  const signers = [payer];
  transaction.feePayer = payer.publicKey;
  const { blockhash } = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;

  return { transaction, signers };
};
