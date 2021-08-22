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
  createAccountsForInitializeMarket,
  createUnderlyingAndQuoteMints,
  initNewTokenAccount,
  initNewTokenMint,
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
  let underlyingAmountPerContract: anchor.BN;
  let quoteAmountPerContract: anchor.BN;
  let expiration: anchor.BN;
  let optionMarketKey: PublicKey;
  let bumpSeed: number;
  let authorityBumpSeed: number;
  let mintFeeKey: PublicKey | null;
  let exerciseFeeKey: PublicKey;
  let optionMintAccount: Keypair;
  let writerTokenMintAccount: Keypair;
  let underlyingAssetPoolAccount: Keypair;
  let quoteAssetPoolAccount: Keypair;
  let remainingAccounts: AccountMeta[] = [];
  let instructions: TransactionInstruction[] = [];
  beforeEach(async () => {
    optionMintAccount = new Keypair();
    writerTokenMintAccount = new Keypair();
    underlyingAssetPoolAccount = new Keypair();
    quoteAssetPoolAccount = new Keypair();
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
      try {
        ({ underlyingToken, quoteToken } = await createUnderlyingAndQuoteMints(
          provider,
          payer,
          mintAuthority
        ));
        [optionMarketKey, bumpSeed] =
          await anchor.web3.PublicKey.findProgramAddress(
            [
              underlyingToken.publicKey.toBuffer(),
              quoteToken.publicKey.toBuffer(),
              underlyingAmountPerContract.toBuffer("le", 8),
              quoteAmountPerContract.toBuffer("le", 8),
              expiration.toBuffer("le", 8),
            ],
            program.programId
          );

        // Get the associated fee address if the market requires a fee
        const mintFee = feeAmount(underlyingAmountPerContract);
        if (mintFee.gtn(0)) {
          mintFeeKey = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            underlyingToken.publicKey,
            FEE_OWNER_KEY
          );
          remainingAccounts.push({
            pubkey: mintFeeKey,
            isWritable: false,
            isSigner: false,
          });
          const ix = await getOrAddAssociatedTokenAccountTx(
            mintFeeKey,
            underlyingToken,
            payer.publicKey
          );
          if (ix) {
            instructions.push(ix);
          }
        }

        const exerciseFee = feeAmount(quoteAmountPerContract);
        if (exerciseFee.gtn(0)) {
          exerciseFeeKey = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            quoteToken.publicKey,
            FEE_OWNER_KEY
          );
          remainingAccounts.push({
            pubkey: exerciseFeeKey,
            isWritable: false,
            isSigner: false,
          });
          const ix = await getOrAddAssociatedTokenAccountTx(
            exerciseFeeKey,
            quoteToken,
            payer.publicKey
          );
          if (ix) {
            instructions.push(ix);
          }
        }

        await createAccountsForInitializeMarket(
          provider.connection,
          payer,
          optionMarketKey,
          optionMintAccount,
          writerTokenMintAccount,
          underlyingAssetPoolAccount,
          quoteAssetPoolAccount,
          underlyingToken,
          quoteToken
        );
      } catch (error) {
        console.error(error);
      }
    });
    it("Creates new OptionMarket!", async () => {
      try {
        await program.rpc.initializeMarket(
          underlyingAmountPerContract,
          quoteAmountPerContract,
          expiration,
          authorityBumpSeed,
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
      } catch (err) {
        console.error(err.toString());
        throw err;
      }

      // Fetch the account for the newly created OptionMarket
      const optionMarket = (await program.account.optionMarket.fetch(
        optionMarketKey
      )) as OptionMarketV2;

      assert.equal(
        optionMarket.underlyingAssetMint?.toString(),
        underlyingToken.publicKey.toString()
      );
      assert.equal(
        optionMarket.quoteAssetMint?.toString(),
        quoteToken.publicKey.toString()
      );
      assert.equal(
        optionMarket.underlyingAssetPool?.toString(),
        underlyingAssetPoolAccount.publicKey.toString()
      );
      assert.equal(
        optionMarket.quoteAssetPool?.toString(),
        quoteAssetPoolAccount.publicKey.toString()
      );
      assert.equal(
        optionMarket.quoteAssetPool?.toString(),
        quoteAssetPoolAccount.publicKey.toString()
      );
      assert.equal(
        optionMarket.mintFeeAccount?.toString(),
        mintFeeKey?.toString()
      );
      assert.equal(
        optionMarket.exerciseFeeAccount?.toString(),
        exerciseFeeKey?.toString()
      );
      // Fetch the OptionToken Mint info
      const optionToken = new Token(
        provider.connection,
        optionMintAccount.publicKey,
        TOKEN_PROGRAM_ID,
        payer
      );
      const optionTokenMint = await optionToken.getMintInfo();
      assert.ok(optionTokenMint.mintAuthority?.equals(optionMarketKey));
    });
  });
  describe("underlying asset amount <= 0", () => {
    beforeEach(async () => {
      underlyingAmountPerContract = new anchor.BN(0);
      ({ underlyingToken, quoteToken } = await createUnderlyingAndQuoteMints(
        provider,
        payer,
        mintAuthority
      ));
      [optionMarketKey, bumpSeed] =
        await anchor.web3.PublicKey.findProgramAddress(
          [
            underlyingToken.publicKey.toBuffer(),
            quoteToken.publicKey.toBuffer(),
            underlyingAmountPerContract.toBuffer("le", 8),
            quoteAmountPerContract.toBuffer("le", 8),
            expiration.toBuffer("le", 8),
          ],
          program.programId
        );

      // Get the associated fee address if the market requires a fee
      const mintFee = feeAmount(underlyingAmountPerContract);
      if (mintFee.gtn(0)) {
        mintFeeKey = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          underlyingToken.publicKey,
          FEE_OWNER_KEY
        );
        remainingAccounts.push({
          pubkey: mintFeeKey,
          isWritable: false,
          isSigner: false,
        });
        const ix = await getOrAddAssociatedTokenAccountTx(
          mintFeeKey,
          underlyingToken,
          payer.publicKey
        );
        if (ix) {
          instructions.push(ix);
        }
      }

      const exerciseFee = feeAmount(quoteAmountPerContract);
      if (exerciseFee.gtn(0)) {
        exerciseFeeKey = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          quoteToken.publicKey,
          FEE_OWNER_KEY
        );
        remainingAccounts.push({
          pubkey: exerciseFeeKey,
          isWritable: false,
          isSigner: false,
        });
        const ix = await getOrAddAssociatedTokenAccountTx(
          exerciseFeeKey,
          quoteToken,
          payer.publicKey
        );
        if (ix) {
          instructions.push(ix);
        }
      }

      await createAccountsForInitializeMarket(
        provider.connection,
        payer,
        optionMarketKey,
        optionMintAccount,
        writerTokenMintAccount,
        underlyingAssetPoolAccount,
        quoteAssetPoolAccount,
        underlyingToken,
        quoteToken
      );
    });
    it("Should error", async () => {
      try {
        await program.rpc.initializeMarket(
          underlyingAmountPerContract,
          quoteAmountPerContract,
          expiration,
          authorityBumpSeed,
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
        assert.ok(false);
      } catch (err) {
        const errMsg =
          "Quote amount and underlying amount per contract must be > 0";
        assert.equal(err.toString(), errMsg);
      }
    });
  });
  describe("quote asset amount <= 0", () => {
    beforeEach(async () => {
      quoteAmountPerContract = new anchor.BN(0);
      ({ underlyingToken, quoteToken } = await createUnderlyingAndQuoteMints(
        provider,
        payer,
        mintAuthority
      ));
      [optionMarketKey, bumpSeed] =
        await anchor.web3.PublicKey.findProgramAddress(
          [
            underlyingToken.publicKey.toBuffer(),
            quoteToken.publicKey.toBuffer(),
            underlyingAmountPerContract.toBuffer("le", 8),
            quoteAmountPerContract.toBuffer("le", 8),
            expiration.toBuffer("le", 8),
          ],
          program.programId
        );

      // Get the associated fee address if the market requires a fee
      const mintFee = feeAmount(underlyingAmountPerContract);
      if (mintFee.gtn(0)) {
        mintFeeKey = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          underlyingToken.publicKey,
          FEE_OWNER_KEY
        );
        remainingAccounts.push({
          pubkey: mintFeeKey,
          isWritable: false,
          isSigner: false,
        });
        const ix = await getOrAddAssociatedTokenAccountTx(
          mintFeeKey,
          underlyingToken,
          payer.publicKey
        );
        if (ix) {
          instructions.push(ix);
        }
      }

      const exerciseFee = feeAmount(quoteAmountPerContract);
      if (exerciseFee.gtn(0)) {
        exerciseFeeKey = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          quoteToken.publicKey,
          FEE_OWNER_KEY
        );
        remainingAccounts.push({
          pubkey: exerciseFeeKey,
          isWritable: false,
          isSigner: false,
        });
        const ix = await getOrAddAssociatedTokenAccountTx(
          exerciseFeeKey,
          quoteToken,
          payer.publicKey
        );
        if (ix) {
          instructions.push(ix);
        }
      }

      await createAccountsForInitializeMarket(
        provider.connection,
        payer,
        optionMarketKey,
        optionMintAccount,
        writerTokenMintAccount,
        underlyingAssetPoolAccount,
        quoteAssetPoolAccount,
        underlyingToken,
        quoteToken
      );
    });
    it("Should error", async () => {
      try {
        await program.rpc.initializeMarket(
          underlyingAmountPerContract,
          quoteAmountPerContract,
          expiration,
          authorityBumpSeed,
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
            signers: [payer],
            remainingAccounts,
            instructions,
          }
        );
        assert.ok(false);
      } catch (err) {
        const errMsg =
          "Quote amount and underlying amount per contract must be > 0";
        assert.equal(err.toString(), errMsg);
      }
    });
  });

  describe("underlying and quote assets are the same", () => {
    beforeEach(async () => {
      ({ underlyingToken, quoteToken } = await createUnderlyingAndQuoteMints(
        provider,
        payer,
        mintAuthority
      ));
      underlyingToken = quoteToken;
      [optionMarketKey, bumpSeed] =
        await anchor.web3.PublicKey.findProgramAddress(
          [
            underlyingToken.publicKey.toBuffer(),
            underlyingToken.publicKey.toBuffer(),
            underlyingAmountPerContract.toBuffer("le", 8),
            quoteAmountPerContract.toBuffer("le", 8),
            expiration.toBuffer("le", 8),
          ],
          program.programId
        );

      await createAccountsForInitializeMarket(
        provider.connection,
        payer,
        optionMarketKey,
        optionMintAccount,
        writerTokenMintAccount,
        underlyingAssetPoolAccount,
        quoteAssetPoolAccount,
        underlyingToken,
        quoteToken
      );
    });
    it("Should error", async () => {
      try {
        await program.rpc.initializeMarket(
          underlyingAmountPerContract,
          quoteAmountPerContract,
          expiration,
          authorityBumpSeed,
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
            signers: [payer],
          }
        );
        assert.ok(false);
      } catch (err) {
        const errMsg = "Same quote and underlying asset, cannot create market";
        assert.equal(err.toString(), errMsg);
      }
    });
  });

  describe("OptionToken mint authority is not the OptionMarket key", () => {
    beforeEach(async () => {
      ({ underlyingToken, quoteToken } = await createUnderlyingAndQuoteMints(
        provider,
        payer,
        mintAuthority
      ));
      [optionMarketKey, bumpSeed] =
        await anchor.web3.PublicKey.findProgramAddress(
          [
            underlyingToken.publicKey.toBuffer(),
            quoteToken.publicKey.toBuffer(),
            underlyingAmountPerContract.toBuffer("le", 8),
            quoteAmountPerContract.toBuffer("le", 8),
            expiration.toBuffer("le", 8),
          ],
          program.programId
        );

      // Get the associated fee address if the market requires a fee
      const mintFee = feeAmount(underlyingAmountPerContract);
      if (mintFee.gtn(0)) {
        mintFeeKey = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          underlyingToken.publicKey,
          FEE_OWNER_KEY
        );
        remainingAccounts.push({
          pubkey: mintFeeKey,
          isWritable: false,
          isSigner: false,
        });
        const ix = await getOrAddAssociatedTokenAccountTx(
          mintFeeKey,
          underlyingToken,
          payer.publicKey
        );
        if (ix) {
          instructions.push(ix);
        }
      }

      const exerciseFee = feeAmount(quoteAmountPerContract);
      if (exerciseFee.gtn(0)) {
        exerciseFeeKey = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          quoteToken.publicKey,
          FEE_OWNER_KEY
        );
        remainingAccounts.push({
          pubkey: exerciseFeeKey,
          isWritable: false,
          isSigner: false,
        });
        const ix = await getOrAddAssociatedTokenAccountTx(
          exerciseFeeKey,
          quoteToken,
          payer.publicKey
        );
        if (ix) {
          instructions.push(ix);
        }
      }

      await createAccountsForInitializeMarket(
        provider.connection,
        payer,
        optionMarketKey,
        optionMintAccount,
        writerTokenMintAccount,
        underlyingAssetPoolAccount,
        quoteAssetPoolAccount,
        underlyingToken,
        quoteToken
      );
      const { mintAccount } = await initNewTokenMint(
        provider.connection,
        payer.publicKey,
        payer
      );
      optionMintAccount = mintAccount;
    });
    it("should error", async () => {
      try {
        await program.rpc.initializeMarket(
          underlyingAmountPerContract,
          quoteAmountPerContract,
          expiration,
          authorityBumpSeed,
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
            signers: [payer],
            remainingAccounts,
            instructions,
          }
        );
        assert.ok(false);
      } catch (err) {
        const errMsg = "OptionMarket must be the mint authority";
        assert.equal(err.toString(), errMsg);
      }
    });
  });
  describe("WriterToken mint authority is not the OptionMarket key", () => {
    beforeEach(async () => {
      ({ underlyingToken, quoteToken } = await createUnderlyingAndQuoteMints(
        provider,
        payer,
        mintAuthority
      ));
      [optionMarketKey, bumpSeed] =
        await anchor.web3.PublicKey.findProgramAddress(
          [
            underlyingToken.publicKey.toBuffer(),
            quoteToken.publicKey.toBuffer(),
            underlyingAmountPerContract.toBuffer("le", 8),
            quoteAmountPerContract.toBuffer("le", 8),
            expiration.toBuffer("le", 8),
          ],
          program.programId
        );

      // Get the associated fee address if the market requires a fee
      const mintFee = feeAmount(underlyingAmountPerContract);
      if (mintFee.gtn(0)) {
        mintFeeKey = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          underlyingToken.publicKey,
          FEE_OWNER_KEY
        );
        remainingAccounts.push({
          pubkey: mintFeeKey,
          isWritable: false,
          isSigner: false,
        });
        const ix = await getOrAddAssociatedTokenAccountTx(
          mintFeeKey,
          underlyingToken,
          payer.publicKey
        );
        if (ix) {
          instructions.push(ix);
        }
      }

      const exerciseFee = feeAmount(quoteAmountPerContract);
      if (exerciseFee.gtn(0)) {
        exerciseFeeKey = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          quoteToken.publicKey,
          FEE_OWNER_KEY
        );
        remainingAccounts.push({
          pubkey: exerciseFeeKey,
          isWritable: false,
          isSigner: false,
        });
        const ix = await getOrAddAssociatedTokenAccountTx(
          exerciseFeeKey,
          quoteToken,
          payer.publicKey
        );
        if (ix) {
          instructions.push(ix);
        }
      }

      await createAccountsForInitializeMarket(
        provider.connection,
        payer,
        optionMarketKey,
        optionMintAccount,
        writerTokenMintAccount,
        underlyingAssetPoolAccount,
        quoteAssetPoolAccount,
        underlyingToken,
        quoteToken
      );

      const { mintAccount } = await initNewTokenMint(
        provider.connection,
        payer.publicKey,
        payer
      );
      writerTokenMintAccount = mintAccount;
    });
    it("should error", async () => {
      try {
        await program.rpc.initializeMarket(
          underlyingAmountPerContract,
          quoteAmountPerContract,
          expiration,
          authorityBumpSeed,
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
            signers: [payer],
            remainingAccounts,
            instructions,
          }
        );
        assert.ok(false);
      } catch (err) {
        const errMsg = "OptionMarket must be the mint authority";
        assert.equal(err.toString(), errMsg);
      }
    });
  });

  describe("UnderlyingAssetPool not owned by OptionMarket", () => {
    beforeEach(async () => {
      ({ underlyingToken, quoteToken } = await createUnderlyingAndQuoteMints(
        provider,
        payer,
        mintAuthority
      ));
      [optionMarketKey, bumpSeed] =
        await anchor.web3.PublicKey.findProgramAddress(
          [
            underlyingToken.publicKey.toBuffer(),
            quoteToken.publicKey.toBuffer(),
            underlyingAmountPerContract.toBuffer("le", 8),
            quoteAmountPerContract.toBuffer("le", 8),
            expiration.toBuffer("le", 8),
          ],
          program.programId
        );

      // Get the associated fee address if the market requires a fee
      const mintFee = feeAmount(underlyingAmountPerContract);
      if (mintFee.gtn(0)) {
        mintFeeKey = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          underlyingToken.publicKey,
          FEE_OWNER_KEY
        );
        remainingAccounts.push({
          pubkey: mintFeeKey,
          isWritable: false,
          isSigner: false,
        });
        const ix = await getOrAddAssociatedTokenAccountTx(
          mintFeeKey,
          underlyingToken,
          payer.publicKey
        );
        if (ix) {
          instructions.push(ix);
        }
      }

      const exerciseFee = feeAmount(quoteAmountPerContract);
      if (exerciseFee.gtn(0)) {
        exerciseFeeKey = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          quoteToken.publicKey,
          FEE_OWNER_KEY
        );
        remainingAccounts.push({
          pubkey: exerciseFeeKey,
          isWritable: false,
          isSigner: false,
        });
        const ix = await getOrAddAssociatedTokenAccountTx(
          exerciseFeeKey,
          quoteToken,
          payer.publicKey
        );
        if (ix) {
          instructions.push(ix);
        }
      }

      await createAccountsForInitializeMarket(
        provider.connection,
        payer,
        optionMarketKey,
        optionMintAccount,
        writerTokenMintAccount,
        underlyingAssetPoolAccount,
        quoteAssetPoolAccount,
        underlyingToken,
        quoteToken
      );
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
        await program.rpc.initializeMarket(
          underlyingAmountPerContract,
          quoteAmountPerContract,
          expiration,
          authorityBumpSeed,
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
            signers: [payer],
            remainingAccounts,
            instructions,
          }
        );
        assert.ok(false);
      } catch (err) {
        const errMsg = "OptionMarket must own the underlying asset pool";
        assert.equal(err.toString(), errMsg);
      }
    });
  });
  describe("QuoteAssetPool not owned by OptionMarket", () => {
    beforeEach(async () => {
      ({ underlyingToken, quoteToken } = await createUnderlyingAndQuoteMints(
        provider,
        payer,
        mintAuthority
      ));
      [optionMarketKey, bumpSeed] =
        await anchor.web3.PublicKey.findProgramAddress(
          [
            underlyingToken.publicKey.toBuffer(),
            quoteToken.publicKey.toBuffer(),
            underlyingAmountPerContract.toBuffer("le", 8),
            quoteAmountPerContract.toBuffer("le", 8),
            expiration.toBuffer("le", 8),
          ],
          program.programId
        );
      // Get the associated fee address if the market requires a fee
      const mintFee = feeAmount(underlyingAmountPerContract);
      if (mintFee.gtn(0)) {
        mintFeeKey = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          underlyingToken.publicKey,
          FEE_OWNER_KEY
        );
        remainingAccounts.push({
          pubkey: mintFeeKey,
          isWritable: false,
          isSigner: false,
        });
        const ix = await getOrAddAssociatedTokenAccountTx(
          mintFeeKey,
          underlyingToken,
          payer.publicKey
        );
        if (ix) {
          instructions.push(ix);
        }
      }

      const exerciseFee = feeAmount(quoteAmountPerContract);
      if (exerciseFee.gtn(0)) {
        exerciseFeeKey = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          quoteToken.publicKey,
          FEE_OWNER_KEY
        );
        remainingAccounts.push({
          pubkey: exerciseFeeKey,
          isWritable: false,
          isSigner: false,
        });
        const ix = await getOrAddAssociatedTokenAccountTx(
          exerciseFeeKey,
          quoteToken,
          payer.publicKey
        );
        if (ix) {
          instructions.push(ix);
        }
      }

      await createAccountsForInitializeMarket(
        provider.connection,
        payer,
        optionMarketKey,
        optionMintAccount,
        writerTokenMintAccount,
        underlyingAssetPoolAccount,
        quoteAssetPoolAccount,
        underlyingToken,
        quoteToken
      );
      // Create a new token account and set it as the underlyingAssetPoolAccount
      const { tokenAccount } = await initNewTokenAccount(
        provider.connection,
        payer.publicKey,
        underlyingToken.publicKey,
        payer
      );
      quoteAssetPoolAccount = tokenAccount;
    });
    it("should error", async () => {
      try {
        await program.rpc.initializeMarket(
          underlyingAmountPerContract,
          quoteAmountPerContract,
          expiration,
          authorityBumpSeed,
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
            signers: [payer],
            remainingAccounts,
            instructions,
          }
        );
        assert.ok(false);
      } catch (err) {
        const errMsg = "OptionMarket must own the quote asset pool";
        assert.equal(err.toString(), errMsg);
      }
    });
  });

  describe("mint fee is required based on underlying assets per contract", () => {
    describe("Mint fee owner is incorrect", () => {
      beforeEach(async () => {
        underlyingAmountPerContract = new anchor.BN("10000000000");
        ({ underlyingToken, quoteToken } = await createUnderlyingAndQuoteMints(
          provider,
          payer,
          mintAuthority
        ));
        [optionMarketKey, bumpSeed] =
          await anchor.web3.PublicKey.findProgramAddress(
            [
              underlyingToken.publicKey.toBuffer(),
              quoteToken.publicKey.toBuffer(),
              underlyingAmountPerContract.toBuffer("le", 8),
              quoteAmountPerContract.toBuffer("le", 8),
              expiration.toBuffer("le", 8),
            ],
            program.programId
          );

        // Get the associated fee address if the market requires a fee
        const mintFee = feeAmount(underlyingAmountPerContract);
        if (mintFee.gtn(0)) {
          mintFeeKey = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            underlyingToken.publicKey,
            payer.publicKey
          );
          remainingAccounts.push({
            pubkey: mintFeeKey,
            isWritable: false,
            isSigner: false,
          });
          const ix = await getOrAddAssociatedTokenAccountTx(
            mintFeeKey,
            underlyingToken,
            payer.publicKey,
            payer.publicKey
          );
          if (ix) {
            instructions.push(ix);
          }
        }

        const exerciseFee = feeAmount(quoteAmountPerContract);
        if (exerciseFee.gtn(0)) {
          exerciseFeeKey = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            quoteToken.publicKey,
            FEE_OWNER_KEY
          );
          remainingAccounts.push({
            pubkey: exerciseFeeKey,
            isWritable: false,
            isSigner: false,
          });
          const ix = await getOrAddAssociatedTokenAccountTx(
            exerciseFeeKey,
            quoteToken,
            payer.publicKey
          );
          if (ix) {
            instructions.push(ix);
          }
        }

        await createAccountsForInitializeMarket(
          provider.connection,
          payer,
          optionMarketKey,
          optionMintAccount,
          writerTokenMintAccount,
          underlyingAssetPoolAccount,
          quoteAssetPoolAccount,
          underlyingToken,
          quoteToken
        );
      });
      it("should error", async () => {
        try {
          await program.rpc.initializeMarket(
            underlyingAmountPerContract,
            quoteAmountPerContract,
            expiration,
            authorityBumpSeed,
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
              signers: [payer],
              remainingAccounts,
              instructions,
            }
          );
          assert.ok(false);
        } catch (err) {
          const errMsg = "Mint fee account must be owned by the FEE_OWNER";
          assert.equal(err.toString(), errMsg);
        }
      });
    });
  });
  describe("exercise fee is required based on quote assets per contract", () => {
    describe("Exercise fee owner is incorrect", () => {
      beforeEach(async () => {
        quoteAmountPerContract = new anchor.BN("50000000000");
        ({ underlyingToken, quoteToken } = await createUnderlyingAndQuoteMints(
          provider,
          payer,
          mintAuthority
        ));
        [optionMarketKey, bumpSeed] =
          await anchor.web3.PublicKey.findProgramAddress(
            [
              underlyingToken.publicKey.toBuffer(),
              quoteToken.publicKey.toBuffer(),
              underlyingAmountPerContract.toBuffer("le", 8),
              quoteAmountPerContract.toBuffer("le", 8),
              expiration.toBuffer("le", 8),
            ],
            program.programId
          );

        // Get the associated fee address if the market requires a fee
        const mintFee = feeAmount(underlyingAmountPerContract);
        if (mintFee.gtn(0)) {
          mintFeeKey = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            underlyingToken.publicKey,
            FEE_OWNER_KEY
          );
          remainingAccounts.push({
            pubkey: mintFeeKey,
            isWritable: false,
            isSigner: false,
          });
          const ix = await getOrAddAssociatedTokenAccountTx(
            mintFeeKey,
            underlyingToken,
            payer.publicKey
          );
          if (ix) {
            instructions.push(ix);
          }
        }

        const exerciseFee = feeAmount(quoteAmountPerContract);
        if (exerciseFee.gtn(0)) {
          exerciseFeeKey = await Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            quoteToken.publicKey,
            payer.publicKey
          );
          remainingAccounts.push({
            pubkey: exerciseFeeKey,
            isWritable: false,
            isSigner: false,
          });
          const ix = await getOrAddAssociatedTokenAccountTx(
            exerciseFeeKey,
            quoteToken,
            payer.publicKey,
            payer.publicKey
          );
          if (ix) {
            instructions.push(ix);
          }
        }

        await createAccountsForInitializeMarket(
          provider.connection,
          payer,
          optionMarketKey,
          optionMintAccount,
          writerTokenMintAccount,
          underlyingAssetPoolAccount,
          quoteAssetPoolAccount,
          underlyingToken,
          quoteToken
        );
      });
      it("should error", async () => {
        try {
          await program.rpc.initializeMarket(
            underlyingAmountPerContract,
            quoteAmountPerContract,
            expiration,
            authorityBumpSeed,
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
              signers: [payer],
              remainingAccounts,
              instructions,
            }
          );
          assert.ok(false);
        } catch (err) {
          const errMsg = "Exercise fee account must be owned by the FEE_OWNER";
          assert.equal(err.toString(), errMsg);
        }
      });
    });
  });
});
