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
  burnWriterForQuote,
  closeOptionPosition,
  closePostExpiration,
  createExerciser,
  createMinter,
  exerciseOptionTx,
  initNewTokenAccount,
  initNewTokenMint,
  initSetup,
  wait,
} from "../utils/helpers";

// TODO: exercise a token so there are quote assets in the pool

describe("burnWriterForQuote", () => {
  const provider = anchor.Provider.env();
  const payer = anchor.web3.Keypair.generate();
  const mintAuthority = anchor.web3.Keypair.generate();
  anchor.setProvider(provider);
  const program = anchor.workspace.PsyAmerican as anchor.Program;

  const minter = anchor.web3.Keypair.generate();
  const exerciser = anchor.web3.Keypair.generate();

  let quoteToken: Token;
  let underlyingToken: Token;
  let writerToken: Token;
  let underlyingAmountPerContract: anchor.BN;
  let quoteAmountPerContract: anchor.BN;
  let expiration: anchor.BN;
  let optionMarketKey: PublicKey;
  let bumpSeed: number;
  let mintFeeKey: PublicKey | null;
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
      writerToken = new Token(
        provider.connection,
        writerTokenMintAccount.publicKey,
        TOKEN_PROGRAM_ID,
        payer
      );
      await initOptionMarket();
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
        new anchor.BN(100).mul(underlyingAmountPerContract).muln(2).toNumber(),
        optionMintAccount.publicKey,
        writerTokenMintAccount.publicKey,
        quoteToken
      ));
      // Mint a bunch of contracts to the minter
      await mintOptionsTx(
        minter,
        minterOptionAcct,
        minterWriterAcct,
        minterUnderlyingAccount,
        { size: new anchor.BN(100) }
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
            optionMarketKey,
            writerToken.publicKey,
            minterWriterAcct.publicKey,
            quoteAssetPoolAccount.publicKey,
            minterQuoteAccount.publicKey
          );
          assert.ok(false);
        } catch (err) {
          const errMsg = "Not enough assets in the quote asset pool";
          assert.equal(err.toString(), errMsg);
        }
      });
    });
    describe("someone has exercised", () => {
      before(async () => {
        const optionToken = new Token(
          provider.connection,
          optionMintAccount.publicKey,
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
          new anchor.BN(100).mul(quoteAmountPerContract).muln(2).toNumber(),
          optionMintAccount.publicKey,
          underlyingToken.publicKey
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
          optionMarketKey,
          optionToken.publicKey,
          exerciser,
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
              optionMarketKey,
              writerToken.publicKey,
              minterWriterAcct.publicKey,
              quoteAssetPoolAccount.publicKey,
              minterQuoteAccount.publicKey
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
              optionMarketKey,
              writerToken.publicKey,
              minterWriterAcct.publicKey,
              badQuotePool.publicKey,
              minterQuoteAccount.publicKey
            );
            assert.ok(false);
          } catch (err) {
            const errMsg =
              "Quote pool account does not match the value on the OptionMarket";
            assert.equal(err.toString(), errMsg);
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
              optionMarketKey,
              badWriterMint.publicKey,
              minterWriterAcct.publicKey,
              quoteAssetPoolAccount.publicKey,
              minterQuoteAccount.publicKey
            );
            assert.ok(false);
          } catch (err) {
            const errMsg =
              "WriterToken mint does not match the value on the OptionMarket";
            assert.equal(err.toString(), errMsg);
          }
        });
      });
    });
  });
});
