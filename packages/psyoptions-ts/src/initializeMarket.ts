import {
  PublicKey,
  Transaction,
  SystemProgram,
  Connection,
  Keypair,
} from '@solana/web3.js';
import {
  AccountLayout,
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

/**
 * Generate and initialize the Accounts to be used for the new option market.
 *
 * @param connection
 * @param payerKey PublicKey to pay for the creation of these new accounts
 */
export const initializeAccountsForMarket = async ({
  connection,
  payerKey,
  optionMarketKey,
  optionMintAccount,
  writerTokenMintAccount,
  underlyingAssetPoolAccount,
  quoteAssetPoolAccount,
}: {
  connection: Connection;
  payerKey: PublicKey;
  optionMarketKey: PublicKey;
  optionMintAccount: Keypair;
  writerTokenMintAccount: Keypair;
  underlyingAssetPoolAccount: Keypair;
  quoteAssetPoolAccount: Keypair;
}) => {
  const transaction = new Transaction();

  // Create the Option Mint Account with rent exemption
  // Allocate memory for the account
  const mintRentBalance = await connection.getMinimumBalanceForRentExemption(
    MintLayout.span,
  );
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: payerKey,
      newAccountPubkey: optionMintAccount.publicKey,
      lamports: mintRentBalance,
      space: MintLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
  );
  transaction.add(
    Token.createInitMintInstruction(
      TOKEN_PROGRAM_ID,
      optionMintAccount.publicKey,
      8,
      optionMarketKey,
      null,
    ),
  );
  // Create the Option Mint Account with rent exemption
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: payerKey,
      newAccountPubkey: writerTokenMintAccount.publicKey,
      lamports: mintRentBalance,
      space: MintLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
  );
  transaction.add(
    Token.createInitMintInstruction(
      TOKEN_PROGRAM_ID,
      writerTokenMintAccount.publicKey,
      8,
      optionMarketKey,
      null,
    ),
  );

  const assetPoolRentBalance =
    await connection.getMinimumBalanceForRentExemption(AccountLayout.span);
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: payerKey,
      newAccountPubkey: underlyingAssetPoolAccount.publicKey,
      lamports: assetPoolRentBalance,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
  );
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: payerKey,
      newAccountPubkey: quoteAssetPoolAccount.publicKey,
      lamports: assetPoolRentBalance,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
  );

  const signers = [
    optionMintAccount,
    writerTokenMintAccount,
    underlyingAssetPoolAccount,
    quoteAssetPoolAccount,
  ];

  return {
    transaction,
    signers,
    optionMintKey: optionMintAccount.publicKey,
    writerTokenMintKey: writerTokenMintAccount.publicKey,
    quoteAssetPoolKey: quoteAssetPoolAccount.publicKey,
    underlyingAssetPoolKey: underlyingAssetPoolAccount.publicKey,
  };
};
