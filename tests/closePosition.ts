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
  closeOptionPosition,
  createMinter,
  initNewTokenAccount,
  initNewTokenMint,
  initOptionMarket,
  initSetup,
  wait,
} from "../utils/helpers";
import { OptionMarketV2 } from "../packages/psyoptions-ts/src/types";
import { mintOptionsTx } from "../packages/psyoptions-ts/src";

describe("closeOptionPosition", () => {
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
  let optionMarket: OptionMarketV2;
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

  describe("Unexpired OptionMarket", () => {
    before(async () => {
      // Initialize a new OptionMarket
      ({
        quoteToken,
        underlyingToken,
        underlyingAmountPerContract,
        optionMarket,
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
    });
    beforeEach(async () => {
      size = new u64(1);
    });

    describe("proper close position", () => {
      it("should burn the WriteToken + OptionToken and transfer the underlying", async () => {
        const writerToken = new Token(
          provider.connection,
          optionMarket.writerTokenMint,
          TOKEN_PROGRAM_ID,
          payer
        );
        const optionToken = new Token(
          provider.connection,
          optionMarket.optionMint,
          TOKEN_PROGRAM_ID,
          payer
        );
        const writerMintBefore = await writerToken.getMintInfo();
        const optionMintBefore = await optionToken.getMintInfo();
        const minterUnderlyingBefore = await underlyingToken.getAccountInfo(
          minterUnderlyingAccount.publicKey
        );
        try {
          await closeOptionPosition(
            program,
            minter,
            size,
            optionMarket.key,
            optionMarket.writerTokenMint,
            minterWriterAcct.publicKey,
            optionMarket.optionMint,
            minterOptionAcct.publicKey,
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

        const optionMintAfter = await optionToken.getMintInfo();
        const optionMintDiff = optionMintAfter.supply.sub(
          optionMintBefore.supply
        );
        assert.equal(optionMintDiff.neg().toString(), size.toString());

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

    describe("WriterToken mint does not match OptionMarket", () => {
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
          await closeOptionPosition(
            program,
            minter,
            size,
            optionMarket.key,
            badWriterMint.publicKey,
            minterWriterAcct.publicKey,
            optionMarket.optionMint,
            minterOptionAcct.publicKey,
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

    describe("OptionToken mint does not match OptionMarket", () => {
      let badOptionMint: Keypair;
      before(async () => {
        const { mintAccount } = await initNewTokenMint(
          provider.connection,
          payer.publicKey,
          payer
        );
        badOptionMint = mintAccount;
      });
      it("should error", async () => {
        try {
          await closeOptionPosition(
            program,
            minter,
            size,
            optionMarket.key,
            optionMarket.writerTokenMint,
            minterWriterAcct.publicKey,
            badOptionMint.publicKey,
            minterOptionAcct.publicKey,
            optionMarket.underlyingAssetPool,
            minterUnderlyingAccount.publicKey
          );
          assert.ok(false);
        } catch (err) {
          const errorMsg =
            "OptionToken mint does not match the value on the OptionMarket";
          assert.equal((err as Error).toString(), errorMsg);
        }
      });
    });

    describe("Underlying asset pool does not match OptionMarket", () => {
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
          await closeOptionPosition(
            program,
            minter,
            size,
            optionMarket.key,
            optionMarket.writerTokenMint,
            minterWriterAcct.publicKey,
            optionMarket.optionMint,
            minterOptionAcct.publicKey,
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
  });
  describe("Expired OptionMarket", () => {
    before(async () => {
      // Initialize a new OptionMarket
      ({
        quoteToken,
        underlyingToken,
        underlyingAmountPerContract,
        optionMarket,
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
      // Wait till the market is expired
      await wait(3000);
    });
    beforeEach(async () => {
      size = new u64(1);
    });

    describe("proper close position", () => {
      it("should burn the WriteToken + OptionToken and transfer the underlying", async () => {
        const writerToken = new Token(
          provider.connection,
          optionMarket.writerTokenMint,
          TOKEN_PROGRAM_ID,
          payer
        );
        const optionToken = new Token(
          provider.connection,
          optionMarket.optionMint,
          TOKEN_PROGRAM_ID,
          payer
        );
        const writerMintBefore = await writerToken.getMintInfo();
        const optionMintBefore = await optionToken.getMintInfo();
        const minterUnderlyingBefore = await underlyingToken.getAccountInfo(
          minterUnderlyingAccount.publicKey
        );
        try {
          await closeOptionPosition(
            program,
            minter,
            size,
            optionMarket.key,
            optionMarket.writerTokenMint,
            minterWriterAcct.publicKey,
            optionMarket.optionMint,
            minterOptionAcct.publicKey,
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

        const optionMintAfter = await optionToken.getMintInfo();
        const optionMintDiff = optionMintAfter.supply.sub(
          optionMintBefore.supply
        );
        assert.equal(optionMintDiff.neg().toString(), size.toString());

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
  });
});
