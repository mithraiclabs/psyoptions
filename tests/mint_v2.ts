import * as anchor from "@project-serum/anchor";
import assert from "assert";
import { Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import {
  AccountMeta,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createMinter,
  initNewTokenAccount,
  initNewTokenMint,
  initOptionMarket,
  initSetup,
  wait,
} from "../utils/helpers";
import { OptionMarketV2 } from "../packages/psyoptions-ts/src/types";
import { Program } from "@project-serum/anchor";
import { PsyAmerican } from "../target/types/psy_american";

describe("mintOption", () => {
  const payer = anchor.web3.Keypair.generate();
  const mintAuthority = anchor.web3.Keypair.generate();
  const program = anchor.workspace.PsyAmerican as Program<PsyAmerican>;
  const provider = program.provider;

  const minter = anchor.web3.Keypair.generate();

  let quoteToken: Token;
  let underlyingToken: Token;
  let optionToken: Token;
  let optionMarket: OptionMarketV2;
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

  let optionAccount: Keypair;
  let underlyingAccount: Keypair;
  let writerTokenAccount: Keypair;
  let size = new u64(2);

  beforeEach(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(payer.publicKey, 10_000_000_000),
      "confirmed"
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        minter.publicKey,
        10_000_000_000
      ),
      "confirmed"
    );
    size = new u64(2);
  });

  const mintOptionsTx = async (
    opts: {
      underlyingAssetPoolKey?: PublicKey;
      remainingAccounts?: AccountMeta[];
    } = {}
  ) => {
    await program.rpc.mintOptionV2(size, {
      accounts: {
        userAuthority: minter.publicKey,
        underlyingAssetMint: optionMarket?.underlyingAssetMint,
        underlyingAssetPool:
          opts.underlyingAssetPoolKey || optionMarket?.underlyingAssetPool,
        underlyingAssetSrc: underlyingAccount.publicKey,
        optionMint: optionMarket?.optionMint,
        mintedOptionDest: optionAccount.publicKey,
        writerTokenMint: optionMarket?.writerTokenMint,
        mintedWriterTokenDest: writerTokenAccount.publicKey,
        optionMarket: optionMarket?.key,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      remainingAccounts: opts.remainingAccounts
        ? opts.remainingAccounts
        : remainingAccounts,
      signers: [minter],
    });
  };

  describe("proper mint", () => {
    beforeEach(async () => {
      ({
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
      ({ optionAccount, underlyingAccount, writerTokenAccount } =
        await createMinter(
          provider.connection,
          minter,
          mintAuthority,
          underlyingToken,
          size.mul(optionMarket.underlyingAmountPerContract).muln(2).toNumber(),
          optionMarket.optionMint,
          optionMarket.writerTokenMint,
          quoteToken
        ));
    });
    it("should mint size OptionTokens", async () => {
      try {
        await mintOptionsTx();
      } catch (err) {
        console.error((err as Error).toString());
        throw err;
      }
      const mintInfo = await optionToken.getMintInfo();
      assert.equal(mintInfo.supply.toString(), size.toString());
    });

    it("should mint size WriterTokens", async () => {
      try {
        await mintOptionsTx();
      } catch (err) {
        console.error((err as Error).toString());
        throw err;
      }
      const writerToken = new Token(
        provider.connection,
        optionMarket.writerTokenMint,
        TOKEN_PROGRAM_ID,
        payer
      );
      const mintInfo = await writerToken.getMintInfo();
      assert.equal(mintInfo.supply.toString(), size.toString());
    });

    it("should transfer the underlying from the minter to the pool", async () => {
      if (!mintFeeKey) {
        throw new Error("mintFeeKey wasn't set when it should be");
      }
      const underlyingPoolBefore = await underlyingToken.getAccountInfo(
        optionMarket.underlyingAssetPool
      );
      const minterUnderlyingBefore = await underlyingToken.getAccountInfo(
        underlyingAccount.publicKey
      );
      try {
        await mintOptionsTx();
      } catch (err) {
        console.error((err as Error).toString());
        throw err;
      }
      const expectedUnderlyingTransfered = size.mul(
        underlyingAmountPerContract
      );

      const underlyingPoolAfter = await underlyingToken.getAccountInfo(
        optionMarket.underlyingAssetPool
      );
      const poolDiff = underlyingPoolAfter.amount.sub(
        underlyingPoolBefore.amount
      );
      assert.equal(
        poolDiff.toString(),
        expectedUnderlyingTransfered.toString()
      );

      const minterUnderlyingAfter = await underlyingToken.getAccountInfo(
        underlyingAccount.publicKey
      );
      const minterUnderlyingDiff = minterUnderlyingAfter.amount.sub(
        minterUnderlyingBefore.amount
      );
      assert.equal(
        expectedUnderlyingTransfered.neg().toString(),
        minterUnderlyingDiff.toString()
      );
    });
  });

  describe("OptionMarket expired", () => {
    beforeEach(async () => {
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
        optionMarket,
        remainingAccounts,
        instructions,
      } = await initSetup(provider, payer, mintAuthority, program, {
        // set expiration to 2 seconds from now
        expiration: new anchor.BN(new Date().getTime() / 1000 + 2),
      }));
      await initOptionMarket(
        program,
        payer,
        optionMarket,
        remainingAccounts,
        instructions
      );
      ({ optionAccount, underlyingAccount, writerTokenAccount } =
        await createMinter(
          provider.connection,
          minter,
          mintAuthority,
          underlyingToken,
          optionMarket.underlyingAmountPerContract.muln(2).toNumber(),
          optionMarket.optionMint,
          optionMarket.writerTokenMint,
          quoteToken
        ));
    });
    it("should error", async () => {
      try {
        await wait(2000);
        await mintOptionsTx();
        assert.ok(false);
      } catch (err) {
        const errMsg = "OptionMarket is expired, can't mint";
        assert.equal((err as Error).toString(), errMsg);
      }
    });
  });

  describe("Underlying pool key differs from option market", () => {
    beforeEach(async () => {
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
      ({ optionAccount, underlyingAccount, writerTokenAccount } =
        await createMinter(
          provider.connection,
          minter,
          mintAuthority,
          underlyingToken,
          size.mul(optionMarket.underlyingAmountPerContract.muln(2)).toNumber(),
          optionMarket.optionMint,
          optionMarket.writerTokenMint,
          quoteToken
        ));
      // Create a new token account and set it as the underlyingAssetPoolAccount
      const { tokenAccount } = await initNewTokenAccount(
        provider.connection,
        payer.publicKey,
        underlyingToken.publicKey,
        payer
      );
      optionMarket.underlyingAssetPool = tokenAccount.publicKey;
    });
    it("should error", async () => {
      try {
        await mintOptionsTx();
        assert.ok(false);
      } catch (err) {
        const errMsg =
          "Underlying pool account does not match the value on the OptionMarket";
        assert.equal((err as Error).toString(), errMsg);
      }
    });
  });

  describe("OptionToken Mint key differs from option market", () => {
    beforeEach(async () => {
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
      // Create a new token mint and set it as the optionMintAccount
      const { mintAccount } = await initNewTokenMint(
        provider.connection,
        payer.publicKey,
        payer
      );
      optionMarket.optionMint = mintAccount.publicKey;
      ({ optionAccount, underlyingAccount, writerTokenAccount } =
        await createMinter(
          provider.connection,
          minter,
          mintAuthority,
          underlyingToken,
          size.mul(optionMarket.underlyingAmountPerContract.muln(2)).toNumber(),
          optionMarket.optionMint,
          optionMarket.writerTokenMint,
          quoteToken
        ));
    });
    it("should error", async () => {
      try {
        await mintOptionsTx();
        assert.ok(false);
      } catch (err) {
        const errMsg =
          "OptionToken mint does not match the value on the OptionMarket";
        assert.equal((err as Error).toString(), errMsg);
      }
    });
  });

  describe("WriterToken Mint key differs from option market", () => {
    beforeEach(async () => {
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
      // Create a new token mint and set it as the optionMintAccount
      const { mintAccount } = await initNewTokenMint(
        provider.connection,
        payer.publicKey,
        payer
      );
      optionMarket.writerTokenMint = mintAccount.publicKey;
      ({ optionAccount, underlyingAccount, writerTokenAccount } =
        await createMinter(
          provider.connection,
          minter,
          mintAuthority,
          underlyingToken,
          size.mul(optionMarket.underlyingAmountPerContract.muln(2)).toNumber(),
          optionMarket.optionMint,
          optionMarket.writerTokenMint,
          quoteToken
        ));
    });
    it("should error", async () => {
      try {
        await mintOptionsTx();
        assert.ok(false);
      } catch (err) {
        const errMsg =
          "WriterToken mint does not match the value on the OptionMarket";
        assert.equal((err as Error).toString(), errMsg);
      }
    });
  });

  describe("Size <= 0", () => {
    beforeEach(async () => {
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
      ({ optionAccount, underlyingAccount, writerTokenAccount } =
        await createMinter(
          provider.connection,
          minter,
          mintAuthority,
          underlyingToken,
          optionMarket.underlyingAmountPerContract.muln(2).toNumber(),
          optionMarket.optionMint,
          optionMarket.writerTokenMint,
          quoteToken
        ));

      // Set the size to 0 to trigger an error
      size = new anchor.BN(0);
    });
    it("should error", async () => {
      try {
        await mintOptionsTx();
        assert.ok(false);
      } catch (err) {
        const errMsg = "The size argument must be > 0";
        assert.equal((err as Error).toString(), errMsg);
      }
    });
  });
});
