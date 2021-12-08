import * as anchor from "@project-serum/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import assert from "assert";
import {
  feeAmountPerContract,
  FEE_OWNER_KEY,
} from "../../packages/psyoptions-ts/src/fees";
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
  vaultAuthorityBump: number;
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
    [vaultAuthority, vaultAuthorityBump] =
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
  describe("unerlying assets are in the vault", () => {
    const size = new anchor.BN(2);
    let writerOptionAccount: anchor.web3.Keypair,
      writerUnderlyingAccount: anchor.web3.Keypair,
      writerTokenAccount: anchor.web3.Keypair,
      mintFeeKey: anchor.web3.PublicKey,
      mintRemainingAccounts: anchor.web3.AccountMeta[] = [];
    before(async () => {
      ({
        optionAccount: writerOptionAccount,
        underlyingAccount: writerUnderlyingAccount,
        writerTokenAccount,
      } = await createMinter(
        provider.connection,
        user,
        mintAuthority,
        underlyingToken,
        optionMarket.underlyingAmountPerContract.mul(size.muln(2)).toNumber(),
        optionMarket.optionMint,
        optionMarket.writerTokenMint,
        quoteToken
      ));
      // If there is no vault these tests are being run individually
      if (!vault) {
        await initMintVault();
      }
      // Transfer underlying assets to the vault
      await underlyingToken.transfer(
        writerUnderlyingAccount.publicKey,
        vault,
        user,
        [],
        optionMarket.underlyingAmountPerContract.mul(size.muln(2)).toNumber()
      );
      /**
       * Get the associated fee address if the market requires a fee.
       *
       * NOTE: If the PsyOptions market can handle a 5bps fee (i.e. feeAmount returns > 0)
       * then this remaining account is required.
       */
      const mintFeePerContract = feeAmountPerContract(
        optionMarket.underlyingAmountPerContract
      );
      if (mintFeePerContract.gtn(0)) {
        mintFeeKey = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          underlyingToken.publicKey,
          FEE_OWNER_KEY
        );
        mintRemainingAccounts.push({
          pubkey: mintFeeKey,
          isWritable: true,
          isSigner: false,
        });
      }
    });

    describe("Mint options CPI", () => {
      it("should mint options to the user's account", async () => {
        const optionMintInfoBefore = await optionToken.getMintInfo();
        const vaultUnderlyingBefore = await underlyingToken.getAccountInfo(
          vault
        );
        const writerOptionAccountBefore = await optionToken.getAccountInfo(
          writerOptionAccount.publicKey
        );
        assert.ok(
          vaultUnderlyingBefore.amount.eq(
            optionMarket.underlyingAmountPerContract.mul(size.muln(2))
          )
        );
        try {
          await program.rpc.mint(size, vaultAuthorityBump, {
            accounts: {
              authority: user.publicKey,
              psyAmericanProgram: americanOptionsProgram.programId,
              vault,
              vaultAuthority,
              underlyingAssetMint: underlyingToken.publicKey,
              underlyingAssetPool: optionMarket.underlyingAssetPool,
              optionMint: optionMarket.optionMint,
              mintedOptionDest: writerOptionAccount.publicKey,
              writerTokenMint: optionMarket.writerTokenMint,
              mintedWriterTokenDest: writerTokenAccount.publicKey,
              optionMarket: optionMarket.key,
              feeOwner: FEE_OWNER_KEY,

              tokenProgram: TOKEN_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              clock: SYSVAR_CLOCK_PUBKEY,
              rent: SYSVAR_RENT_PUBKEY,
              systemProgram: SystemProgram.programId,
            },
            signers: [user],
          });
        } catch (err) {
          console.log((err as Error).toString());
          throw err;
        }

        // Validate the option mint created size options
        const optionMintInfoAfter = await optionToken.getMintInfo();
        const optionSupplyDiff = optionMintInfoAfter.supply.sub(
          optionMintInfoBefore.supply
        );
        assert.ok(optionSupplyDiff.eq(size));

        // Validate that the options minted to the user's option account
        const writerOptionAccountAfter = await optionToken.getAccountInfo(
          writerOptionAccount.publicKey
        );
        const writerOptionAccountDiff = writerOptionAccountAfter.amount.sub(
          writerOptionAccountBefore.amount
        );
        assert.ok(writerOptionAccountDiff.eq(size));
      });
    });
  });
});
