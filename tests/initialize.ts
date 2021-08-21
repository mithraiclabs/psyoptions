import * as anchor from "@project-serum/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { AccountInfo, PublicKey } from "@solana/web3.js";
import assert from "assert";
import { OptionMarket } from "../packages/psyoptions-ts/src";

import { FEE_OWNER_KEY } from "../packages/psyoptions-ts/src/fees";
import {
  createAccountsForInitializeMarket,
  createUnderlyingAndQuoteMints,
} from "../utils/helpers";

describe("initialize", () => {
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
  before(async () => {
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

    ({ underlyingToken, quoteToken } = await createUnderlyingAndQuoteMints(
      provider,
      payer,
      mintAuthority
    ));
  });

  it("Is initialized!", async () => {
    const underlyingAmountPerContract = new anchor.BN("10000000000");
    const quoteAmountPerContract = new anchor.BN("50000000000");
    const expiration = new anchor.BN(new Date().getTime() / 1000 + 3600);
    console.log("*** expiration ", expiration.toString(10));
    let [optionMarketKey, _bumpSeed] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          underlyingToken.publicKey.toBuffer(),
          quoteToken.publicKey.toBuffer(),
          underlyingAmountPerContract.toBuffer(),
          quoteAmountPerContract.toBuffer(),
          expiration.toBuffer(),
        ],
        program.programId
      );
    let [marketAuthority, authorityBumpSeed] =
      await anchor.web3.PublicKey.findProgramAddress(
        [optionMarketKey.toBuffer()],
        program.programId
      );
    // Get the associated fee address
    const mintFeeKey = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      underlyingToken.publicKey,
      FEE_OWNER_KEY
    );

    const exerciseFeeKey = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      quoteToken.publicKey,
      FEE_OWNER_KEY
    );
    await program.rpc.initializeMarket(
      underlyingAmountPerContract,
      quoteAmountPerContract,
      expiration,
      authorityBumpSeed,
      {
        accounts: {
          underlyingAssetMint: underlyingToken.publicKey,
          quoteAssetMint: quoteToken.publicKey,
          optionMintKey,
          writerTokenMintKey,
          quoteAssetPoolKey,
          underlyingAssetPoolKey,
          optionMarketKey,
          marketAuthority,
          mintFeeKey,
          exerciseFeeKey,
          tokenProgramKey: TOKEN_PROGRAM_ID,
          associatedTokenProgramKey: ASSOCIATED_TOKEN_PROGRAM_ID,
        },
      }
    );

    // Fetch the account for the newly created OptionMarket
    const optionMarket = (await program.account.optionMarket.fetch(
      optionMarketKey
    )) as OptionMarket;

    assert.equal(
      optionMarket.underlyingAssetMintKey.toString(),
      underlyingToken.publicKey.toString()
    );
    assert.equal(
      optionMarket.quoteAssetMintKey.toString(),
      quoteToken.publicKey.toString()
    );
    assert.equal(
      optionMarket.underlyingAssetPoolKey.toString(),
      underlyingAssetPoolKey.toString()
    );
    assert.equal(
      optionMarket.quoteAssetPoolKey.toString(),
      quoteAssetPoolKey.toString()
    );
    assert.equal(
      optionMarket.quoteAssetPoolKey.toString(),
      quoteAssetPoolKey.toString()
    );
  });
});
