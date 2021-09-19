// TODO: initialize an OptionMarket
// TODO: create a minter
// TODO: initialize a mint vault that takes the underlying asset of the OptionMarket, with some underlying assets
// TODO: create and test a mint instruction
import * as anchor from "@project-serum/anchor";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import assert from "assert";
import { OptionMarketV2 } from "../../packages/psyoptions-ts/src/types";
import { initSetup } from "../../utils/helpers";

const textEncoder = new TextEncoder();
let optionMarket: OptionMarketV2, underlyingToken: Token, quoteToken: Token;
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
      quoteToken: _quoteToken,
      underlyingToken: _underlyingToken,
      remainingAccounts: _remainingAccounts,
    } = await initSetup(
      provider,
      (provider.wallet as anchor.Wallet).payer,
      mintAuthority,
      americanOptionsProgram
    );
    optionMarket = newOptionMarket;
    quoteToken = _quoteToken;
    underlyingToken = _underlyingToken;
  });

  describe("Initialize new mint vault", () => {
    it("should create a token account owned by the program", async () => {
      const [vault, _vaultBump] =
        await anchor.web3.PublicKey.findProgramAddress(
          [underlyingToken.publicKey.toBuffer(), textEncoder.encode("vault")],
          program.programId
        );
      const [vaultAuthority, _vaultAuthorityBump] =
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
      const vaultAcct = await underlyingToken.getAccountInfo(vault);
      // Validate the vault account is created for the underlying asset
      assert.ok(vaultAcct.mint.equals(underlyingToken.publicKey));
      // validate the vault authority controls the tokens in the vault
      assert.ok(vaultAcct.owner.equals(vaultAuthority));
    });
  });
});
