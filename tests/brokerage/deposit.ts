import * as anchor from "@project-serum/anchor";
import { Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import {
  AccountMeta,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import assert from "assert";
import { mintOptionsTx } from "../../packages/psyoptions-ts/src";

import { OptionMarketV2 } from "../../packages/psyoptions-ts/src/types";
import { createMinter, initOptionMarket, initSetup } from "../../utils/helpers";

describe("brokerage deposit", () => {
  const provider = anchor.Provider.env();
  const payer = anchor.web3.Keypair.generate();
  anchor.setProvider(provider);
  const program = anchor.workspace.Brokerage as anchor.Program;
  const americanOptionsProgram = anchor.workspace.PsyAmerican as anchor.Program;
  let optionMarket: OptionMarketV2;
  const mintAuthority = anchor.web3.Keypair.generate();

  const user = anchor.web3.Keypair.generate();

  let underlyingToken: Token;
  let optionToken: Token;
  let optionMarketKey: PublicKey;
  let remainingAccounts: AccountMeta[] = [];

  let userWriterAcct: Keypair;
  let userOptionAcct: Keypair;
  let userUnderlyingAccount: Keypair;
  let size = new u64(1);

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(payer.publicKey, 10_000_000_000),
      "confirmed"
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(user.publicKey, 10_000_000_000),
      "confirmed"
    );
    const {
      instructions,
      optionMarket: newOptionMarket,
      optionMarketKey: _optionMarketKey,
      quoteToken,
      remainingAccounts: _remainingAccounts,
      underlyingAmountPerContract,
      underlyingToken: _underlyingToken,
    } = await initSetup(
      provider,
      (provider.wallet as anchor.Wallet).payer,
      mintAuthority,
      americanOptionsProgram
    );
    optionMarketKey = _optionMarketKey;
    optionMarket = newOptionMarket;
    remainingAccounts = _remainingAccounts;
    underlyingToken = _underlyingToken;
    await initOptionMarket(
      americanOptionsProgram,
      (provider.wallet as anchor.Wallet).payer,
      optionMarket,
      remainingAccounts,
      instructions
    );
    optionToken = new Token(
      provider.connection,
      optionMarket.optionMint,
      TOKEN_PROGRAM_ID,
      payer
    );
    ({
      optionAccount: userOptionAcct,
      underlyingAccount: userUnderlyingAccount,
      writerTokenAccount: userWriterAcct,
    } = await createMinter(
      provider.connection,
      user,
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
    await mintOptionsTx(
      americanOptionsProgram,
      user,
      userOptionAcct,
      userWriterAcct,
      userUnderlyingAccount,
      size,
      optionMarket
    );
  });

  it("should allow an option to be deposited", async () => {
    const size = new anchor.BN(1);
    const textEncoder = new TextEncoder();
    const [vault, _vaultBump] = await PublicKey.findProgramAddress(
      [optionMarket.optionMint.toBuffer(), textEncoder.encode("vault")],
      program.programId
    );
    const [vaultAuthority, _vaultAuthorityBump] =
      await PublicKey.findProgramAddress(
        [optionMarket.key.toBuffer(), textEncoder.encode("vaultAuthority")],
        program.programId
      );

    await program.rpc.initialize(size, {
      accounts: {
        authority: user.publicKey,
        optionSource: userOptionAcct.publicKey,
        optionMint: optionMarket.optionMint,
        vault,
        vaultAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      },
      signers: [user],
    });

    const vaultAccount = await optionToken.getAccountInfo(vault);
    assert.ok(vaultAccount.amount.eq(size as u64));
  });
});
