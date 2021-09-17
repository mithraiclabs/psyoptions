import * as anchor from "@project-serum/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  AccountInfo,
  AccountMeta,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import assert from "assert";
import { getOrAddAssociatedTokenAccountTx } from "../packages/psyoptions-ts/src";

import { feeAmount, FEE_OWNER_KEY } from "../packages/psyoptions-ts/src/fees";
import { OptionMarketV2 } from "../packages/psyoptions-ts/src/types";
import {
  createUnderlyingAndQuoteMints,
  initNewTokenAccount,
  initNewTokenMint,
  initOptionMarket,
  initSetup,
} from "../utils/helpers";

describe("initializeMarket", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  const payer = anchor.web3.Keypair.generate();
  const mintAuthority = anchor.web3.Keypair.generate();
  anchor.setProvider(provider);
  const program = anchor.workspace.PsyAmerican as anchor.Program;

  let quoteToken: Token;
  let underlyingToken: Token;
  let optionToken: Token;
  let underlyingAmountPerContract: anchor.BN;
  let quoteAmountPerContract: anchor.BN;
  let expiration: anchor.BN;
  let optionMarketKey: PublicKey;
  let bumpSeed: number;
  let mintFeeKey: PublicKey | null;
  let exerciseFeeKey: PublicKey;
  let optionMintKey: PublicKey;
  let writerTokenMintKey: PublicKey;
  let underlyingAssetPoolKey: PublicKey;
  let quoteAssetPoolKey: PublicKey;
  let optionMarket: OptionMarketV2;
  let remainingAccounts: AccountMeta[] = [];
  let instructions: TransactionInstruction[] = [];

  beforeEach(async () => {
    underlyingAmountPerContract = new anchor.BN("10000000000");
    quoteAmountPerContract = new anchor.BN("50000000000");
    expiration = new anchor.BN(new Date().getTime() / 1000 + 3600);
    remainingAccounts = [];
    instructions = [];
    // airdrop to the user so it has funds to use
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(payer.publicKey, 10_000_000_000),
      "confirmed"
    );
  });

  describe("good account setup", () => {
    beforeEach(async () => {
      ({
        quoteToken,
        underlyingToken,
        optionToken,
        optionMarket,
        remainingAccounts,
        instructions,
      } = await initSetup(provider, payer, mintAuthority, program, {}));
    });
    it("Creates new OptionMarket!", async () => {
      try {
        await initOptionMarket(
          program,
          payer,
          optionMarket,
          remainingAccounts,
          instructions
        );
      } catch (err) {
        console.error((err as Error).toString());
        throw err;
      }
      // Fetch the account for the newly created OptionMarket
      const onChainOptionMarket = (await program.account.optionMarket.fetch(
        optionMarket.key
      )) as OptionMarketV2;

      assert.equal(
        onChainOptionMarket.underlyingAssetMint?.toString(),
        underlyingToken.publicKey.toString()
      );
      assert.equal(
        onChainOptionMarket.quoteAssetMint?.toString(),
        quoteToken.publicKey.toString()
      );
      assert.equal(
        onChainOptionMarket.underlyingAssetPool?.toString(),
        optionMarket.underlyingAssetPool.toString()
      );
      assert.equal(
        onChainOptionMarket.quoteAssetPool?.toString(),
        optionMarket.quoteAssetPool.toString()
      );
      assert.equal(
        onChainOptionMarket.mintFeeAccount?.toString(),
        optionMarket.mintFeeAccount?.toString()
      );
      assert.equal(
        onChainOptionMarket.exerciseFeeAccount?.toString(),
        optionMarket.exerciseFeeAccount?.toString()
      );
      assert.equal(
        onChainOptionMarket.expired?.toString(),
        optionMarket.expired?.toString()
      );
      // Fetch the OptionToken Mint info
      const optionTokenMint = await optionToken.getMintInfo();
      assert.ok(optionTokenMint.mintAuthority?.equals(optionMarket.key));
    });
  });
  describe("underlying asset amount <= 0", () => {
    beforeEach(async () => {
      underlyingAmountPerContract = new anchor.BN(0);
      ({ optionMarket, remainingAccounts, instructions } = await initSetup(
        provider,
        payer,
        mintAuthority,
        program,
        {
          underlyingAmountPerContract,
        }
      ));
    });
    it("Should error", async () => {
      try {
        await initOptionMarket(
          program,
          payer,
          optionMarket,
          remainingAccounts,
          instructions
        );
        assert.ok(false);
      } catch (err) {
        const errMsg =
          "Quote amount and underlying amount per contract must be > 0";
        assert.equal((err as Error).toString(), errMsg);
      }
    });
  });
  describe("quote asset amount <= 0", () => {
    beforeEach(async () => {
      quoteAmountPerContract = new anchor.BN(0);
      ({ optionMarket, remainingAccounts, instructions } = await initSetup(
        provider,
        payer,
        mintAuthority,
        program,
        {
          quoteAmountPerContract,
        }
      ));
    });
    it("Should error", async () => {
      try {
        await initOptionMarket(
          program,
          payer,
          optionMarket,
          remainingAccounts,
          instructions
        );
        assert.ok(false);
      } catch (err) {
        const errMsg =
          "Quote amount and underlying amount per contract must be > 0";
        assert.equal((err as Error).toString(), errMsg);
      }
    });
  });

  describe("mint fee is required based on underlying assets per contract", () => {
    describe("Mint fee owner is incorrect", () => {
      beforeEach(async () => {
        ({ optionMarket, remainingAccounts, instructions } = await initSetup(
          provider,
          payer,
          mintAuthority,
          program,
          {
            mintFeeOwner: payer.publicKey,
          }
        ));
      });
      it("should error", async () => {
        try {
          await initOptionMarket(
            program,
            payer,
            optionMarket,
            remainingAccounts,
            instructions
          );
          assert.ok(false);
        } catch (err) {
          const errMsg = "Mint fee account must be owned by the FEE_OWNER";
          assert.equal((err as Error).toString(), errMsg);
        }
      });
    });
    describe("Mint fee token is not the underlying asset token", () => {
      beforeEach(async () => {
        const { mintAccount } = await initNewTokenMint(
          provider.connection,
          payer.publicKey,
          payer
        );
        const mintFeeToken = new Token(
          provider.connection,
          mintAccount.publicKey,
          TOKEN_PROGRAM_ID,
          payer
        );
        ({ optionMarket, remainingAccounts, instructions } = await initSetup(
          provider,
          payer,
          mintAuthority,
          program,
          {
            mintFeeToken,
          }
        ));
      });
      it("should error", async () => {
        try {
          await initOptionMarket(
            program,
            payer,
            optionMarket,
            remainingAccounts,
            instructions
          );
          assert.ok(false);
        } catch (err) {
          const errMsg =
            "Mint fee token must be the same as the underlying asset";
          assert.equal((err as Error).toString(), errMsg);
        }
      });
    });
  });
  describe("exercise fee is required based on quote assets per contract", () => {
    describe("Exercise fee owner is incorrect", () => {
      beforeEach(async () => {
        ({ optionMarket, remainingAccounts, instructions } = await initSetup(
          provider,
          payer,
          mintAuthority,
          program,
          {
            exerciseFeeOwner: payer.publicKey,
          }
        ));
      });
      it("should error", async () => {
        try {
          await initOptionMarket(
            program,
            payer,
            optionMarket,
            remainingAccounts,
            instructions
          );
          assert.ok(false);
        } catch (err) {
          const errMsg = "Exercise fee account must be owned by the FEE_OWNER";
          assert.equal((err as Error).toString(), errMsg);
        }
      });
    });
    describe("Exercise fee token is not the quote asset token", () => {
      beforeEach(async () => {
        const { mintAccount } = await initNewTokenMint(
          provider.connection,
          payer.publicKey,
          payer
        );
        const exerciseFeeToken = new Token(
          provider.connection,
          mintAccount.publicKey,
          TOKEN_PROGRAM_ID,
          payer
        );
        ({ optionMarket, remainingAccounts, instructions } = await initSetup(
          provider,
          payer,
          mintAuthority,
          program,
          {
            exerciseFeeToken,
          }
        ));
      });
      it("should error", async () => {
        try {
          await initOptionMarket(
            program,
            payer,
            optionMarket,
            remainingAccounts,
            instructions
          );
          assert.ok(false);
        } catch (err) {
          const errMsg =
            "Exercise fee token must be the same as the quote asset";
          assert.equal((err as Error).toString(), errMsg);
        }
      });
    });
  });
});
