import {
  AccountMeta,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { BN } from '@project-serum/anchor';
import { struct, u8 } from 'buffer-layout';
import { INTRUCTION_TAG_LAYOUT, uint64 } from './layout';
import { TOKEN_PROGRAM_ID } from './utils';

export const EXCHANGE_WRITER_TOKEN_FOR_QUOTE = struct([uint64('size')]);

/**
 * Generate the instruction for `ExchangeWriterTokenForQuote`
 *
 * This instruction will burn a Writer Token and transfer quote asset to the
 * specified account. The amount of quote asset transfered depends on the quote
 * amount per contract, aka `contract size * price`.
 *
 * **Note this instruction can only be called after an option has been exercised**
 *
 * @param programId the public key for the PsyOptions program
 * @param optionMarketKey public key for the opton market
 * @param writerTokenMintKey public key of the writer token mint for the option market
 * @param writerTokenSourceKey public key of the account where the Writer Token will be burned from
 * @param writerTokenSourceAuthorityKey owner of the writerTokenSourceKey, likely the wallet
 * making the transaction
 * @param quoteAssetDestKey public key of the account to send the quote asset to
 * @param quoteAssetPoolKey public key of the quote asset pool
 * for the market, where the asset will be transfered from
 * @param size number of writer tokens to burn to claim for quote asset
 * @returns
 */
export const exchangeWriterTokenForQuoteInstruction = async ({
  programId,
  optionMarketKey,
  writerTokenMintKey,
  writerTokenSourceKey,
  writerTokenSourceAuthorityKey,
  quoteAssetDestKey,
  quoteAssetPoolKey,
  size = new BN(1),
}: {
  programId: PublicKey;
  optionMarketKey: PublicKey;
  writerTokenMintKey: PublicKey;
  writerTokenSourceKey: PublicKey;
  writerTokenSourceAuthorityKey: PublicKey;
  quoteAssetDestKey: PublicKey;
  quoteAssetPoolKey: PublicKey;
  size?: BN;
}) => {
  const exchangeWriterTokeForQuoteIXBuffer = Buffer.alloc(
    EXCHANGE_WRITER_TOKEN_FOR_QUOTE.span,
  );
  // Generate the program derived address needed
  const [marketAuthorityKey] = await PublicKey.findProgramAddress(
    [optionMarketKey.toBuffer()],
    programId,
  );
  EXCHANGE_WRITER_TOKEN_FOR_QUOTE.encode(
    { size },
    exchangeWriterTokeForQuoteIXBuffer,
  );

  /*
   * Generate the instruction tag. 5 is the tag that denotes the
   * ExchangeWriterTokenForQuote instruction The tags can be found the
   * OptionInstruction.unpack function (instruction.rs)
   */
  const tagBuffer = Buffer.alloc(INTRUCTION_TAG_LAYOUT.span);
  INTRUCTION_TAG_LAYOUT.encode(5, tagBuffer, 0);

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
    data: Buffer.concat([tagBuffer, exchangeWriterTokeForQuoteIXBuffer]),
    programId,
  });
};

export const exchangeWriterTokenForQuote = async ({
  connection,
  payerKey,
  programId,
  optionMarketKey,
  writerTokenMintKey,
  writerTokenSourceKey,
  writerTokenSourceAuthorityKey,
  quoteAssetDestKey,
  quoteAssetPoolKey,
  size = new BN(1),
}: {
  connection: Connection;
  payerKey: PublicKey;
  programId: PublicKey | string;
  optionMarketKey: PublicKey;
  writerTokenMintKey: PublicKey;
  writerTokenSourceKey: PublicKey;
  writerTokenSourceAuthorityKey: PublicKey;
  quoteAssetDestKey: PublicKey;
  quoteAssetPoolKey: PublicKey;
  size?: BN;
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
    size,
  });
  transaction.add(closePositionIx);
  const signers: Keypair[] = [];
  transaction.feePayer = payerKey;
  const { blockhash } = await connection.getRecentBlockhash();
  transaction.recentBlockhash = blockhash;

  return { transaction, signers };
};
