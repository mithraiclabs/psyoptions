import { BN, Provider } from "@project-serum/anchor";
import {
  AccountLayout,
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID,
  u64,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { initializeAccountsForMarket } from "../packages/psyoptions-ts/src";

export const createUnderlyingAndQuoteMints = async (
  provider: Provider,
  wallet: Keypair,
  mintAuthority: Keypair
) => {
  const underlyingToken = await Token.createMint(
    provider.connection,
    wallet,
    mintAuthority.publicKey,
    null,
    0,
    TOKEN_PROGRAM_ID
  );

  const quoteToken = await Token.createMint(
    provider.connection,
    wallet,
    mintAuthority.publicKey,
    null,
    0,
    TOKEN_PROGRAM_ID
  );
  return {
    quoteToken,
    underlyingToken,
  };
};

export const createAccountsForInitializeMarket = async (
  connection: Connection,
  wallet: Keypair,
  optionMarketKey: PublicKey,
  optionMintAccount: Keypair,
  writerTokenMintAccount: Keypair,
  underlyingAssetPoolAccount: Keypair,
  quoteAssetPoolAccount: Keypair,
  underlyingToken: Token,
  quoteToken: Token
) => {
  const {
    transaction: createAccountsTx,
    signers,
    optionMintKey,
    writerTokenMintKey,
    quoteAssetPoolKey,
    underlyingAssetPoolKey,
  } = await initializeAccountsForMarket({
    connection,
    payerKey: wallet.publicKey,
    optionMarketKey,
    optionMintAccount,
    writerTokenMintAccount,
    underlyingAssetPoolAccount,
    quoteAssetPoolAccount,
    underlyingToken,
    quoteToken,
  });

  try {
    await sendAndConfirmTransaction(
      connection,
      createAccountsTx,
      [wallet, ...signers],
      {
        commitment: "confirmed",
      }
    );
  } catch (error) {
    console.error(error);
  }

  return {
    optionMintKey,
    writerTokenMintKey,
    quoteAssetPoolKey,
    underlyingAssetPoolKey,
  };
};

export const initNewTokenMint = async (
  connection: Connection,
  /** The owner for the new mint account */
  owner: PublicKey,
  wallet: Keypair
) => {
  const mintAccount = new Keypair();
  const transaction = new Transaction();
  // Create the Option Mint Account with rent exemption
  // Allocate memory for the account
  const mintRentBalance = await connection.getMinimumBalanceForRentExemption(
    MintLayout.span
  );

  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: mintAccount.publicKey,
      lamports: mintRentBalance,
      space: MintLayout.span,
      programId: TOKEN_PROGRAM_ID,
    })
  );
  transaction.add(
    Token.createInitMintInstruction(
      TOKEN_PROGRAM_ID,
      mintAccount.publicKey,
      8,
      owner,
      null
    )
  );
  await sendAndConfirmTransaction(
    connection,
    transaction,
    [wallet, mintAccount],
    {
      commitment: "confirmed",
    }
  );
  return {
    mintAccount,
  };
};

export const initNewTokenAccount = async (
  connection: Connection,
  /** The owner for the new mint account */
  owner: PublicKey,
  /** The SPL Token Mint address */
  mint: PublicKey,
  wallet: Keypair
) => {
  const tokenAccount = new Keypair();
  const transaction = new Transaction();

  const assetPoolRentBalance =
    await connection.getMinimumBalanceForRentExemption(AccountLayout.span);
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: wallet.publicKey,
      newAccountPubkey: tokenAccount.publicKey,
      lamports: assetPoolRentBalance,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    })
  );
  transaction.add(
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      mint,
      tokenAccount.publicKey,
      owner
    )
  );
  await sendAndConfirmTransaction(
    connection,
    transaction,
    [wallet, tokenAccount],
    {
      commitment: "confirmed",
    }
  );
  return {
    tokenAccount,
  };
};

export const createMinter = async (
  connection: Connection,
  minter: Keypair,
  mintAuthority: Keypair,
  underlyingToken: Token,
  underlyingAmountPerContract: BN,
  optionMint: PublicKey,
  writerTokenMint: PublicKey
) => {
  const { tokenAccount: underlyingAccount } = await initNewTokenAccount(
    connection,
    minter.publicKey,
    underlyingToken.publicKey,
    minter
  );

  // mint underlying tokens to the minter's account
  await underlyingToken.mintTo(
    underlyingAccount.publicKey,
    mintAuthority,
    [],
    underlyingAmountPerContract.muln(2).toNumber()
  );
  // create an associated token account to hold the options
  const { tokenAccount: optionAccount } = await initNewTokenAccount(
    connection,
    minter.publicKey,
    optionMint,
    minter
  );
  // create an associated token account to hold the writer tokens
  const { tokenAccount: writerTokenAccount } = await initNewTokenAccount(
    connection,
    minter.publicKey,
    writerTokenMint,
    minter
  );
  return { optionAccount, underlyingAccount, writerTokenAccount };
};
