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
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { getOrAddAssociatedTokenAccountTx } from "../packages/psyoptions-ts/src";
import {
  feeAmountPerContract,
  FEE_OWNER_KEY,
} from "../packages/psyoptions-ts/src/fees";
import { OptionMarketV2 } from "../packages/psyoptions-ts/src/types";

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

/**
 *
 * TODO: This should be transformed to use associated token program accounts. That will make it easier
 *
 * @param connection
 * @param minter
 * @param mintAuthority
 * @param underlyingToken
 * @param underlyingAmount
 * @param optionMint
 * @param writerTokenMint
 * @param quoteToken
 * @param quoteAmount
 * @returns
 */
export const createMinter = async (
  connection: Connection,
  minter: Keypair,
  mintAuthority: Keypair,
  underlyingToken: Token,
  underlyingAmount: number,
  optionMint: PublicKey,
  writerTokenMint: PublicKey,
  quoteToken: Token,
  quoteAmount: number = 0
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

  const quoteAccount = new Keypair();
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: minter.publicKey,
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
    [
      minter,
      underlyingAccount,
      quoteAccount,
      optionAccount,
      writerTokenAccount,
    ],
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

  if (quoteAmount > 0) {
    await quoteToken.mintTo(
      quoteAccount.publicKey,
      mintAuthority,
      [],
      quoteAmount
    );
  }
  return { optionAccount, quoteAccount, underlyingAccount, writerTokenAccount };
};

export const createExerciser = async (
  connection: Connection,
  exerciser: Keypair,
  mintAuthority: Keypair,
  quoteToken: Token,
  quoteAmount: number,
  optionMint: PublicKey,
  underlyingTokenMint: PublicKey
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

  // create an associated token account to hold the underlying tokens
  const underlyingAccount = new Keypair();
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: exerciser.publicKey,
      newAccountPubkey: underlyingAccount.publicKey,
      lamports: assetPoolRentBalance,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    })
  );
  transaction.add(
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      underlyingTokenMint,
      underlyingAccount.publicKey,
      exerciser.publicKey
    )
  );
  await sendAndConfirmTransaction(
    connection,
    transaction,
    [exerciser, quoteAccount, optionAccount, underlyingAccount],
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
  return { optionAccount, quoteAccount, underlyingAccount };
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
  const textEncoder = new TextEncoder();
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
  let remainingAccounts: AccountMeta[] = [];
  let instructions: TransactionInstruction[] = [];
  ({ underlyingToken, quoteToken } = await createUnderlyingAndQuoteMints(
    provider,
    payer,
    mintAuthority
  ));
  [optionMarketKey, bumpSeed] = await anchor.web3.PublicKey.findProgramAddress(
    [
      underlyingToken.publicKey.toBuffer(),
      quoteToken.publicKey.toBuffer(),
      underlyingAmountPerContract.toBuffer("le", 8),
      quoteAmountPerContract.toBuffer("le", 8),
      expiration.toBuffer("le", 8),
    ],
    program.programId
  );

  const [optionMintKey, optionMintBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [optionMarketKey.toBuffer(), textEncoder.encode("optionToken")],
      program.programId
    );

  const [writerMintKey, writerMintBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [optionMarketKey.toBuffer(), textEncoder.encode("writerToken")],
      program.programId
    );
  const [quoteAssetPoolKey, quoteAssetPoolBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [optionMarketKey.toBuffer(), textEncoder.encode("quoteAssetPool")],
      program.programId
    );

  const [underlyingAssetPoolKey, underlyingAssetPoolBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [optionMarketKey.toBuffer(), textEncoder.encode("underlyingAssetPool")],
      program.programId
    );

  // Get the associated fee address if the market requires a fee
  const mintFeePerContract = feeAmountPerContract(underlyingAmountPerContract);
  if (mintFeePerContract.gtn(0)) {
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

  const exerciseFee = feeAmountPerContract(quoteAmountPerContract);
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
  const optionMarket: OptionMarketV2 = {
    key: optionMarketKey,
    optionMint: optionMintKey,
    writerTokenMint: writerMintKey,
    underlyingAssetMint: underlyingToken.publicKey,
    quoteAssetMint: quoteToken.publicKey,
    underlyingAssetPool: underlyingAssetPoolKey,
    quoteAssetPool: quoteAssetPoolKey,
    mintFeeAccount: mintFeeKey,
    exerciseFeeAccount: exerciseFeeKey,
    underlyingAmountPerContract,
    quoteAmountPerContract,
    expirationUnixTimestamp: expiration,
    expired: false,
    bumpSeed,
  };

  const optionToken = new Token(
    provider.connection,
    optionMintKey,
    TOKEN_PROGRAM_ID,
    payer
  );

  return {
    quoteToken,
    underlyingToken,
    optionToken,
    underlyingAmountPerContract,
    quoteAmountPerContract,
    expiration,
    optionMarketKey,
    bumpSeed,
    mintFeeKey,
    exerciseFeeKey,
    optionMintKey,
    writerMintKey,
    underlyingAssetPoolKey,
    quoteAssetPoolKey,
    optionMarket,
    remainingAccounts,
    instructions,
  };
};

export const initOptionMarket = async (
  program: anchor.Program,
  payer: Keypair,
  optionMarket: OptionMarketV2,
  remainingAccounts: AccountMeta[],
  instructions: TransactionInstruction[]
) => {
  await program.rpc.initializeMarket(
    optionMarket.underlyingAmountPerContract,
    optionMarket.quoteAmountPerContract,
    optionMarket.expirationUnixTimestamp,
    optionMarket.bumpSeed,
    {
      accounts: {
        authority: payer.publicKey,
        underlyingAssetMint: optionMarket.underlyingAssetMint,
        quoteAssetMint: optionMarket.quoteAssetMint,
        optionMint: optionMarket.optionMint,
        writerTokenMint: optionMarket.writerTokenMint,
        quoteAssetPool: optionMarket.quoteAssetPool,
        underlyingAssetPool: optionMarket.underlyingAssetPool,
        optionMarket: optionMarket.key,
        feeOwner: FEE_OWNER_KEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
        clock: SYSVAR_CLOCK_PUBKEY,
      },
      remainingAccounts,
      signers: [payer],
      instructions,
    }
  );
};

/**
 *
 * @param program
 * @param size - The amount of option tokens to burn and exercise
 * @param optionMarket - The OptionMarket to exercise on
 * @param optionTokenKey - The key for the OptionToken
 * @param exerciser - The signer that is the exerciser
 * @param exerciserOptionTokenSrc - The publickey for the exerciser's OptionToken account for optionMarket
 * @param underlyingAssetPoolKey - The publickey for the OptionMarket's underlying asset pool
 * @param underlyingAssetDestKey - The publickey of the exerciser's underlying asset account
 * @param quoteAssetPoolKey - The publickey of the OptionMarket's quote asset pool
 * @param quoteAssetSrcKey - The publickey of the exerciser's quote asset account
 * @param opts - override options, usually used for testing
 * @param remainingAccounts
 */
export const exerciseOptionTx = async (
  program: anchor.Program,
  size: anchor.BN,
  optionMarket: PublicKey,
  optionTokenKey: PublicKey,
  exerciser: Keypair,
  optionAuthority: Keypair,
  exerciserOptionTokenSrc: PublicKey,
  underlyingAssetPoolKey: PublicKey,
  underlyingAssetDestKey: PublicKey,
  quoteAssetPoolKey: PublicKey,
  quoteAssetSrcKey: PublicKey,
  remainingAccounts: AccountMeta[],
  opts: { feeOwner?: PublicKey } = {}
) => {
  await program.rpc.exerciseOption(size, {
    accounts: {
      userAuthority: exerciser.publicKey,
      optionAuthority: optionAuthority.publicKey,
      optionMarket,
      optionMint: optionTokenKey,
      exerciserOptionTokenSrc: exerciserOptionTokenSrc,
      underlyingAssetPool: underlyingAssetPoolKey,
      underlyingAssetDest: underlyingAssetDestKey,
      quoteAssetPool: quoteAssetPoolKey,
      quoteAssetSrc: quoteAssetSrcKey,
      feeOwner: opts.feeOwner || FEE_OWNER_KEY,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      clock: SYSVAR_CLOCK_PUBKEY,
    },
    remainingAccounts: remainingAccounts,
    signers: [exerciser],
  });
};

export const closePostExpiration = async (
  program: anchor.Program,
  optionHolder: Keypair,
  size: anchor.BN,
  optionMarket: PublicKey,
  writerTokenMint: PublicKey,
  writerTokenSrc: PublicKey,
  underlyingAssetPool: PublicKey,
  underlyingAssetDest: PublicKey
) => {
  await program.rpc.closePostExpiration(size, {
    accounts: {
      userAuthority: optionHolder.publicKey,
      optionMarket,
      writerTokenMint,
      writerTokenSrc,
      underlyingAssetPool,
      underlyingAssetDest,
      tokenProgram: TOKEN_PROGRAM_ID,
      clock: SYSVAR_CLOCK_PUBKEY,
    },
    signers: [optionHolder],
  });
};

export const closeOptionPosition = async (
  program: anchor.Program,
  minter: Keypair,
  size: anchor.BN,
  optionMarket: PublicKey,
  writerTokenMint: PublicKey,
  writerTokenSrc: PublicKey,
  optionTokenMint: PublicKey,
  optionTokenSrc: PublicKey,
  underlyingAssetPool: PublicKey,
  underlyingAssetDest: PublicKey
) => {
  await program.rpc.closeOptionPosition(size, {
    accounts: {
      userAuthority: minter.publicKey,
      optionMarket,
      writerTokenMint,
      writerTokenSrc,
      optionTokenMint,
      optionTokenSrc,
      underlyingAssetPool,
      underlyingAssetDest,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
    signers: [minter],
  });
};

export const burnWriterForQuote = async (
  program: anchor.Program,
  writer: Keypair,
  size: anchor.BN,
  optionMarket: PublicKey,
  writerTokenMint: PublicKey,
  writerTokenSrc: PublicKey,
  quoteAssetPool: PublicKey,
  writerQuoteDest: PublicKey
) => {
  await program.rpc.burnWriterForQuote(size, {
    accounts: {
      userAuthority: writer.publicKey,
      optionMarket,
      writerTokenMint,
      writerTokenSrc,
      quoteAssetPool,
      writerQuoteDest,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
    signers: [writer],
  });
};
