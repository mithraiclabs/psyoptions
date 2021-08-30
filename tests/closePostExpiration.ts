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
import { FEE_OWNER_KEY } from "../packages/psyoptions-ts/src/fees";
import {
  closePostExpiration,
  createExerciser,
  createMinter,
  initNewTokenAccount,
  initNewTokenMint,
  initSetup,
  wait,
} from "../utils/helpers";

describe("closePostExpiration", () => {
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
  let minterWriterAcct: Keypair;
  let minterOptionAcct: Keypair;
  let minterUnderlyingAccount: Keypair;
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
  });

  describe("Expired OptionMarket", () => {
    before(async () => {
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
      } = await initSetup(provider, payer, mintAuthority, program, {
        // set expiration to 2 seconds from now
        expiration: new anchor.BN(new Date().getTime() / 1000 + 3),
      }));
      await initOptionMarket();
      // Create a new minter
      ({
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
      ));
      // Mint a bunch of contracts to the minter
      await mintOptionsTx(
        minter,
        minterOptionAcct,
        minterWriterAcct,
        minterUnderlyingAccount,
        { size: new anchor.BN(100) }
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
        new u64(100)
      );
      // Wait so the market is expired
      await wait(3000);
    });
    beforeEach(async () => {
      size = new u64(1);
    });

    describe("proper close post expiration", () => {
      it("should burn the WriteToken and transfer the underlying", async () => {
        const writerToken = new Token(
          provider.connection,
          writerTokenMintAccount.publicKey,
          TOKEN_PROGRAM_ID,
          payer
        );
        const writerMintBefore = await writerToken.getMintInfo();
        const minterUnderlyingBefore = await underlyingToken.getAccountInfo(
          minterUnderlyingAccount.publicKey
        );
        try {
          await closePostExpiration(
            program,
            minter,
            size,
            optionMarketKey,
            writerTokenMintAccount.publicKey,
            minterWriterAcct.publicKey,
            underlyingAssetPoolAccount.publicKey,
            minterUnderlyingAccount.publicKey
          );
        } catch (err) {
          console.error(err.toString());
          throw err;
        }
        const writerMintAfter = await writerToken.getMintInfo();
        const writerMintDiff = writerMintAfter.supply.sub(
          writerMintBefore.supply
        );
        assert.equal(writerMintDiff.toString(), size.neg().toString());

        const minterUnderlyingAfter = await underlyingToken.getAccountInfo(
          minterUnderlyingAccount.publicKey
        );
        const minterUnderlyingDiff = minterUnderlyingAfter.amount.sub(
          minterUnderlyingBefore.amount
        );
        assert.equal(
          minterUnderlyingDiff.toString(),
          size.mul(underlyingAmountPerContract).toString()
        );
      });
    });
    describe("underlying asset pool does not match the OptionMarket", () => {
      let badUnderlyingPool: Keypair;
      before(async () => {
        const { tokenAccount } = await initNewTokenAccount(
          provider.connection,
          payer.publicKey,
          underlyingToken.publicKey,
          payer
        );
        badUnderlyingPool = tokenAccount;
      });
      it("should error", async () => {
        try {
          await closePostExpiration(
            program,
            minter,
            size,
            optionMarketKey,
            writerTokenMintAccount.publicKey,
            minterWriterAcct.publicKey,
            badUnderlyingPool.publicKey,
            minterUnderlyingAccount.publicKey
          );
          assert.ok(false);
        } catch (err) {
          const errorMsg =
            "Underlying pool account does not match the value on the OptionMarket";
          assert.equal(err.toString(), errorMsg);
        }
      });
    });
    describe("Validate the writer mint is the same as the OptionMarket", () => {
      let badWriterMint: Keypair;
      before(async () => {
        const { mintAccount } = await initNewTokenMint(
          provider.connection,
          payer.publicKey,
          payer
        );
        badWriterMint = mintAccount;
      });
      it("should error", async () => {
        try {
          await closePostExpiration(
            program,
            minter,
            size,
            optionMarketKey,
            badWriterMint.publicKey,
            minterWriterAcct.publicKey,
            underlyingAssetPoolAccount.publicKey,
            minterUnderlyingAccount.publicKey
          );
          assert.ok(false);
        } catch (err) {
          const errorMsg =
            "WriterToken mint does not match the value on the OptionMarket";
          assert.equal(err.toString(), errorMsg);
        }
      });
    });
    describe("Validate the underlying destination is the same as the OptionMarket", () => {
      let badUnderlyingDest: Keypair;
      before(async () => {
        const { tokenAccount } = await initNewTokenAccount(
          provider.connection,
          payer.publicKey,
          quoteToken.publicKey,
          payer
        );
        badUnderlyingDest = tokenAccount;
      });
      it("should error", async () => {
        try {
          await closePostExpiration(
            program,
            minter,
            size,
            optionMarketKey,
            writerTokenMintAccount.publicKey,
            minterWriterAcct.publicKey,
            underlyingAssetPoolAccount.publicKey,
            badUnderlyingDest.publicKey
          );
          assert.ok(false);
        } catch (err) {
          const errorMsg =
            "Underlying destination mint must match underlying asset mint address";
          assert.equal(err.toString(), errorMsg);
        }
      });
    });
  });
  describe("Unexpired OptionMarket", () => {
    before(async () => {
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
      } = await initSetup(provider, payer, mintAuthority, program, {
        // set expiration to 2 seconds from now
        expiration: new anchor.BN(new Date().getTime() / 1000 + 600),
      }));
      await initOptionMarket();
      // Create a new minter
      ({
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
      ));
      // Mint a bunch of contracts to the minter
      await mintOptionsTx(
        minter,
        minterOptionAcct,
        minterWriterAcct,
        minterUnderlyingAccount,
        { size: new anchor.BN(100) }
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
        new u64(100)
      );
    });
    beforeEach(async () => {
      size = new u64(1);
    });

    it("should error", async () => {
      try {
        await closePostExpiration(
          program,
          minter,
          size,
          optionMarketKey,
          writerTokenMintAccount.publicKey,
          minterWriterAcct.publicKey,
          underlyingAssetPoolAccount.publicKey,
          minterUnderlyingAccount.publicKey
        );
        assert.ok(false);
      } catch (err) {
        const errorMsg = "OptionMarket has not expired, can't close";
        assert.equal(err.toString(), errorMsg);
      }
    });
  });
});
