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
  });

  describe("Non-nft OptionMarket", () => {
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
          underlyingAssetPoolAccount.publicKey
        );
        const quotePoolBefore = await quoteToken.getAccountInfo(
          quoteAssetPoolAccount.publicKey
        );
        const exerciserQuoteBefore = await quoteToken.getAccountInfo(
          exerciserQuoteAcct.publicKey
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
            quoteAssetPoolAccount.publicKey,
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

        const quotePoolAfter = await quoteToken.getAccountInfo(
          quoteAssetPoolAccount.publicKey
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
            exerciserOptionAcct.publicKey,
            underlyingAssetPoolAccount.publicKey,
            exerciserUnderlyingAcct.publicKey,
            quoteAssetPoolAccount.publicKey,
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
          assert.equal(err.toString(), errMsg);
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
            optionMarketKey,
            optionToken.publicKey,
            exerciser,
            exerciserOptionAcct.publicKey,
            underlyingAssetPoolAccount.publicKey,
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
          assert.equal(err.toString(), errMsg);
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
            optionMarketKey,
            optionToken.publicKey,
            exerciser,
            exerciserOptionAcct.publicKey,
            badUnderlyingAssetPoolAcct.publicKey,
            exerciserUnderlyingAcct.publicKey,
            quoteAssetPoolAccount.publicKey,
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
          assert.equal(err.toString(), errMsg);
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
            optionMarketKey,
            optionToken.publicKey,
            exerciser,
            exerciserOptionAcct.publicKey,
            underlyingAssetPoolAccount.publicKey,
            badUnderlyingDest.publicKey,
            quoteAssetPoolAccount.publicKey,
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
          assert.equal(err.toString(), errMsg);
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
            optionMarketKey,
            badOptionToken.publicKey,
            exerciser,
            exerciserOptionAcct.publicKey,
            underlyingAssetPoolAccount.publicKey,
            exerciserUnderlyingAcct.publicKey,
            quoteAssetPoolAccount.publicKey,
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
          assert.equal(err.toString(), errMsg);
        }
      });
    });
  });
  describe("OptionMarket is for NFT", () => {
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
        quoteAmountPerContract: new anchor.BN(1),
      }));
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
          optionMarketKey,
          optionToken.publicKey,
          exerciser,
          exerciserOptionAcct.publicKey,
          underlyingAssetPoolAccount.publicKey,
          exerciserUnderlyingAcct.publicKey,
          quoteAssetPoolAccount.publicKey,
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
        console.error(err.toString());
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
