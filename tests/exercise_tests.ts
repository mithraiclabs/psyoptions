import * as anchor from "@project-serum/anchor";
import assert from "assert";
import { Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import {
  AccountMeta,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
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
  initOptionMarket,
  initSetup,
  wait,
} from "../utils/helpers";
import { OptionMarketV2 } from "../packages/psyoptions-ts/src/types";
import { mintOptionsTx } from "../packages/psyoptions-ts/src";

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
  let optionToken: Token;
  let underlyingAmountPerContract: anchor.BN;
  let quoteAmountPerContract: anchor.BN;
  let optionMarketKey: PublicKey;
  let optionMarket: OptionMarketV2;
  let exerciseFeeKey: PublicKey;
  let exerciserOptionAcct: Keypair;
  let exerciserQuoteAcct: Keypair;
  let exerciserUnderlyingAcct: Keypair;
  let remainingAccounts: AccountMeta[] = [];
  let instructions: TransactionInstruction[] = [];

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

  describe("Non-nft OptionMarket", () => {
    before(async () => {
      // Initialize a new OptionMarket
      ({
        quoteToken,
        underlyingToken,
        optionToken,
        underlyingAmountPerContract,
        quoteAmountPerContract,
        optionMarketKey,
        exerciseFeeKey,
        optionMarket,
        remainingAccounts,
        instructions,
      } = await initSetup(provider, payer, mintAuthority, program));
      await initOptionMarket(
        program,
        payer,
        optionMarket,
        remainingAccounts,
        instructions
      );
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
        new anchor.BN(100)
          .mul(optionMarket.underlyingAmountPerContract)
          .muln(2)
          .toNumber(),
        optionMarket.optionMint,
        optionMarket.writerTokenMint,
        quoteToken
      );
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
      ({
        optionAccount: exerciserOptionAcct,
        quoteAccount: exerciserQuoteAcct,
        underlyingAccount: exerciserUnderlyingAcct,
      } = await createExerciser(
        provider.connection,
        exerciser,
        mintAuthority,
        quoteToken,
        new anchor.BN(100)
          .mul(optionMarket.quoteAmountPerContract)
          .muln(2)
          .toNumber(),
        optionMarket.optionMint,
        underlyingToken.publicKey
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

    it("should be properly setup", async () => {
      const exerciserOption = await optionToken.getAccountInfo(
        exerciserOptionAcct.publicKey
      );
      assert.equal(exerciserOption.amount.toString(), new u64(100).toString());
    });

    describe("proper exercise", () => {
      it("should burn the option token, swap the quote and underlying assets", async () => {
        const optionTokenBefore = await optionToken.getMintInfo();
        const underlyingPoolBefore = await underlyingToken.getAccountInfo(
          optionMarket.underlyingAssetPool
        );
        const quotePoolBefore = await quoteToken.getAccountInfo(
          optionMarket.quoteAssetPool
        );
        const exerciserQuoteBefore = await quoteToken.getAccountInfo(
          exerciserQuoteAcct.publicKey
        );
        try {
          await exerciseOptionTx(
            program,
            size,
            optionMarket.key,
            optionMarket.optionMint,
            exerciser,
            exerciser,
            exerciserOptionAcct.publicKey,
            optionMarket.underlyingAssetPool,
            exerciserUnderlyingAcct.publicKey,
            optionMarket.quoteAssetPool,
            exerciserQuoteAcct.publicKey,
            [
              {
                pubkey: exerciseFeeKey,
                isWritable: true,
                isSigner: false,
              },
            ]
          );
        } catch (err) {
          console.error((err as Error).toString());
          throw err;
        }
        const optionTokenAfter = await optionToken.getMintInfo();
        const optionTokenDiff = optionTokenAfter.supply.sub(
          optionTokenBefore.supply
        );
        assert.equal(optionTokenDiff.toString(), size.neg().toString());

        const underlyingPoolAfter = await underlyingToken.getAccountInfo(
          optionMarket.underlyingAssetPool
        );
        const underlyingPoolDiff = underlyingPoolAfter.amount.sub(
          underlyingPoolBefore.amount
        );
        assert.equal(
          underlyingPoolDiff.toString(),
          size.mul(underlyingAmountPerContract).neg().toString()
        );

        const quotePoolAfter = await quoteToken.getAccountInfo(
          optionMarket.quoteAssetPool
        );
        const quotePoolDiff = quotePoolAfter.amount.sub(quotePoolBefore.amount);
        assert.equal(
          quotePoolDiff.toString(),
          size.mul(quoteAmountPerContract).toString()
        );

        const exerciserQuoteAfter = await quoteToken.getAccountInfo(
          exerciserQuoteAcct.publicKey
        );
        const exerciserQuoteDiff = exerciserQuoteAfter.amount.sub(
          exerciserQuoteBefore.amount
        );
        const exerciseFee = feeAmount(quoteAmountPerContract);
        assert.equal(
          exerciserQuoteDiff.neg().toString(),
          exerciseFee.add(size.mul(quoteAmountPerContract)).toString()
        );
      });
    });
    describe("exercise fee key does not match OptionMarket", () => {
      let badExerciseFeeKey: PublicKey;
      beforeEach(async () => {
        // Create a new token account and set it as the mintFeeKey
        const { tokenAccount } = await initNewTokenAccount(
          provider.connection,
          FEE_OWNER_KEY,
          quoteToken.publicKey,
          payer
        );
        badExerciseFeeKey = tokenAccount.publicKey;
      });
      it("should error", async () => {
        try {
          await exerciseOptionTx(
            program,
            size,
            optionMarketKey,
            optionToken.publicKey,
            exerciser,
            exerciser,
            exerciserOptionAcct.publicKey,
            optionMarket.underlyingAssetPool,
            exerciserUnderlyingAcct.publicKey,
            optionMarket.quoteAssetPool,
            exerciserQuoteAcct.publicKey,
            [
              {
                pubkey: badExerciseFeeKey,
                isWritable: true,
                isSigner: false,
              },
            ]
          );
          assert.ok(false);
        } catch (err) {
          const errMsg =
            "exerciseFee key does not match the value on the OptionMarket";
          assert.equal((err as Error).toString(), errMsg);
        }
      });
    });
    describe("quote asset pool is not the same as the OptionMarket", () => {
      let badQuoteAssetPoolAcct: Keypair;
      beforeEach(async () => {
        // Create a new token account and set it as the mintFeeKey
        const { tokenAccount } = await initNewTokenAccount(
          provider.connection,
          FEE_OWNER_KEY,
          quoteToken.publicKey,
          payer
        );
        badQuoteAssetPoolAcct = tokenAccount;
      });
      it("should error", async () => {
        try {
          await exerciseOptionTx(
            program,
            size,
            optionMarket.key,
            optionMarket.optionMint,
            exerciser,
            exerciser,
            exerciserOptionAcct.publicKey,
            optionMarket.underlyingAssetPool,
            exerciserUnderlyingAcct.publicKey,
            badQuoteAssetPoolAcct.publicKey,
            exerciserQuoteAcct.publicKey,
            [
              {
                pubkey: exerciseFeeKey,
                isWritable: true,
                isSigner: false,
              },
            ]
          );
          assert.ok(false);
        } catch (err) {
          const errMsg =
            "Quote pool account does not match the value on the OptionMarket";
          assert.equal((err as Error).toString(), errMsg);
        }
      });
    });
    describe("Underlying asset pool is not the same as the OptionMarket", () => {
      let badUnderlyingAssetPoolAcct: Keypair;
      beforeEach(async () => {
        // Create a new token account and set it as the mintFeeKey
        const { tokenAccount } = await initNewTokenAccount(
          provider.connection,
          FEE_OWNER_KEY,
          underlyingToken.publicKey,
          payer
        );
        badUnderlyingAssetPoolAcct = tokenAccount;
      });
      it("should error", async () => {
        try {
          await exerciseOptionTx(
            program,
            size,
            optionMarket.key,
            optionMarket.optionMint,
            exerciser,
            exerciser,
            exerciserOptionAcct.publicKey,
            badUnderlyingAssetPoolAcct.publicKey,
            exerciserUnderlyingAcct.publicKey,
            optionMarket.quoteAssetPool,
            exerciserQuoteAcct.publicKey,
            [
              {
                pubkey: exerciseFeeKey,
                isWritable: true,
                isSigner: false,
              },
            ]
          );
          assert.ok(false);
        } catch (err) {
          const errMsg =
            "Underlying pool account does not match the value on the OptionMarket";
          assert.equal((err as Error).toString(), errMsg);
        }
      });
    });
    describe("Underlying destination mint is not the same as the underlying asset", () => {
      let badUnderlyingDest: Keypair;
      beforeEach(async () => {
        // Create a new token account and set it as the mintFeeKey
        const { tokenAccount } = await initNewTokenAccount(
          provider.connection,
          FEE_OWNER_KEY,
          quoteToken.publicKey,
          payer
        );
        badUnderlyingDest = tokenAccount;
      });
      it("should error", async () => {
        try {
          await exerciseOptionTx(
            program,
            size,
            optionMarket.key,
            optionMarket.optionMint,
            exerciser,
            exerciser,
            exerciserOptionAcct.publicKey,
            optionMarket.underlyingAssetPool,
            badUnderlyingDest.publicKey,
            optionMarket.quoteAssetPool,
            exerciserQuoteAcct.publicKey,
            [
              {
                pubkey: exerciseFeeKey,
                isWritable: true,
                isSigner: false,
              },
            ]
          );
          assert.ok(false);
        } catch (err) {
          const errMsg =
            "Underlying destination mint must match underlying asset mint address";
          assert.equal((err as Error).toString(), errMsg);
        }
      });
    });
    describe("OptionToken Mint is not the same as the OptionMarket", () => {
      let badOptionToken: Token;
      beforeEach(async () => {
        // Create a new token account and set it as the mintFeeKey
        const { mintAccount } = await initNewTokenMint(
          provider.connection,
          FEE_OWNER_KEY,
          payer
        );
        badOptionToken = new Token(
          provider.connection,
          mintAccount.publicKey,
          TOKEN_PROGRAM_ID,
          payer
        );
      });
      it("should error", async () => {
        try {
          await exerciseOptionTx(
            program,
            size,
            optionMarket.key,
            badOptionToken.publicKey,
            exerciser,
            exerciser,
            exerciserOptionAcct.publicKey,
            optionMarket.underlyingAssetPool,
            exerciserUnderlyingAcct.publicKey,
            optionMarket.quoteAssetPool,
            exerciserQuoteAcct.publicKey,
            [
              {
                pubkey: exerciseFeeKey,
                isWritable: true,
                isSigner: false,
              },
            ]
          );
          assert.ok(false);
        } catch (err) {
          const errMsg =
            "OptionToken mint does not match the value on the OptionMarket";
          assert.equal((err as Error).toString(), errMsg);
        }
      });
    });
    describe("Fee Owner does not match the program's fee owner", () => {
      let badFeeOwner: Keypair;
      beforeEach(async () => {
        badFeeOwner = new Keypair();
      });
      it("should error", async () => {
        try {
          await exerciseOptionTx(
            program,
            size,
            optionMarket.key,
            optionMarket.optionMint,
            exerciser,
            exerciser,
            exerciserOptionAcct.publicKey,
            optionMarket.underlyingAssetPool,
            exerciserUnderlyingAcct.publicKey,
            optionMarket.quoteAssetPool,
            exerciserQuoteAcct.publicKey,
            [
              {
                pubkey: exerciseFeeKey,
                isWritable: true,
                isSigner: false,
              },
            ],
            { feeOwner: badFeeOwner.publicKey }
          );
          assert.ok(false);
        } catch (err) {
          const errMsg = "Fee owner does not match the program's fee owner";
          assert.equal((err as Error).toString(), errMsg);
        }
      });
    });
  });

  describe("Expired option market", () => {
    before(async () => {
      // Initialize a new OptionMarket
      ({
        quoteToken,
        underlyingToken,
        optionToken,
        underlyingAmountPerContract,
        quoteAmountPerContract,
        optionMarketKey,
        exerciseFeeKey,
        optionMarket,
        remainingAccounts,
        instructions,
      } = await initSetup(provider, payer, mintAuthority, program, {
        // set expiration to 2 seconds from now
        expiration: new anchor.BN(new Date().getTime() / 1000 + 4),
      }));
      await initOptionMarket(
        program,
        payer,
        optionMarket,
        remainingAccounts,
        instructions
      );
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
        new anchor.BN(100)
          .mul(optionMarket.underlyingAmountPerContract)
          .muln(2)
          .toNumber(),
        optionMarket.optionMint,
        optionMarket.writerTokenMint,
        quoteToken
      );
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
      ({
        optionAccount: exerciserOptionAcct,
        quoteAccount: exerciserQuoteAcct,
        underlyingAccount: exerciserUnderlyingAcct,
      } = await createExerciser(
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
        await wait(3000);
        await exerciseOptionTx(
          program,
          size,
          optionMarket.key,
          optionMarket.optionMint,
          exerciser,
          exerciser,
          exerciserOptionAcct.publicKey,
          optionMarket.underlyingAssetPool,
          exerciserUnderlyingAcct.publicKey,
          optionMarket.quoteAssetPool,
          exerciserQuoteAcct.publicKey,
          [
            {
              pubkey: exerciseFeeKey,
              isWritable: true,
              isSigner: false,
            },
          ]
        );
        assert.ok(false);
      } catch (err) {
        const errMsg = "OptionMarket is expired, can't exercise";
        assert.equal((err as Error).toString(), errMsg);
      }
    });
  });
  describe("OptionMarket is for NFT", () => {
    before(async () => {
      // Initialize a new OptionMarket
      ({
        quoteToken,
        underlyingToken,
        optionToken,
        underlyingAmountPerContract,
        quoteAmountPerContract,
        optionMarketKey,
        exerciseFeeKey,
        optionMarket,
        remainingAccounts,
        instructions,
      } = await initSetup(provider, payer, mintAuthority, program, {
        quoteAmountPerContract: new anchor.BN(1),
      }));
      await initOptionMarket(
        program,
        payer,
        optionMarket,
        remainingAccounts,
        instructions
      );
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
        new anchor.BN(100)
          .mul(optionMarket.underlyingAmountPerContract)
          .muln(2)
          .toNumber(),
        optionMarket.optionMint,
        optionMarket.writerTokenMint,
        quoteToken
      );
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
      ({
        optionAccount: exerciserOptionAcct,
        quoteAccount: exerciserQuoteAcct,
        underlyingAccount: exerciserUnderlyingAcct,
      } = await createExerciser(
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
        new u64(1)
      );
      size = new u64(1);
    });
    it("should transfer enough lamports as required by the fee", async () => {
      const exerciserBefore = await provider.connection.getAccountInfo(
        exerciser.publicKey
      );
      const feeOwnerBefore =
        (await provider.connection.getAccountInfo(FEE_OWNER_KEY))?.lamports ||
        0;
      try {
        await exerciseOptionTx(
          program,
          size,
          optionMarket.key,
          optionMarket.optionMint,
          exerciser,
          exerciser,
          exerciserOptionAcct.publicKey,
          optionMarket.underlyingAssetPool,
          exerciserUnderlyingAcct.publicKey,
          optionMarket.quoteAssetPool,
          exerciserQuoteAcct.publicKey,
          [
            {
              pubkey: exerciseFeeKey,
              isWritable: true,
              isSigner: false,
            },
          ]
        );
      } catch (err) {
        console.error((err as Error).toString());
        throw err;
      }
      const exerciserAfter = await provider.connection.getAccountInfo(
        exerciser.publicKey
      );
      const feeOwnerAfter =
        (await provider.connection.getAccountInfo(FEE_OWNER_KEY))?.lamports ||
        0;
      if (!exerciserAfter?.lamports || !exerciserBefore?.lamports) {
        throw new Error("minter has no lamports");
      }
      const exerciserDiff =
        exerciserAfter?.lamports - exerciserBefore?.lamports;
      const feeOwnerDiff = feeOwnerAfter - feeOwnerBefore;
      assert.equal(-exerciserDiff, NFT_MINT_LAMPORTS);
      assert.equal(feeOwnerDiff, NFT_MINT_LAMPORTS);
    });
  });
});
