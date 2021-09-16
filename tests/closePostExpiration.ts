import * as anchor from "@project-serum/anchor";
import assert from "assert";
import { Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import {
  AccountMeta,
  Keypair,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  closePostExpiration,
  createExerciser,
  createMinter,
  initNewTokenAccount,
  initNewTokenMint,
  initOptionMarket,
  initSetup,
  wait,
} from "../utils/helpers";
import { OptionMarketV2 } from "../packages/psyoptions-ts/src/types";
import { mintOptionsTx } from "../packages/psyoptions-ts/src";

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
  let optionToken: Token;
  let underlyingAmountPerContract: anchor.BN;
  let optionMarket: OptionMarketV2;
  let exerciserOptionAcct: Keypair;
  let remainingAccounts: AccountMeta[] = [];
  let instructions: TransactionInstruction[] = [];

  let minterWriterAcct: Keypair;
  let minterOptionAcct: Keypair;
  let minterUnderlyingAccount: Keypair;
  let size = new u64(1);

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
        optionMarket,
        optionToken,
        remainingAccounts,
        instructions,
      } = await initSetup(provider, payer, mintAuthority, program, {
        // set expiration to 2 seconds from now
        expiration: new anchor.BN(new Date().getTime() / 1000 + 3),
      }));
      await initOptionMarket(
        program,
        payer,
        optionMarket,
        remainingAccounts,
        instructions
      );
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
        new anchor.BN(100)
          .mul(optionMarket.underlyingAmountPerContract)
          .muln(2)
          .toNumber(),
        optionMarket.optionMint,
        optionMarket.writerTokenMint,
        quoteToken
      ));
      // Mint a bunch of contracts to the minter
      await mintOptionsTx(
        program,
        minter,
        minterOptionAcct,
        minterWriterAcct,
        minterUnderlyingAccount,
        new anchor.BN(100),
        optionMarket
      );
      // Create an exerciser
      ({ optionAccount: exerciserOptionAcct } = await createExerciser(
        provider.connection,
        exerciser,
        mintAuthority,
        quoteToken,
        new anchor.BN(100)
          .mul(optionMarket.quoteAmountPerContract)
          .muln(2)
          .toNumber(),
        optionMarket.optionMint,
        optionMarket.underlyingAssetMint
      ));

      // Transfer a options to the exerciser
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
          optionMarket.writerTokenMint,
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
            optionMarket.key,
            optionMarket.writerTokenMint,
            minterWriterAcct.publicKey,
            optionMarket.underlyingAssetPool,
            minterUnderlyingAccount.publicKey
          );
        } catch (err) {
          console.error((err as Error).toString());
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
            optionMarket.key,
            optionMarket.writerTokenMint,
            minterWriterAcct.publicKey,
            badUnderlyingPool.publicKey,
            minterUnderlyingAccount.publicKey
          );
          assert.ok(false);
        } catch (err) {
          const errorMsg =
            "Underlying pool account does not match the value on the OptionMarket";
          assert.equal((err as Error).toString(), errorMsg);
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
            optionMarket.key,
            badWriterMint.publicKey,
            minterWriterAcct.publicKey,
            optionMarket.underlyingAssetPool,
            minterUnderlyingAccount.publicKey
          );
          assert.ok(false);
        } catch (err) {
          const errorMsg =
            "WriterToken mint does not match the value on the OptionMarket";
          assert.equal((err as Error).toString(), errorMsg);
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
            optionMarket.key,
            optionMarket.writerTokenMint,
            minterWriterAcct.publicKey,
            optionMarket.underlyingAssetPool,
            badUnderlyingDest.publicKey
          );
          assert.ok(false);
        } catch (err) {
          const errorMsg =
            "Underlying destination mint must match underlying asset mint address";
          assert.equal((err as Error).toString(), errorMsg);
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
        optionMarket,
        optionToken,
        remainingAccounts,
        instructions,
      } = await initSetup(provider, payer, mintAuthority, program, {
        // set expiration to 2 seconds from now
        expiration: new anchor.BN(new Date().getTime() / 1000 + 600),
      }));
      await initOptionMarket(
        program,
        payer,
        optionMarket,
        remainingAccounts,
        instructions
      );
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
        new anchor.BN(100)
          .mul(optionMarket.underlyingAmountPerContract)
          .muln(2)
          .toNumber(),
        optionMarket.optionMint,
        optionMarket.writerTokenMint,
        quoteToken
      ));
      // Mint a bunch of contracts to the minter
      await mintOptionsTx(
        program,
        minter,
        minterOptionAcct,
        minterWriterAcct,
        minterUnderlyingAccount,
        new anchor.BN(100),
        optionMarket
      );
      // Create an exerciser
      ({ optionAccount: exerciserOptionAcct } = await createExerciser(
        provider.connection,
        exerciser,
        mintAuthority,
        quoteToken,
        new anchor.BN(100)
          .mul(optionMarket.quoteAmountPerContract)
          .muln(2)
          .toNumber(),
        optionMarket.optionMint,
        optionMarket.underlyingAssetMint
      ));

      // Transfer a options to the exerciser
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
          optionMarket.key,
          optionMarket.writerTokenMint,
          minterWriterAcct.publicKey,
          optionMarket.underlyingAssetPool,
          minterUnderlyingAccount.publicKey
        );
        assert.ok(false);
      } catch (err) {
        const errorMsg = "OptionMarket has not expired, can't close";
        assert.equal((err as Error).toString(), errorMsg);
      }
    });
  });
});
