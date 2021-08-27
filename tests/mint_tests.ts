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
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import { getOrAddAssociatedTokenAccountTx } from "../packages/psyoptions-ts/src";
import { feeAmount, FEE_OWNER_KEY } from "../packages/psyoptions-ts/src/fees";
import {
  createAccountsForInitializeMarket,
  createMinter,
  createUnderlyingAndQuoteMints,
  initNewTokenAccount,
  initNewTokenMint,
  initSetup,
  wait,
} from "../utils/helpers";

describe("mintOption", () => {
  const provider = anchor.Provider.env();
  const payer = anchor.web3.Keypair.generate();
  const mintAuthority = anchor.web3.Keypair.generate();
  anchor.setProvider(provider);
  const program = anchor.workspace.PsyAmerican as anchor.Program;

  const minter = anchor.web3.Keypair.generate();

  let quoteToken: Token;
  let underlyingToken: Token;
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
  });

  const mintOptionsTx = async (
    opts: {
      underlyingAssetPoolAccount?: Keypair;
      remainingAccounts?: AccountMeta[];
    } = {}
  ) => {
    await program.rpc.mintOption(size, {
      accounts: {
        userAuthority: minter.publicKey,
        underlyingAssetMint: underlyingToken.publicKey,
        underlyingAssetPool: (
          opts.underlyingAssetPoolAccount || underlyingAssetPoolAccount
        ).publicKey,
        underlyingAssetSrc: underlyingAccount.publicKey,
        optionMint: optionMintAccount.publicKey,
        mintedOptionDest: optionAccount.publicKey,
        writerTokenMint: writerTokenMintAccount.publicKey,
        mintedWriterTokenDest: writerTokenAccount.publicKey,
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

  describe("proper mint", () => {
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
        optionMintAccount,
        writerTokenMintAccount,
        underlyingAssetPoolAccount,
        quoteAssetPoolAccount,
        remainingAccounts,
        instructions,
      } = await initSetup(provider, payer, mintAuthority, program));
      await initOptionMarket();
      ({ optionAccount, underlyingAccount, writerTokenAccount } =
        await createMinter(
          provider.connection,
          minter,
          mintAuthority,
          underlyingToken,
          underlyingAmountPerContract.muln(2).toNumber(),
          optionMintAccount.publicKey,
          writerTokenMintAccount.publicKey
        ));
    });
    it("should mint size OptionTokens", async () => {
      try {
        await mintOptionsTx();
      } catch (err) {
        console.error(err.toString());
        throw err;
      }
      const optionMintToken = new Token(
        provider.connection,
        optionMintAccount.publicKey,
        TOKEN_PROGRAM_ID,
        payer
      );
      const mintInfo = await optionMintToken.getMintInfo();
      assert.equal(mintInfo.supply.toString(), size.toString());
    });

    it("should mint size WriterTokens", async () => {
      try {
        await mintOptionsTx();
      } catch (err) {
        console.error(err.toString());
        throw err;
      }
      const writerToken = new Token(
        provider.connection,
        writerTokenMintAccount.publicKey,
        TOKEN_PROGRAM_ID,
        payer
      );
      const mintInfo = await writerToken.getMintInfo();
      assert.equal(mintInfo.supply.toString(), size.toString());
    });

    it("should transfer the underlying from the minter to the pool", async () => {
      const underlyingPoolBefore = await underlyingToken.getAccountInfo(
        underlyingAssetPoolAccount.publicKey
      );
      const minterUnderlyingBefore = await underlyingToken.getAccountInfo(
        underlyingAccount.publicKey
      );
      try {
        await mintOptionsTx();
      } catch (err) {
        console.error(err.toString());
        throw err;
      }
      const expectedUnderlyingTransfered = size.mul(
        underlyingAmountPerContract
      );

      const underlyingPoolAfter = await underlyingToken.getAccountInfo(
        underlyingAssetPoolAccount.publicKey
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
        optionMintAccount,
        writerTokenMintAccount,
        underlyingAssetPoolAccount,
        quoteAssetPoolAccount,
        remainingAccounts,
        instructions,
      } = await initSetup(provider, payer, mintAuthority, program, {
        // set expiration to 2 seconds from now
        expiration: new anchor.BN(new Date().getTime() / 1000 + 2),
      }));
      await initOptionMarket();
      ({ optionAccount, underlyingAccount, writerTokenAccount } =
        await createMinter(
          provider.connection,
          minter,
          mintAuthority,
          underlyingToken,
          underlyingAmountPerContract.muln(2).toNumber(),
          optionMintAccount.publicKey,
          writerTokenMintAccount.publicKey
        ));
    });
    it("should error", async () => {
      try {
        await wait(2000);
        await mintOptionsTx();
        assert.ok(false);
      } catch (err) {
        const errMsg = "OptionMarket is expired, can't mint";
        assert.equal(err.toString(), errMsg);
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
        optionMintAccount,
        writerTokenMintAccount,
        underlyingAssetPoolAccount,
        quoteAssetPoolAccount,
        remainingAccounts,
        instructions,
      } = await initSetup(provider, payer, mintAuthority, program));
      await initOptionMarket();
      ({ optionAccount, underlyingAccount, writerTokenAccount } =
        await createMinter(
          provider.connection,
          minter,
          mintAuthority,
          underlyingToken,
          underlyingAmountPerContract.muln(2).toNumber(),
          optionMintAccount.publicKey,
          writerTokenMintAccount.publicKey
        ));
      // Create a new token account and set it as the underlyingAssetPoolAccount
      const { tokenAccount } = await initNewTokenAccount(
        provider.connection,
        payer.publicKey,
        underlyingToken.publicKey,
        payer
      );
      underlyingAssetPoolAccount = tokenAccount;
    });
    it("should error", async () => {
      try {
        await mintOptionsTx();
        assert.ok(false);
      } catch (err) {
        const errMsg =
          "Underlying pool account does not match the value on the OptionMarket";
        assert.equal(err.toString(), errMsg);
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
        optionMintAccount,
        writerTokenMintAccount,
        underlyingAssetPoolAccount,
        quoteAssetPoolAccount,
        remainingAccounts,
        instructions,
      } = await initSetup(provider, payer, mintAuthority, program));
      await initOptionMarket();
      // Create a new token mint and set it as the optionMintAccount
      const { mintAccount } = await initNewTokenMint(
        provider.connection,
        payer.publicKey,
        payer
      );
      optionMintAccount = mintAccount;
      ({ optionAccount, underlyingAccount, writerTokenAccount } =
        await createMinter(
          provider.connection,
          minter,
          mintAuthority,
          underlyingToken,
          underlyingAmountPerContract.muln(2).toNumber(),
          optionMintAccount.publicKey,
          writerTokenMintAccount.publicKey
        ));
    });
    it("should error", async () => {
      try {
        await mintOptionsTx();
        assert.ok(false);
      } catch (err) {
        const errMsg =
          "OptionToken mint does not match the value on the OptionMarket";
        assert.equal(err.toString(), errMsg);
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
        optionMintAccount,
        writerTokenMintAccount,
        underlyingAssetPoolAccount,
        quoteAssetPoolAccount,
        remainingAccounts,
        instructions,
      } = await initSetup(provider, payer, mintAuthority, program));
      await initOptionMarket();
      // Create a new token mint and set it as the optionMintAccount
      const { mintAccount } = await initNewTokenMint(
        provider.connection,
        payer.publicKey,
        payer
      );
      writerTokenMintAccount = mintAccount;
      ({ optionAccount, underlyingAccount, writerTokenAccount } =
        await createMinter(
          provider.connection,
          minter,
          mintAuthority,
          underlyingToken,
          underlyingAmountPerContract.muln(2).toNumber(),
          optionMintAccount.publicKey,
          writerTokenMintAccount.publicKey
        ));
    });
    it("should error", async () => {
      try {
        await mintOptionsTx();
        assert.ok(false);
      } catch (err) {
        const errMsg =
          "WriterToken mint does not match the value on the OptionMarket";
        assert.equal(err.toString(), errMsg);
      }
    });
  });

  describe("MintFee account differs from option market", () => {
    let badMintFeeKey: PublicKey;
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
        optionMintAccount,
        writerTokenMintAccount,
        underlyingAssetPoolAccount,
        quoteAssetPoolAccount,
        remainingAccounts,
        instructions,
      } = await initSetup(provider, payer, mintAuthority, program));
      await initOptionMarket();
      // Create a new token account and set it as the mintFeeKey
      const { tokenAccount } = await initNewTokenAccount(
        provider.connection,
        FEE_OWNER_KEY,
        underlyingToken.publicKey,
        payer
      );
      badMintFeeKey = tokenAccount.publicKey;

      ({ optionAccount, underlyingAccount, writerTokenAccount } =
        await createMinter(
          provider.connection,
          minter,
          mintAuthority,
          underlyingToken,
          underlyingAmountPerContract.muln(2).toNumber(),
          optionMintAccount.publicKey,
          writerTokenMintAccount.publicKey
        ));
    });
    it("should error", async () => {
      try {
        await mintOptionsTx({
          remainingAccounts: [
            {
              pubkey: badMintFeeKey,
              isWritable: true,
              isSigner: false,
            },
          ],
        });
        assert.ok(false);
      } catch (err) {
        const errMsg =
          "MintFee key does not match the value on the OptionMarket";
        assert.equal(err.toString(), errMsg);
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
        optionMintAccount,
        writerTokenMintAccount,
        underlyingAssetPoolAccount,
        quoteAssetPoolAccount,
        remainingAccounts,
        instructions,
      } = await initSetup(provider, payer, mintAuthority, program));
      await initOptionMarket();
      ({ optionAccount, underlyingAccount, writerTokenAccount } =
        await createMinter(
          provider.connection,
          minter,
          mintAuthority,
          underlyingToken,
          underlyingAmountPerContract.muln(2).toNumber(),
          optionMintAccount.publicKey,
          writerTokenMintAccount.publicKey
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
        assert.equal(err.toString(), errMsg);
      }
    });
  });
});
