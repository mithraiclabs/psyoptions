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
  const initSetup = async (
    opts: {
      underlyingAmountPerContract?: anchor.BN;
      quoteAmountPerContract?: anchor.BN;
      mintFeeToken?: Token;
      exerciseFeeToken?: Token;
      mintFeeOwner?: PublicKey;
      exerciseFeeOwner?: PublicKey;
    } = {}
  ) => {
    try {
      // Handle overriding underlyingAmountPerContract
      underlyingAmountPerContract = opts.underlyingAmountPerContract
        ? opts.underlyingAmountPerContract
        : underlyingAmountPerContract;
      // Handle overriding quoteAmountPerContract
      quoteAmountPerContract = opts.quoteAmountPerContract
        ? opts.quoteAmountPerContract
        : quoteAmountPerContract;

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
          opts.mintFeeToken?.publicKey || underlyingToken.publicKey,
          opts.mintFeeOwner || FEE_OWNER_KEY
        );
        remainingAccounts.push({
          pubkey: mintFeeKey,
          isWritable: false,
          isSigner: false,
        });
        const ix = await getOrAddAssociatedTokenAccountTx(
          mintFeeKey,
          opts.mintFeeToken || underlyingToken,
          payer.publicKey,
          opts.mintFeeOwner || FEE_OWNER_KEY
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
          opts.exerciseFeeToken?.publicKey || quoteToken.publicKey,
          opts.exerciseFeeOwner || FEE_OWNER_KEY
        );
        remainingAccounts.push({
          pubkey: exerciseFeeKey,
          isWritable: false,
          isSigner: false,
        });
        const ix = await getOrAddAssociatedTokenAccountTx(
          exerciseFeeKey,
          opts.exerciseFeeToken || quoteToken,
          payer.publicKey,
          opts.exerciseFeeOwner || FEE_OWNER_KEY
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
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

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
    optionMintAccount = new Keypair();
    writerTokenMintAccount = new Keypair();
    underlyingAssetPoolAccount = new Keypair();
    quoteAssetPoolAccount = new Keypair();
    underlyingAmountPerContract = new anchor.BN("10000000000");
    quoteAmountPerContract = new anchor.BN("50000000000");
    expiration = new anchor.BN(new Date().getTime() / 1000 + 3600);
    remainingAccounts = [];
    instructions = [];
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
    await initSetup();
    await initOptionMarket();
  });

  describe("proper mint", () => {
    it("should mint 1 option", async () => {
      const size = new u64(1);
      try {
        const { optionAccount, underlyingAccount, writerTokenAccount } =
          await createMinter(
            provider.connection,
            minter,
            mintAuthority,
            underlyingToken,
            underlyingAmountPerContract,
            optionMintAccount.publicKey,
            writerTokenMintAccount.publicKey
          );
        await program.rpc.mintOption(size, {
          accounts: {
            authority: payer.publicKey,
            underlyingAssetMint: underlyingToken.publicKey,
            underlyingAssetPool: underlyingAssetPoolAccount.publicKey,
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
          remainingAccounts,
          signers: [payer],
        });
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
  });
});
