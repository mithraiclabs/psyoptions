import * as anchor from "@project-serum/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  AccountInfo,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import assert from "assert";

import { FEE_OWNER_KEY } from "../packages/psyoptions-ts/src/fees";
import { OptionMarketV2 } from "../packages/psyoptions-ts/src/types";
import {
  createAccountsForInitializeMarket,
  createUnderlyingAndQuoteMints,
} from "../utils/helpers";

describe("initializeMarket", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  const payer = anchor.web3.Keypair.generate();
  const mintAuthority = anchor.web3.Keypair.generate();
  anchor.setProvider(provider);
  const program = anchor.workspace.PsyAmerican as anchor.Program;

  let optionMintKey: PublicKey;
  let writerTokenMintKey: PublicKey;
  let quoteAssetPoolKey: PublicKey;
  let underlyingAssetPoolKey: PublicKey;
  let quoteToken: Token;
  let underlyingToken: Token;
  let underlyingAmountPerContract = new anchor.BN("10000000000");
  let quoteAmountPerContract = new anchor.BN("50000000000");
  let expiration = new anchor.BN(new Date().getTime() / 1000 + 3600);
  let optionMarketKey: PublicKey;
  let bumpSeed: number;
  let marketAuthority: PublicKey;
  let authorityBumpSeed: number;
  let mintFeeKey: PublicKey;
  let exerciseFeeKey: PublicKey;
  beforeEach(async () => {
    // airdrop to the user so it has funds to use
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(payer.publicKey, 10_000_000_000),
      "confirmed"
    );
    ({
      optionMintKey,
      writerTokenMintKey,
      quoteAssetPoolKey,
      underlyingAssetPoolKey,
    } = await createAccountsForInitializeMarket(
      provider.connection,
      payer,
      program.programId
    ));
  });

  it("Is initialized!", async () => {
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

    [marketAuthority, authorityBumpSeed] =
      await anchor.web3.PublicKey.findProgramAddress(
        [optionMarketKey.toBuffer()],
        program.programId
      );
    // Get the associated fee address
    mintFeeKey = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      underlyingToken.publicKey,
      FEE_OWNER_KEY
    );

    exerciseFeeKey = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      quoteToken.publicKey,
      FEE_OWNER_KEY
    );
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
            optionMint: optionMintKey,
            writerTokenMint: writerTokenMintKey,
            quoteAssetPool: quoteAssetPoolKey,
            underlyingAssetPool: underlyingAssetPoolKey,
            optionMarket: optionMarketKey,
            marketAuthority,
            feeOwner: FEE_OWNER_KEY,
            mintFeeRecipient: mintFeeKey,
            exerciseFeeRecipient: exerciseFeeKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
          },
          signers: [payer],
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
      underlyingAssetPoolKey.toString()
    );
    assert.equal(
      optionMarket.quoteAssetPool?.toString(),
      quoteAssetPoolKey.toString()
    );
    assert.equal(
      optionMarket.quoteAssetPool?.toString(),
      quoteAssetPoolKey.toString()
    );
  });

  describe("underlying and quote assets are the same", () => {
    it("Should error", async () => {
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

      [marketAuthority, authorityBumpSeed] =
        await anchor.web3.PublicKey.findProgramAddress(
          [optionMarketKey.toBuffer()],
          program.programId
        );
      // Get the associated fee address
      mintFeeKey = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        underlyingToken.publicKey,
        FEE_OWNER_KEY
      );

      exerciseFeeKey = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        quoteToken.publicKey,
        FEE_OWNER_KEY
      );
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
              optionMint: optionMintKey,
              writerTokenMint: writerTokenMintKey,
              quoteAssetPool: quoteAssetPoolKey,
              underlyingAssetPool: underlyingAssetPoolKey,
              optionMarket: optionMarketKey,
              marketAuthority,
              feeOwner: FEE_OWNER_KEY,
              mintFeeRecipient: mintFeeKey,
              exerciseFeeRecipient: exerciseFeeKey,
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
});
