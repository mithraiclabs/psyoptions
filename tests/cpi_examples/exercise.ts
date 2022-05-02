import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import {
  AccountInfo,
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
} from "@solana/web3.js";
import assert from "assert";
import { mintOptionsTx } from "../../packages/psyoptions-ts/src";
import {
  feeAmountPerContract,
  FEE_OWNER_KEY,
} from "../../packages/psyoptions-ts/src/fees";

import { OptionMarketV2 } from "../../packages/psyoptions-ts/src/types";
import { CpiExamples } from "../../target/types/cpi_examples";
import { PsyAmerican } from "../../target/types/psy_american";
import { createMinter, initOptionMarket, initSetup } from "../../utils/helpers";

describe("cpi_examples exercise", () => {
  const payer = anchor.web3.Keypair.generate();
  const program = anchor.workspace.CpiExamples as Program<CpiExamples>;
  const provider = program.provider;
  const americanOptionsProgram = anchor.workspace
    .PsyAmerican as Program<PsyAmerican>;
  let optionMarket: OptionMarketV2;
  let vaultAccount: AccountInfo;
  const mintAuthority = anchor.web3.Keypair.generate();

  const user = anchor.web3.Keypair.generate();

  let underlyingToken: Token;
  let optionToken: Token;
  let optionMarketKey: PublicKey;
  let remainingAccounts: AccountMeta[] = [];

  let userWriterAcct: Keypair;
  let userOptionAcct: Keypair;
  let userUnderlyingAccount: Keypair;
  let userQuoteAccount: Keypair;
  let size = new u64(1);

  let vaultAuthority: PublicKey;
  let vaultAuthorityBump: number;
  let exerciseFeeKey: PublicKey;

  describe("OptionMarket is not expired", () => {
    before(async () => {
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(
          payer.publicKey,
          10_000_000_000
        ),
        "confirmed"
      );
      await provider.connection.confirmTransaction(
        await provider.connection.requestAirdrop(
          user.publicKey,
          10_000_000_000
        ),
        "confirmed"
      );
      const {
        instructions,
        optionMarket: newOptionMarket,
        optionMarketKey: _optionMarketKey,
        quoteToken,
        remainingAccounts: _remainingAccounts,
        underlyingToken: _underlyingToken,
      } = await initSetup(
        provider,
        (provider.wallet as anchor.Wallet).payer,
        mintAuthority,
        americanOptionsProgram,
        {
          // set expiration to 4 seconds from now
          expiration: new anchor.BN(new Date().getTime() / 1000 + 4),
        }
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
        quoteAccount: userQuoteAccount,
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
        quoteToken,
        // Make sure the minter has access to enough quote assets to exercise
        new anchor.BN(100)
          .mul(newOptionMarket.quoteAmountPerContract)
          .muln(2)
          .toNumber()
      ));
      await mintOptionsTx(
        americanOptionsProgram,
        user,
        userOptionAcct,
        userWriterAcct,
        userUnderlyingAccount,
        new anchor.BN(25),
        optionMarket
      );

      // Initialize and deposit options into a vault
      const size = new anchor.BN(1);
      const textEncoder = new TextEncoder();
      const [vault, _vaultBump] = await PublicKey.findProgramAddress(
        [optionMarket.optionMint.toBuffer(), textEncoder.encode("vault")],
        program.programId
      );
      [vaultAuthority, vaultAuthorityBump] = await PublicKey.findProgramAddress(
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

      vaultAccount = await optionToken.getAccountInfo(vault);
    });

    it("should exercise the options in the vault", async () => {
      // Validate the vault has an option in it
      assert.equal(vaultAccount.amount.toString(), size.toString());

      const userUnderlyingBefore = await underlyingToken.getAccountInfo(
        userUnderlyingAccount.publicKey
      );

      const exerciseFeePerContract = feeAmountPerContract(
        optionMarket.quoteAmountPerContract
      );
      if (exerciseFeePerContract.gtn(0)) {
        exerciseFeeKey = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          optionMarket.quoteAssetMint,
          FEE_OWNER_KEY
        );
        remainingAccounts = [
          {
            pubkey: exerciseFeeKey,
            isWritable: true,
            isSigner: false,
          },
        ];
      }

      try {
        await program.rpc.exercise(vaultAuthorityBump, {
          accounts: {
            authority: user.publicKey,
            psyAmericanProgram: americanOptionsProgram.programId,
            vaultAuthority: vaultAuthority,
            optionMarket: optionMarket.key,
            optionMint: optionMarket.optionMint,
            exerciserOptionTokenSrc: vaultAccount.address,
            underlyingAssetPool: optionMarket.underlyingAssetPool,
            underlyingAssetDest: userUnderlyingAccount.publicKey,
            quoteAssetPool: optionMarket.quoteAssetPool,
            quoteAssetSrc: userQuoteAccount.publicKey,
            feeOwner: FEE_OWNER_KEY,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            clock: SYSVAR_CLOCK_PUBKEY,
          },
          remainingAccounts,
          signers: [user],
        });
      } catch (err) {
        console.log((err as Error).toString());
        throw err;
      }

      // TODO: Validate the minter received the underlying assets
      const userUnderlyingAfter = await underlyingToken.getAccountInfo(
        userUnderlyingAccount.publicKey
      );
      const userUnderlyingDiff = userUnderlyingAfter.amount.sub(
        userUnderlyingBefore.amount
      );

      assert.equal(
        userUnderlyingDiff.toString(),
        size.mul(optionMarket.underlyingAmountPerContract).toString()
      );
    });
  });
});
