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
  initSetup,
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
