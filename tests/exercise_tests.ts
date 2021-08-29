import * as anchor from "@project-serum/anchor";
import assert from "assert";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
  u64,
} from "@solana/spl-token";
import {
  AccountMeta,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  feeAmount,
  FEE_OWNER_KEY,
  NFT_MINT_LAMPORTS,
} from "../packages/psyoptions-ts/src/fees";
import {
  createExerciser,
  createMinter,
  exerciseOptionTx,
  initNewTokenAccount,
  initNewTokenMint,
  initSetup,
  wait,
} from "../utils/helpers";
import { OptionMarketV2 } from "../packages/psyoptions-ts/src/types";

// TODO: Create an exerciser
// TODO: Transfer an option to the exerciser
// TODO: Actually implement the exercise RPC call

describe("exerciseOption", () => {
  const provider = anchor.Provider.env();
  const payer = anchor.web3.Keypair.generate();
  const mintAuthority = anchor.web3.Keypair.generate();
  anchor.setProvider(provider);
  const program = anchor.workspace.PsyAmerican as anchor.Program;

  const minter = anchor.web3.Keypair.generate();
  const exerciser = anchor.web3.Keypair.generate();

  let quoteToken: Token;
  let underlyingToken: Token;
  let underlyingAmountPerContract: anchor.BN;
  let quoteAmountPerContract: anchor.BN;
  let expiration: anchor.BN;
  let optionMarketKey: PublicKey;
  let bumpSeed: number;
  let mintFeeKey: PublicKey | null;
  let exerciseFeeKey: PublicKey;
  let exerciserOptionAcct: Keypair;
  let exerciserQuoteAcct: Keypair;
  let exerciserUnderlyingAcct: Keypair;
  let optionMintAccount: Keypair;
  let writerTokenMintAccount: Keypair;
  let underlyingAssetPoolAccount: Keypair;
  let quoteAssetPoolAccount: Keypair;
  let remainingAccounts: AccountMeta[] = [];
  let instructions: TransactionInstruction[] = [];

  let optionToken: Token;
  let size = new u64(1);

  const initOptionMarket = async () => {
    await program.rpc.initializeMarket(
      underlyingAmountPerContract,
      quoteAmountPerContract,
      expiration,
      bumpSeed,
      {
        accounts: {
          authority: payer.publicKey,
          underlyingAssetMint: underlyingToken.publicKey,
          quoteAssetMint: quoteToken.publicKey,
          optionMint: optionMintAccount.publicKey,
          writerTokenMint: writerTokenMintAccount.publicKey,
          quoteAssetPool: quoteAssetPoolAccount.publicKey,
          underlyingAssetPool: underlyingAssetPoolAccount.publicKey,
          optionMarket: optionMarketKey,
          feeOwner: FEE_OWNER_KEY,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
        },
        remainingAccounts,
        signers: [payer],
        instructions,
      }
    );
  };
  const mintOptionsTx = async (
    minter: Keypair,
    minterOptionAcct: Keypair,
    minterWriterAcct: Keypair,
    minterUnderlyingAccount: Keypair,
    opts: {
      size?: anchor.BN;
      underlyingAssetPoolAccount?: Keypair;
      remainingAccounts?: AccountMeta[];
    } = {}
  ) => {
    await program.rpc.mintOption(opts.size || size, {
      accounts: {
        userAuthority: minter.publicKey,
        underlyingAssetMint: underlyingToken.publicKey,
        underlyingAssetPool: (
          opts.underlyingAssetPoolAccount || underlyingAssetPoolAccount
        ).publicKey,
        underlyingAssetSrc: minterUnderlyingAccount.publicKey,
        optionMint: optionMintAccount.publicKey,
        mintedOptionDest: minterOptionAcct.publicKey,
        writerTokenMint: writerTokenMintAccount.publicKey,
        mintedWriterTokenDest: minterWriterAcct.publicKey,
        optionMarket: optionMarketKey,
        feeOwner: FEE_OWNER_KEY,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        clock: SYSVAR_CLOCK_PUBKEY,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      },
      remainingAccounts: opts.remainingAccounts
        ? opts.remainingAccounts
        : remainingAccounts,
      signers: [minter],
    });
  };
  before(async () => {
    // airdrop SOL to the payer and minter
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        payer.publicKey,
        100 * LAMPORTS_PER_SOL
      ),
      "confirmed"
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        minter.publicKey,
        100 * LAMPORTS_PER_SOL
      ),
      "confirmed"
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        exerciser.publicKey,
        100 * LAMPORTS_PER_SOL
      ),
      "confirmed"
    );
    // Initialize a new OptionMarket
    ({
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
    } = await initSetup(provider, payer, mintAuthority, program));
    await initOptionMarket();
    // Create a new minter
    const {
      optionAccount: minterOptionAcct,
      underlyingAccount: minterUnderlyingAccount,
      writerTokenAccount: minterWriterAcct,
    } = await createMinter(
      provider.connection,
      minter,
      mintAuthority,
      underlyingToken,
      new anchor.BN(100).mul(underlyingAmountPerContract).muln(2).toNumber(),
      optionMintAccount.publicKey,
      writerTokenMintAccount.publicKey
    );
    // Mint a bunch of contracts to the minter
    await mintOptionsTx(
      minter,
      minterOptionAcct,
      minterWriterAcct,
      minterUnderlyingAccount,
      { size: new anchor.BN(10) }
    );
    // Create an exerciser
    ({
      optionAccount: exerciserOptionAcct,
      quoteAccount: exerciserQuoteAcct,
      underlyingAccount: exerciserUnderlyingAcct,
    } = await createExerciser(
      provider.connection,
      exerciser,
      mintAuthority,
      quoteToken,
      new anchor.BN(100).mul(quoteAmountPerContract).muln(2).toNumber(),
      optionMintAccount.publicKey,
      underlyingToken.publicKey
    ));

    // Transfer a options to the exerciser
    optionToken = new Token(
      provider.connection,
      optionMintAccount.publicKey,
      TOKEN_PROGRAM_ID,
      payer
    );
    await optionToken.transfer(
      minterOptionAcct.publicKey,
      exerciserOptionAcct.publicKey,
      minter,
      [],
      new u64(1)
    );
  });
  beforeEach(async () => {
    size = new u64(1);
  });

  it("should be properly setup", async () => {
    const exerciserOption = await optionToken.getAccountInfo(
      exerciserOptionAcct.publicKey
    );
    assert.equal(exerciserOption.amount.toString(), new u64(1).toString());
  });

  describe("proper exercise", () => {
    beforeEach(async () => {});
    it("should burn the option token, swap the quote and underlying assets", async () => {
      const optionTokenBefore = await optionToken.getMintInfo();
      const underlyingPoolBefore = await underlyingToken.getAccountInfo(
        underlyingAssetPoolAccount.publicKey
      );
      try {
        await exerciseOptionTx(
          program,
          size,
          optionMarketKey,
          optionToken.publicKey,
          exerciser,
          exerciserOptionAcct.publicKey,
          underlyingAssetPoolAccount.publicKey,
          exerciserUnderlyingAcct.publicKey,
          []
        );
      } catch (err) {
        console.error(err.toString());
        throw err;
      }
      const optionTokenAfter = await optionToken.getMintInfo();
      const optionTokenDiff = optionTokenAfter.supply.sub(
        optionTokenBefore.supply
      );
      assert.equal(optionTokenDiff.toString(), size.neg().toString());

      const underlyingPoolAfter = await underlyingToken.getAccountInfo(
        underlyingAssetPoolAccount.publicKey
      );
      const underlyingPoolDiff = underlyingPoolAfter.amount.sub(
        underlyingPoolBefore.amount
      );
      assert.equal(
        underlyingPoolDiff.toString(),
        size.mul(underlyingAmountPerContract).neg().toString()
      );
    });
  });
});
