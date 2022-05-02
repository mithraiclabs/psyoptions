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
  burnWriterForQuote,
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
import { AnchorError, Program } from "@project-serum/anchor";
import { PsyAmerican } from "../target/types/psy_american";

// TODO: exercise a token so there are quote assets in the pool

describe("burnWriterForQuote", () => {
  const payer = anchor.web3.Keypair.generate();
  const mintAuthority = anchor.web3.Keypair.generate();
  const program = anchor.workspace.PsyAmerican as Program<PsyAmerican>;
  const provider = program.provider;

  const minter = anchor.web3.Keypair.generate();
  const exerciser = anchor.web3.Keypair.generate();

  let quoteToken: Token;
  let underlyingToken: Token;
  let writerToken: Token;
  let underlyingAmountPerContract: anchor.BN;
  let quoteAmountPerContract: anchor.BN;
  let optionMarketKey: PublicKey;
  let optionMarket: OptionMarketV2;
  let exerciseFeeKey: PublicKey;
  let optionMintAccount: Keypair;
  let writerTokenMintAccount: Keypair;
  let underlyingAssetPoolAccount: Keypair;
  let quoteAssetPoolAccount: Keypair;
  let remainingAccounts: AccountMeta[] = [];
  let instructions: TransactionInstruction[] = [];

  let minterWriterAcct: Keypair;
  let minterOptionAcct: Keypair;
  let minterUnderlyingAccount: Keypair;
  let minterQuoteAccount: Keypair;
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
        quoteAmountPerContract,
        optionMarketKey,
        exerciseFeeKey,
        optionMarket,
        remainingAccounts,
        instructions,
      } = await initSetup(provider, payer, mintAuthority, program, {
        // set expiration to 2 seconds from now
        expiration: new anchor.BN(new Date().getTime() / 1000 + 600),
      }));
      writerToken = new Token(
        provider.connection,
        optionMarket.writerTokenMint,
        TOKEN_PROGRAM_ID,
        payer
      );
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
        quoteAccount: minterQuoteAccount,
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

    describe("No quotes in pool", () => {
      it("should error", async () => {
        try {
          await burnWriterForQuote(
            program,
            minter,
            size,
            optionMarket.key,
            optionMarket.writerTokenMint,
            minterWriterAcct.publicKey,
            optionMarket.quoteAssetPool,
            minterQuoteAccount.publicKey
          );
          assert.ok(false);
        } catch (err) {
          const errMsg = "Not enough assets in the quote asset pool";
          assert.equal((err as AnchorError).error.errorMessage, errMsg);
        }
      });
    });
    describe("someone has exercised", () => {
      before(async () => {
        const optionToken = new Token(
          provider.connection,
          optionMarket.optionMint,
          TOKEN_PROGRAM_ID,
          payer
        );
        // Create an exerciser
        const {
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
        );
        // Transfer options to the exerciser
        await optionToken.transfer(
          minterOptionAcct.publicKey,
          exerciserOptionAcct.publicKey,
          minter,
          [],
          new u64(100)
        );
        // exercise 100 options so there's plenty of quote assets in the pool
        await exerciseOptionTx(
          program,
          new anchor.BN(100),
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
      });
      describe("proper burn writer for quote", () => {
        it("should burn the WriteToken and transfer the quote assets", async () => {
          const writerMintBefore = await writerToken.getMintInfo();
          const writerQuoteBefore = await quoteToken.getAccountInfo(
            minterQuoteAccount.publicKey
          );
          try {
            await burnWriterForQuote(
              program,
              minter,
              size,
              optionMarket.key,
              optionMarket.writerTokenMint,
              minterWriterAcct.publicKey,
              optionMarket.quoteAssetPool,
              minterQuoteAccount.publicKey
            );
          } catch (err) {
            console.error((err as AnchorError).error.errorMessage);
            throw err;
          }
          const writerMintAfter = await writerToken.getMintInfo();
          const writerMintDiff = writerMintAfter.supply.sub(
            writerMintBefore.supply
          );
          assert.equal(writerMintDiff.toString(), size.neg().toString());

          const writerQuoteAfter = await quoteToken.getAccountInfo(
            minterQuoteAccount.publicKey
          );
          const writerQuoteDiff = writerQuoteAfter.amount.sub(
            writerQuoteBefore.amount
          );
          assert.equal(
            writerQuoteDiff.toString(),
            size.mul(quoteAmountPerContract).toString()
          );
        });
      });
      describe("Quote pool does not match OptionMarket", () => {
        let badQuotePool: Keypair;
        before(async () => {
          const { tokenAccount } = await initNewTokenAccount(
            provider.connection,
            payer.publicKey,
            underlyingToken.publicKey,
            payer
          );
          badQuotePool = tokenAccount;
        });
        it("should error", async () => {
          try {
            await burnWriterForQuote(
              program,
              minter,
              size,
              optionMarket.key,
              optionMarket.writerTokenMint,
              minterWriterAcct.publicKey,
              badQuotePool.publicKey,
              minterQuoteAccount.publicKey
            );
            assert.ok(false);
          } catch (err) {
            const errMsg =
              "Quote pool account does not match the value on the OptionMarket";
            assert.equal((err as AnchorError).error.errorMessage, errMsg);
          }
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
            await burnWriterForQuote(
              program,
              minter,
              size,
              optionMarket.key,
              badWriterMint.publicKey,
              minterWriterAcct.publicKey,
              optionMarket.quoteAssetPool,
              minterQuoteAccount.publicKey
            );
            assert.ok(false);
          } catch (err) {
            const errMsg =
              "WriterToken mint does not match the value on the OptionMarket";
            assert.equal((err as AnchorError).error.errorMessage, errMsg);
          }
        });
      });
    });
  });
});
