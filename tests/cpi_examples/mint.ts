import * as anchor from "@project-serum/anchor";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import assert from "assert";
import { OptionMarketV2 } from "../../packages/psyoptions-ts/src/types";
import { createMinter, initOptionMarket, initSetup } from "../../utils/helpers";

const textEncoder = new TextEncoder();
let optionMarket: OptionMarketV2,
  underlyingToken: Token,
  quoteToken: Token,
  optionToken: Token;
let vault: anchor.web3.PublicKey,
  vaultAuthority: anchor.web3.PublicKey,
  _vaultBump: number,
  _vaultAuthorityBump: number;
describe("cpi_examples mint", () => {
  const provider = anchor.Provider.env();
  const payer = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();
  const mintAuthority = anchor.web3.Keypair.generate();
  anchor.setProvider(provider);
  const program = anchor.workspace.CpiExamples as anchor.Program;
  const americanOptionsProgram = anchor.workspace.PsyAmerican as anchor.Program;
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
      optionToken: _optionToken,
      quoteToken: _quoteToken,
      underlyingToken: _underlyingToken,
      remainingAccounts,
    } = await initSetup(
      provider,
      (provider.wallet as anchor.Wallet).payer,
      mintAuthority,
      americanOptionsProgram
    );
    optionMarket = newOptionMarket;
    quoteToken = _quoteToken;
    underlyingToken = _underlyingToken;
    optionToken = _optionToken;
    await initOptionMarket(
      americanOptionsProgram,
      (provider.wallet as anchor.Wallet).payer,
      optionMarket,
      remainingAccounts,
      instructions
    );
  });

  const initMintVault = async () => {
    [vault, _vaultBump] = await anchor.web3.PublicKey.findProgramAddress(
      [underlyingToken.publicKey.toBuffer(), textEncoder.encode("vault")],
      program.programId
    );
    [vaultAuthority, _vaultAuthorityBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          underlyingToken.publicKey.toBuffer(),
          textEncoder.encode("vaultAuthority"),
        ],
        program.programId
      );
    await program.rpc.initMintVault({
      accounts: {
        authority: user.publicKey,
        underlyingAsset: underlyingToken.publicKey,
        vault,
        vaultAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      },
      signers: [user],
    });
  };

  describe("Initialize new mint vault", () => {
    it("should create a token account owned by the program", async () => {
      await initMintVault();
      const vaultAcct = await underlyingToken.getAccountInfo(vault);
      // Validate the vault account is created for the underlying asset
      assert.ok(vaultAcct.mint.equals(underlyingToken.publicKey));
      // validate the vault authority controls the tokens in the vault
      assert.ok(vaultAcct.owner.equals(vaultAuthority));
    });
  });
  describe("underlying assets are in the vault", () => {
    before(async () => {
      await createMinter(
        provider.connection,
        user,
        mintAuthority,
        underlyingToken,
        optionMarket.underlyingAmountPerContract.muln(2).toNumber(),
        optionMarket.optionMint,
        optionMarket.writerTokenMint,
        quoteToken
      );
      // If there is no vault these tests are being run individually
      if (!vault) {
        await initMintVault();
      }
    });

    describe("Mint options CPI", () => {
      it("should mint options to the user's account", async () => {
        const size = new anchor.BN(2);
        const optionMintInfoBefore = await optionToken.getMintInfo();
        console.log("*** vault", vault);
        await program.rpc.mint({
          accounts: {
            authority: user.publicKey,
            optionMint: optionMarket.optionMint,
            underlyingAsset: underlyingToken.publicKey,
            vault,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
          },
          signers: [user],
        });

        // Validate the option mint created size options
        const optionMintInfoAfter = await optionToken.getMintInfo();
        const optionSupplyDiff = optionMintInfoAfter.supply.sub(
          optionMintInfoBefore.supply
        );
        assert.ok(optionSupplyDiff.eq(size));

        // TODO: Validate that the options minted to the user's option account
      });
    });
  });
});
