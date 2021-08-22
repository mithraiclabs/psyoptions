import {
  PublicKey,
  Transaction,
  SystemProgram,
  Connection,
  Keypair,
} from '@solana/web3.js';
import {
  AccountLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import BN from 'bn.js';
import { feeAmount, FEE_OWNER_KEY } from './fees';

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
  underlyingToken,
  quoteToken,
  mintFeeKey,
  exerciseFeeKey,
}: {
  connection: Connection;
  payerKey: PublicKey;
  optionMarketKey: PublicKey;
  optionMintAccount: Keypair;
  writerTokenMintAccount: Keypair;
  underlyingAssetPoolAccount: Keypair;
  quoteAssetPoolAccount: Keypair;
  underlyingToken: Token;
  quoteToken: Token;
  mintFeeKey: PublicKey | null;
  exerciseFeeKey: PublicKey | null;
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
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      underlyingToken.publicKey,
      underlyingAssetPoolAccount.publicKey,
      optionMarketKey,
    ),
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
  transaction.add(
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      quoteToken.publicKey,
      quoteAssetPoolAccount.publicKey,
      optionMarketKey,
    ),
  );

  // Create the mint fee account if the key was passed in
  if (mintFeeKey) {
    const ix = await getOrAddAssociatedTokenAccountTx(
      mintFeeKey,
      underlyingToken,
      payerKey,
    );
    if (ix) {
      transaction.add(ix);
    }
  }
  // Create the exercise fee account if it is required && it does not exist yet
  if (exerciseFeeKey) {
    const ix = await getOrAddAssociatedTokenAccountTx(
      exerciseFeeKey,
      quoteToken,
      payerKey,
    );
    if (ix) {
      transaction.add(ix);
    }
  }

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

const getOrAddAssociatedTokenAccountTx = async (
  associatedAddress: PublicKey,
  token: Token,
  payer: PublicKey,
) => {
  // This is the optimum logic, considering TX fee, client-side computation,
  // RPC roundtrips and guaranteed idempotent.
  // Sadly we can't do this atomically;
  try {
    await token.getAccountInfo(associatedAddress);
    return null;
  } catch (err) {
    // INVALID_ACCOUNT_OWNER can be possible if the associatedAddress has
    // already been received some lamports (= became system accounts).
    // Assuming program derived addressing is safe, this is the only case
    // for the INVALID_ACCOUNT_OWNER in this code-path
    if (
      err.message === 'Failed to find account' ||
      err.message === 'Invalid account owner'
    ) {
      // as this isn't atomic, it's possible others can create associated
      // accounts meanwhile
      return Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        token.publicKey,
        associatedAddress,
        FEE_OWNER_KEY,
        payer,
      );
    } else {
      throw err;
    }
  }
};
