// TODO: setup option market
// TODO: mint options while market is not expired
// TODO: initialize vault
// TODO: crank the exercise request
import * as anchor from "@project-serum/anchor";
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
  TransactionInstruction,
} from "@solana/web3.js";
import assert from "assert";
import {
  feeAmount,
  FEE_OWNER_KEY,
} from "../../packages/psyoptions-ts/src/fees";

import { OptionMarketV2 } from "../../packages/psyoptions-ts/src/types";
import {
  createMinter,
  initNewTokenAccount,
  initOptionMarket,
  initSetup,
  wait,
} from "../../utils/helpers";

describe("brokerage exercise", () => {
  const provider = anchor.Provider.env();
  const payer = anchor.web3.Keypair.generate();
  anchor.setProvider(provider);
  const program = anchor.workspace.Brokerage as anchor.Program;
  const americanOptionsProgram = anchor.workspace.PsyAmerican as anchor.Program;
  let optionMarket: OptionMarketV2;
  let vaultAccount: AccountInfo;
  const mintAuthority = anchor.web3.Keypair.generate();

  const user = anchor.web3.Keypair.generate();

  let underlyingToken: Token;
  let optionToken: Token;
  let optionMarketKey: PublicKey;
  let optionMintAccount: Keypair;
  let writerTokenMintAccount: Keypair;
  let underlyingAssetPoolAccount: Keypair;
  let remainingAccounts: AccountMeta[] = [];

  let userWriterAcct: Keypair;
  let userOptionAcct: Keypair;
  let userUnderlyingAccount: Keypair;
  let userQuoteAccount: Keypair;
  let size = new u64(1);

  let vaultAuthority: PublicKey;
  let vaultAuthorityBump: number;
  let exerciseFeeKey: PublicKey;

  const mintOptionsTx = async (
    minter: Keypair,
    minterOptionAcct: Keypair,
    minterWriterAcct: Keypair,
    minterUnderlyingAccount: Keypair,
    opts: {
      size?: anchor.BN;
      underlyingAssetPoolAccount?: Keypair;
      remainingAccounts?: AccountMeta[];
    } = {}
  ) => {
    await americanOptionsProgram.rpc.mintOption(opts.size || size, {
      accounts: {
        userAuthority: minter.publicKey,
        underlyingAssetMint: underlyingToken.publicKey,
        underlyingAssetPool: (
          opts.underlyingAssetPoolAccount || underlyingAssetPoolAccount
        ).publicKey,
        underlyingAssetSrc: minterUnderlyingAccount.publicKey,
        optionMint: optionMintAccount.publicKey,
        mintedOptionDest: minterOptionAcct.publicKey,
        writerTokenMint: writerTokenMintAccount.publicKey,
        mintedWriterTokenDest: minterWriterAcct.publicKey,
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
        optionMintAccount: _optionMintAccount,
        quoteToken,
        remainingAccounts: _remainingAccounts,
        underlyingAmountPerContract,
        underlyingToken: _underlyingToken,
        underlyingAssetPoolAccount: _underlyingAssetPoolAccount,
        writerTokenMintAccount: _writerTokenMintAccount,
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
      optionMintAccount = _optionMintAccount;
      remainingAccounts = _remainingAccounts;
      underlyingToken = _underlyingToken;
      underlyingAssetPoolAccount = _underlyingAssetPoolAccount;
      writerTokenMintAccount = _writerTokenMintAccount;
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
        new anchor.BN(100).mul(underlyingAmountPerContract).muln(2).toNumber(),
        optionMintAccount.publicKey,
        writerTokenMintAccount.publicKey,
        quoteToken,
        // Make sure the minter has access to enough quote assets to exercise
        new anchor.BN(100)
          .mul(newOptionMarket.quoteAmountPerContract)
          .muln(2)
          .toNumber()
      ));
      await mintOptionsTx(
        user,
        userOptionAcct,
        userWriterAcct,
        userUnderlyingAccount
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

      const exerciseFee = feeAmount(optionMarket.quoteAmountPerContract);
      if (exerciseFee.gtn(0)) {
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
        console.log(err.toString());
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
