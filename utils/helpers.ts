import * as anchor from "@project-serum/anchor";
import { BN, Provider } from "@project-serum/anchor";
import {
  AccountLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID,
  u64,
} from "@solana/spl-token";
import {
  AccountMeta,
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getOrAddAssociatedTokenAccountTx,
  initializeAccountsForMarket,
} from "../packages/psyoptions-ts/src";
import { feeAmount, FEE_OWNER_KEY } from "../packages/psyoptions-ts/src/fees";

export const wait = (delayMS: number) =>
  new Promise((resolve) => setTimeout(resolve, delayMS));

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
  underlyingAmount: number,
  optionMint: PublicKey,
  writerTokenMint: PublicKey
) => {
  const transaction = new Transaction();

  const underlyingAccount = new Keypair();
  const assetPoolRentBalance =
    await connection.getMinimumBalanceForRentExemption(AccountLayout.span);
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: minter.publicKey,
      newAccountPubkey: underlyingAccount.publicKey,
      lamports: assetPoolRentBalance,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    })
  );
  transaction.add(
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      underlyingToken.publicKey,
      underlyingAccount.publicKey,
      minter.publicKey
    )
  );

  // create an associated token account to hold the options
  const optionAccount = new Keypair();
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: minter.publicKey,
      newAccountPubkey: optionAccount.publicKey,
      lamports: assetPoolRentBalance,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    })
  );
  transaction.add(
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      optionMint,
      optionAccount.publicKey,
      minter.publicKey
    )
  );

  // create an associated token account to hold the writer tokens
  const writerTokenAccount = new Keypair();
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: minter.publicKey,
      newAccountPubkey: writerTokenAccount.publicKey,
      lamports: assetPoolRentBalance,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    })
  );
  transaction.add(
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      writerTokenMint,
      writerTokenAccount.publicKey,
      minter.publicKey
    )
  );
  await sendAndConfirmTransaction(
    connection,
    transaction,
    [minter, underlyingAccount, optionAccount, writerTokenAccount],
    {
      commitment: "confirmed",
    }
  );

  // mint underlying tokens to the minter's account
  await underlyingToken.mintTo(
    underlyingAccount.publicKey,
    mintAuthority,
    [],
    underlyingAmount
  );
  return { optionAccount, underlyingAccount, writerTokenAccount };
};

export const createExerciser = async (
  connection: Connection,
  exerciser: Keypair,
  mintAuthority: Keypair,
  quoteToken: Token,
  quoteAmount: number,
  optionMint: PublicKey,
  writerTokenMint: PublicKey
) => {
  const transaction = new Transaction();

  const quoteAccount = new Keypair();
  const assetPoolRentBalance =
    await connection.getMinimumBalanceForRentExemption(AccountLayout.span);
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: exerciser.publicKey,
      newAccountPubkey: quoteAccount.publicKey,
      lamports: assetPoolRentBalance,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    })
  );
  transaction.add(
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      quoteToken.publicKey,
      quoteAccount.publicKey,
      exerciser.publicKey
    )
  );

  // create an associated token account to hold the options
  const optionAccount = new Keypair();
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: exerciser.publicKey,
      newAccountPubkey: optionAccount.publicKey,
      lamports: assetPoolRentBalance,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    })
  );
  transaction.add(
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      optionMint,
      optionAccount.publicKey,
      exerciser.publicKey
    )
  );

  // create an associated token account to hold the writer tokens
  const writerTokenAccount = new Keypair();
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: exerciser.publicKey,
      newAccountPubkey: writerTokenAccount.publicKey,
      lamports: assetPoolRentBalance,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    })
  );
  transaction.add(
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      writerTokenMint,
      writerTokenAccount.publicKey,
      exerciser.publicKey
    )
  );
  await sendAndConfirmTransaction(
    connection,
    transaction,
    [exerciser, quoteAccount, optionAccount, writerTokenAccount],
    {
      commitment: "confirmed",
    }
  );

  // mint underlying tokens to the minter's account
  await quoteToken.mintTo(
    quoteAccount.publicKey,
    mintAuthority,
    [],
    quoteAmount
  );
  return { optionAccount, quoteAccount, writerTokenAccount };
};

export const initSetup = async (
  provider: anchor.Provider,
  payer: Keypair,
  mintAuthority: Keypair,
  program: anchor.Program,
  opts: {
    underlyingAmountPerContract?: anchor.BN;
    quoteAmountPerContract?: anchor.BN;
    mintFeeToken?: Token;
    exerciseFeeToken?: Token;
    mintFeeOwner?: PublicKey;
    exerciseFeeOwner?: PublicKey;
    expiration?: anchor.BN;
  } = {}
) => {
  let quoteToken: Token;
  let underlyingToken: Token;
  let underlyingAmountPerContract =
    opts.underlyingAmountPerContract || new anchor.BN("10000000000");
  let quoteAmountPerContract =
    opts.quoteAmountPerContract || new anchor.BN("50000000000");
  let expiration =
    opts.expiration || new anchor.BN(new Date().getTime() / 1000 + 3600);
  let optionMarketKey: PublicKey;
  let bumpSeed: number;
  let mintFeeKey = new Keypair().publicKey;
  let exerciseFeeKey = new Keypair().publicKey;
  const optionMintAccount = new Keypair();
  let writerTokenMintAccount = new Keypair();
  let underlyingAssetPoolAccount = new Keypair();
  let quoteAssetPoolAccount = new Keypair();
  let remainingAccounts: AccountMeta[] = [];
  let instructions: TransactionInstruction[] = [];
  try {
    ({ underlyingToken, quoteToken } = await createUnderlyingAndQuoteMints(
      provider,
      payer,
      mintAuthority
    ));
    [optionMarketKey, bumpSeed] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          underlyingToken.publicKey.toBuffer(),
          quoteToken.publicKey.toBuffer(),
          underlyingAmountPerContract.toBuffer("le", 8),
          quoteAmountPerContract.toBuffer("le", 8),
          expiration.toBuffer("le", 8),
        ],
        program.programId
      );

    // Get the associated fee address if the market requires a fee
    const mintFee = feeAmount(underlyingAmountPerContract);
    if (mintFee.gtn(0)) {
      mintFeeKey = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        opts.mintFeeToken?.publicKey || underlyingToken.publicKey,
        opts.mintFeeOwner || FEE_OWNER_KEY
      );
      remainingAccounts.push({
        pubkey: mintFeeKey,
        isWritable: true,
        isSigner: false,
      });
      const ix = await getOrAddAssociatedTokenAccountTx(
        mintFeeKey,
        opts.mintFeeToken || underlyingToken,
        payer.publicKey,
        opts.mintFeeOwner || FEE_OWNER_KEY
      );
      if (ix) {
        instructions.push(ix);
      }
    }

    const exerciseFee = feeAmount(quoteAmountPerContract);
    if (exerciseFee.gtn(0)) {
      exerciseFeeKey = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        opts.exerciseFeeToken?.publicKey || quoteToken.publicKey,
        opts.exerciseFeeOwner || FEE_OWNER_KEY
      );
      remainingAccounts.push({
        pubkey: exerciseFeeKey,
        isWritable: false,
        isSigner: false,
      });
      const ix = await getOrAddAssociatedTokenAccountTx(
        exerciseFeeKey,
        opts.exerciseFeeToken || quoteToken,
        payer.publicKey,
        opts.exerciseFeeOwner || FEE_OWNER_KEY
      );
      if (ix) {
        instructions.push(ix);
      }
    }

    await createAccountsForInitializeMarket(
      provider.connection,
      payer,
      optionMarketKey,
      optionMintAccount,
      writerTokenMintAccount,
      underlyingAssetPoolAccount,
      quoteAssetPoolAccount,
      underlyingToken,
      quoteToken
    );
  } catch (err) {
    console.error(err);
    throw err;
  }
  return {
    quoteToken,
    underlyingToken,
    underlyingAmountPerContract,
    quoteAmountPerContract,
    expiration,
    optionMarketKey,
    bumpSeed,
    mintFeeKey,
    exerciseFeeKey,
    optionMintAccount,
    writerTokenMintAccount,
    underlyingAssetPoolAccount,
    quoteAssetPoolAccount,
    remainingAccounts,
    instructions,
  };
};
/**
 *
 * @param program
 * @param size - The amount of option tokens to burn and exercise
 * @param optionMarket - The OptionMarket to exercise on
 * @param optionTokenKey - The key for the OptionToken
 * @param exerciser - The signer that is the exerciser
 * @param exerciserOptionTokenSrc - The publickey for the exerciser's OptionToken account for optionMarket
 * @param remainingAccounts
 */
export const exerciseOptionTx = async (
  program: anchor.Program,
  size: anchor.BN,
  optionMarket: PublicKey,
  optionTokenKey: PublicKey,
  exerciser: Keypair,
  exerciserOptionTokenSrc: PublicKey,
  remainingAccounts: AccountMeta[]
) => {
  await program.rpc.exerciseOption(size, {
    accounts: {
      userAuthority: exerciser.publicKey,
      optionMarket,
      optionMint: optionTokenKey,
      exerciserOptionTokenSrc: exerciserOptionTokenSrc,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
    remainingAccounts: remainingAccounts,
    signers: [exerciser],
  });
};
